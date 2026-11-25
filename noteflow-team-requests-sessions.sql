create table if not exists public.noteflow_team_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.noteflow_workspaces(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 140),
  category text not null default 'other'
    check (category in ('notes', 'class_timing', 'study_help', 'other')),
  details text not null default '' check (length(details) <= 2000),
  status text not null default 'open'
    check (status in ('open', 'fulfilled')),
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete cascade,   
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists noteflow_team_requests_workspace_created_idx
  on public.noteflow_team_requests (workspace_id, created_at desc);
create index if not exists noteflow_team_requests_workspace_status_idx
  on public.noteflow_team_requests (workspace_id, status);

alter table public.noteflow_team_requests enable row level security; 
grant select, insert, update, delete
  on public.noteflow_team_requests to authenticated;

drop policy if exists "NoteFlow members read team requests" on public.noteflow_team_requests;
create policy "NoteFlow members read team requests"
  on public.noteflow_team_requests for select to authenticated
  using (
    public.noteflow_is_workspace_member(workspace_id)
    and exists (
      select 1 from public.noteflow_workspaces w
      where w.id = workspace_id and w.kind = 'team'
    )
  );

drop policy if exists "NoteFlow members create team requests" on public.noteflow_team_requests;
create policy "NoteFlow members create team requests"
  on public.noteflow_team_requests for insert to authenticated
  with check (
    public.noteflow_is_workspace_member(workspace_id)
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.noteflow_workspaces w
      where w.id = workspace_id and w.kind = 'team'
    )
  );

drop policy if exists "NoteFlow authors update team requests" on public.noteflow_team_requests;
create policy "NoteFlow authors update team requests"
  on public.noteflow_team_requests for update to authenticated
  using (
    public.noteflow_is_workspace_member(workspace_id)
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.noteflow_workspaces w
      where w.id = workspace_id and w.kind = 'team'
    )
  )
  with check (
    public.noteflow_is_workspace_member(workspace_id)
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.noteflow_workspaces w
      where w.id = workspace_id and w.kind = 'team'
    )
  );

drop policy if exists "NoteFlow authors and editors delete team requests" on public.noteflow_team_requests;
create policy "NoteFlow authors and editors delete team requests"
  on public.noteflow_team_requests for delete to authenticated
  using (
    public.noteflow_is_workspace_member(workspace_id)
    and (
      created_by = (select auth.uid())
      or public.noteflow_can_edit_workspace(workspace_id)
    )
    and exists (
      select 1 from public.noteflow_workspaces w
      where w.id = workspace_id and w.kind = 'team'
    )
  );

create table if not exists public.noteflow_team_study_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.noteflow_workspaces(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 140),
  details text not null default '' check (length(details) <= 2000),
  starts_at timestamptz not null,
  duration_minutes integer not null default 60
    check (duration_minutes between 15 and 480),
  created_by uuid not null default auth.uid()
    references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists noteflow_team_study_sessions_workspace_starts_idx
  on public.noteflow_team_study_sessions (workspace_id, starts_at);

alter table public.noteflow_team_study_sessions enable row level security;
grant select, insert, update, delete
  on public.noteflow_team_study_sessions to authenticated;

drop policy if exists "NoteFlow members read team study sessions" on public.noteflow_team_study_sessions;
create policy "NoteFlow members read team study sessions"
  on public.noteflow_team_study_sessions for select to authenticated
  using (
    public.noteflow_is_workspace_member(workspace_id)
    and exists (
      select 1 from public.noteflow_workspaces w
      where w.id = workspace_id and w.kind = 'team'
    )
  );

drop policy if exists "NoteFlow members create team study sessions" on public.noteflow_team_study_sessions;
create policy "NoteFlow members create team study sessions"
  on public.noteflow_team_study_sessions for insert to authenticated
  with check (
    public.noteflow_is_workspace_member(workspace_id)
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.noteflow_workspaces w
      where w.id = workspace_id and w.kind = 'team'
    )
  );

drop policy if exists "NoteFlow authors update team study sessions" on public.noteflow_team_study_sessions;
create policy "NoteFlow authors update team study sessions"
  on public.noteflow_team_study_sessions for update to authenticated
  using (
    public.noteflow_is_workspace_member(workspace_id)
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.noteflow_workspaces w
      where w.id = workspace_id and w.kind = 'team'
    )
  )
  with check (
    public.noteflow_is_workspace_member(workspace_id)
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.noteflow_workspaces w
      where w.id = workspace_id and w.kind = 'team'
    )
  );

drop policy if exists "NoteFlow authors and editors delete team study sessions" on public.noteflow_team_study_sessions;
create policy "NoteFlow authors and editors delete team study sessions"
  on public.noteflow_team_study_sessions for delete to authenticated
  using (
    public.noteflow_is_workspace_member(workspace_id)
    and (
      created_by = (select auth.uid())
      or public.noteflow_can_edit_workspace(workspace_id)
    )
    and exists (
      select 1 from public.noteflow_workspaces w
      where w.id = workspace_id and w.kind = 'team'
    )
  );

notify pgrst, 'reload schema';
