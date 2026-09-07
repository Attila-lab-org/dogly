-- Reconciled from production migration history. This migration normalized
-- direct auth.uid() calls in policies that existed before later tables.

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
        coalesce(qual, '') like '%auth.uid()%'
        or coalesce(with_check, '') like '%auth.uid()%'
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
        || replace(p.qual, 'auth.uid()', '(select auth.uid())')
        || ')';
    end if;
    if p.with_check is not null then
      create_sql := create_sql
        || ' with check ('
        || replace(p.with_check, 'auth.uid()', '(select auth.uid())')
        || ')';
    end if;
    execute create_sql;
  end loop;
end
$migration$;
