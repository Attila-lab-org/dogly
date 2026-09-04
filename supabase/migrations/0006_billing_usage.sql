-- 0006_billing_usage.sql
-- Scope (Spec V1 §11): subscriptions, usage ledger, atomic reserve/commit/refund functions.
-- Acceptance: parallel quota tests pass.
--
-- Quota model (Spec §7.3, §22):
--   reserve_usage()  — called server-side BEFORE issuing a processing job. Takes a row lock
--                      on the user's current ledger row so parallel requests serialize and
--                      can never exceed the allowance.
--   commit_usage()   — called when the analysis is delivered (clear, ambiguous or
--                      insufficient all consume one unit, Spec §6.1).
--   refund_usage()   — idempotent refund only for defined quality/technical terminal
--                      states and pre-provider cancellation.
-- Idempotency is anchored on internal.usage_reservations.reference_id (the event/capture
-- id or idempotency key): repeating any of the three RPCs with the same reference is a
-- safe no-op (Spec §22: "Duplicate client tap → repeated init returns same reservation").

-- ---------------------------------------------------------------------------
-- public.subscriptions — RevenueCat entitlement mirror (Spec §10.4, §21.1)
-- Never the only billing source of truth; updated by verified webhooks (service_role).
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null unique references auth.users (id) on delete cascade,
  plan                    text not null default 'FREE'
                          check (plan in ('FREE', 'PREMIUM_MONTHLY', 'PREMIUM_ANNUAL')),
  status                  text not null default 'ACTIVE',  -- RevenueCat lifecycle status
                          -- (ACTIVE / TRIALING / GRACE_PERIOD / CANCELLED / EXPIRED /
                          --  REFUNDED / BILLING_ISSUE); kept as text: the mirror must not
                          --  reject a new store status before the backend mapping updates.
  store                   text,             -- APP_STORE / PLAY_STORE / ...
  product_id              text,
  entitlement_id          text,
  revenuecat_customer_id  text,
  period_start            timestamptz,
  period_end              timestamptz,
  last_webhook_event_id   text,             -- idempotent webhook handling (Spec §22)
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.subscriptions is
  'Server-side mirror of the current RevenueCat entitlement. Grace/refund/cancel update '
  'entitlement without deleting dog data (Spec §21.1).';

alter table public.subscriptions enable row level security;
alter table public.subscriptions force row level security;

-- Spec §12 matrix: mobile reads own summary; writes are webhook/service only.
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using (user_id = auth.uid());

grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;

-- ---------------------------------------------------------------------------
-- public.usage_ledgers — per user + billing period (Spec §10.4, §21.1)
-- Entitlement (subscriptions) says what the user MAY do; the ledger says what has been
-- consumed/reserved. Unused analyses do not roll over (Spec §21).
-- ---------------------------------------------------------------------------
create table public.usage_ledgers (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  period_start       timestamptz not null,
  reset_at           timestamptz not null,
  behavior_limit     integer not null default 0 check (behavior_limit >= 0),
  behavior_used      integer not null default 0 check (behavior_used >= 0),
  behavior_reserved  integer not null default 0 check (behavior_reserved >= 0),
  digestive_limit    integer not null default 0 check (digestive_limit >= 0),
  digestive_used     integer not null default 0 check (digestive_used >= 0),
  digestive_reserved integer not null default 0 check (digestive_reserved >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, period_start),
  check (reset_at > period_start)
  -- NOTE: no hard CHECK on used+reserved<=limit. The invariant is enforced atomically by
  -- reserve_usage() under row lock; a CHECK would block legitimate mid-period entitlement
  -- downgrades coming from RevenueCat webhooks (used may exceed the new lower limit).
);

comment on table public.usage_ledgers is
  'Monthly allowance ledger per user. used+reserved can never exceed limit; enforced '
  'atomically by reserve_usage() under row lock.';

create index usage_ledgers_user_idx on public.usage_ledgers (user_id, reset_at desc);

alter table public.usage_ledgers enable row level security;
alter table public.usage_ledgers force row level security;

-- Spec §12 matrix: mobile reads own summary; NO client writes (billing/quota service only).
create policy usage_ledgers_select_own on public.usage_ledgers
  for select to authenticated
  using (user_id = auth.uid());

grant select on public.usage_ledgers to authenticated;
grant all on public.usage_ledgers to service_role;

-- ---------------------------------------------------------------------------
-- internal.usage_reservations — idempotency anchor for reserve/commit/refund
-- ---------------------------------------------------------------------------
create table internal.usage_reservations (
  id           uuid primary key default gen_random_uuid(),
  reference_id text not null unique,    -- capture/event id or idempotency key
  user_id      uuid not null references auth.users (id) on delete cascade,
  ledger_id    uuid not null references public.usage_ledgers (id) on delete cascade,
  domain       text not null check (domain in ('BEHAVIOR', 'DIGESTIVE')),
  units        integer not null default 1 check (units > 0),
  state        text not null default 'RESERVED'
               check (state in ('RESERVED', 'COMMITTED', 'REFUNDED', 'RELEASED')),
  reason       text,                    -- refund/release reason (audit)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index usage_reservations_user_idx on internal.usage_reservations (user_id, created_at desc);

comment on table internal.usage_reservations is
  'One row per quota reservation. State machine RESERVED -> COMMITTED | REFUNDED | RELEASED '
  'makes commit/refund idempotent under duplicate queue delivery (Spec §22).';

grant all on internal.usage_reservations to service_role;
revoke all on internal.usage_reservations from anon, authenticated;

-- ---------------------------------------------------------------------------
-- internal.current_plan_limits — plan -> monthly allowances (Spec §21)
-- FREE: 3 behavior + 3 digestive. PREMIUM_*: 30 + 30. No unlimited, no rollover.
-- ---------------------------------------------------------------------------
create or replace function internal.current_plan_limits(p_user_id uuid)
returns table (behavior_limit integer, digestive_limit integer)
language sql
stable
security definer
set search_path = public, internal
as $$
  select case when s.plan in ('PREMIUM_MONTHLY', 'PREMIUM_ANNUAL')
                   and s.status in ('ACTIVE', 'TRIALING', 'GRACE_PERIOD')
              then 30 else 3 end,
         case when s.plan in ('PREMIUM_MONTHLY', 'PREMIUM_ANNUAL')
                   and s.status in ('ACTIVE', 'TRIALING', 'GRACE_PERIOD')
              then 30 else 3 end
  from (select 1) one
  left join public.subscriptions s on s.user_id = p_user_id;
$$;

-- ---------------------------------------------------------------------------
-- public.reserve_usage — atomic reservation under row lock (Spec §7.3, §22)
-- Returns jsonb: {granted bool, reason text, ledger_id, reference_id, domain,
--                 limit, used, reserved, remaining, reset_at}
-- ---------------------------------------------------------------------------
create or replace function public.reserve_usage(
  p_user_id      uuid,
  p_domain       text,
  p_reference_id text,
  p_units        integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, internal
as $$
declare
  v_ledger      public.usage_ledgers%rowtype;
  v_existing    internal.usage_reservations%rowtype;
  v_limits      record;
  v_limit       integer;
  v_used        integer;
  v_reserved    integer;
begin
  if p_domain not in ('BEHAVIOR', 'DIGESTIVE') then
    raise exception 'INVALID_DOMAIN: %', p_domain using errcode = '22023';
  end if;
  if p_units is null or p_units < 1 then
    raise exception 'INVALID_UNITS: %', p_units using errcode = '22023';
  end if;

  -- Idempotency: a repeated init with the same reference returns the same reservation.
  select * into v_existing
  from internal.usage_reservations
  where reference_id = p_reference_id;
  if found then
    if v_existing.user_id <> p_user_id or v_existing.domain <> p_domain then
      raise exception 'RESERVATION_REFERENCE_CONFLICT' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'granted', v_existing.state = 'RESERVED',
      'reason', case v_existing.state
                  when 'RESERVED' then 'ALREADY_RESERVED'
                  when 'COMMITTED' then 'ALREADY_COMMITTED'
                  else 'ALREADY_' || v_existing.state end,
      'reference_id', v_existing.reference_id,
      'domain', v_existing.domain,
      'state', v_existing.state);
  end if;

  -- Lock the user's CURRENT ledger row. FOR UPDATE serializes parallel reserves:
  -- concurrent transactions queue on this row and re-read fresh counters, so
  -- used + reserved can never exceed the limit (Spec §22 "Quota race").
  select * into v_ledger
  from public.usage_ledgers
  where user_id = p_user_id
    and now() >= period_start
    and now() < reset_at
  order by period_start desc
  limit 1
  for update;

  if not found then
    -- First use of the period: create the ledger with entitlement-derived limits.
    select * into v_limits from internal.current_plan_limits(p_user_id);
    insert into public.usage_ledgers (
      user_id, period_start, reset_at, behavior_limit, digestive_limit)
    values (
      p_user_id,
      date_trunc('month', now()),
      date_trunc('month', now()) + interval '1 month',
      v_limits.behavior_limit,
      v_limits.digestive_limit)
    on conflict (user_id, period_start) do nothing
    returning * into v_ledger;

    if not found then
      -- Lost the create race: lock the row the concurrent transaction created.
      select * into v_ledger
      from public.usage_ledgers
      where user_id = p_user_id
        and now() >= period_start
        and now() < reset_at
      order by period_start desc
      limit 1
      for update;
    end if;
  end if;

  if p_domain = 'BEHAVIOR' then
    v_limit := v_ledger.behavior_limit;
    v_used := v_ledger.behavior_used;
    v_reserved := v_ledger.behavior_reserved;
  else
    v_limit := v_ledger.digestive_limit;
    v_used := v_ledger.digestive_used;
    v_reserved := v_ledger.digestive_reserved;
  end if;

  if v_used + v_reserved + p_units > v_limit then
    return jsonb_build_object(
      'granted', false,
      'reason', 'QUOTA_EXHAUSTED',
      'reference_id', p_reference_id,
      'domain', p_domain,
      'limit', v_limit, 'used', v_used, 'reserved', v_reserved,
      'remaining', greatest(v_limit - v_used - v_reserved, 0),
      'reset_at', v_ledger.reset_at);
  end if;

  if p_domain = 'BEHAVIOR' then
    update public.usage_ledgers
    set behavior_reserved = behavior_reserved + p_units, updated_at = now()
    where id = v_ledger.id;
  else
    update public.usage_ledgers
    set digestive_reserved = digestive_reserved + p_units, updated_at = now()
    where id = v_ledger.id;
  end if;

  -- First writer wins; a concurrent duplicate reference raises unique_violation and is
  -- converted into the idempotent ALREADY_RESERVED response.
  begin
    insert into internal.usage_reservations (reference_id, user_id, ledger_id, domain, units)
    values (p_reference_id, p_user_id, v_ledger.id, p_domain, p_units);
  exception
    when unique_violation then
      -- Roll back the counter bump: the concurrent transaction owns this reservation.
      if p_domain = 'BEHAVIOR' then
        update public.usage_ledgers
        set behavior_reserved = greatest(behavior_reserved - p_units, 0), updated_at = now()
        where id = v_ledger.id;
      else
        update public.usage_ledgers
        set digestive_reserved = greatest(digestive_reserved - p_units, 0), updated_at = now()
        where id = v_ledger.id;
      end if;
      return jsonb_build_object(
        'granted', true, 'reason', 'ALREADY_RESERVED',
        'reference_id', p_reference_id, 'domain', p_domain);
  end;

  return jsonb_build_object(
    'granted', true,
    'reason', 'RESERVED',
    'reference_id', p_reference_id,
    'domain', p_domain,
    'limit', v_limit, 'used', v_used, 'reserved', v_reserved + p_units,
    'remaining', v_limit - v_used - v_reserved - p_units,
    'reset_at', v_ledger.reset_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- public.commit_usage — reservation becomes consumption (delivered analysis).
-- Idempotent: COMMITTED/REFUNDED/RELEASED references are no-ops.
-- ---------------------------------------------------------------------------
create or replace function public.commit_usage(p_reference_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, internal
as $$
declare
  v_res internal.usage_reservations%rowtype;
begin
  select * into v_res
  from internal.usage_reservations
  where reference_id = p_reference_id
  for update;

  if not found then
    raise exception 'RESERVATION_NOT_FOUND: %', p_reference_id using errcode = '22023';
  end if;

  if v_res.state <> 'RESERVED' then
    return jsonb_build_object('committed', false, 'reason', 'NO_OP_' || v_res.state,
                              'reference_id', p_reference_id);
  end if;

  -- Lock the ledger row and move units reserved -> used.
  if v_res.domain = 'BEHAVIOR' then
    update public.usage_ledgers
    set behavior_reserved = behavior_reserved - v_res.units,
        behavior_used     = behavior_used + v_res.units,
        updated_at        = now()
    where id = v_res.ledger_id;
  else
    update public.usage_ledgers
    set digestive_reserved = digestive_reserved - v_res.units,
        digestive_used     = digestive_used + v_res.units,
        updated_at         = now()
    where id = v_res.ledger_id;
  end if;

  update internal.usage_reservations
  set state = 'COMMITTED', updated_at = now()
  where id = v_res.id;

  return jsonb_build_object('committed', true, 'reason', 'COMMITTED',
                            'reference_id', p_reference_id,
                            'domain', v_res.domain, 'units', v_res.units);
end;
$$;

-- ---------------------------------------------------------------------------
-- public.refund_usage — idempotent refund for defined quality/technical terminal
-- states and pre-provider cancellation (Spec §7.3, §22).
-- p_reason in: QUALITY_REJECTED | TECHNICAL_FAILURE | CANCELLED
-- ---------------------------------------------------------------------------
create or replace function public.refund_usage(
  p_reference_id text,
  p_reason       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, internal
as $$
declare
  v_res internal.usage_reservations%rowtype;
begin
  if p_reason is not null
     and p_reason not in ('QUALITY_REJECTED', 'TECHNICAL_FAILURE', 'CANCELLED') then
    raise exception 'INVALID_REFUND_REASON: %', p_reason using errcode = '22023';
  end if;

  select * into v_res
  from internal.usage_reservations
  where reference_id = p_reference_id
  for update;

  if not found then
    raise exception 'RESERVATION_NOT_FOUND: %', p_reference_id using errcode = '22023';
  end if;

  -- Idempotent: refunding a committed/already-refunded/released reservation is a no-op.
  if v_res.state <> 'RESERVED' then
    return jsonb_build_object('refunded', false, 'reason', 'NO_OP_' || v_res.state,
                              'reference_id', p_reference_id);
  end if;

  if v_res.domain = 'BEHAVIOR' then
    update public.usage_ledgers
    set behavior_reserved = greatest(behavior_reserved - v_res.units, 0),
        updated_at        = now()
    where id = v_res.ledger_id;
  else
    update public.usage_ledgers
    set digestive_reserved = greatest(digestive_reserved - v_res.units, 0),
        updated_at         = now()
    where id = v_res.ledger_id;
  end if;

  update internal.usage_reservations
  set state = case when p_reason = 'CANCELLED' then 'RELEASED' else 'REFUNDED' end,
      reason = p_reason,
      updated_at = now()
  where id = v_res.id;

  return jsonb_build_object('refunded', true, 'reason', coalesce(p_reason, 'REFUNDED'),
                            'reference_id', p_reference_id,
                            'domain', v_res.domain, 'units', v_res.units);
end;
$$;

-- Quota RPCs are server-only: callable by the backend with the service role, never by
-- client roles (Spec §24.1: quota bypass / parallel abuse control).
revoke all on function public.reserve_usage(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.commit_usage(text) from public, anon, authenticated;
revoke all on function public.refund_usage(text, text) from public, anon, authenticated;
grant execute on function public.reserve_usage(uuid, text, text, integer) to service_role;
grant execute on function public.commit_usage(text) to service_role;
grant execute on function public.refund_usage(text, text) to service_role;
