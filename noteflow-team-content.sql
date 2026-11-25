create table if not exists public.noteflow_workspace_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.noteflow_workspaces(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  details text not null default '',
  assignee_id uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'done')),
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, assignee_id)
    references public.noteflow_workspace_members(workspace_id, user_id)
);

create index if not exists noteflow_workspace_tasks_due_idx
  on public.noteflow_workspace_tasks (workspace_id, due_at);
create index if not exists noteflow_workspace_tasks_status_idx
  on public.noteflow_workspace_tasks (workspace_id, status);

alter table public.noteflow_workspace_tasks enable row level security;

grant select, insert, update, delete
  on public.noteflow_workspace_tasks to authenticated;

drop policy if exists "NoteFlow members read team tasks" on public.noteflow_workspace_tasks;
create policy "NoteFlow members read team tasks"
  on public.noteflow_workspace_tasks for select to authenticated
  using (
    public.noteflow_is_workspace_member(workspace_id)
    and exists (
      select 1 from public.noteflow_workspaces w
      where w.id = workspace_id and w.kind = 'team'
    )
  );

drop policy if exists "NoteFlow editors create team tasks" on public.noteflow_workspace_tasks;
create policy "NoteFlow editors create team tasks"
  on public.noteflow_workspace_tasks for insert to authenticated
  with check (
    public.noteflow_can_edit_workspace(workspace_id)
    and exists (
      select 1 from public.noteflow_workspaces w
      where w.id = workspace_id and w.kind = 'team'
    )
    and created_by = (select auth.uid())
  );

drop policy if exists "NoteFlow editors update team tasks" on public.noteflow_workspace_tasks;
create policy "NoteFlow editors update team tasks"
  on public.noteflow_workspace_tasks for update to authenticated
  using (
    public.noteflow_can_edit_workspace(workspace_id)
    and exists (
      select 1 from public.noteflow_workspaces w
      where w.id = workspace_id and w.kind = 'team'
    )
  )
  with check (
    public.noteflow_can_edit_workspace(workspace_id)
    and exists (
      select 1 from public.noteflow_workspaces w
      where w.id = workspace_id and w.kind = 'team'
    )
  );

drop policy if exists "NoteFlow editors delete team tasks" on public.noteflow_workspace_tasks;
create policy "NoteFlow editors delete team tasks"
  on public.noteflow_workspace_tasks for delete to authenticated
  using (
    public.noteflow_can_edit_workspace(workspace_id)
    and exists (
      select 1 from public.noteflow_workspaces w
      where w.id = workspace_id and w.kind = 'team'
    )
  );

notify pgrst, 'reload schema';
