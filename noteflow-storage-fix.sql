insert into storage.buckets (id, name, public, file_size_limit)
values ('noteflow-files', 'noteflow-files', false, 26214400)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

insert into public.noteflow_workspace_members (workspace_id, user_id, role)
select w.id, w.created_by, 'owner'
from public.noteflow_workspaces w
where not exists (
  select 1
  from public.noteflow_workspace_members m
  where m.workspace_id = w.id
    and m.user_id = w.created_by
    and m.role = 'owner'
)
on conflict (workspace_id, user_id)
do update set role = 'owner';

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
