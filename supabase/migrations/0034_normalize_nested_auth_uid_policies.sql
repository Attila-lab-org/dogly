-- 0034_normalize_nested_auth_uid_policies.sql
-- Normalize policies touched by earlier broad hardening runs. Nested scalar
-- selects are valid but unnecessary and make policy drift hard to audit.

do $migration$
declare
  p record;
  create_sql text;
  roles_sql text;
  qual_sql text;
  check_sql text;
begin
  for p in
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
      and (
        lower(coalesce(qual, '')) like '%(select (select auth.uid()))%'
        or lower(coalesce(with_check, '')) like '%(select (select auth.uid()))%'
      )
  loop
    qual_sql := p.qual;
    check_sql := p.with_check;
    while position('(select (select auth.uid()))' in lower(coalesce(qual_sql, ''))) > 0
    loop
      qual_sql := regexp_replace(
        qual_sql,
        '\(select \(select auth\.uid\(\)\)\)',
        '(select auth.uid())',
        'gi'
      );
    end loop;
    while position('(select (select auth.uid()))' in lower(coalesce(check_sql, ''))) > 0
    loop
      check_sql := regexp_replace(
        check_sql,
        '\(select \(select auth\.uid\(\)\)\)',
        '(select auth.uid())',
        'gi'
      );
    end loop;

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
    if qual_sql is not null then
      create_sql := create_sql || ' using (' || qual_sql || ')';
    end if;
    if check_sql is not null then
      create_sql := create_sql || ' with check (' || check_sql || ')';
    end if;
    execute create_sql;
  end loop;
end
$migration$;
