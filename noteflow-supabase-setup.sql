create table if not exists public.noteflow_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  kind text not null check (kind in ('personal', 'team')),
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  created_at timestamptz not null default now() 
);

create table if not exists public.noteflow_workspace_members (
  workspace_id uuid not null
    references public.noteflow_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create unique index if not exists noteflow_one_owner_per_workspace
  on public.noteflow_workspace_members (workspace_id)
  where role = 'owner';

create table if not exists public.noteflow_workspace_items (
  workspace_id uuid not null
    references public.noteflow_workspaces(id) on delete cascade,
  item_id text not null,
  item_type text not null,
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, item_id)
);

create or replace function public.noteflow_is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.noteflow_workspace_members m
    join public.noteflow_workspaces w on w.id = m.workspace_id
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and (w.kind = 'team' or m.role = 'owner')
  );
$$;

create or replace function public.noteflow_can_edit_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.noteflow_workspace_members m
    join public.noteflow_workspaces w on w.id = m.workspace_id
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'editor')
      and (w.kind = 'team' or m.role = 'owner')
  );
$$;

create or replace function public.noteflow_is_workspace_owner(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.noteflow_workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

create or replace function public.noteflow_add_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.noteflow_workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

drop trigger if exists noteflow_workspace_owner on public.noteflow_workspaces;
create trigger noteflow_workspace_owner
  after insert on public.noteflow_workspaces
  for each row execute function public.noteflow_add_workspace_owner();

alter table public.noteflow_workspaces enable row level security;
alter table public.noteflow_workspace_members enable row level security;
alter table public.noteflow_workspace_items enable row level security;

grant select, insert, update, delete
  on public.noteflow_workspaces to authenticated;
grant select, insert, update, delete
  on public.noteflow_workspace_members to authenticated;
grant select, insert, update, delete
  on public.noteflow_workspace_items to authenticated;

drop policy if exists "NoteFlow members read workspaces" on public.noteflow_workspaces;
create policy "NoteFlow members read workspaces"
  on public.noteflow_workspaces for select to authenticated
  using (public.noteflow_is_workspace_member(id));

drop policy if exists "NoteFlow users create workspaces" on public.noteflow_workspaces;
create policy "NoteFlow users create workspaces"
  on public.noteflow_workspaces for insert to authenticated
  with check ((select auth.uid()) = created_by);

drop policy if exists "NoteFlow owners update workspaces" on public.noteflow_workspaces;
create policy "NoteFlow owners update workspaces"
  on public.noteflow_workspaces for update to authenticated
  using (public.noteflow_is_workspace_owner(id))
  with check (public.noteflow_is_workspace_owner(id));

drop policy if exists "NoteFlow owners delete workspaces" on public.noteflow_workspaces;
create policy "NoteFlow owners delete workspaces"
  on public.noteflow_workspaces for delete to authenticated
  using (public.noteflow_is_workspace_owner(id));

drop policy if exists "NoteFlow members read memberships" on public.noteflow_workspace_members;
create policy "NoteFlow members read memberships"
  on public.noteflow_workspace_members for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.noteflow_is_workspace_member(workspace_id)
  );

drop policy if exists "NoteFlow owners add members" on public.noteflow_workspace_members;
create policy "NoteFlow owners add members"
  on public.noteflow_workspace_members for insert to authenticated
  with check (
    role in ('editor', 'viewer')
    and public.noteflow_is_workspace_owner(workspace_id)
    and exists (
      select 1 from public.noteflow_workspaces w
      where w.id = workspace_id and w.kind = 'team'
    )
  );

drop policy if exists "NoteFlow owners update members" on public.noteflow_workspace_members;
create policy "NoteFlow owners update members"
  on public.noteflow_workspace_members for update to authenticated
  using (
    role <> 'owner'
    and public.noteflow_is_workspace_owner(workspace_id)
    and exists (
      select 1 from public.noteflow_workspaces w
      where w.id = workspace_id and w.kind = 'team'
    )
  )
  with check (
    role in ('editor', 'viewer')
    and public.noteflow_is_workspace_owner(workspace_id)
    and exists (
      select 1 from public.noteflow_workspaces w
      where w.id = workspace_id and w.kind = 'team'
    )
  );

drop policy if exists "NoteFlow owners remove members" on public.noteflow_workspace_members;
create policy "NoteFlow owners remove members"
  on public.noteflow_workspace_members for delete to authenticated
  using (
    role <> 'owner'
    and public.noteflow_is_workspace_owner(workspace_id)
    and exists (
      select 1 from public.noteflow_workspaces w
      where w.id = workspace_id and w.kind = 'team'
    )
  );

drop policy if exists "NoteFlow members read workspace items" on public.noteflow_workspace_items;
create policy "NoteFlow members read workspace items"
  on public.noteflow_workspace_items for select to authenticated
  using (public.noteflow_is_workspace_member(workspace_id));

drop policy if exists "NoteFlow editors create workspace items" on public.noteflow_workspace_items;
create policy "NoteFlow editors create workspace items"
  on public.noteflow_workspace_items for insert to authenticated
  with check (public.noteflow_can_edit_workspace(workspace_id));

drop policy if exists "NoteFlow editors update workspace items" on public.noteflow_workspace_items;
create policy "NoteFlow editors update workspace items"
  on public.noteflow_workspace_items for update to authenticated
  using (public.noteflow_can_edit_workspace(workspace_id))
  with check (public.noteflow_can_edit_workspace(workspace_id));

drop policy if exists "NoteFlow editors delete workspace items" on public.noteflow_workspace_items;
create policy "NoteFlow editors delete workspace items"
  on public.noteflow_workspace_items for delete to authenticated
  using (public.noteflow_can_edit_workspace(workspace_id));

insert into storage.buckets (id, name, public, file_size_limit)
values ('noteflow-files', 'noteflow-files', false, 26214400)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit;

drop policy if exists "NoteFlow members read files" on storage.objects;
create policy "NoteFlow members read files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'noteflow-files'
    and exists (
      select 1
      from public.noteflow_workspace_members m
      join public.noteflow_workspaces w on w.id = m.workspace_id
      where m.workspace_id::text = (storage.foldername(name))[1]
        and m.user_id = (select auth.uid())
        and (w.kind = 'team' or m.role = 'owner')
    )
  );

drop policy if exists "NoteFlow editors upload files" on storage.objects;
create policy "NoteFlow editors upload files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'noteflow-files'
    and exists (
      select 1
      from public.noteflow_workspace_members m
      join public.noteflow_workspaces w on w.id = m.workspace_id
      where m.workspace_id::text = (storage.foldername(name))[1]
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'editor')
        and (w.kind = 'team' or m.role = 'owner')
    )
  );

drop policy if exists "NoteFlow editors update files" on storage.objects;
create policy "NoteFlow editors update files"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'noteflow-files'
    and exists (
      select 1
      from public.noteflow_workspace_members m
      join public.noteflow_workspaces w on w.id = m.workspace_id
      where m.workspace_id::text = (storage.foldername(name))[1]
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'editor')
        and (w.kind = 'team' or m.role = 'owner')
    )
  )
  with check (
    bucket_id = 'noteflow-files'
    and exists (
      select 1
      from public.noteflow_workspace_members m
      join public.noteflow_workspaces w on w.id = m.workspace_id
      where m.workspace_id::text = (storage.foldername(name))[1]
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'editor')
        and (w.kind = 'team' or m.role = 'owner')
    )
  );

drop policy if exists "NoteFlow editors delete files" on storage.objects;
create policy "NoteFlow editors delete files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'noteflow-files'
    and exists (
      select 1
      from public.noteflow_workspace_members m
      join public.noteflow_workspaces w on w.id = m.workspace_id
      where m.workspace_id::text = (storage.foldername(name))[1]
        and m.user_id = (select auth.uid())
        and m.role in ('owner', 'editor')
        and (w.kind = 'team' or m.role = 'owner')
    )
  );
