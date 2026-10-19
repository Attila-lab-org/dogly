drop policy if exists walks_select_own on public.walks;
create policy walks_select_own on public.walks
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists walks_insert_own on public.walks;
create policy walks_insert_own on public.walks
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.dogs
      where public.dogs.id = walks.dog_id
        and public.dogs.owner_id = (select auth.uid())
    )
  );
