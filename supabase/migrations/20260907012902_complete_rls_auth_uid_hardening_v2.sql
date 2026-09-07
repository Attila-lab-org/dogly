-- 0032_complete_rls_auth_uid_hardening.sql
-- Reconciles the production hardening migration with the forward-only local
-- source of truth and also covers policies introduced by 0029-0031.

do $migration$
declare
  p record;
  create_sql text;
  roles_sql text;
begin
  for p in
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
      and (
        (
          coalesce(qual, '') like '%auth.uid()%'
          and lower(coalesce(qual, '')) not like '%(select auth.uid())%'
        )
        or (
          coalesce(with_check, '') like '%auth.uid()%'
          and lower(coalesce(with_check, '')) not like '%(select auth.uid())%'
        )
      )
  loop
    select string_agg(quote_ident(role_name), ', ')
      into roles_sql
      from unnest(p.roles) as role_name;

    execute format(
      'drop policy if exists %I on %I.%I',
      p.policyname,
      p.schemaname,
      p.tablename
    );

    create_sql := format(
      'create policy %I on %I.%I as %s for %s to %s',
      p.policyname,
      p.schemaname,
      p.tablename,
      p.permissive,
      p.cmd,
      roles_sql
    );
    if p.qual is not null then
      create_sql := create_sql
        || ' using ('
        || case
          when lower(p.qual) like '%(select auth.uid())%' then p.qual
          else replace(p.qual, 'auth.uid()', '(select auth.uid())')
        end
        || ')';
    end if;
    if p.with_check is not null then
      create_sql := create_sql
        || ' with check ('
        || case
          when lower(p.with_check) like '%(select auth.uid())%' then p.with_check
          else replace(p.with_check, 'auth.uid()', '(select auth.uid())')
        end
        || ')';
    end if;
    execute create_sql;
  end loop;
end
$migration$;
