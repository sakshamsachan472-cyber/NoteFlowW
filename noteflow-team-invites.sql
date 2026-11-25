alter table public.noteflow_workspaces
  add column if not exists description text not null default '';

create or replace function public.noteflow_create_workspace(
  p_name text,
  p_kind text,
  p_description text default ''
)
returns jsonb
language plpgsql
security definer 
set search_path = ''
as $$
declare
  v_workspace public.noteflow_workspaces%rowtype;
  v_name text := trim(coalesce(p_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Sign in before creating a workspace.';
  end if;
  if length(v_name) < 1 or length(v_name) > 120 then
    raise exception 'Workspace names must be between 1 and 120 characters.';
  end if;
  if p_kind is null or p_kind not in ('personal', 'team') then
    raise exception 'Choose a valid workspace type.';
  end if;
  if length(coalesce(p_description, '')) > 500 then
    raise exception 'Workspace descriptions must be 500 characters or fewer.';
  end if;

  insert into public.noteflow_workspaces (name, description, kind, created_by)
  values (v_name, trim(coalesce(p_description, '')), p_kind, auth.uid())
  returning * into v_workspace;

  return jsonb_build_object(
    'id', v_workspace.id,
    'name', v_workspace.name,
    'description', v_workspace.description,
    'kind', v_workspace.kind,
    'created_by', v_workspace.created_by,
    'created_at', v_workspace.created_at
  );
end;
$$;

create table if not exists public.noteflow_team_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.noteflow_workspaces(id) on delete cascade,
  workspace_name text not null,
  invited_email text not null check (
    invited_email = lower(trim(invited_email)) and length(invited_email) <= 320
  ),
  invited_by uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  responded_at timestamptz
);

create unique index if not exists noteflow_one_pending_team_invite
  on public.noteflow_team_invites (workspace_id, invited_email)
  where status = 'pending';

alter table public.noteflow_team_invites enable row level security;

grant select on public.noteflow_team_invites to authenticated;

drop policy if exists "NoteFlow users read their team invites" on public.noteflow_team_invites;
create policy "NoteFlow users read their team invites"
  on public.noteflow_team_invites for select to authenticated
  using (
    invited_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    or invited_by = (select auth.uid())
    or public.noteflow_is_workspace_owner(workspace_id)
  );

create or replace function public.noteflow_create_team_invite(
  p_workspace_id uuid,
  p_invited_email text,
  p_role text default 'editor'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_invited_email, '')));
  v_workspace_name text;
  v_invite_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in before inviting a teammate.';
  end if;
  if v_email = '' or length(v_email) > 320 or position('@' in v_email) < 2 then
    raise exception 'Enter a valid email address.';
  end if;
  if v_email = lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'You cannot invite your own email address.';
  end if;
  if p_role is null or p_role not in ('editor', 'viewer') then
    raise exception 'Choose a valid team role.';
  end if;

  select w.name into v_workspace_name
  from public.noteflow_workspaces w
  where w.id = p_workspace_id
    and w.kind = 'team'
    and public.noteflow_is_workspace_owner(w.id);
  if v_workspace_name is null then
    raise exception 'Only a team owner can invite members.';
  end if;

  update public.noteflow_team_invites
  set status = 'expired'
  where workspace_id = p_workspace_id
    and invited_email = v_email
    and status = 'pending'
    and expires_at <= now();

  select id into v_invite_id
  from public.noteflow_team_invites
  where workspace_id = p_workspace_id
    and invited_email = v_email
    and status = 'pending'
    and expires_at > now()
  order by created_at desc
  limit 1;
  if v_invite_id is not null then
    return v_invite_id;
  end if;

  insert into public.noteflow_team_invites (
    workspace_id, workspace_name, invited_email, invited_by, role
  )
  values (
    p_workspace_id, v_workspace_name, v_email, auth.uid(), p_role
  )
  returning id into v_invite_id;
  return v_invite_id;
end;
$$;

create or replace function public.noteflow_respond_team_invite(
  p_invite_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.noteflow_team_invites%rowtype;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or v_email = '' or p_accept is null then
    raise exception 'Sign in with the invited email address to respond.';
  end if;

  select * into v_invite
  from public.noteflow_team_invites
  where id = p_invite_id
    and invited_email = v_email
    and status = 'pending'
  for update;
  if not found then
    raise exception 'This invitation is unavailable or has already been answered.';
  end if;
  if v_invite.expires_at <= now() then
    update public.noteflow_team_invites
    set status = 'expired', responded_at = now()
    where id = v_invite.id;
    return jsonb_build_object(
      'workspace_id', v_invite.workspace_id,
      'workspace_name', v_invite.workspace_name,
      'status', 'expired'
    );
  end if;

  if p_accept then
    insert into public.noteflow_workspace_members (workspace_id, user_id, role)
    values (v_invite.workspace_id, auth.uid(), v_invite.role)
    on conflict (workspace_id, user_id) do nothing;
    update public.noteflow_team_invites
    set status = 'accepted', responded_at = now()
    where id = v_invite.id;
  else
    update public.noteflow_team_invites
    set status = 'declined', responded_at = now()
    where id = v_invite.id;
  end if;

  return jsonb_build_object(
    'workspace_id', v_invite.workspace_id,
    'workspace_name', v_invite.workspace_name,
    'status', case when p_accept then 'accepted' else 'declined' end
  );
end;
$$;

revoke all on function public.noteflow_create_team_invite(uuid, text, text) from public, anon;
revoke all on function public.noteflow_respond_team_invite(uuid, boolean) from public, anon;
revoke all on function public.noteflow_create_workspace(text, text, text) from public, anon;
grant execute on function public.noteflow_create_team_invite(uuid, text, text) to authenticated;
grant execute on function public.noteflow_respond_team_invite(uuid, boolean) to authenticated;
grant execute on function public.noteflow_create_workspace(text, text, text) to authenticated;

notify pgrst, 'reload schema';
