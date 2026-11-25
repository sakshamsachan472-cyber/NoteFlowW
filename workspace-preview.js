(function () {
  "use strict";

  const SESSION_STORAGE_KEY = "noteflow_supabase_session";
  let authSession = null;
  try {
    const savedSession = localStorage.getItem(SESSION_STORAGE_KEY);
    authSession = savedSession ? JSON.parse(savedSession) : null;
  } catch (error) {
    authSession = null;
  }
  if (!authSession || !authSession.access_token || !authSession.user || !authSession.user.id) {
    window.location.replace("LANDINGPAGE.html");
    return;
  }
  const accountId = authSession.user.id;
  const userMetadata = authSession.user.user_metadata || {};
  const displayName = (userMetadata.full_name || authSession.user.email || "NoteFlow user").trim();
  const firstName = displayName.split(/\s+/)[0];
  const initials = displayName.split(/\s+/).map(function (part) { return part.charAt(0); }).join("").slice(0, 2).toUpperCase();
  const profileName = document.getElementById("workspace-profile-name");
  const greetingName = document.getElementById("workspace-greeting-name");
  const spaceName = document.getElementById("workspace-space-name");
  const spaceIcon = document.getElementById("workspace-space-icon");
  const avatar = document.getElementById("workspace-avatar");
  const signout = document.getElementById("workspace-signout");
  if (profileName) profileName.textContent = displayName;
  if (greetingName) greetingName.textContent = firstName;
  if (spaceName) spaceName.textContent = firstName + "'s workspace";
  if (spaceIcon) spaceIcon.textContent = (firstName.charAt(0) || "N").toUpperCase();
  if (avatar) avatar.textContent = initials || "N";
  if (signout) {
    signout.addEventListener("click", function () {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      window.location.replace("LANDINGPAGE.html");
    });
  }

  const NOTES_KEY = "noteflow.workspacePreview.notes." + accountId;
  const WORKSPACE_KEY = "noteflow.workspacePreview.workspace." + accountId;
  const TEAM_KEY = "noteflow.workspacePreview.team." + accountId;
  const FILES_DB = "noteflow.workspacePreview.files." + accountId;
  const FILES_STORE = "files";
  const MAX_FILE_BYTES = 25 * 1024 * 1024;
  const SUPABASE_URL = "https://lqtyxouobzircrcoejjz.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_p-MxDS1RmMJLVzUIL8V2fA_VRqoi08d";
  const $ = function (id) { return document.getElementById(id); }; 
  const notesList = $("notes-list");
  const noteForm = $("note-editor");
  const errorMessage = $("notes-error");
  const dialog = $("workspace-dialog");
  const dialogForm = $("workspace-dialog-form");
  const fileList = $("workspace-file-list");
  const recentUploadList = $("recent-upload-list");
  const filePreviewDialog = $("file-preview-dialog");
  const filePreviewContent = $("file-preview-content");
  const meetingsList = $("workspace-meeting-list");
  const tasksList = $("workspace-task-list");
  const teamList = $("team-list");
  const teamInviteList = $("team-invite-list");
  const teamMemberList = $("team-member-list");
  const teamOutgoingInvites = $("team-outgoing-invites");
  const teamFeedback = $("team-feedback");
  const teamSharedItemsElement = $("team-shared-items");
  const teamSharedTasksElement = $("team-shared-tasks");
  const teamRequestsElement = $("team-requests");
  const teamStudySessionsElement = $("team-study-sessions");
  const teamFileList = $("team-file-list");
  const teamFilePicker = $("team-file-picker");
  const teamFileFeedback = $("team-file-feedback");
  const teamRemovalNoticeList = $("team-removal-notice-list");
  const teamFileShareDialog = $("team-file-share-dialog");
  const teamFileShareList = $("team-file-share-list");
  const teamFileShareError = $("team-file-share-error");
  const teamFileShareSubmit = $("team-file-share-submit");
  const workShareTeamDialog = $("work-share-team-dialog");
  const workShareTeamSelect = $("work-share-team-select");
  const workShareTeamError = $("work-share-team-error");
  const workShareTeamSubmit = $("work-share-team-submit");
  let filePreviewUrl = null;
  let cloudWorkspaceId = null;
  let cloudReady = false;
  let cloudSyncTimer = null;
  let cloudSyncInProgress = false;
  let cloudSyncPending = false;
  let applyingCloudData = false;
  const LEGACY_DATA_OWNER_KEY = "noteflow.workspacePreview.legacyDataOwner";
  try {
    if (!localStorage.getItem(LEGACY_DATA_OWNER_KEY)) {
      [
        ["noteflow.workspacePreview.notes", NOTES_KEY],
        ["noteflow.workspacePreview.workspace", WORKSPACE_KEY],
        ["noteflow.workspacePreview.team", TEAM_KEY]
      ].forEach(function (keys) {
        const legacyData = localStorage.getItem(keys[0]);
        if (legacyData !== null && localStorage.getItem(keys[1]) === null) {
          localStorage.setItem(keys[1], legacyData);
        }
      });
      localStorage.setItem(LEGACY_DATA_OWNER_KEY, accountId);
    }
  } catch (error) {
    console.error("Could not migrate local workspace data to this account:", error);
    showWorkspaceError("Existing browser data couldn't be separated for this account. Check browser storage settings.");
  }
  const seedNotes = [
    { id: "lecture-notes", title: "Biology — cell structure", body: "Review the key organelles, their functions, and the differences between plant and animal cells.", category: "Coursework", updatedAt: "2026-10-26T08:30:00.000Z", starred: true },
    { id: "history-reading", title: "History reading notes", body: "Capture the main arguments, important dates, and questions to bring to the next class.", category: "Class notes", updatedAt: "2026-10-25T12:00:00.000Z", starred: false },
    { id: "research-outline", title: "Research project — source outline", body: "Organize useful sources, shape the research question, and map out the first draft.", category: "Project", updatedAt: "2026-10-24T09:15:00.000Z", starred: true },
    { id: "weekly-study-plan", title: "This week's study plan", body: "Break revision into focused sessions and leave time to review before the Friday quiz.", category: "Study plan", updatedAt: "2026-10-23T10:45:00.000Z", starred: false }
  ];
  const seedTasks = [
    { id: "task-1", title: "Review the presentation outline", done: false },
    { id: "task-2", title: "Prepare for the project check-in", done: false },
    { id: "task-3", title: "Send the updated brief", done: true }
  ];
  const seedStudentTasks = [
    { id: "study-task-1", title: "Review today's lecture slides", done: false },
    { id: "study-task-2", title: "Finish the research outline", done: false },
    { id: "study-task-3", title: "Prepare for the Friday quiz", done: true }
  ];
  const copy = {
    professional: {
      space: "PROFESSIONAL SPACE",
      breadcrumb: "Professional workspace",
      description: "Your workday, organized around the things you need to get done.",
      actions: [
        ["New presentation", "Build a deck for your next big idea"],
        ["Start a meeting", "Set up a focused session with notes"],
        ["Upload file", "Add a file from your device"],
        ["More", "Notes, documents, and other work"]
      ],
      work: "Recent work",
      workSubtitle: "Pick up where you left off.",
      tasks: "My tasks",
      tasksSubtitle: "A clear list for your priorities.",
      meetings: "Upcoming meetings",
      presentation: "New presentation",
      doc: "New document",
      meetingLabel: "Schedule a meeting"
    },
    student: {
      space: "STUDENT SPACE",
      breadcrumb: "Student workspace",
      description: "A calmer way to keep up with classes, study sessions, projects, and deadlines.",
      actions: [
        ["Create study slides", "Turn class notes into slides for revision"],
        ["Start a study session", "Set a focus block and capture your notes"],
        ["Upload class files", "Keep lecture slides and readings close"],
        ["More", "Notes, coursework, and study documents"]
      ],
      work: "Recent coursework",
      workSubtitle: "Pick up where you left off in class.",
      tasks: "Study plan",
      tasksSubtitle: "Your next steps for today.",
      meetings: "Study sessions",
      presentation: "Create study slides",
      doc: "New class document",
      meetingLabel: "Plan a study session"
    }
  };
  const dateOptions = { month: "short", day: "numeric" };
  let notes = loadNotes();
  let savedWorkspace = loadWorkspace();
  let teamWorkspace = null;
  let teamWorkspaces = [];
  let pendingTeamInvites = [];
  let teamMembers = [];
  let outgoingTeamInvites = [];
  let teamSharedItems = [];
  let teamTasks = [];
  let teamRequests = [];
  let teamStudySessions = [];
  let teamCollaborationError = "";
  let teamFiles = [];
  let teamFilesError = "";
  let teamRemovalNotices = [];
  let teamManagementReady = false;
  let teamManagementUnavailable = false;
  let teamManagementError = "";
  let shareablePersonalFiles = [];
  let selectedTeamId = null;
  let teamDataError = null;
  let teamDataReady = false;
  let editingTeamItemId = null;
  let editingTeamTaskId = null;
  let editingTeamRequestId = null;
  let removingTeamMemberId = null;
  let workItemToShare = null;
  let activeWorkspace = "solo";
  let persona = savedWorkspace.persona;
  let currentFilter = window.location.hash === "#starred" ? "starred" : "all";
  let currentWorkTypeFilter = currentFilter;
  let editingNoteId = null;
  let activeDocumentId = null;
  let documentSaveTimer = null;
  let newItemCategory = "Note";
  let slideCanvas = null;
  let activeDeckId = null;
  let activeSlideIndex = 0;
  let isLoadingPresentationSlide = false;
  let presentationSaveTimer = null;
  let activePresentationText = null;
  let presentationTextSelection = null;
  let presentationTextReflowFrame = null;
  let presentationTextStyle = { fontFamily: "Arial", fontSize: 32, fontWeight: "normal", fill: "#263449" };
  const presentationTypingStyles = new WeakMap();
  const presentationTextSnapshots = new WeakMap();
  let searchTerm = "";
  let dialogAction = "";
  let fileDatabasePromise;

  function readLocal(key, fallback, isValid) {
    try {
      const saved = localStorage.getItem(key);
      if (saved === null) return fallback;
      const parsed = JSON.parse(saved);
      if (!isValid(parsed)) throw new Error("Saved workspace data has an unexpected format.");
      return parsed;
    } catch (error) {
      console.error("Could not load workspace data:", error);
      showWorkspaceError("Some saved workspace data couldn't be loaded. Check browser storage and refresh.");
      return fallback;
    }
  }

  function loadNotes() {
    const stored = readLocal(NOTES_KEY, seedNotes.map(function (note) { return { ...note }; }), function (value) {
      return Array.isArray(value) && value.every(function (note) {
        return note && typeof note.id === "string" && typeof note.title === "string" &&
          typeof note.body === "string" && typeof note.category === "string" &&
          typeof note.updatedAt === "string" && typeof note.starred === "boolean";
      });
    });
    const oldDemoNotes = {
      "welcome-note": ["A little space to think", "Welcome to your workspace. Keep ideas, plans, and the small things you don't want to forget all in one place."],
      "project-plan": ["Project launch plan", "Outline the first milestones, gather references, and turn the big idea into a few clear next steps."],
      "design-ideas": ["Ideas for the new design", "Keep the interface calm and focused. Use color to make the important actions easy to find."],
      "weekly-focus": ["This week's focus", "Make time for deep work, finish the open tasks, and leave a little room for something new."]
    };
    const isOldDemoSet = stored.length === Object.keys(oldDemoNotes).length &&
      stored.every(function (note) {
        const oldDemo = oldDemoNotes[note.id];
        return oldDemo && note.title === oldDemo[0] && note.body === oldDemo[1];
      });
    return isOldDemoSet ? seedNotes.map(function (note) { return { ...note }; }) : stored;
  }

  function loadWorkspace() {
    const stored = readLocal(WORKSPACE_KEY, {}, function (value) {
      return value && typeof value === "object" && !Array.isArray(value) &&
        (value.persona === undefined || value.persona === "professional" || value.persona === "student") &&
        (value.meetings === undefined || (Array.isArray(value.meetings) && value.meetings.every(function (meeting) {
          return meeting && typeof meeting.id === "string" && typeof meeting.title === "string" &&
            typeof meeting.date === "string" && typeof meeting.details === "string";
        }))) &&
        [value.tasks, value.tasksProfessional, value.tasksStudent].every(function (tasks) {
          return tasks === undefined || (Array.isArray(tasks) && tasks.every(function (task) {
            return task && typeof task.id === "string" && typeof task.title === "string" && typeof task.done === "boolean";
          }));
        });
    });
    return {
      persona: "student",
      meetings: stored.meetings || [],
      tasksProfessional: stored.tasksProfessional || stored.tasks || seedTasks.map(function (task) { return { ...task }; }),
      tasksStudent: stored.tasksStudent || seedStudentTasks.map(function (task) { return { ...task }; })
    };
  }

  function loadTeam() {
    return readLocal(TEAM_KEY, null, function (value) {
      return value === null || (
        value && typeof value === "object" && !Array.isArray(value) &&
        typeof value.name === "string" && value.name.trim().length > 0 &&
        typeof value.description === "string" &&
        typeof value.createdAt === "string"
      );
    });
  }

  function saveTeam(team) {
    try {
      localStorage.setItem(TEAM_KEY, JSON.stringify(team));
      return true;
    } catch (error) {
      console.error("Could not save team workspace:", error);
      showWorkspaceError("The team workspace couldn't be saved in this browser. Check storage settings and try again.");
      return false;
    }
  }

  function saveNotes() {
    try {
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
      if (cloudReady && !applyingCloudData) scheduleCloudSync();
      errorMessage.hidden = true;
      errorMessage.textContent = "";
      return true;
    } catch (error) {
      console.error("Could not save workspace documents:", error);
      errorMessage.hidden = false;
      errorMessage.textContent = "The workspace item couldn't be saved in this browser. Check storage settings and try again.";
      return false;
    }
  }

  function saveWorkspace() {
    try {
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify({
        persona: persona,
        meetings: savedWorkspace.meetings,
        tasksProfessional: savedWorkspace.tasksProfessional,
        tasksStudent: savedWorkspace.tasksStudent
      }));
      if (cloudReady && !applyingCloudData) scheduleCloudSync();
      return true;
    } catch (error) {
      console.error("Could not save workspace preferences:", error);
      showWorkspaceError("Workspace changes couldn't be saved. Check browser storage and try again.");
      return false;
    }
  }

  async function refreshCloudSession() {
    if (!authSession.refresh_token) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      window.location.replace("LANDINGPAGE.html");
      throw new Error("Your session expired. Please log in again.");
    }
    const response = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refresh_token: authSession.refresh_token })
    });
    const result = await response.json().catch(function () { return null; });
    if (!response.ok || !result || !result.access_token) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      window.location.replace("LANDINGPAGE.html");
      throw new Error(result && (result.msg || result.message || result.error_description)
        ? (result.msg || result.message || result.error_description)
        : "Your session expired. Please log in again.");
    }
    authSession = {
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      expires_at: result.expires_at || Math.floor(Date.now() / 1000) + (result.expires_in || 3600),
      user: result.user || authSession.user
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(authSession));
  }

  async function cloudRequest(path, options, retryAfterRefresh) {
    const retry = retryAfterRefresh !== false;
    if (authSession.expires_at && authSession.expires_at * 1000 <= Date.now() + 60000) {
      await refreshCloudSession();
    }
    const requestOptions = options || {};
    const headers = Object.assign({}, requestOptions.headers || {}, {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: "Bearer " + authSession.access_token
    });
    const response = await fetch(SUPABASE_URL + path, Object.assign({}, requestOptions, { headers: headers }));
    if (response.status === 401 && retry && authSession.refresh_token) {
      await refreshCloudSession();
      return cloudRequest(path, requestOptions, false);
    }
    const responseText = response.status === 204 ? "" : await response.text();
    let result = null;
    if (responseText) {
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error("Supabase returned an unreadable response.");
      }
    }
    if (!response.ok) {
      throw new Error(result && (result.message || result.error || result.details || result.hint)
        ? (result.message || result.error || result.details || result.hint)
        : "Supabase returned " + response.status + ".");
    }
    return result;
  }

  async function cloudStorageRequest(path, options, retryAfterRefresh) {
    const retry = retryAfterRefresh !== false;
    if (authSession.expires_at && authSession.expires_at * 1000 <= Date.now() + 60000) {
      await refreshCloudSession();
    }
    const requestOptions = options || {};
    const headers = Object.assign({}, requestOptions.headers || {}, {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: "Bearer " + authSession.access_token
    });
    const response = await fetch(SUPABASE_URL + path, Object.assign({}, requestOptions, { headers: headers }));
    if (response.status === 401 && retry && authSession.refresh_token) {
      await refreshCloudSession();
      return cloudStorageRequest(path, requestOptions, false);
    }
    if (!response.ok) {
      const responseText = await response.text();
      let result = null;
      try {
        result = responseText ? JSON.parse(responseText) : null;
      } catch {
        result = null;
      }
      throw new Error(result && (result.message || result.error || result.error_description)
        ? (result.message || result.error || result.error_description)
        : "Supabase Storage returned " + response.status + ".");
    }
    return response;
  }

  function encodeStoragePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  function createWorkspaceFilePath(file, id, workspaceId) {
    const targetWorkspaceId = workspaceId || cloudWorkspaceId;
    if (!targetWorkspaceId) throw new Error("Your workspace is still connecting to Supabase. Try again in a moment.");
    return targetWorkspaceId + "/" + (id || createId()) + "__" + file.name;
  }

  async function uploadWorkspaceFile(file, id, workspaceId) {
    const path = createWorkspaceFilePath(file, id, workspaceId);
    await cloudStorageRequest("/storage/v1/object/noteflow-files/" + encodeStoragePath(path), {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "true"
      },
      body: file.blob || file
    });
    return path;
  }

  async function listWorkspaceFiles(workspaceId, offset) {
    const targetWorkspaceId = workspaceId || cloudWorkspaceId;
    if (!targetWorkspaceId) return [];
    return cloudStorageRequest("/storage/v1/object/list/noteflow-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prefix: targetWorkspaceId,
        limit: 1000,
        offset: Math.max(0, Number(offset) || 0),
        sortBy: { column: "created_at", order: "desc" }
      })
    }).then(function (response) { return response.json(); });
  }

  async function listAllWorkspaceFiles(workspaceId) {
    const files = [];
    let offset = 0;
    while (true) {
      const page = await listWorkspaceFiles(workspaceId, offset);
      files.push.apply(files, page || []);
      if (!page || page.length < 1000) return files;
      offset += page.length;
    }
  }

  async function downloadWorkspaceFile(path) {
    const response = await cloudStorageRequest(
      "/storage/v1/object/authenticated/noteflow-files/" + encodeStoragePath(path)
    );
    return response.blob();
  }

  async function deleteWorkspaceFile(path) {
    await cloudStorageRequest("/storage/v1/object/noteflow-files", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [path] })
    });
  }

  function workspaceItemRows() {
    const rows = notes.map(function (note, index) {
      return {
        workspace_id: cloudWorkspaceId,
        item_id: "note:" + note.id,
        item_type: "note",
        content: { item: note, position: index },
        updated_at: new Date().toISOString()
      };
    });
    savedWorkspace.tasksProfessional.forEach(function (task, index) {
      rows.push({
        workspace_id: cloudWorkspaceId,
        item_id: "task:professional:" + task.id,
        item_type: "task-professional",
        content: { item: task, position: index },
        updated_at: new Date().toISOString()
      });
    });
    savedWorkspace.tasksStudent.forEach(function (task, index) {
      rows.push({
        workspace_id: cloudWorkspaceId,
        item_id: "task:student:" + task.id,
        item_type: "task-student",
        content: { item: task, position: index },
        updated_at: new Date().toISOString()
      });
    });
    savedWorkspace.meetings.forEach(function (meeting, index) {
      rows.push({
        workspace_id: cloudWorkspaceId,
        item_id: "meeting:" + meeting.id,
        item_type: "meeting",
        content: { item: meeting, position: index },
        updated_at: new Date().toISOString()
      });
    });
    rows.push({
      workspace_id: cloudWorkspaceId,
      item_id: "preferences",
      item_type: "preferences",
      content: { persona: persona },
      updated_at: new Date().toISOString()
    });
    return rows;
  }

  async function syncWorkspaceSnapshot() {
    if (!cloudWorkspaceId || !navigator.onLine) return;
    if (cloudSyncInProgress) {
      cloudSyncPending = true;
      return;
    }
    cloudSyncInProgress = true;
    try {
      const desiredRows = workspaceItemRows();
      const existingRows = await cloudRequest(
        "/rest/v1/noteflow_workspace_items?select=item_id&workspace_id=eq." + encodeURIComponent(cloudWorkspaceId)
      ) || [];
      await cloudRequest(
        "/rest/v1/noteflow_workspace_items?on_conflict=workspace_id%2Citem_id",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=minimal"
          },
          body: JSON.stringify(desiredRows)
        }
      );
      const desiredIds = new Set(desiredRows.map(function (row) { return row.item_id; }));
      for (const row of existingRows) {
        if (desiredIds.has(row.item_id)) continue;
        await cloudRequest(
          "/rest/v1/noteflow_workspace_items?workspace_id=eq." +
          encodeURIComponent(cloudWorkspaceId) + "&item_id=eq." + encodeURIComponent(row.item_id),
          { method: "DELETE" }
        );
      }
      const status = $("workspace-error");
      if (status.textContent.indexOf("Cloud sync") === 0) {
        status.hidden = true;
        status.textContent = "";
      }
    } finally {
      cloudSyncInProgress = false;
      if (cloudSyncPending) {
        cloudSyncPending = false;
        scheduleCloudSync();
      }
    }
  }

  function scheduleCloudSync() {
    if (!cloudReady || !cloudWorkspaceId || applyingCloudData) return;
    window.clearTimeout(cloudSyncTimer);
    if (!navigator.onLine) {
      showWorkspaceError("Cloud sync is paused while offline. Changes are saved in this browser.");
      return;
    }
    cloudSyncTimer = window.setTimeout(function () {
      syncWorkspaceSnapshot().catch(function (error) {
        console.error("Could not sync workspace data to Supabase:", error);
        showWorkspaceError("Cloud sync failed. Changes are saved in this browser. " + error.message);
      });
    }, 800);
  }

  async function initializeCloudSync() {
    try {
      const workspacePath = "/rest/v1/noteflow_workspaces?select=id&kind=eq.personal&created_by=eq." +
        encodeURIComponent(accountId) + "&order=created_at.asc&limit=1";
      let workspaces = await cloudRequest(workspacePath) || [];
      if (!workspaces.length) {
        const createdWorkspace = await cloudRequest("/rest/v1/rpc/noteflow_create_workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            p_name: firstName + "'s workspace",
            p_kind: "personal",
            p_description: ""
          })
        });
        workspaces = createdWorkspace ? [createdWorkspace] : [];
      }
      if (!workspaces.length || !workspaces[0].id) {
        throw new Error("Supabase did not return a personal workspace.");
      }
      cloudWorkspaceId = workspaces[0].id;
      const remoteRows = await cloudRequest(
        "/rest/v1/noteflow_workspace_items?select=item_id,item_type,content&workspace_id=eq." +
        encodeURIComponent(cloudWorkspaceId)
      ) || [];
      if (remoteRows.length) {
        applyingCloudData = true;
        const byType = function (type) {
          return remoteRows.filter(function (row) { return row.item_type === type; })
            .sort(function (a, b) { return (a.content.position || 0) - (b.content.position || 0); })
            .map(function (row) { return row.content.item; });
        };
        notes = byType("note");
        savedWorkspace.tasksProfessional = byType("task-professional");
        savedWorkspace.tasksStudent = byType("task-student");
        savedWorkspace.meetings = byType("meeting");
        const preferences = remoteRows.find(function (row) { return row.item_type === "preferences"; });
        if (preferences && ["student", "professional"].includes(preferences.content.persona)) {
          persona = preferences.content.persona;
          savedWorkspace.persona = persona;
        }
        if (!saveNotes() || !saveWorkspace()) {
          throw new Error("Cloud data loaded, but could not be cached in this browser.");
        }
        applyingCloudData = false;
        updatePersona(persona);
        renderMeetings();
        renderTasks();
        renderFiles();
        updateNavigation();
      } else {
        cloudReady = true;
        await syncWorkspaceSnapshot();
      }
      cloudReady = true;
      renderFiles();
      migrateBrowserFilesToCloud().catch(function (error) {
        console.error("Could not migrate browser-saved files to Supabase:", error);
        $("files-error").hidden = false;
        $("files-error").textContent = "Older files remain saved only in this browser. " + error.message;
      });
      const status = $("workspace-error");
      if (status.textContent.indexOf("Cloud sync is paused") === 0) {
        status.hidden = true;
        status.textContent = "";
      }
      try {
        await loadTeamHubData();
        teamDataError = null;
      } catch (teamError) {
        teamDataError = teamError;
        teamDataReady = false;
        console.error("Could not load team invitations:", teamError);
        if (window.location.hash === "#team") {
          showWorkspaceError("Team features need their database migrations. Run noteflow-team-invites.sql and noteflow-team-content.sql in Supabase SQL Editor.");
        }
      }
    } catch (error) {
      applyingCloudData = false;
      cloudReady = false;
      console.error("Could not initialize Supabase workspace sync:", error);
      showWorkspaceError("Workspace data is saved in this browser, but cloud sync could not start. " + error.message);
    }
  }

  async function loadTeamHubData() {
    const teamPath = "/rest/v1/noteflow_workspaces?select=id,name,description,created_by,created_at&kind=eq.team&order=created_at.desc";
    teamWorkspaces = await cloudRequest(teamPath) || [];
    const email = String(authSession.user.email || "").toLowerCase();
    const invitePath = "/rest/v1/noteflow_team_invites?select=id,workspace_id,workspace_name,invited_email,role,status,created_at,expires_at&invited_email=eq." +
      encodeURIComponent(email) + "&status=eq.pending&expires_at=gt." +
      encodeURIComponent(new Date().toISOString()) + "&order=created_at.desc";
    pendingTeamInvites = email ? await cloudRequest(invitePath) || [] : [];
    if (!teamManagementUnavailable) {
      try {
        teamRemovalNotices = await cloudRequest(
          "/rest/v1/noteflow_team_member_removals?select=id,workspace_name,reason,removed_at&removed_user_id=eq." +
          encodeURIComponent(accountId) + "&order=removed_at.desc&limit=5"
        ) || [];
        teamManagementReady = true;
        teamManagementError = "";
      } catch (error) {
        teamRemovalNotices = [];
        teamManagementReady = false;
        teamManagementError = error.message;
        teamManagementUnavailable = /noteflow_team_member_removals|schema cache|404/i.test(error.message);
        console.error("Could not load team removal notices:", error);
      }
    } else {
      teamRemovalNotices = [];
      teamManagementReady = false;
    }

    if (!teamWorkspaces.some(function (team) { return team.id === selectedTeamId; })) {
      selectedTeamId = teamWorkspaces.length ? teamWorkspaces[0].id : null;
    }
    teamWorkspace = teamWorkspaces.find(function (team) { return team.id === selectedTeamId; }) || null;
    teamMembers = [];
    outgoingTeamInvites = [];
    teamSharedItems = [];
    teamTasks = [];
    teamRequests = [];
    teamStudySessions = [];
    teamCollaborationError = "";
    teamFiles = [];
    teamFilesError = "";
    if (teamWorkspace) {
      const workspaceId = encodeURIComponent(teamWorkspace.id);
      const results = await Promise.all([
        cloudRequest(
          "/rest/v1/noteflow_workspace_members?select=workspace_id,user_id,role&workspace_id=eq." +
          workspaceId + "&order=created_at.asc"
        ),
        cloudRequest(
          "/rest/v1/noteflow_team_invites?select=id,invited_email,role,status,created_at,expires_at&workspace_id=eq." +
          workspaceId + "&order=created_at.desc"
        ),
        cloudRequest(
          "/rest/v1/noteflow_workspace_items?select=item_id,item_type,content,updated_at&workspace_id=eq." +
          workspaceId + "&order=updated_at.desc"
        ),
        cloudRequest(
          "/rest/v1/noteflow_workspace_tasks?select=id,title,details,assignee_id,due_at,status,created_by,created_at,updated_at&workspace_id=eq." +
          workspaceId + "&order=created_at.desc"
        )
      ]);
      teamMembers = results[0] || [];
      outgoingTeamInvites = results[1] || [];
      teamSharedItems = (results[2] || []).filter(function (row) {
        return row.item_type === "team-note" || row.item_type === "team-document";
      }).map(function (row) {
        return row.content && row.content.item;
      }).filter(Boolean);
      teamTasks = results[3] || [];
      try {
        const collaborationResults = await Promise.all([
          cloudRequest(
            "/rest/v1/noteflow_team_requests?select=id,workspace_id,title,category,details,status,created_by,created_at,updated_at&workspace_id=eq." +
            workspaceId + "&order=created_at.desc"
          ),
          cloudRequest(
            "/rest/v1/noteflow_team_study_sessions?select=id,workspace_id,title,details,starts_at,duration_minutes,created_by,created_at,updated_at&workspace_id=eq." +
            workspaceId + "&order=starts_at.asc"
          )
        ]);
        teamRequests = collaborationResults[0] || [];
        teamStudySessions = collaborationResults[1] || [];
      } catch (error) {
        teamCollaborationError = error.message;
        console.error("Could not load team requests and study sessions:", error);
      }
      try {
        teamFiles = await listWorkspaceFiles(teamWorkspace.id) || [];
      } catch (error) {
        teamFilesError = error.message;
        console.error("Could not load shared team files:", error);
      }
    }
    teamDataError = null;
    teamDataReady = true;
    renderTeamHub();
  }

  function renderTeamHub() {
    const pendingCount = pendingTeamInvites.length;
    $("team-invite-count").textContent = String(pendingCount);
    $("team-invite-count").hidden = pendingCount === 0;
    $("team-invite-heading-count").textContent = pendingCount ? "(" + pendingCount + ")" : "";

    teamList.innerHTML = teamWorkspaces.length
      ? teamWorkspaces.map(function (team) {
        return '<button type="button" class="team-list-item' +
          (team.id === selectedTeamId ? " is-selected" : "") +
          '" data-team-select="' + escapeHTML(team.id) + '"><span><strong>' +
          escapeHTML(team.name) + "</strong><small>" +
          escapeHTML(team.description || "Team workspace") +
          '</small></span><span aria-hidden="true">›</span></button>';
      }).join("")
      : '<p class="team-list-empty">You haven’t joined a team yet. Create one, or accept an invitation.</p>';

    teamInviteList.innerHTML = pendingCount
      ? pendingTeamInvites.map(function (invite) {
        return '<article class="team-invite-card"><div class="team-invite-copy"><strong>' +
          escapeHTML(invite.workspace_name) + '</strong><small>Invited as ' +
          escapeHTML(invite.role) + '</small></div><div class="team-invite-actions">' +
          '<button type="button" data-invite-decline="' + escapeHTML(invite.id) + '">Decline</button>' +
          '<button type="button" data-invite-accept="' + escapeHTML(invite.id) + '">Accept</button>' +
          "</div></article>";
      }).join("")
      : '<p class="team-invite-empty">No pending invitations.</p>';

    teamRemovalNoticeList.innerHTML = teamRemovalNotices.map(function (notice) {
      return '<article class="team-removal-notice"><strong>You were removed from ' +
        escapeHTML(notice.workspace_name) + '</strong><p>Reason: ' +
        escapeHTML(notice.reason) + '</p><small>' +
        escapeHTML(new Date(notice.removed_at).toLocaleString()) + "</small></article>";
    }).join("");
    teamRemovalNoticeList.hidden = teamRemovalNotices.length === 0;
    $("team-management-warning").hidden = teamManagementReady;
    $("team-management-warning").textContent = teamManagementReady
      ? ""
      : /noteflow_team_member_removals|schema cache|404/i.test(teamManagementError)
        ? "Team deletion and member removal need the noteflow-team-management.sql migration in Supabase."
        : "Team management setup couldn't be checked. " + teamManagementError;

    $("team-details").hidden = !teamWorkspace;
    if (!teamWorkspace) return;
    $("team-detail-name").textContent = teamWorkspace.name;
    $("team-detail-description").textContent = teamWorkspace.description || "A shared place for your team.";
    $("team-invite-button").hidden = teamWorkspace.created_by !== accountId;
    $("team-delete-button").hidden = !isTeamOwner() || !teamManagementReady;
    teamMemberList.innerHTML = teamMembers.length
      ? teamMembers.map(function (member, index) {
        const isCurrentUser = member.user_id === accountId;
        const role = member.role.charAt(0).toUpperCase() + member.role.slice(1);
        const memberLabel = isCurrentUser
          ? "You"
          : "Team member " + (index + 1) + " · " + member.user_id.slice(0, 8);
        const removeAction = teamWorkspace.created_by === accountId &&
          !isCurrentUser && member.role !== "owner" && teamManagementReady
          ? '<button type="button" class="team-member-remove" data-team-member-remove="' +
            escapeHTML(member.user_id) + '" data-member-label="' +
            escapeHTML(memberLabel) + '">Remove</button>'
          : "";
        return '<div class="team-member-row"><span><strong>' +
          escapeHTML(memberLabel) +
          '</strong><small>' + escapeHTML(role) + "</small></span>" +
          (removeAction ? '<div class="team-member-actions">' + removeAction + "</div>" : "") +
          "</div>";
      }).join("")
      : '<p class="team-list-empty">No members found.</p>';
    teamOutgoingInvites.innerHTML = outgoingTeamInvites.length
      ? outgoingTeamInvites.map(function (invite) {
        const status = invite.status === "pending" && new Date(invite.expires_at) <= new Date()
          ? "Expired"
          : invite.status.charAt(0).toUpperCase() + invite.status.slice(1);
        return '<div class="team-member-row"><span><strong>' + escapeHTML(invite.invited_email) +
          '</strong><small>' + escapeHTML(invite.role) + " · " + escapeHTML(status) +
          "</small></span></div>";
      }).join("")
      : '<p class="team-invite-empty">No invitations sent yet.</p>';
    const canEdit = canEditTeam();
    $("team-item-create").hidden = !canEdit;
    $("team-task-create").hidden = !canEdit;
    $("team-file-upload").hidden = !canEdit;
    $("team-file-share-existing").hidden = !canEdit;
    $("team-collaboration-feedback").hidden = !teamCollaborationError;
    $("team-collaboration-feedback").textContent = teamCollaborationError
      ? "Requests and group sessions couldn't load. Run noteflow-team-requests-sessions.sql in Supabase SQL Editor. " +
        teamCollaborationError
      : "";
    $("team-request-create").disabled = Boolean(teamCollaborationError);
    $("team-session-create").disabled = Boolean(teamCollaborationError);
    renderTeamSharedItems(canEdit);
    renderTeamTasks(canEdit);
    renderTeamRequests();
    renderTeamStudySessions();
    renderTeamFiles(canEdit);
  }

  function canEditTeam() {
    const membership = teamMembers.find(function (member) { return member.user_id === accountId; });
    return Boolean(membership && (membership.role === "owner" || membership.role === "editor"));
  }

  function isTeamOwner() {
    return teamMembers.some(function (member) {
      return member.user_id === accountId && member.role === "owner";
    });
  }

  function isTeamMember() {
    return teamMembers.some(function (member) { return member.user_id === accountId; });
  }

  function openTeamMemberRemovalDialog(memberId, memberLabel) {
    if (!teamWorkspace || teamWorkspace.created_by !== accountId || !teamManagementReady) return;
    const member = teamMembers.find(function (item) { return item.user_id === memberId; });
    if (!member || member.role === "owner" || member.user_id === accountId) return;
    removingTeamMemberId = member.user_id;
    $("team-member-remove-form").reset();
    $("team-member-remove-error").hidden = true;
    $("team-member-remove-description").textContent =
      "You are removing " + memberLabel + " from " + teamWorkspace.name +
      ". They will see the reason and lose access to this team's shared content.";
    $("team-member-remove-dialog").showModal();
    $("team-member-remove-reason").focus();
  }

  async function removeTeamMember(event) {
    event.preventDefault();
    const member = teamMembers.find(function (item) {
      return item.user_id === removingTeamMemberId;
    });
    const reason = $("team-member-remove-reason").value.trim();
    const error = $("team-member-remove-error");
    const submit = $("team-member-remove-form").querySelector('button[type="submit"]');
    if (!teamWorkspace || teamWorkspace.created_by !== accountId || !member ||
        member.role === "owner" || !teamManagementReady) return;
    if (!reason) {
      error.textContent = "Enter a reason before removing this member.";
      error.hidden = false;
      return;
    }
    if (!window.confirm(
      "Remove this member from " + teamWorkspace.name + "?\n\nReason: " + reason +
      "\n\nThey will no longer access the team's shared content."
    )) return;
    submit.disabled = true;
    error.hidden = true;
    try {
      await cloudRequest("/rest/v1/rpc/noteflow_remove_team_member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p_workspace_id: teamWorkspace.id,
          p_member_user_id: member.user_id,
          p_reason: reason
        })
      });
      $("team-member-remove-dialog").close();
      removingTeamMemberId = null;
      await loadTeamHubData();
      teamFeedback.textContent = "Member removed. They can see the reason the next time they open Team.";
      teamFeedback.hidden = false;
    } catch (requestError) {
      error.textContent = "The member couldn't be removed. " + requestError.message;
      error.hidden = false;
    } finally {
      submit.disabled = false;
    }
  }

  async function deleteTeamWorkspace() {
    if (!teamWorkspace || !isTeamOwner() || !teamManagementReady) return;
    const workspaceId = teamWorkspace.id;
    const workspaceName = teamWorkspace.name;
    if (!window.confirm(
      'Delete "' + workspaceName + '" and permanently remove its shared notes, tasks, requests, sessions, invitations, members, and files? This cannot be undone.'
    )) return;
    const deleteButton = $("team-delete-button");
    deleteButton.disabled = true;
    try {
      const files = await listAllWorkspaceFiles(workspaceId);
      let deletedFiles = 0;
      for (const file of files) {
        if (!file || !file.name) continue;
        await deleteWorkspaceFile(workspaceId + "/" + file.name);
        deletedFiles++;
      }
      const deleted = await cloudRequest(
        "/rest/v1/noteflow_workspaces?id=eq." + encodeURIComponent(workspaceId) +
        "&kind=eq.team",
        {
          method: "DELETE",
          headers: { Prefer: "return=representation" }
        }
      );
      if (!Array.isArray(deleted) || deleted.length !== 1) {
        throw new Error("Supabase did not confirm that the team was deleted.");
      }
      selectedTeamId = null;
      await loadTeamHubData();
      teamFeedback.textContent = '"' + workspaceName + '" and its ' +
        deletedFiles + " shared file" + (deletedFiles === 1 ? "" : "s") + " were deleted.";
      teamFeedback.hidden = false;
    } catch (error) {
      console.error("Could not delete the team workspace:", error);
      showWorkspaceError("The team couldn't be fully deleted. " + error.message);
    } finally {
      deleteButton.disabled = false;
    }
  }

  function teamMemberLabel(userId) {
    const member = teamMembers.find(function (item) { return item.user_id === userId; });
    if (!member) return "Unassigned";
    if (member.user_id === accountId) return "You";
    return "Member " + member.user_id.slice(0, 8);
  }

  function renderTeamSharedItems(canEdit) {
    teamSharedItemsElement.innerHTML = teamSharedItems.length
      ? teamSharedItems.map(function (item) {
        const type = item.category === "team-document" ? "Document" : "Note";
        const safeBody = String(item.body || "").slice(0, 600);
        const documentContent = item.category === "team-document"
          ? sanitizeDocumentHTML(item.content || documentTextToHTML(item.body || ""))
          : "";
        return '<article class="team-shared-item"><div class="team-shared-item-heading"><strong>' +
          escapeHTML(item.title || "Untitled") + '<span class="team-shared-meta"> · ' +
          type + "</span></strong>" + (canEdit
            ? '<div class="team-shared-actions"><button type="button" data-team-item-edit="' +
              escapeHTML(item.id) + '">Edit</button><button type="button" data-team-item-delete="' +
              escapeHTML(item.id) + '">Delete</button></div>'
            : "") + "</div><p>" + escapeHTML(safeBody) + "</p>" +
          (documentContent
            ? '<details class="team-shared-document"><summary>Open full document</summary><div class="team-shared-document-body">' +
              documentContent + "</div></details>"
            : "") + '<div class="team-shared-meta">' +
          escapeHTML(relativeDate(item.updatedAt)) + "</div></article>";
      }).join("")
      : '<p class="team-content-empty">No shared notes or documents yet.</p>';
  }

  function renderTeamTasks(canEdit) {
    teamSharedTasksElement.innerHTML = teamTasks.length
      ? teamTasks.map(function (task) {
        const isAuthor = task.created_by === accountId;
        const dueText = task.due_at
          ? "Due " + new Date(task.due_at).toLocaleString(undefined, {
            month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
          })
          : "No due date";
        const statusText = task.status === "in_progress" ? "In progress" : task.status === "done" ? "Done" : "Open";
        return '<article class="team-shared-task' + (task.status === "done" ? " is-done" : "") +
          '"><div class="team-shared-task-heading"><label><input type="checkbox" data-team-task-complete="' +
          escapeHTML(task.id) + '"' + (task.status === "done" ? " checked" : "") +
          (isAuthor ? "" : " disabled") + '><span class="team-task-copy"><strong>' +
          escapeHTML(task.title) + '</strong><span class="team-shared-meta">' +
          escapeHTML(statusText) + " · " + escapeHTML(teamMemberLabel(task.assignee_id)) + " · " +
          escapeHTML(dueText) + "</span>" + (task.details
            ? "<p>" + escapeHTML(task.details) + "</p>"
            : "") +             "</span></label>" + (isAuthor || canEdit
            ? '<div class="team-shared-actions"><button type="button" data-team-task-edit="' +
                escapeHTML(task.id) + '" ' + (isAuthor ? "" : "hidden") +
                '>Edit</button><button type="button" data-team-task-delete="' +
                escapeHTML(task.id) + '" ' + (canEdit ? "" : "hidden") +
                '>Delete</button></div>'
            : "") + "</div></article>";
      }).join("")
      : '<p class="team-content-empty">No shared tasks yet.</p>';
  }

  function renderTeamRequests() {
    const categories = {
      notes: "Notes or material",
      class_timing: "Class timing",
      study_help: "Study help",
      other: "Other"
    };
    teamRequestsElement.innerHTML = teamRequests.length
      ? teamRequests.map(function (request) {
        const isAuthor = request.created_by === accountId;
        const canDelete = isAuthor || canEditTeam();
        const isFulfilled = request.status === "fulfilled";
        const category = categories[request.category] || categories.other;
        const actions = (isAuthor
          ? '<button type="button" data-team-request-edit="' + escapeHTML(request.id) +
            '">Edit</button><button type="button" data-team-request-status="' + escapeHTML(request.id) +
            '" data-next-status="' + (isFulfilled ? "open" : "fulfilled") + '">' +
            (isFulfilled ? "Reopen" : "Mark received") + "</button>"
          : "") + (canDelete
          ? '<button type="button" data-team-request-delete="' + escapeHTML(request.id) + '">Delete</button>'
          : "");
        return '<article class="team-shared-item team-request-item' +
          (isFulfilled ? " is-fulfilled" : "") + '"><div class="team-shared-item-heading"><strong>' +
          escapeHTML(request.title) + '<span class="team-shared-meta"> · ' +
          escapeHTML(category) + " · " + (isFulfilled ? "Received" : "Open") +
          "</span></strong>" + (actions ? '<div class="team-shared-actions">' + actions + "</div>" : "") +
          "</div>" + (request.details ? "<p>" + escapeHTML(request.details) + "</p>" : "") +
          '<div class="team-shared-meta">Asked by ' +
          escapeHTML(teamMemberLabel(request.created_by)) + " · " +
          escapeHTML(relativeDate(request.created_at)) + "</div></article>";
      }).join("")
      : '<p class="team-content-empty">No requests yet. Ask the team for notes, timing, or help.</p>';
  }

  function renderTeamStudySessions() {
    const now = Date.now();
    const upcoming = teamStudySessions.filter(function (session) {
      return new Date(session.starts_at).getTime() >= now;
    });
    const past = teamStudySessions.filter(function (session) {
      return new Date(session.starts_at).getTime() < now;
    }).sort(function (a, b) {
      return new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime();
    }).slice(0, 3);
    const sessions = upcoming.concat(past);
    teamStudySessionsElement.innerHTML = sessions.length
      ? sessions.map(function (session) {
        const startsAt = new Date(session.starts_at);
        const when = Number.isNaN(startsAt.getTime())
          ? "Time unavailable"
          : startsAt.toLocaleString(undefined, {
            weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
          });
        const canDelete = session.created_by === accountId || canEditTeam();
        return '<article class="team-shared-item team-study-session' +
          (startsAt.getTime() < now ? " is-past" : "") + '"><div class="team-shared-item-heading"><strong>' +
          escapeHTML(session.title) + '<span class="team-shared-meta"> · ' +
          escapeHTML(when) + " · " + escapeHTML(String(session.duration_minutes)) +
          " min</span></strong>" + (canDelete
            ? '<div class="team-shared-actions"><button type="button" data-team-session-delete="' +
              escapeHTML(session.id) + '">Cancel</button></div>'
            : "") + "</div>" + (session.details ? "<p>" + escapeHTML(session.details) + "</p>" : "") +
          '<div class="team-shared-meta">Scheduled by ' +
          escapeHTML(teamMemberLabel(session.created_by)) + "</div></article>";
      }).join("")
      : '<p class="team-content-empty">No group study sessions scheduled yet.</p>';
  }

  function renderTeamFiles(canEdit) {
    teamFileFeedback.hidden = !teamFilesError;
    teamFileFeedback.textContent = teamFilesError
      ? "Shared files couldn't load. " + teamFilesError
      : "";
    const files = teamFiles.filter(function (file) {
      return file && file.name;
    }).sort(function (a, b) {
      return new Date(b.updated_at || b.created_at || 0).getTime() -
        new Date(a.updated_at || a.created_at || 0).getTime();
    });
    teamFileList.innerHTML = files.length
      ? files.map(function (file) {
        const separator = file.name.indexOf("__");
        const name = separator >= 0 ? file.name.slice(separator + 2) : file.name;
        const path = teamWorkspace.id + "/" + file.name;
        const size = Number(file.metadata && file.metadata.size) || 0;
        const updatedAt = file.updated_at || file.created_at || Date.now();
        return '<article class="team-file-row"><span class="file-type-mark">' +
          escapeHTML((name.split(".").pop() || "FILE").slice(0, 4).toUpperCase()) +
          '</span><span class="team-file-copy"><strong>' + escapeHTML(name) +
          '</strong><small>' + escapeHTML(formatBytes(size)) + " · " +
          escapeHTML(new Date(updatedAt).toLocaleDateString(undefined, dateOptions)) +
          '</small></span><div class="team-file-actions"><button type="button" class="file-open" data-team-file-action="open" data-file-id="' +
          escapeHTML(path) + '" data-file-name="' + escapeHTML(name) + '" data-file-type="' +
          escapeHTML(file.metadata && file.metadata.mimetype || "") +
          '" aria-label="Preview ' + escapeHTML(name) + '">Open</button><button type="button" data-team-file-action="download" data-file-id="' +
          escapeHTML(path) + '" data-file-name="' + escapeHTML(name) + '" aria-label="Download ' +
          escapeHTML(name) + '">Download</button>' + (canEdit
            ? '<button type="button" data-team-file-action="delete" data-file-id="' +
              escapeHTML(path) + '" data-file-name="' + escapeHTML(name) +
              '" aria-label="Delete ' + escapeHTML(name) + '">Delete</button>'
            : "") + "</div></article>";
      }).join("")
      : '<p class="team-content-empty">No files shared with this team yet.</p>';
  }

  async function refreshTeamFiles() {
    if (!teamWorkspace) return;
    try {
      teamFiles = await listWorkspaceFiles(teamWorkspace.id) || [];
      teamFilesError = "";
      renderTeamFiles(canEditTeam());
      return true;
    } catch (error) {
      teamFilesError = error.message;
      console.error("Could not refresh shared team files:", error);
      renderTeamFiles(canEditTeam());
      return false;
    }
  }

  async function uploadTeamFiles(event) {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    if (!selected.length) return;
    if (!teamWorkspace || !canEditTeam()) {
      teamFileFeedback.hidden = false;
      teamFileFeedback.textContent = "You don't have permission to upload files to this team.";
      return;
    }
    const oversized = selected.find(function (file) { return file.size > MAX_FILE_BYTES; });
    if (oversized) {
      teamFileFeedback.hidden = false;
      teamFileFeedback.textContent = oversized.name + " is larger than the 25 MB per-file limit.";
      return;
    }
    teamFileFeedback.hidden = false;
    teamFileFeedback.textContent = "Uploading files to this team's private storage…";
    let uploaded = 0;
    const uploadButton = $("team-file-upload");
    uploadButton.disabled = true;
    try {
      for (const file of selected) {
        await uploadWorkspaceFile(file, null, teamWorkspace.id);
        uploaded++;
      }
      const refreshed = await refreshTeamFiles();
      teamFileFeedback.hidden = false;
      teamFileFeedback.textContent = refreshed
        ? "Uploaded " + uploaded + " file" + (uploaded === 1 ? "" : "s") + " to this team's private storage."
        : "Files uploaded, but the team file list couldn't refresh. " + teamFilesError;
    } catch (error) {
      console.error("Could not upload shared team files:", error);
      await refreshTeamFiles();
      teamFileFeedback.hidden = false;
      teamFileFeedback.textContent = (uploaded
        ? "Uploaded " + uploaded + " file" + (uploaded === 1 ? "" : "s") +
          "; the remaining files couldn't be uploaded. "
        : "Files couldn't be uploaded. ") + error.message;
    } finally {
      uploadButton.disabled = false;
    }
  }

  function renderShareablePersonalFiles() {
    teamFileShareList.innerHTML = shareablePersonalFiles.length
      ? shareablePersonalFiles.map(function (file, index) {
        return '<label class="team-file-share-option"><input type="checkbox" name="team-share-file" value="' +
          index + '"><span><strong>' + escapeHTML(file.name) + '</strong><small>' +
          escapeHTML(formatBytes(file.size)) + " · " +
          escapeHTML(new Date(file.updatedAt).toLocaleDateString(undefined, dateOptions)) +
          (file.storage === "local" ? " · This browser" : " · Supabase") +
          "</small></span></label>";
      }).join("")
      : '<p class="team-content-empty">No personal uploads found. Upload a file to your workspace first.</p>';
    teamFileShareSubmit.disabled = true;
  }

  async function openTeamFileShareDialog() {
    if (!teamWorkspace || !canEditTeam()) return;
    shareablePersonalFiles = [];
    teamFileShareError.hidden = true;
    teamFileShareError.textContent = "";
    teamFileShareList.textContent = "Loading your uploads…";
    teamFileShareSubmit.disabled = true;
    teamFileShareDialog.showModal();
    $("team-file-share-cancel").focus();
    try {
      if (!cloudWorkspaceId) throw new Error("Your personal workspace is still connecting to Supabase.");
      let localFiles = [];
      let localReadError = null;
      try {
        localFiles = await getStoredFiles();
      } catch (error) {
        localReadError = error;
      }
      const cloudObjects = await listWorkspaceFiles(cloudWorkspaceId);
      const cloudFiles = (cloudObjects || []).filter(function (object) {
        return object && object.name;
      }).map(function (object) {
        const separator = object.name.indexOf("__");
        const name = separator >= 0 ? object.name.slice(separator + 2) : object.name;
        const path = cloudWorkspaceId + "/" + object.name;
        return {
          id: path,
          path: path,
          name: name,
          size: Number(object.metadata && object.metadata.size) || 0,
          type: object.metadata && object.metadata.mimetype || "application/octet-stream",
          updatedAt: object.updated_at || object.created_at || Date.now(),
          storage: "cloud"
        };
      });
      const cloudFileIds = new Set(cloudFiles.map(function (file) {
        const filename = file.path.split("/").pop();
        const separator = filename.indexOf("__");
        return separator >= 0 ? filename.slice(0, separator) : "";
      }));
      const browserFiles = localFiles.filter(function (file) {
        return !cloudFileIds.has(file.id);
      }).map(function (file) {
        return Object.assign({}, file, { storage: "local" });
      });
      shareablePersonalFiles = cloudFiles.concat(browserFiles).sort(function (a, b) {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
      renderShareablePersonalFiles();
      if (localReadError) {
        teamFileShareError.hidden = false;
        teamFileShareError.textContent = "Browser-only uploads couldn't be checked. Cloud uploads are still available. " + localReadError.message;
      }
    } catch (error) {
      console.error("Could not load personal uploads for team sharing:", error);
      teamFileShareList.replaceChildren();
      teamFileShareError.hidden = false;
      teamFileShareError.textContent = "Your uploads couldn't be loaded. " + error.message;
    }
  }

  async function shareSelectedPersonalFiles(event) {
    event.preventDefault();
    if (!teamWorkspace || !canEditTeam()) return;
    const selectedIndexes = Array.from(teamFileShareList.querySelectorAll('input[name="team-share-file"]:checked'))
      .map(function (input) { return Number(input.value); }) 
      .filter(function (index) {
        return Number.isInteger(index) && index >= 0 && index < shareablePersonalFiles.length;
      });
    if (!selectedIndexes.length) {
      teamFileShareError.hidden = false;
      teamFileShareError.textContent = "Select at least one file to share.";
      return;
    }
    const oversized = selectedIndexes.map(function (index) {
      return shareablePersonalFiles[index];
    }).find(function (file) {
      return file.size > MAX_FILE_BYTES;
    });
    if (oversized) {
      teamFileShareError.hidden = false;
      teamFileShareError.textContent = oversized.name + " is larger than the 25 MB per-file limit.";
      return;
    }

    teamFileShareSubmit.disabled = true;
    teamFileShareError.hidden = true;
    teamFileShareError.textContent = "";
    const sharedKeys = new Set();
    try {
      for (const index of selectedIndexes) {
        const file = shareablePersonalFiles[index];
        const blob = file.storage === "cloud" ? await downloadWorkspaceFile(file.path) : file.blob;
        await uploadWorkspaceFile({
          name: file.name,
          type: file.type || blob.type || "application/octet-stream",
          blob: blob
        }, null, teamWorkspace.id);
        sharedKeys.add(file.storage + ":" + file.id);
      }
      teamFileShareDialog.close();
      const refreshed = await refreshTeamFiles();
      teamFileFeedback.hidden = false;
      teamFileFeedback.textContent = refreshed
        ? "Shared " + selectedIndexes.length + " selected file" +
          (selectedIndexes.length === 1 ? "" : "s") + " with this team. Your personal files remain unchanged."
        : "Files were shared, but the team file list couldn't refresh. " + teamFilesError;
    } catch (error) {
      console.error("Could not share selected personal files with the team:", error);
      shareablePersonalFiles = shareablePersonalFiles.filter(function (file) {
        return !sharedKeys.has(file.storage + ":" + file.id);
      });
      renderShareablePersonalFiles();
      await refreshTeamFiles();
      teamFileShareError.hidden = false;
      teamFileShareError.textContent = (sharedKeys.size
        ? "Shared " + sharedKeys.size + " file" + (sharedKeys.size === 1 ? "" : "s") +
          "; the remaining selected files couldn't be shared. "
        : "Selected files couldn't be shared. ") + error.message;
    } finally {
      teamFileShareSubmit.disabled = teamFileShareList.querySelectorAll('input[name="team-share-file"]:checked').length === 0;
    }
  }

  async function openWorkShareTeamDialog(item) {
    if (!item || !["Document", "Coursework", "Presentation"].includes(item.category)) return;
    workItemToShare = item;
    workShareTeamError.hidden = true;
    workShareTeamError.textContent = "";
    $("work-share-team-status").hidden = true;
    $("work-share-team-status").textContent = "";
    workShareTeamSubmit.disabled = false;
    workShareTeamSubmit.textContent = "Share copy";
    workShareTeamSelect.replaceChildren(new Option("Loading teams…", ""));
    workShareTeamDialog.showModal();
    $("work-share-team-cancel").focus();
    try {
      await loadTeamHubData();
      if (!teamWorkspaces.length) {
        throw new Error("Create or join a team before sharing this item.");
      }
      const workspaceIds = teamWorkspaces.map(function (team) {
        return encodeURIComponent(team.id);
      }).join(",");
      const memberships = await cloudRequest(
        "/rest/v1/noteflow_workspace_members?select=workspace_id,role&user_id=eq." +
        encodeURIComponent(accountId) + "&workspace_id=in.(" + workspaceIds +
        ")&role=in.(owner,editor)"
      );
      const editableIds = new Set((memberships || []).map(function (membership) {
        return membership.workspace_id;
      }));
      const editableTeams = teamWorkspaces.filter(function (team) {
        return editableIds.has(team.id);
      });
      workShareTeamSelect.replaceChildren(new Option("Choose a team", ""));
      editableTeams.forEach(function (team) {
        workShareTeamSelect.add(new Option(team.name, team.id));
      });
      if (!editableTeams.length) {
        throw new Error("You need owner or editor access to share work with a team.");
      }
      workShareTeamSelect.focus();
    } catch (error) {
      console.error("Could not load teams for sharing workspace work:", error);
      workShareTeamError.hidden = false;
      workShareTeamError.textContent = error.message || "Teams couldn't be loaded.";
      workShareTeamSelect.replaceChildren(new Option("No available teams", ""));
    }
  }

  async function shareWorkItemWithTeam(event) {
    event.preventDefault();
    const item = workItemToShare && notes.find(function (entry) {
      return entry.id === workItemToShare.id;
    });
    const targetTeam = teamWorkspaces.find(function (team) {
      return team.id === workShareTeamSelect.value;
    });
    if (!item || !targetTeam) {
      workShareTeamError.hidden = false;
      workShareTeamError.textContent = "Choose a team and try again.";
      return;
    }
    workShareTeamSubmit.disabled = true;
    workShareTeamError.hidden = true;
    $("work-share-team-status").hidden = true;
    try {
      if (item.category === "Presentation") {
        if (!Array.isArray(item.slides) || !item.slides.length) {
          throw new Error("This presentation has no slides to share.");
        }
        const blob = await createPresentationPptxBlob(item);
        if (blob.size > MAX_FILE_BYTES) {
          throw new Error("The exported PowerPoint is larger than the 25 MB per-file limit.");
        }
        const safeName = (item.title || "NoteFlow presentation")
          .replace(/[<>:"/\\|?*]+/g, "-").trim() || "NoteFlow presentation";
        await uploadWorkspaceFile({
          name: safeName + ".pptx",
          type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          blob: blob
        }, null, targetTeam.id);
      } else {
        const content = sanitizeDocumentHTML(item.content || documentTextToHTML(item.body || ""));
        const body = new DOMParser().parseFromString(content, "text/html").body.textContent ||
          item.body || "";
        const sharedCopy = {
          id: createId(),
          title: item.title || "Untitled document",
          body: body,
          content: content,
          category: "team-document",
          updatedAt: new Date().toISOString()
        };
        await cloudRequest(
          "/rest/v1/noteflow_workspace_items?on_conflict=workspace_id%2Citem_id",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Prefer: "resolution=merge-duplicates,return=minimal"
            },
            body: JSON.stringify([{
              workspace_id: targetTeam.id,
              item_id: "team-item:" + sharedCopy.id,
              item_type: "team-document",
              content: { item: sharedCopy },
              updated_at: sharedCopy.updatedAt
            }])
          }
        );
      }
      if (selectedTeamId === targetTeam.id) await loadTeamHubData();
      $("work-share-team-status").textContent = item.category === "Presentation"
        ? "A PowerPoint copy was added to " + targetTeam.name + " shared files. Your original stays private."
        : "A copy was added to " + targetTeam.name + " shared documents. Your original stays private.";
      $("work-share-team-status").hidden = false;
      workShareTeamSubmit.textContent = "Shared";
    } catch (error) {
      console.error("Could not share workspace work with the team:", error);
      workShareTeamError.hidden = false;
      workShareTeamError.textContent = "The copy couldn't be shared. " + error.message;
      workShareTeamSubmit.disabled = false;
    }
  }

  async function handleTeamFileAction(event) {
    const button = event.target.closest("button[data-team-file-action]");
    if (!button || !teamWorkspace) return;
    const action = button.dataset.teamFileAction;
    const path = button.dataset.fileId;
    const name = button.dataset.fileName || path.split("/").pop();
    if (action === "delete" && (!canEditTeam() ||
        !window.confirm("Delete this file for everyone in the team? This can't be undone."))) return;
    button.disabled = true;
    teamFileFeedback.hidden = true;
    try {
      if (action === "delete") {
        await deleteWorkspaceFile(path);
        const refreshed = await refreshTeamFiles();
        teamFileFeedback.hidden = false;
        teamFileFeedback.textContent = refreshed
          ? "File deleted from the team."
          : "File deleted, but the team file list couldn't refresh. " + teamFilesError;
        return;
      }
      const blob = await downloadWorkspaceFile(path);
      if (action === "open") {
        await showFilePreview({
          name: name,
          type: button.dataset.fileType || blob.type || "application/octet-stream",
          blob: blob
        });
      } else {
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = name;
        link.click();
        window.setTimeout(function () { URL.revokeObjectURL(downloadUrl); }, 1000);
      }
    } catch (error) {
      console.error("Could not access a shared team file:", error);
      teamFileFeedback.hidden = false;
      teamFileFeedback.textContent = "The file couldn't be " +
        (action === "open" ? "opened" : action === "download" ? "downloaded" : "deleted") +
        ". " + error.message;
    } finally {
      button.disabled = false;
    }
  }

  function openTeamItemDialog(item) {
    if (!teamWorkspace || !canEditTeam()) return;
    editingTeamItemId = item ? item.id : null;
    $("team-item-form").reset();
    $("team-item-error").hidden = true;
    $("team-item-dialog-title").textContent = item ? "Edit shared item" : "New shared item";
    $("team-item-type").value = item && item.category === "team-document" ? "team-document" : "team-note";
    $("team-item-title").value = item ? item.title : "";
    $("team-item-body").value = item ? item.body : "";
    $("team-item-dialog").showModal();
    $("team-item-title").focus();
  }

  async function saveTeamItem(event) {
    event.preventDefault();
    if (!teamWorkspace || !canEditTeam()) return;
    const saveButton = $("team-item-save");
    const error = $("team-item-error");
    saveButton.disabled = true;
    error.hidden = true;
    const item = {
      id: editingTeamItemId || createId(),
      title: $("team-item-title").value.trim(),
      body: $("team-item-body").value.trim(),
      category: $("team-item-type").value,
      updatedAt: new Date().toISOString()
    };
    if (!item.title) {
      error.textContent = "Enter a title.";
      error.hidden = false;
      saveButton.disabled = false;
      return;
    }
    try {
      await cloudRequest(
        "/rest/v1/noteflow_workspace_items?on_conflict=workspace_id%2Citem_id",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=minimal"
          },
          body: JSON.stringify([{
            workspace_id: teamWorkspace.id,
            item_id: "team-item:" + item.id,
            item_type: item.category,
            content: { item: item },
            updated_at: item.updatedAt
          }])
        }
      );
      $("team-item-dialog").close();
      await loadTeamHubData();
      teamFeedback.textContent = "Shared item saved for this team.";
      teamFeedback.hidden = false;
    } catch (requestError) {
      error.textContent = requestError.message;
      error.hidden = false;
    } finally {
      saveButton.disabled = false;
    }
  }

  async function deleteTeamItem(itemId) {
    if (!teamWorkspace || !canEditTeam()) return;
    if (!window.confirm("Delete this shared item for everyone in the team?")) return;
    try {
      await cloudRequest(
        "/rest/v1/noteflow_workspace_items?workspace_id=eq." +
        encodeURIComponent(teamWorkspace.id) + "&item_id=eq." +
        encodeURIComponent("team-item:" + itemId),
        { method: "DELETE" }
      );
      await loadTeamHubData();
      teamFeedback.textContent = "Shared item deleted.";
      teamFeedback.hidden = false;
    } catch (error) {
      showWorkspaceError("The shared item couldn't be deleted. " + error.message);
    }
  } 

  function dateTimeLocalValue(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function openTeamTaskDialog(task) {
    if (!teamWorkspace || (task
      ? task.created_by !== accountId
      : !canEditTeam())) return;
    editingTeamTaskId = task ? task.id : null;
    $("team-task-form").reset();
    $("team-task-error").hidden = true;
    $("team-task-dialog-title").textContent = task ? "Edit shared task" : "New shared task";
    const assignee = $("team-task-assignee");
    assignee.replaceChildren(new Option("Unassigned", ""));
    teamMembers.forEach(function (member) {
      const label = member.user_id === accountId
        ? "You"
        : "Member " + member.user_id.slice(0, 8);
      assignee.add(new Option(label + " · " + member.role, member.user_id));
    });
    $("team-task-title").value = task ? task.title : "";
    $("team-task-details").value = task ? task.details || "" : "";
    assignee.value = task && task.assignee_id ? task.assignee_id : "";
    $("team-task-due").value = dateTimeLocalValue(task && task.due_at);
    $("team-task-status").value = task ? task.status : "open";
    $("team-task-dialog").showModal();
    $("team-task-title").focus();
  }

  async function saveTeamTask(event) {
    event.preventDefault();
    const editingTask = editingTeamTaskId
      ? teamTasks.find(function (task) { return task.id === editingTeamTaskId; })
      : null;
    if (!teamWorkspace || (editingTeamTaskId
      ? !editingTask || editingTask.created_by !== accountId
      : !canEditTeam())) return;
    const saveButton = $("team-task-save");
    const error = $("team-task-error");
    const title = $("team-task-title").value.trim();
    if (!title) {
      error.textContent = "Enter a task.";
      error.hidden = false;
      return;
    }
    let dueAt = null;
    if ($("team-task-due").value) {
      const parsedDueDate = new Date($("team-task-due").value);
      if (Number.isNaN(parsedDueDate.getTime())) {
        error.textContent = "Choose a valid due date.";
        error.hidden = false;
        return;
      }
      dueAt = parsedDueDate.toISOString();
    }
    saveButton.disabled = true;
    error.hidden = true;
    const taskData = {
      title: title,
      details: $("team-task-details").value.trim(),
      assignee_id: $("team-task-assignee").value || null,
      due_at: dueAt,
      status: $("team-task-status").value,
      updated_at: new Date().toISOString()
    };
    try {
      if (editingTeamTaskId) {
        await cloudRequest(
          "/rest/v1/noteflow_workspace_tasks?id=eq." +
          encodeURIComponent(editingTeamTaskId) + "&workspace_id=eq." +
          encodeURIComponent(teamWorkspace.id),
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify(taskData)
          }
        );
      } else {
        await cloudRequest("/rest/v1/noteflow_workspace_tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify(Object.assign({
            workspace_id: teamWorkspace.id,
            created_by: accountId
          }, taskData))
        });
      }
      $("team-task-dialog").close();
      await loadTeamHubData();
      teamFeedback.textContent = editingTeamTaskId ? "Shared task updated." : "Shared task added.";
      teamFeedback.hidden = false;
    } catch (requestError) {
      error.textContent = requestError.message;
      error.hidden = false;
    } finally {
      saveButton.disabled = false;
    }
  }

  async function setTeamTaskStatus(taskId, isDone) {
    const task = teamTasks.find(function (item) { return item.id === taskId; });
    if (!teamWorkspace || !task || task.created_by !== accountId) return;
    try {
      await cloudRequest(
        "/rest/v1/noteflow_workspace_tasks?id=eq." +
        encodeURIComponent(taskId) + "&workspace_id=eq." +
        encodeURIComponent(teamWorkspace.id),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({
            status: isDone ? "done" : "open",
            updated_at: new Date().toISOString()
          })
        }
      );
      await loadTeamHubData();
    } catch (error) {
      showWorkspaceError("The task status couldn't be updated. " + error.message);
      await loadTeamHubData();
    }
  }

  async function deleteTeamTask(taskId) {
    if (!teamWorkspace || !canEditTeam()) return;
    if (!window.confirm("Delete this shared task for everyone in the team?")) return;
    try {
      await cloudRequest(
        "/rest/v1/noteflow_workspace_tasks?id=eq." +
        encodeURIComponent(taskId) + "&workspace_id=eq." +
        encodeURIComponent(teamWorkspace.id),
        { method: "DELETE" }
      );
      await loadTeamHubData();
      teamFeedback.textContent = "Shared task deleted.";
      teamFeedback.hidden = false;
    } catch (error) {
      showWorkspaceError("The shared task couldn't be deleted. " + error.message);
    }
  }

  function openTeamRequestDialog(request) {
    if (!teamWorkspace || !isTeamMember() ||
        (request && request.created_by !== accountId)) return;
    editingTeamRequestId = request ? request.id : null;
    $("team-request-form").reset();
    $("team-request-error").hidden = true;
    $("team-request-dialog-title").textContent = request ? "Edit your request" : "Post a team request";
    $("team-request-category").value = request ? request.category : "notes";
    $("team-request-title").value = request ? request.title : "";
    $("team-request-details").value = request ? request.details || "" : "";
    $("team-request-save").textContent = request ? "Save changes" : "Post request";
    $("team-request-dialog").showModal();
    $("team-request-title").focus();
  }

  async function saveTeamRequest(event) {
    event.preventDefault();
    const editingRequest = editingTeamRequestId
      ? teamRequests.find(function (request) { return request.id === editingTeamRequestId; })
      : null;
    if (!teamWorkspace || !isTeamMember() || (editingTeamRequestId
      ? !editingRequest || editingRequest.created_by !== accountId
      : false)) return;
    const saveButton = $("team-request-save");
    const error = $("team-request-error");
    const title = $("team-request-title").value.trim();
    if (!title) {
      error.textContent = "Describe what you need from the team.";
      error.hidden = false;
      return;
    }
    saveButton.disabled = true;
    error.hidden = true;
    try {
      await cloudRequest(editingTeamRequestId
        ? "/rest/v1/noteflow_team_requests?id=eq." +
          encodeURIComponent(editingTeamRequestId) + "&workspace_id=eq." +
          encodeURIComponent(teamWorkspace.id)
        : "/rest/v1/noteflow_team_requests", {
        method: editingTeamRequestId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(Object.assign({
          title: title,
          category: $("team-request-category").value,
          details: $("team-request-details").value.trim(),
          updated_at: new Date().toISOString()
        }, editingTeamRequestId ? {} : {
          workspace_id: teamWorkspace.id,
          created_by: accountId
        }))
      });
      $("team-request-dialog").close();
      teamFeedback.textContent = editingTeamRequestId
        ? "Your request was updated."
        : "Your request is now visible to the team.";
      teamFeedback.hidden = false;
      editingTeamRequestId = null;
      $("team-request-save").textContent = "Post request";
      try {
        await loadTeamHubData();
      } catch (refreshError) {
        console.error("Request was posted but the Team view could not refresh:", refreshError);
        teamFeedback.textContent = "Request posted, but the Team view couldn't refresh. Reopen Team to check.";
      }
    } catch (requestError) {
      error.textContent = requestError.message;
      error.hidden = false;
    } finally {
      saveButton.disabled = false;
    }
  }

  async function updateTeamRequestStatus(requestId, status) {
    const request = teamRequests.find(function (item) { return item.id === requestId; });
    if (!teamWorkspace || !request || request.created_by !== accountId ||
        !["open", "fulfilled"].includes(status)) return;
    try {
      await cloudRequest(
        "/rest/v1/noteflow_team_requests?id=eq." + encodeURIComponent(requestId) +
        "&workspace_id=eq." + encodeURIComponent(teamWorkspace.id),
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ status: status, updated_at: new Date().toISOString() })
        }
      );
      await loadTeamHubData();
    } catch (error) {
      showWorkspaceError("The request status couldn't be updated. " + error.message);
    }
  }

  async function deleteTeamRequest(requestId) {
    const request = teamRequests.find(function (item) { return item.id === requestId; });
    if (!teamWorkspace || !request ||
        (request.created_by !== accountId && !canEditTeam())) return;
    if (!window.confirm("Delete this request for everyone in the team?")) return;
    try {
      await cloudRequest(
        "/rest/v1/noteflow_team_requests?id=eq." + encodeURIComponent(requestId) +
        "&workspace_id=eq." + encodeURIComponent(teamWorkspace.id),
        { method: "DELETE" }
      );
      await loadTeamHubData();
      teamFeedback.textContent = "Team request deleted.";
      teamFeedback.hidden = false;
    } catch (error) {
      showWorkspaceError("The team request couldn't be deleted. " + error.message);
    }
  }

  function openTeamStudySessionDialog() {
    if (!teamWorkspace || !isTeamMember()) return;
    $("team-session-form").reset();
    $("team-session-error").hidden = true;
    $("team-session-duration").value = "60";
    $("team-session-dialog").showModal();
    $("team-session-title").focus();
  }

  async function saveTeamStudySession(event) {
    event.preventDefault();
    if (!teamWorkspace || !isTeamMember()) return;
    const saveButton = $("team-session-save");
    const error = $("team-session-error");
    const title = $("team-session-title").value.trim();
    const startValue = $("team-session-start").value;
    const startDate = new Date(startValue);
    const duration = Number($("team-session-duration").value);
    if (!title) {
      error.textContent = "Enter a name for the group study session.";
      error.hidden = false;
      return;
    }
    if (!startValue || Number.isNaN(startDate.getTime()) || startDate.getTime() <= Date.now()) {
      error.textContent = "Choose a future date and time.";
      error.hidden = false;
      return;
    }
    if (!Number.isInteger(duration) || duration < 15 || duration > 480) {
      error.textContent = "Choose a valid session duration.";
      error.hidden = false;
      return;
    }
    saveButton.disabled = true;
    error.hidden = true;
    try {
      await cloudRequest("/rest/v1/noteflow_team_study_sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          workspace_id: teamWorkspace.id,
          title: title,
          details: $("team-session-details").value.trim(),
          starts_at: startDate.toISOString(),
          duration_minutes: duration,
          created_by: accountId
        })
      });
      $("team-session-dialog").close();
      teamFeedback.textContent = "Group study session scheduled for everyone in the team.";
      teamFeedback.hidden = false;
      try {
        await loadTeamHubData();
      } catch (refreshError) {
        console.error("Study session was scheduled but the Team view could not refresh:", refreshError);
        teamFeedback.textContent = "Session scheduled, but the Team view couldn't refresh. Reopen Team to check.";
      }
    } catch (requestError) {
      error.textContent = requestError.message;
      error.hidden = false;
    } finally {
      saveButton.disabled = false;
    }
  }

  async function deleteTeamStudySession(sessionId) {
    const session = teamStudySessions.find(function (item) { return item.id === sessionId; });
    if (!teamWorkspace || !session ||
        (session.created_by !== accountId && !canEditTeam())) return;
    if (!window.confirm("Cancel this group study session for everyone?")) return;
    try {
      await cloudRequest(
        "/rest/v1/noteflow_team_study_sessions?id=eq." + encodeURIComponent(sessionId) +
        "&workspace_id=eq." + encodeURIComponent(teamWorkspace.id),
        { method: "DELETE" }
      );
      await loadTeamHubData();
      teamFeedback.textContent = "Group study session cancelled.";
      teamFeedback.hidden = false;
    } catch (error) {
      showWorkspaceError("The group study session couldn't be cancelled. " + error.message);
    }
  }

  async function inviteTeamMember(event) {
    event.preventDefault();
    if (!teamWorkspace) return;
    const emailInput = $("team-invite-email");
    const submitButton = $("team-invite-submit");
    const error = $("team-invite-error");
    const email = emailInput.value.trim().toLowerCase();
    submitButton.disabled = true;
    error.hidden = true;
    try {
      await cloudRequest("/rest/v1/rpc/noteflow_create_team_invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p_workspace_id: teamWorkspace.id,
          p_invited_email: email,
          p_role: $("team-invite-role").value
        })
      });
      $("team-invite-dialog").close();
      $("team-invite-form").reset();
      await loadTeamHubData();
      teamFeedback.textContent = "Invitation sent to " + email + ". They can accept it in Team after signing in with that email.";
      teamFeedback.hidden = false;
    } catch (requestError) {
      error.textContent = requestError.message;
      error.hidden = false;
    } finally {
      submitButton.disabled = false;
    }
  }

  async function respondToTeamInvite(inviteId, accept) {
    const buttons = Array.from(teamInviteList.querySelectorAll("button")).filter(function (button) {
      return button.dataset.inviteAccept === inviteId || button.dataset.inviteDecline === inviteId;
    });
    buttons.forEach(function (button) { button.disabled = true; });
    try {
      const result = await cloudRequest("/rest/v1/rpc/noteflow_respond_team_invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_invite_id: inviteId, p_accept: accept })
      });
      await loadTeamHubData();
      teamFeedback.textContent = result && result.status === "expired"
        ? "That invitation has expired."
        : accept ? "You joined " + ((result && result.workspace_name) || "the team") + "."
          : "Invitation declined.";
      teamFeedback.hidden = false;
    } catch (error) {
      console.error("Could not respond to team invitation:", error);
      showWorkspaceError("The invitation could not be updated. " + error.message);
      buttons.forEach(function (button) { button.disabled = false; });
    }
  }

  function showWorkspaceError(message) {
    const status = $("workspace-error");
    if (!status) return;
    status.hidden = false;
    status.textContent = message;
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  function createId() {
    return window.crypto && window.crypto.randomUUID
      ? window.crypto.randomUUID()
      : String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  }

  function relativeDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Saved in workspace";
    return "Updated " + date.toLocaleDateString(undefined, dateOptions);
  }

  function renderNotes() {
    const filtered = notes.filter(function (note) {
      return (currentFilter !== "starred" || note.starred) &&
        (currentWorkTypeFilter === "all" ||
          (currentWorkTypeFilter === "presentations" && note.category === "Presentation") ||
          (currentWorkTypeFilter === "documents" && ["Document", "Coursework"].includes(note.category)) ||
          (currentWorkTypeFilter === "notes" && !["Presentation", "Document", "Coursework"].includes(note.category)) ||
          (currentWorkTypeFilter === "starred" && note.starred)) &&
        (note.title + " " + note.body + " " + note.category).toLowerCase().includes(searchTerm);
    });
    $("note-count").textContent = "(" + filtered.length + ")";
    document.querySelectorAll("[data-work-filter]").forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.dataset.workFilter === currentWorkTypeFilter));
    });
    if (!filtered.length) {
      const hasActiveFilter = currentWorkTypeFilter !== "all";
      notesList.innerHTML = '<div class="notes-empty"><h3>' +
        (searchTerm || hasActiveFilter ? "No work found" : "Your workspace is ready") +
        "</h3><p>" + (searchTerm || hasActiveFilter
          ? "No items match this filter. Try another filter or search."
          : "Create a note, document, or presentation to get started.") + "</p></div>";
      return;
    }
    notesList.innerHTML = filtered.map(function (item) {
      const categoryClass = item.category.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const canShare = ["Document", "Coursework", "Presentation"].includes(item.category);
      return '<article class="note-card workspace-work-card">' +
        '<div class="preview-note-category"><span class="category-' + escapeHTML(categoryClass) + '">' +
        escapeHTML(item.category) + '</span><button type="button" class="note-star' +
        (item.starred ? " is-starred" : "") + '" data-action="star" data-note-id="' +
        escapeHTML(item.id) + '" aria-label="' + (item.starred ? "Remove from starred" : "Add to starred") +
        '">' + (item.starred ? "★" : "☆") + "</button></div>" +
        "<h3>" + escapeHTML(item.title) + "</h3><p>" + escapeHTML(item.body) + "</p>" +
        "<footer><span>" + escapeHTML(relativeDate(item.updatedAt)) + '</span><span class="note-card-actions">' +
        '<button type="button" data-action="' + (item.category === "Presentation"
          ? "edit-presentation"
          : ["Document", "Coursework"].includes(item.category) ? "edit-document" : "edit") +
        '" data-note-id="' + escapeHTML(item.id) +
        '">Open</button>' + (canShare
          ? '<button type="button" data-action="share-team" data-note-id="' +
            escapeHTML(item.id) + '">Share to team</button>'
          : "") + '<button type="button" class="delete-note" data-action="delete" data-note-id="' +
        escapeHTML(item.id) + '">Delete</button></span></footer></article>';
    }).join("");
  }

  function renderTasks() {
    const tasks = currentTasks();
    tasksList.innerHTML = tasks.length
      ? tasks.map(function (task) {
        return '<div class="workspace-task-row"><label class="solo-task"><input type="checkbox" data-task-id="' +
          escapeHTML(task.id) + '"' + (task.done ? " checked" : "") +
          '><span><strong>' + escapeHTML(task.title) + "</strong><small>" +
          (task.done ? "Completed" : (persona === "student" ? "Study priority" : "Work priority")) +
          '</small></span></label><button type="button" class="task-remove" data-task-remove="' +
          escapeHTML(task.id) + '" aria-label="Remove ' + escapeHTML(task.title) + '">×</button></div>';
      }).join("")
      : '<p class="workspace-empty">Nothing on your list. Add a task when you are ready.</p>';
  }

  function currentTasks() {
    return persona === "student" ? savedWorkspace.tasksStudent : savedWorkspace.tasksProfessional;
  }

  function renderMeetings() {
    const upcoming = savedWorkspace.meetings.filter(function (meeting) {
      return new Date(meeting.date).getTime() >= Date.now();
    }).sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    meetingsList.innerHTML = upcoming.length
      ? upcoming.slice(0, 4).map(function (meeting) {
        const date = new Date(meeting.date);
        const dateLabel = Number.isNaN(date.getTime())
          ? "Date to be confirmed"
          : date.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        return '<article class="workspace-meeting"><span class="meeting-date-mark">' +
          escapeHTML(date.toLocaleDateString(undefined, { month: "short", day: "numeric" })) +
          '</span><span class="meeting-copy"><strong>' + escapeHTML(meeting.title) +
          "</strong><small>" + escapeHTML(dateLabel) + "</small></span>" +
          '<button type="button" class="meeting-remove" data-meeting-id="' + escapeHTML(meeting.id) +
          '" aria-label="Remove ' + escapeHTML(meeting.title) + '">×</button></article>';
      }).join("")
      : '<div class="workspace-empty-card"><span class="meeting-empty-mark">◷</span><strong>' +
        (persona === "student" ? "Your study time is open" : "Your calendar has room") +
        "</strong><p>" +
        (persona === "student" ? "Plan a study session when you need a focused block." : "Plan a meeting when you need one.") +
        "</p></div>";
  }

  function openFilesDatabase() {
    if (fileDatabasePromise) return fileDatabasePromise;
    fileDatabasePromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) {
        reject(new Error("This browser does not support local file storage."));
        return;
      }
      const request = window.indexedDB.open(FILES_DB, 1);
      request.onupgradeneeded = function () {
        const database = request.result;
        if (!database.objectStoreNames.contains(FILES_STORE)) {
          database.createObjectStore(FILES_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error("Could not open local file storage.")); };
    });
    return fileDatabasePromise;
  }

  function getStoredFiles() {
    return openFilesDatabase().then(function (database) {
      return new Promise(function (resolve, reject) {
        const transaction = database.transaction(FILES_STORE, "readonly");
        const request = transaction.objectStore(FILES_STORE).getAll();
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error || new Error("Could not read saved files.")); };
      });
    });
  }

  function deleteStoredFile(id) {
    return openFilesDatabase().then(function (database) {
      return new Promise(function (resolve, reject) {
        const transaction = database.transaction(FILES_STORE, "readwrite");
        const request = transaction.objectStore(FILES_STORE).delete(id);
        transaction.oncomplete = resolve;
        transaction.onerror = function () { reject(transaction.error || new Error("Could not remove the browser copy.")); };
        transaction.onabort = function () { reject(transaction.error || new Error("Removing the browser copy was cancelled.")); };
        request.onerror = function () { reject(request.error || new Error("Could not remove the browser copy.")); };
      });
    });
  }

  async function migrateBrowserFilesToCloud() {
    const files = await getStoredFiles();
    let migrated = 0;
    for (const file of files) {
      try {
        await uploadWorkspaceFile(file, file.id);
        await deleteStoredFile(file.id);
        migrated++;
      } catch (error) {
        console.error("Could not migrate a browser-saved file to Supabase:", error);
        $("files-error").hidden = false;
        $("files-error").textContent = "Some older files remain saved only in this browser and couldn't be moved to Supabase. " + error.message;
      }
    }
    if (migrated) renderFiles();
  }

  function renderFiles() {
    Promise.all([
      getStoredFiles(),
      cloudReady
        ? listWorkspaceFiles().catch(function (error) {
            $("files-error").hidden = false;
            $("files-error").textContent = "Cloud files couldn't be loaded. " + error.message;
            return [];
          })
        : Promise.resolve([])
    ]).then(function (results) {
      const localFiles = results[0].map(function (file) {
        return Object.assign({}, file, { storage: "local" });
      });
      const cloudFiles = results[1].filter(function (object) {
        return object && object.name && object.id;
      }).map(function (object) {
        const separator = object.name.indexOf("__");
        const name = separator >= 0 ? object.name.slice(separator + 2) : object.name;
        const path = cloudWorkspaceId + "/" + object.name;
        return {
          id: path,
          path: path,
          name: name,
          size: Number(object.metadata && object.metadata.size) || 0,
          type: object.metadata && object.metadata.mimetype || "application/octet-stream",
          updatedAt: object.updated_at || object.created_at || Date.now(),
          storage: "cloud"
        };
      });
      const files = cloudFiles.concat(localFiles).sort(function (a, b) {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
      renderRecentUploads(files);
      $("file-count").textContent = String(files.length);
      fileList.innerHTML = files.length
        ? files.map(function (file) {
          return '<article class="workspace-file"><span class="file-type-mark">' +
            escapeHTML((file.name.split(".").pop() || "FILE").slice(0, 4).toUpperCase()) +
            '</span><span class="file-copy"><strong>' + escapeHTML(file.name) +
            "</strong><small>" + escapeHTML(formatBytes(file.size)) + " · " +
            escapeHTML(new Date(file.updatedAt).toLocaleDateString(undefined, dateOptions)) +
            (file.storage === "local" ? " · This browser" : " · Supabase") +
            '</small></span><button type="button" class="file-open" data-file-id="' +
            escapeHTML(file.id) + '" data-storage="' + file.storage + '" data-file-name="' + escapeHTML(file.name) +
            '" data-file-type="' + escapeHTML(file.type || "") + '" aria-label="Open ' + escapeHTML(file.name) +
            '">↗</button><button type="button" class="file-download" data-file-id="' +
            escapeHTML(file.id) + '" data-storage="' + file.storage + '" data-file-name="' + escapeHTML(file.name) +
            '" data-file-type="' + escapeHTML(file.type || "") + '" aria-label="Download ' + escapeHTML(file.name) +
            '">↓</button><button type="button" class="file-remove" data-file-id="' +
            escapeHTML(file.id) + '" data-storage="' + file.storage + '" data-file-name="' + escapeHTML(file.name) +
            '" aria-label="Remove ' + escapeHTML(file.name) +
            '">×</button></article>'; 
        }).join("")
        : '<div class="workspace-empty-card file-empty"><span class="file-empty-mark">↥</span><strong>No files uploaded yet</strong><p>Upload files to keep them in this workspace.</p></div>';
    }).catch(function (error) {
      console.error("Could not load workspace files:", error);
      $("files-error").hidden = false;
      $("files-error").textContent = "Saved files couldn't be loaded. " + error.message;
    });
  }

  function renderRecentUploads(files) {
    const recentFiles = files.slice(0, 4);
    recentUploadList.innerHTML = recentFiles.length
      ? recentFiles.map(function (file) {
        return '<article class="recent-upload-item"><span class="file-type-mark">' +
          escapeHTML((file.name.split(".").pop() || "FILE").slice(0, 4).toUpperCase()) +
          '</span><span class="recent-upload-copy"><strong>' + escapeHTML(file.name) +
          '</strong><small>' + escapeHTML(formatBytes(file.size)) + " · " +
          escapeHTML(new Date(file.updatedAt).toLocaleDateString(undefined, dateOptions)) +
          '</small></span><button type="button" class="file-open" data-file-id="' +
          escapeHTML(file.id) + '" data-storage="' + file.storage + '" data-file-name="' +
          escapeHTML(file.name) + '" data-file-type="' + escapeHTML(file.type || "") +
          '" aria-label="Open ' + escapeHTML(file.name) + '">Open</button></article>';
      }).join("")
      : '<p class="recent-uploads-empty">No uploads yet. Your recent files will appear here.</p>';
  }

  function formatBytes(size) {
    if (size < 1024 * 1024) return Math.max(1, Math.round(size / 1024)) + " KB";
    return (size / (1024 * 1024)).toFixed(1) + " MB";
  }

  function updatePersona(nextPersona) {
    persona = nextPersona;
    const text = copy[persona];
    $("space-kicker").textContent = text.space;
    $("dashboard-description").textContent = text.description;
    $("action-one-title").textContent = text.actions[0][0];
    $("action-one-description").textContent = text.actions[0][1];
    $("action-two-title").textContent = text.actions[1][0];
    $("action-two-description").textContent = text.actions[1][1];
    $("action-three-title").textContent = text.actions[2][0];
    $("action-three-description").textContent = text.actions[2][1];
    $("action-four-title").textContent = text.actions[3][0];
    $("action-four-description").textContent = text.actions[3][1];
    $("notes-heading").textContent = currentFilter === "starred" ? "Starred work" : text.work;
    $("notes-subtitle").textContent = currentFilter === "starred" ? "Your saved favorites." : text.workSubtitle;
    $("tasks-subtitle").textContent = text.tasksSubtitle;
    $("meeting-heading").textContent = text.meetings;
    document.querySelector('[data-create="meeting"].solo-icon-action').setAttribute("aria-label", text.meetingLabel);
    $("meetings-nav-label").textContent = persona === "student" ? "Study sessions" : "Meetings";
    $("tasks-nav-label").textContent = persona === "student" ? "Study plan" : "Tasks";
    document.body.dataset.persona = persona;
    document.title = "NoteFlow — " + (persona === "student" ? "Student" : "Professional") + " Workspace";
    savedWorkspace.persona = persona;
    saveWorkspace();
    renderTasks();
    renderNotes();
  }

  function setWorkspaceMode(mode) {
    if (mode === "team" && !teamWorkspaces.length) {
      $("team-form").reset();
      $("team-dialog-error").hidden = true;
      $("team-dialog").showModal();
      $("team-name").focus();
      return;
    }
    activeWorkspace = mode;
    const isTeam = mode === "team";
    if (isTeam) {
      activeDeckId = null;
      $("presentation-editor").hidden = true;
      if (window.location.hash === "#presentation") history.replaceState(null, "", "#overview");
    }
    $("solo-dashboard").hidden = isTeam || (!isTeam && window.location.hash === "#presentation");
    $("team-dashboard").hidden = !isTeam;
    document.title = isTeam
      ? "NoteFlow — " + teamWorkspace.name
      : "NoteFlow — " + (persona === "student" ? "Student" : "Professional") + " Workspace";
    if (isTeam) {
      history.replaceState(null, "", "#team");
      $("team-dashboard-title").textContent = teamWorkspace.name;
      $("team-dashboard-description").textContent = "Manage members and invitations for your teams.";
      renderTeamHub();
    }
  }

  async function createTeamWorkspace(event) {
    event.preventDefault();
    const name = $("team-name").value.trim();
    if (!name) {
      $("team-name").reportValidity();
      return;
    }
    const submitButton = $("team-form").querySelector('[type="submit"]');
    submitButton.disabled = true;
    $("team-dialog-error").hidden = true;
    try {
      const team = await cloudRequest("/rest/v1/rpc/noteflow_create_workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          p_name: name,
          p_description: $("team-description").value.trim(),
          p_kind: "team"
        })
      });
      if (!team || !team.id) {
        throw new Error("Supabase did not return the new team workspace.");
      }
      selectedTeamId = team.id;
      $("team-dialog").close();
      await loadTeamHubData();
      teamWorkspace = teamWorkspaces.find(function (workspace) { return workspace.id === selectedTeamId; }) || team;
      setWorkspaceMode("team");
    } catch (error) {
      $("team-dialog-error").textContent = error.message;
      $("team-dialog-error").hidden = false;
    } finally {
      submitButton.disabled = false;
    }
  }

  function openDocumentEditor(note, template, category) {
    editingNoteId = note ? note.id : null;
    newItemCategory = note ? note.category : (category || "Note");
    noteForm.reset();
    $("note-title").value = note ? note.title : (template ? template.title : "");
    $("note-body").value = note ? note.body : (template ? template.body : "");
    $("note-title-label").textContent = newItemCategory === "Note" ? "Note title" : "Document title";
    $("note-body-label").textContent = newItemCategory === "Note" ? "Your note" : "Your document";
    $("note-body").placeholder = newItemCategory === "Note"
      ? "Capture an idea, reminder, or meeting note..."
      : "Write an outline, project brief, or meeting notes...";
    $("note-save-label").textContent = newItemCategory === "Note" ? "Save note" : "Save document";
    noteForm.hidden = false;
    noteForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
    $("note-title").focus({ preventScroll: true });
  }

  function isDocumentItem(item) {
    return item && ["Document", "Coursework"].includes(item.category);
  }

  function documentTextToHTML(text) {
    return "<p>" + escapeHTML(text || "").replace(/\r?\n/g, "<br>") + "</p>";
  }

  function sanitizeDocumentHTML(html) {
    const source = new DOMParser().parseFromString(html, "text/html");
    const clean = document.createElement("div");
    const allowed = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "H1", "H2", "BLOCKQUOTE"]);
    const blocked = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "IMG"]);
    function copySafeNode(node, parent) {
      if (node.nodeType === Node.TEXT_NODE) {
        parent.appendChild(document.createTextNode(node.nodeValue || ""));
        return;
      } 
      if (node.nodeType !== Node.ELEMENT_NODE || blocked.has(node.tagName)) return;
      if (allowed.has(node.tagName)) {
        const element = document.createElement(node.tagName.toLowerCase());
        parent.appendChild(element);
        Array.from(node.childNodes).forEach(function (child) { copySafeNode(child, element); });
        return;
      }
      Array.from(node.childNodes).forEach(function (child) { copySafeNode(child, parent); });
    }
    Array.from(source.body.childNodes).forEach(function (node) { copySafeNode(node, clean); });
    return clean.innerHTML || "<p><br></p>";
  }

  function getActiveDocument() {
    return notes.find(function (item) { return item.id === activeDocumentId && isDocumentItem(item); });
  }
 
  function setDocumentSaveStatus(message, isError) {
    $("document-save-status").textContent = message;
    $("document-save-status").classList.toggle("is-error", Boolean(isError));
  }

  function saveDocumentChanges() {
    window.clearTimeout(documentSaveTimer);
    documentSaveTimer = null;
    const item = getActiveDocument();
    if (!item) return false;
    item.title = $("document-title").value.trim() || "Untitled document";
    item.content = sanitizeDocumentHTML($("document-content").innerHTML);
    item.body = $("document-content").innerText.trim();
    item.updatedAt = new Date().toISOString();
    const saved = saveNotes();
    $("document-error").hidden = saved;
    if (saved) {
      $("document-error").textContent = "";
      setDocumentSaveStatus("Saved locally", false);
      renderNotes();
    } else {
      $("document-error").textContent = "This document couldn't be saved. Check browser storage and try again.";
      setDocumentSaveStatus("Save failed", true);
    }
    return saved;
  }

  function scheduleDocumentSave() {
    setDocumentSaveStatus("Saving…", false);
    $("document-error").hidden = true;
    window.clearTimeout(documentSaveTimer);
    documentSaveTimer = window.setTimeout(saveDocumentChanges, 500);
  }

  function openWorkspaceDocument(note) {
    const item = note || {
      id: createId(),
      title: "Untitled document",
      body: "",
      content: "<p><br></p>",
      category: persona === "student" ? "Coursework" : "Document",
      updatedAt: new Date().toISOString(),
      starred: false
    };
    if (!note) {
      notes.unshift(item);
      if (!saveNotes()) {
        notes = notes.filter(function (entry) { return entry.id !== item.id; });
        return;
      }
    }
    activeDocumentId = item.id;
    editingNoteId = null;
    noteForm.hidden = true;
    $("document-title").value = item.title;
    $("document-content").innerHTML = sanitizeDocumentHTML(item.content || documentTextToHTML(item.body));
    $("document-error").hidden = true;
    $("document-error").textContent = "";
    $("document-editor").hidden = false;
    $("work-list-view").hidden = true;
    if (window.location.hash !== "#work") {
      history.replaceState(null, "", "#work");
      updateNavigation();
    }
    $("document-editor").hidden = false;
    $("work-list-view").hidden = true;
    $("work-heading-actions").hidden = true;
    $("notes-heading").textContent = "Document editor";
    $("notes-subtitle").textContent = "Write, format, and save your document here.";
    setDocumentSaveStatus("Saved locally", false);
    $("document-title").focus({ preventScroll: true });
    $("document-editor").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeWorkspaceDocument() {
    saveDocumentChanges();
    activeDocumentId = null;
    $("document-editor").hidden = true;
    $("work-list-view").hidden = false;
    $("work-heading-actions").hidden = false;
    $("notes-heading").textContent = currentFilter === "starred" ? "Starred work" : copy[persona].work;
    $("notes-subtitle").textContent = currentFilter === "starred" ? "Your saved favorites." : copy[persona].workSubtitle;
    renderNotes();
    $("notes-heading").focus({ preventScroll: true });
  }

  function handleDocumentFormat(event) {
    const button = event.target.closest("[data-doc-command]");
    if (!button) return;
    $("document-content").focus();
    document.execCommand(button.dataset.docCommand, false, button.dataset.docValue || null);
    scheduleDocumentSave();
  }

  function downloadActiveDocument() {
    if (!saveDocumentChanges()) return;
    const item = getActiveDocument();
    if (!item) return;
    const safeName = item.title.replace(/[<>:"/\\|?*]+/g, "-").trim() || "Untitled document";
    const blob = new Blob([item.body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeName + ".txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function getActiveDeck() {
    return notes.find(function (item) { return item.id === activeDeckId && item.category === "Presentation"; });
  }

  function setPresentationStatus(message, isError) {
    const status = $("presentation-save-status");
    status.textContent = message;
    status.classList.toggle("is-error", Boolean(isError));
  }

  function renderPresentationSlides() {
    const deck = getActiveDeck();
    if (!deck) return;
    $("presentation-slide-list").innerHTML = deck.slides.map(function (slide, index) {
      const thumbnail = slide.thumbnail
        ? '<img src="' + escapeHTML(slide.thumbnail) + '" alt="">'
        : '<span class="presentation-slide-preview">' + (index + 1) + "</span>";
      const slideTitle = slide.title || ("Slide " + (index + 1));
      return '<button type="button" class="presentation-slide-thumb' +
        (index === activeSlideIndex ? " is-active" : "") + '" data-slide-index="' + index +
        '" aria-label="Open slide ' + (index + 1) + ': ' + escapeHTML(slideTitle) +
        '" aria-current="' + (index === activeSlideIndex ? "true" : "false") + '">' +
        thumbnail + "<span>" + (index + 1) + ". " + escapeHTML(slideTitle) + "</span></button>";
    }).join("");
  }

  function saveActivePresentationSlide() {
    const deck = getActiveDeck();
    if (!deck || !slideCanvas || isLoadingPresentationSlide) return false;
    const slide = deck.slides[activeSlideIndex];
    if (!slide) return false;
    slide.data = slideCanvas.toJSON([
      "isPresentationTableCell",
      "isPresentationTableCellBackground",
      "isPresentationTableCellText",
      "presentationTableCellId"
    ]);
    slide.background = slideCanvas.backgroundColor || slide.background || "#ffffff";
    try {
      slide.thumbnail = slideCanvas.toDataURL({ format: "png", multiplier: 0.18 });
    } catch (error) {
      console.error("Could not render presentation slide preview:", error);
    }
    if (!saveNotes()) {
      setPresentationStatus("Save failed", true);
      return false;
    }
    setPresentationStatus("Saved", false);
    renderPresentationSlides();
    return true;
  }

  function queuePresentationSave() {
    if (isLoadingPresentationSlide) return;
    setPresentationStatus("Saving…", false);
    window.clearTimeout(presentationSaveTimer);
    presentationSaveTimer = window.setTimeout(saveActivePresentationSlide, 450);
  }

  function addDefaultSlideContent(slide) {
    isLoadingPresentationSlide = true;
    slideCanvas.clear();
    slideCanvas.setBackgroundColor(slide.background || "#ffffff", function () {});
    slideCanvas.renderAll();
    isLoadingPresentationSlide = false;
    saveActivePresentationSlide();
  }

  function preparePresentationText(objectData) {
    if (!objectData || typeof objectData !== "object") return;
    if (objectData.type === "i-text") objectData.type = "textbox";
    if (objectData.type === "textbox") objectData.splitByGrapheme = true;
    if (Array.isArray(objectData.objects)) {
      objectData.objects.forEach(preparePresentationText);
    }
  }

  function getPresentationTextTarget() {
    if (activePresentationText) return activePresentationText;
    const active = slideCanvas && slideCanvas.getActiveObject();
    return active && (active.type === "textbox" || active.type === "i-text") ? active : null;
  }

  function syncPresentationTextControls(text) {
    if (!text) return;
    if (text.fontFamily) {
      presentationTextStyle.fontFamily = text.fontFamily;
      $("presentation-font-family").value = text.fontFamily;
    }
    if (text.fontSize) {
      presentationTextStyle.fontSize = text.fontSize;
      $("presentation-font-size").value = text.fontSize;
    }
    if (text.fill && /^#[0-9a-f]{6}$/i.test(text.fill)) {
      presentationTextStyle.fill = text.fill;
      $("presentation-font-color").value = text.fill;
      $("presentation-font-color").previousElementSibling.style.color = text.fill;
    }
    presentationTextStyle.fontWeight = text.fontWeight === "bold" || Number(text.fontWeight) >= 600 ? "bold" : "normal";
    $("presentation-format-bold").setAttribute("aria-pressed", String(presentationTextStyle.fontWeight === "bold"));
  }

  function capturePresentationTextSelection() {
    const text = getPresentationTextTarget();
    if (!text || !text.isEditing) {
      presentationTextSelection = null;
      return;
    }
    presentationTextSelection = {
      start: text.selectionStart,
      end: text.selectionEnd
    };
  }

  function applyPresentationTextStyle(property, value) {
    presentationTextStyle[property] = value;
    if (property === "fontFamily") $("presentation-font-family").value = value;
    if (property === "fontSize") $("presentation-font-size").value = value;
    if (property === "fill") {
      $("presentation-font-color").value = value;
      $("presentation-font-color").previousElementSibling.style.color = value;
    }
    if (property === "fontWeight") {
      $("presentation-format-bold").setAttribute("aria-pressed", String(value === "bold"));
    }
    const text = getPresentationTextTarget();
    if (!text) return;
    const selection = presentationTextSelection;
    const typingStyles = presentationTypingStyles.get(text) || {};
    typingStyles[property] = value;
    presentationTypingStyles.set(text, typingStyles);
    if (selection && selection.start !== selection.end && typeof text.setSelectionStyles === "function") {
      const style = {};
      style[property] = value;
      text.setSelectionStyles(style, selection.start, selection.end);
    }
    queuePresentationTextReflow();
  }

  function applyPresentationTypingStyles(event) {
    const text = event.target;
    if (!text || typeof text.text !== "string") return;
    const previousText = presentationTextSnapshots.get(text) || "";
    const currentText = text.text;
    let prefixLength = 0;
    while (prefixLength < previousText.length && prefixLength < currentText.length &&
        previousText[prefixLength] === currentText[prefixLength]) {
      prefixLength += 1;
    }
    let suffixLength = 0;
    while (suffixLength < previousText.length - prefixLength &&
        suffixLength < currentText.length - prefixLength &&
        previousText[previousText.length - 1 - suffixLength] === currentText[currentText.length - 1 - suffixLength]) {
      suffixLength += 1;
    }
    presentationTextSnapshots.set(text, currentText);
    const insertedEnd = currentText.length - suffixLength;
    const typingStyles = presentationTypingStyles.get(text);
    if (typingStyles && insertedEnd > prefixLength) {
      text.setSelectionStyles(typingStyles, prefixLength, insertedEnd);
      text.setCoords();
    }
    queuePresentationTextReflow();
  }

  function queuePresentationTextReflow() {
    if (presentationTextReflowFrame !== null) return;
    presentationTextReflowFrame = window.requestAnimationFrame(function () {
      presentationTextReflowFrame = null;
      reflowPresentationTextBoxes();
      slideCanvas.requestRenderAll();
      queuePresentationSave();
    });
  }

  function reflowPresentationTextBoxes() {
    const textBoxes = slideCanvas.getObjects()
      .filter(function (object) {
        return object.type === "textbox" && !object.isPresentationTableCellText &&
          typeof object.text === "string" && object.text.trim();
      })
      .sort(function (first, second) {
        return first.top - second.top || first.left - second.left;
      });

    textBoxes.forEach(function (textBox, index) {
      textBox.setCoords();
      const bounds = textBox.getBoundingRect(true, true);
      textBoxes.slice(index + 1).forEach(function (nextTextBox) {
        nextTextBox.setCoords();
        const nextBounds = nextTextBox.getBoundingRect(true, true);
        const overlapsHorizontally = bounds.left < nextBounds.left + nextBounds.width &&
          nextBounds.left < bounds.left + bounds.width;
        const overlapsVertically = bounds.top < nextBounds.top + nextBounds.height &&
          nextBounds.top < bounds.top + bounds.height;
        if (!overlapsHorizontally || !overlapsVertically) return;
        nextTextBox.set("top", nextTextBox.top + bounds.top + bounds.height + 8 - nextBounds.top);
        nextTextBox.setCoords();
      });
    });
  }

  function loadPresentationSlide(index) {
    const deck = getActiveDeck();
    if (!deck || !slideCanvas || !deck.slides[index]) return;
    activeSlideIndex = index;
    activePresentationText = null;
    presentationTextSelection = null;
    const slide = deck.slides[index];
    $("slide-background").value = slide.background || "#ffffff";
    renderPresentationSlides();
    if (!slide.data) {
      addDefaultSlideContent(slide);
      return;
    }
    if (Array.isArray(slide.data.objects)) {
      slide.data.objects.forEach(preparePresentationText);
    }
    isLoadingPresentationSlide = true;
    try {
      slideCanvas.loadFromJSON(slide.data, function () {
        slideCanvas.setBackgroundColor(slide.background || "#ffffff", function () {
          slideCanvas.renderAll();
          isLoadingPresentationSlide = false;
          slideCanvas.calcOffset();
          saveActivePresentationSlide();
          renderPresentationSlides();
        });
      });
    } catch (error) {
      isLoadingPresentationSlide = false;
      console.error("Could not open presentation slide:", error);
      $("presentation-error").hidden = false;
      $("presentation-error").textContent = "This slide couldn't be opened. Try another slide or refresh the workspace.";
    }
  }

  function initializePresentationCanvas() {
    if (slideCanvas) return true;
    if (!window.fabric || typeof window.fabric.Canvas !== "function") {
      $("presentation-error").hidden = false;
      $("presentation-error").textContent = "The slide editor couldn't load. Refresh the workspace and try again.";
      return false;
    }
    slideCanvas = new fabric.Canvas("presentation-canvas", {
      width: 1280,
      height: 720,
      preserveObjectStacking: true,
      selection: true
    });
    ["object:modified", "object:added", "object:removed", "text:changed"].forEach(function (eventName) {
      slideCanvas.on(eventName, queuePresentationSave);
    });
    slideCanvas.on("object:modified", function (event) {
      if (event.target && event.target.type === "textbox" && !event.target.isPresentationTableCellText) {
        queuePresentationTextReflow();
      }
    });
    slideCanvas.on("text:editing:entered", function (event) {
      activePresentationText = event.target;
      presentationTextSnapshots.set(event.target, event.target.text);
      syncPresentationTextControls(event.target);
    });
    slideCanvas.on("text:changed", applyPresentationTypingStyles);
    slideCanvas.on("selection:created", function (event) {
      const target = event.selected && event.selected[0];
      if (target && (target.type === "textbox" || target.type === "i-text")) {
        activePresentationText = target;
        syncPresentationTextControls(target);
      }
    });
    slideCanvas.on("selection:updated", function (event) {
      const target = event.selected && event.selected[0];
      if (target && (target.type === "textbox" || target.type === "i-text")) {
        activePresentationText = target;
        syncPresentationTextControls(target);
      }
    });
    slideCanvas.on("selection:cleared", function () {
      if (!activePresentationText || !activePresentationText.isEditing) activePresentationText = null;
    });
    slideCanvas.on("mouse:dblclick", function (event) {
      const target = event.target;
      if (!target) return;
      const cellGroup = target.isPresentationTableCell
        ? target
        : target.group && target.group.isPresentationTableCell
          ? target.group
          : null;
      if (!cellGroup || typeof cellGroup.getObjects !== "function") return;
      const textCell = target.type === "textbox"
        ? target
        : cellGroup.getObjects().find(function (object) { return object.type === "textbox"; });
      if (!textCell) return;
      if (textCell.group && typeof cellGroup._restoreObjectsState === "function") {
        const cellObjects = cellGroup.getObjects().slice();
        const cellId = createId();
        cellGroup._restoreObjectsState();
        slideCanvas.remove(cellGroup);
        cellObjects.forEach(function (object) {
          if (object.type === "textbox") {
            object.isPresentationTableCellText = true;
            object.presentationTableCellId = cellId;
          } else if (object.type === "rect") {
            object.selectable = false;
            object.evented = true;
            object.isPresentationTableCellBackground = true;
            object.presentationTableCellId = cellId;
          }
          slideCanvas.add(object);
        });
      }
      slideCanvas.setActiveObject(textCell);
      textCell.enterEditing();
      textCell.selectAll();
      if (textCell.hiddenTextarea) textCell.hiddenTextarea.focus();
      slideCanvas.requestRenderAll();
    });
    slideCanvas.on("mouse:down", function (event) {
      if (event.target) {
        const text = event.target.type === "textbox" || event.target.type === "i-text"
          ? event.target
          : event.target.isPresentationTableCellBackground
            ? slideCanvas.getObjects().find(function (object) {
              return object.isPresentationTableCellText &&
                object.presentationTableCellId === event.target.presentationTableCellId;
            })
            : null;
        if (text && typeof text.enterEditing === "function") {
          if (event.target.isPresentationTableCellBackground) slideCanvas.setActiveObject(text);
          text.enterEditing();
          if (typeof text.setCursorByClick === "function") text.setCursorByClick(event.e);
          if (text.hiddenTextarea) text.hiddenTextarea.focus();
          slideCanvas.requestRenderAll();
        }
        return;
      }
      const pointer = slideCanvas.getPointer(event.e);
      const left = Math.max(40, Math.min(pointer.x, 1120));
      const text = new fabric.Textbox("", {
        left: left,
        top: pointer.y,
        width: 1240 - left,
        fontFamily: presentationTextStyle.fontFamily,
        fontSize: presentationTextStyle.fontSize,
        fontWeight: presentationTextStyle.fontWeight,
        fill: presentationTextStyle.fill,
        splitByGrapheme: true
      });
      activePresentationText = text;
      slideCanvas.add(text);
      slideCanvas.setActiveObject(text);
      slideCanvas.requestRenderAll();
      queuePresentationSave();
      text.enterEditing();
      text.hiddenTextarea.focus();
    });
    slideCanvas.on("text:editing:exited", function (event) {
      if (event.target && event.target.type === "textbox" &&
          !event.target.isPresentationTableCellText && !event.target.text.trim()) {
        slideCanvas.remove(event.target);
        queuePresentationSave();
      }
      queuePresentationTextReflow();
    });
    return true;
  }

  function openPresentationEditor(noteId) {
    const deck = notes.find(function (item) { return item.id === noteId && item.category === "Presentation"; });
    if (!deck) {
      showWorkspaceError("That presentation couldn't be found in My work.");
      return;
    }
    if (!Array.isArray(deck.slides) || !deck.slides.length) {
      deck.slides = [{ id: createId(), title: "Slide 1", background: "#ffffff", data: null, thumbnail: "" }];
      if (!saveNotes()) return;
    }
    if (!initializePresentationCanvas()) return;
    activeDeckId = deck.id;
    activeSlideIndex = 0;
    $("presentation-title").value = deck.title;
    $("presentation-error").hidden = true;
    history.replaceState(null, "", "#presentation");
    updateNavigation();
    loadPresentationSlide(activeSlideIndex);
    window.requestAnimationFrame(function () {
      if (slideCanvas) slideCanvas.calcOffset();
    });
  }

  function closePresentationEditor() {
    window.clearTimeout(presentationSaveTimer);
    saveActivePresentationSlide();
    activeDeckId = null;
    history.replaceState(null, "", "#work");
    updateNavigation();
    $("notes-heading").focus({ preventScroll: true });
  }

  function addPresentationShape(type) {
    if (!slideCanvas) return;
    const shape = type === "circle"
      ? new fabric.Ellipse({ left: 180, top: 160, rx: 100, ry: 68, fill: "#c5d3ff" })
      : new fabric.Rect({ left: 180, top: 160, width: 240, height: 150, rx: 12, ry: 12, fill: "#c5d3ff" });
    slideCanvas.add(shape);
    slideCanvas.setActiveObject(shape);
    slideCanvas.requestRenderAll();
    queuePresentationSave();
  }

  function insertPresentationTable(rows, columns) {
    if (!slideCanvas) return;
    const cellWidth = Math.min(220, 1080 / columns);
    const cellHeight = Math.min(62, 400 / rows);
    const tableWidth = cellWidth * columns;
    const tableHeight = cellHeight * rows;
    const left = (1280 - tableWidth) / 2;
    const top = 290;
    const cells = [];
    let firstCellText = null;

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const isHeader = row === 0;
        const cellId = createId();
        const cellBackground = new fabric.Rect({
          left: left + column * cellWidth,
          top: top + row * cellHeight,
          width: cellWidth,
          height: cellHeight,
          fill: isHeader ? "#e9eefb" : "#ffffff",
          stroke: "#b8c2d2",
          strokeWidth: 1,
          selectable: false,
          evented: true,
          isPresentationTableCellBackground: true,
          presentationTableCellId: cellId
        });
        const cellText = new fabric.Textbox(
          "",
          {
            left: left + column * cellWidth + 12,
            top: top + row * cellHeight + Math.max(8, (cellHeight - 22) / 2),
            width: cellWidth - 24,
            fontFamily: "Arial",
            fontSize: Math.min(18, cellHeight * 0.32),
            fontWeight: isHeader ? "bold" : "normal",
            fill: "#34445a",
            splitByGrapheme: true,
            editable: true,
            isPresentationTableCellText: true,
            presentationTableCellId: cellId
          }
        );
        cells.push(cellBackground, cellText);
        if (!firstCellText) firstCellText = cellText;
      }
    }

    slideCanvas.add.apply(slideCanvas, cells);
    slideCanvas.setActiveObject(firstCellText);
    slideCanvas.requestRenderAll();
    firstCellText.enterEditing();
    window.setTimeout(function () {
      firstCellText.enterEditing();
      if (firstCellText.hiddenTextarea) firstCellText.hiddenTextarea.focus();
    }, 0);
    queuePresentationSave();
    $("presentation-error").hidden = true;
  }

  function addPresentationImage(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      $("presentation-error").hidden = false;
      $("presentation-error").textContent = "Choose an image smaller than 8 MB so it can be added to the presentation.";
      return;
    }
    const reader = new FileReader();
    reader.onerror = function () {
      $("presentation-error").hidden = false;
      $("presentation-error").textContent = "The image couldn't be read. Choose another image and try again.";
    };
    reader.onload = function () {
      const source = new Image();
      source.onerror = function () {
        $("presentation-error").hidden = false;
        $("presentation-error").textContent = "The selected file isn't a supported image.";
      };
      source.onload = function () {
        const scale = Math.min(1, 1600 / source.width, 900 / source.height);
        const imageCanvas = document.createElement("canvas");
        imageCanvas.width = Math.max(1, Math.round(source.width * scale));
        imageCanvas.height = Math.max(1, Math.round(source.height * scale));
        const context = imageCanvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, imageCanvas.width, imageCanvas.height);
        context.drawImage(source, 0, 0, imageCanvas.width, imageCanvas.height);
        const compressedImage = imageCanvas.toDataURL("image/jpeg", 0.82);
        fabric.Image.fromURL(compressedImage, function (image) {
        if (!image) {
          $("presentation-error").hidden = false;
          $("presentation-error").textContent = "The selected file isn't a supported image.";
          return;
        }
        image.scale(Math.min(520 / image.width, 420 / image.height, 1));
        image.set({ left: 130, top: 110 });
        slideCanvas.add(image);
        slideCanvas.setActiveObject(image);
        slideCanvas.requestRenderAll();
        queuePresentationSave();
        });
      };
      source.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  async function createPresentationPptxBlob(deck) {
    if (typeof window.PptxGenJS !== "function") {
      throw new Error("PowerPoint export couldn't load. Refresh the workspace and try again.");
    }
    const pptx = new window.PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "NoteFlow";
    pptx.subject = "Presentation created in NoteFlow";
    for (const slideData of deck.slides) {
      const staticCanvas = new fabric.StaticCanvas(null, { width: 1280, height: 720 });
      try {
        await new Promise(function (resolve, reject) {
          try {
            staticCanvas.loadFromJSON(slideData.data, resolve);
          } catch (error) {
            reject(error);
          }
        });
        staticCanvas.setBackgroundColor(slideData.background || "#ffffff", function () {});
        staticCanvas.renderAll();
        const image = staticCanvas.toDataURL({ format: "png" });
        const page = pptx.addSlide();
        page.addImage({ data: image, x: 0, y: 0, w: 13.333, h: 7.5 });
      } finally {
        staticCanvas.dispose();
      }
    }
    const output = await pptx.write({ outputType: "blob" });
    return output instanceof Blob
      ? output
      : new Blob([output], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
  }

  async function exportPresentation() {
    const deck = getActiveDeck();
    if (!deck || !saveActivePresentationSlide()) return;
    const exportButton = $("presentation-export");
    exportButton.disabled = true;
    $("presentation-error").hidden = true;
    setPresentationStatus("Exporting…", false);
    try {
      const blob = await createPresentationPptxBlob(deck);
      const safeName = (deck.title || "NoteFlow presentation").replace(/[<>:"/\\|?*]+/g, "-").trim();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = (safeName || "NoteFlow presentation") + ".pptx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      setPresentationStatus("PowerPoint exported", false);
    } catch (error) {
      console.error("Could not export the presentation:", error);
      $("presentation-error").hidden = false;
      $("presentation-error").textContent = error.message || "PowerPoint export failed. Try again after checking available storage.";
      setPresentationStatus("Export failed", true);
    } finally {
      exportButton.disabled = false;
    }
  }

  function openCreateDialog(action) {
    dialogAction = action;
    dialogForm.reset();
    $("workspace-dialog-error").hidden = true;
    const isMeeting = action === "meeting";
    const isPresentation = action === "presentation";
    $("dialog-eyebrow").textContent = persona === "student" ? "STUDENT WORKSPACE" : "PROFESSIONAL WORKSPACE";
    $("dialog-title").textContent = isMeeting
      ? (persona === "student" ? "Plan a study session" : "Schedule a meeting")
      : isPresentation
        ? (persona === "student" ? "Create study slides" : "Start a presentation")
        : action === "other"
          ? "Create another workspace item"
          : (persona === "student" ? "Create a class document" : "Create a work document");
    $("dialog-description").textContent = isMeeting
      ? "Add a title, time, and anything you want to cover."
      : isPresentation
        ? "Create a blank slide deck and add content yourself."
        : action === "other"
          ? "Add a title and details for another item in your workspace."
          : "Save a document in your workspace.";
    $("dialog-name-label").textContent = isMeeting ? "Meeting name" : isPresentation ? "Presentation name" : action === "other" ? "Item name" : "Document name";
    $("dialog-name").placeholder = isMeeting ? "e.g. Project check-in" : isPresentation ? "e.g. Product launch" : action === "other" ? "e.g. Project checklist" : "e.g. Project brief";
    $("dialog-details-label").innerHTML = isMeeting ? "Agenda <span>(optional)</span>" : isPresentation ? "Notes <span>(optional)</span>" : action === "other" ? "Details <span>(optional)</span>" : "Content <span>(optional)</span>";
    $("dialog-details").placeholder = isMeeting ? "What would you like to cover?" : isPresentation ? "Optional notes for this deck" : "Add a few points to get started";
    $("dialog-date-label").hidden = !isMeeting;
    $("dialog-date").hidden = !isMeeting;
    $("dialog-date").required = isMeeting;
    if (isMeeting) {
      const localNow = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
      $("dialog-date").min = localNow.toISOString().slice(0, 16);
    }
    $("dialog-submit").textContent = isMeeting ? (persona === "student" ? "Plan session" : "Schedule meeting") : "Create workspace item";
    dialog.showModal();
    $("dialog-name").focus();
  }

  function closeDialog() {
    if (dialog.open) dialog.close();
  }

  function saveDialogItem(event) {
    event.preventDefault();
    if (!dialogForm.reportValidity()) return;
    const title = $("dialog-name").value.trim();
    const details = $("dialog-details").value.trim();
    if (dialogAction === "meeting") {
      const date = new Date($("dialog-date").value);
      if (Number.isNaN(date.getTime()) || date.getTime() < Date.now()) {
        $("workspace-dialog-error").hidden = false;
        $("workspace-dialog-error").textContent = "Choose a future date and time.";
        return;
      }
      savedWorkspace.meetings.push({ id: createId(), title: title, details: details, date: date.toISOString() });
      if (!saveWorkspace()) return;
      renderMeetings();
      closeDialog();
      location.hash = "meetings";
      return;
    }

    const newItem = {
      id: createId(),
      title: title,
      body: dialogAction === "presentation"
        ? details
        : details || (dialogAction === "other" ? "Workspace item created." : "Workspace document created."),
      category: dialogAction === "presentation"
        ? "Presentation"
        : dialogAction === "other" ? "Other" : (persona === "student" ? "Coursework" : "Document"),
      updatedAt: new Date().toISOString(),
      starred: false
    }; 
    if (dialogAction === "presentation") {
      newItem.slides = [{ id: createId(), title: "Slide 1", background: "#ffffff", data: null, thumbnail: "" }];
    }
    notes.unshift(newItem);
    if (!saveNotes()) return;
    closeDialog();
    currentFilter = "all";
    if (dialogAction === "presentation") {
      openPresentationEditor(newItem.id);
      return;
    }
    history.replaceState(null, "", "#work");
    updateNavigation();
    location.hash = "work";
  }

  function openFilePicker() {
    $("file-picker").click();
  }

  function saveSelectedFiles(event) {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    if (!selected.length) return;
    const oversized = selected.find(function (file) { return file.size > MAX_FILE_BYTES; });
    if (oversized) {
      $("files-error").hidden = false;
      $("files-error").textContent = oversized.name + " is larger than the 25 MB per-file limit.";
      return;
    }
    if (!cloudReady || !cloudWorkspaceId) {
      $("files-error").hidden = false;
      $("files-error").textContent = "Supabase storage is still connecting. Wait a moment, then try uploading again.";
      return;
    }
    let uploaded = 0;
    (async function () {
      for (const file of selected) {
        await uploadWorkspaceFile(file);
        uploaded++;
      }
      renderFiles();
      $("files-error").hidden = false;
      $("files-error").textContent = "Uploaded " + uploaded + " file" + (uploaded === 1 ? "" : "s") + " to your private Supabase workspace.";
    })().catch(function (error) {
      renderFiles();
      console.error("Could not save workspace files:", error);
      $("files-error").hidden = false;
      $("files-error").textContent = (uploaded
        ? "Uploaded " + uploaded + " file" + (uploaded === 1 ? "" : "s") + "; the remaining files couldn't be uploaded. "
        : "Files couldn't be uploaded to Supabase. ") + error.message;
    });
  }

  function handleFileAction(event) {
    const button = event.target.closest("button[data-file-id]");
    if (!button) return;
    const id = button.dataset.fileId;
    const storage = button.dataset.storage || "local";
    const shouldRemove = button.classList.contains("file-remove");
    const shouldOpen = button.classList.contains("file-open");
    if (shouldRemove && !window.confirm("Are you sure you want to delete this saved file? This can't be undone.")) return;
    if (storage === "cloud") {
      (async function () {
        if (shouldRemove) {
          await deleteWorkspaceFile(id);
          renderFiles();
          return;
        }
        const blob = await downloadWorkspaceFile(id);
        const file = {
          name: button.dataset.fileName || id.split("/").pop(),
          type: button.dataset.fileType || blob.type || "application/octet-stream",
          blob: blob
        };
        if (shouldOpen) {
          await showFilePreview(file);
        } else {
          const downloadUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = downloadUrl;
          link.download = file.name;
          link.click();
          window.setTimeout(function () { URL.revokeObjectURL(downloadUrl); }, 1000);
        }
      })().catch(function (error) {
        console.error("Could not access the Supabase workspace file:", error);
        $("files-error").hidden = false;
        $("files-error").textContent = (shouldRemove ? "The file couldn't be deleted. " : "The file couldn't be opened or downloaded. ") + error.message;
      });
      return;
    }
    openFilesDatabase().then(function (database) {
      return new Promise(function (resolve, reject) {
        const transaction = database.transaction(FILES_STORE, shouldRemove ? "readwrite" : "readonly");
        const store = transaction.objectStore(FILES_STORE);
        const request = shouldRemove ? store.delete(id) : store.get(id);
        if (shouldRemove) {
          transaction.oncomplete = function () { resolve(); };
        } else {
          request.onsuccess = function () { resolve(request.result); };
        }
        request.onerror = function () { reject(request.error || new Error("Could not access this saved file.")); };
        transaction.onerror = function () { reject(transaction.error || new Error("Could not update saved files.")); };
        transaction.onabort = function () { reject(transaction.error || new Error("The saved file action was cancelled.")); };
      });
    }).then(function (file) {
      if (shouldRemove) {
        renderFiles();
        return;
      }
      if (!file) throw new Error("This saved file is no longer available.");
      if (shouldOpen) {
        return showFilePreview(file);
      } else {
        const downloadUrl = URL.createObjectURL(file.blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = file.name;
        link.click();
        window.setTimeout(function () { URL.revokeObjectURL(downloadUrl); }, 1000);
      }
    }).catch(function (error) {
      if (shouldOpen && filePreviewUrl && !filePreviewDialog.open) releaseFilePreview();
      console.error("Could not access the saved workspace file:", error);
      $("files-error").hidden = false;
      $("files-error").textContent = (shouldRemove ? "The file couldn't be deleted. " : "The file couldn't be opened. ") + error.message;
    });
  }

  function showFilePreview(file) {
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    filePreviewUrl = URL.createObjectURL(file.blob);
    filePreviewContent.replaceChildren();
    filePreviewContent.hidden = false;
    $("file-preview-title").textContent = file.name;
    $("file-preview-fallback").hidden = true;
    $("file-preview-download").href = filePreviewUrl;
    $("file-preview-download").download = file.name;
    const extension = file.name.split(".").pop().toLowerCase();
    const isText = file.type.startsWith("text/") ||
      ["json", "md", "csv", "xml", "yaml", "yml", "log"].includes(extension);
    if (file.type.startsWith("image/")) {
      const image = document.createElement("img");
      image.src = filePreviewUrl;
      image.alt = file.name;
      filePreviewContent.appendChild(image);
    } else if (isText) {
      const preview = document.createElement("pre");
      return file.blob.text().then(function (text) {
        preview.textContent = text;
        filePreviewContent.appendChild(preview);
        filePreviewDialog.showModal();
      });
    } else {
      filePreviewContent.hidden = true;
      $("file-preview-fallback").hidden = false;
      $("file-preview-message").textContent = window.location.protocol === "file:"
        ? "This file type can't be previewed while NoteFlow is opened directly from your computer. Download it and open it with a compatible app."
        : "Your browser can't preview this file type here. Download it and open it with a compatible app.";
    }
    filePreviewDialog.showModal();
  }

  function closeFilePreview() {
    if (filePreviewDialog.open) filePreviewDialog.close();
  }

  function releaseFilePreview() {
    filePreviewContent.replaceChildren();
    filePreviewContent.hidden = false;
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      filePreviewUrl = null;
    }
  }

  noteForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const title = $("note-title").value.trim();
    const body = $("note-body").value.trim();
    if (!title || !body) {
      noteForm.reportValidity();
      return;
    }
    if (editingNoteId) {
      const item = notes.find(function (entry) { return entry.id === editingNoteId; });
      if (!item) {
        errorMessage.hidden = false;
        errorMessage.textContent = "That workspace item is no longer available. Refresh and try again.";
        return;
      }
      item.title = title;
      item.body = body;
      item.updatedAt = new Date().toISOString();
    } else {
      notes.unshift({ id: createId(), title: title, body: body, category: newItemCategory, updatedAt: new Date().toISOString(), starred: false });
    }
    if (!saveNotes()) return;
    noteForm.hidden = true;
    noteForm.reset();
    editingNoteId = null;
    renderNotes();
  });

  notesList.addEventListener("click", function (event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const item = notes.find(function (entry) { return entry.id === button.dataset.noteId; });
    if (!item) return;
    if (button.dataset.action === "edit-document") openWorkspaceDocument(item);
    if (button.dataset.action === "edit") openDocumentEditor(item);
    if (button.dataset.action === "edit-presentation") openPresentationEditor(item.id);
    if (button.dataset.action === "share-team") openWorkShareTeamDialog(item);
    if (button.dataset.action === "star") {
      item.starred = !item.starred;
      if (saveNotes()) renderNotes();
    }
    if (button.dataset.action === "delete") {
      if (!window.confirm("Remove this workspace item? This can't be undone.")) return;
      notes = notes.filter(function (entry) { return entry.id !== item.id; });
      if (saveNotes()) renderNotes();
    }
  });

  $("presentation-back").addEventListener("click", closePresentationEditor);
  $("presentation-title").addEventListener("input", function (event) {
    const deck = getActiveDeck();
    if (!deck) return;
    deck.title = event.target.value.trim() || "Untitled presentation";
    if (saveNotes()) {
      setPresentationStatus("Saved", false);
      renderPresentationSlides();
    } else {
      setPresentationStatus("Save failed", true);
    }
  });
  $("presentation-add-rect").addEventListener("click", function () { addPresentationShape("rectangle"); });
  $("presentation-add-circle").addEventListener("click", function () { addPresentationShape("circle"); });
  const presentationTableDialog = $("presentation-table-dialog");
  $("presentation-insert-table").addEventListener("click", function () {
    $("presentation-table-error").hidden = true;
    $("presentation-table-form").reset();
    presentationTableDialog.showModal();
    $("presentation-table-rows").focus();
  });
  $("presentation-table-close").addEventListener("click", function () { presentationTableDialog.close(); });
  $("presentation-table-cancel").addEventListener("click", function () { presentationTableDialog.close(); });
  $("presentation-table-form").addEventListener("submit", function (event) {
    event.preventDefault();
    const form = event.currentTarget;
    const rows = Number($("presentation-table-rows").value);
    const columns = Number($("presentation-table-columns").value);
    if (!form.reportValidity() || !Number.isInteger(rows) || rows < 1 || rows > 12 ||
        !Number.isInteger(columns) || columns < 1 || columns > 10) {
      $("presentation-table-error").hidden = false;
      $("presentation-table-error").textContent = "Choose 1–12 rows and 1–10 columns.";
      return;
    }
    if (!slideCanvas || !getActiveDeck()) {
      $("presentation-table-error").hidden = false;
      $("presentation-table-error").textContent = "Open a presentation slide before inserting a table.";
      return;
    }
    presentationTableDialog.close();
    insertPresentationTable(rows, columns);
  });
  $("presentation-add-image").addEventListener("click", function () { $("presentation-image-picker").click(); });
  $("presentation-image-picker").addEventListener("change", addPresentationImage);
  $("presentation-delete-object").addEventListener("click", function () {
    if (!slideCanvas) return;
    const selected = slideCanvas.getActiveObjects();
    if (!selected.length) return;
    if (!window.confirm("Delete the selected object" + (selected.length === 1 ? "" : "s") + " from this slide?")) return;
    selected.forEach(function (object) { slideCanvas.remove(object); });
    slideCanvas.discardActiveObject();
    slideCanvas.requestRenderAll();
    queuePresentationSave();
  });
  $("presentation-add-slide").addEventListener("click", function () {
    const deck = getActiveDeck();
    window.clearTimeout(presentationSaveTimer);
    if (!deck || !saveActivePresentationSlide()) return;
    deck.slides.push({ id: createId(), title: "Slide " + (deck.slides.length + 1), background: "#ffffff", data: null, thumbnail: "" });
    if (!saveNotes()) return;
    loadPresentationSlide(deck.slides.length - 1);
  });
  $("presentation-duplicate-slide").addEventListener("click", function () {
    const deck = getActiveDeck();
    window.clearTimeout(presentationSaveTimer);
    if (!deck || !saveActivePresentationSlide()) return;
    const duplicate = JSON.parse(JSON.stringify(deck.slides[activeSlideIndex]));
    duplicate.id = createId();
    duplicate.title = "Copy of " + (duplicate.title || ("Slide " + (activeSlideIndex + 1)));
    deck.slides.splice(activeSlideIndex + 1, 0, duplicate);
    if (!saveNotes()) return;
    loadPresentationSlide(activeSlideIndex + 1);
  });
  $("presentation-delete-slide").addEventListener("click", function () {
    const deck = getActiveDeck();
    if (!deck) return;
    if (deck.slides.length === 1) {
      $("presentation-error").hidden = false;
      $("presentation-error").textContent = "A presentation must contain at least one slide.";
      return;
    }
    if (!window.confirm("Delete this slide from the presentation? This can't be undone.")) return;
    window.clearTimeout(presentationSaveTimer);
    if (!saveActivePresentationSlide()) return;
    deck.slides.splice(activeSlideIndex, 1);
    if (!saveNotes()) return;
    $("presentation-error").hidden = true;
    loadPresentationSlide(Math.min(activeSlideIndex, deck.slides.length - 1));
  });
  $("presentation-slide-list").addEventListener("click", function (event) {
    const button = event.target.closest("button[data-slide-index]");
    if (!button) return;
    const index = Number(button.dataset.slideIndex);
    if (!Number.isInteger(index) || index < 0 || index >= (getActiveDeck() || { slides: [] }).slides.length) return;
    if (index === activeSlideIndex) return;
    window.clearTimeout(presentationSaveTimer);
    if (!saveActivePresentationSlide()) return;
    loadPresentationSlide(index);
  });
  $("slide-background").addEventListener("change", function (event) {
    if (!slideCanvas) return;
    const deck = getActiveDeck();
    if (!deck) return;
    deck.slides[activeSlideIndex].background = event.target.value;
    slideCanvas.setBackgroundColor(event.target.value, function () {
      slideCanvas.renderAll();
      queuePresentationSave();
    });
  });
  const presentationFormatControls = [
    $("presentation-font-family"),
    $("presentation-font-size"),
    $("presentation-font-color"),
    $("presentation-format-bold")
  ];
  presentationFormatControls.forEach(function (control) {
    control.addEventListener("pointerdown", capturePresentationTextSelection);
    control.addEventListener("focus", capturePresentationTextSelection);
  });
  $("presentation-font-family").addEventListener("change", function (event) {
    applyPresentationTextStyle("fontFamily", event.target.value);
  });
  $("presentation-font-size").addEventListener("change", function (event) {
    const size = Number(event.target.value);
    if (!Number.isInteger(size) || size < 8 || size > 160) {
      event.target.value = presentationTextStyle.fontSize;
      return;
    }
    applyPresentationTextStyle("fontSize", size);
  });
  $("presentation-font-color").addEventListener("input", function (event) {
    $("presentation-font-color").style.setProperty("--font-color", event.target.value);
    $("presentation-font-color").previousElementSibling.style.color = event.target.value;
    applyPresentationTextStyle("fill", event.target.value);
  });
  $("presentation-format-bold").addEventListener("click", function () {
    const isBold = $("presentation-format-bold").getAttribute("aria-pressed") === "true";
    applyPresentationTextStyle("fontWeight", isBold ? "normal" : "bold");
  });
  $("presentation-export").addEventListener("click", exportPresentation);

  document.querySelectorAll("[data-create]").forEach(function (button) {
    button.addEventListener("click", function () { openCreateDialog(button.dataset.create); });
  });
  const moreCreate = $("more-create");
  const moreMenu = $("more-create-menu");
  const moreWrap = moreCreate.closest(".solo-more-wrap");
  function setMoreMenuOpen(isOpen) {
    moreMenu.hidden = !isOpen;
    moreWrap.classList.toggle("is-open", isOpen);
    moreCreate.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) moreMenu.querySelector('[role="menuitem"]').focus();
    else moreCreate.focus();
  } 
  moreCreate.addEventListener("click", function () {
    setMoreMenuOpen(moreMenu.hidden);
  });
  moreMenu.addEventListener("keydown", function (event) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(moreMenu.querySelectorAll('[role="menuitem"]'));
    const currentIndex = items.indexOf(document.activeElement);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (currentIndex + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
    items[nextIndex].focus();
  });
  moreMenu.addEventListener("click", function (event) {
    const option = event.target.closest("[data-more-action]");
    if (!option) return;
    const action = option.dataset.moreAction;
    setMoreMenuOpen(false);
    if (action === "note") {
      currentFilter = "all";
      searchTerm = "";
      $("notes-search").value = "";
      history.replaceState(null, "", "#work");
      updateNavigation();
      openDocumentEditor(null, null, "Note");
      return;
    }
    if (action === "document") {
      currentFilter = "all";
      currentWorkTypeFilter = "documents";
      searchTerm = "";
      $("notes-search").value = "";
      history.replaceState(null, "", "#work");
      updateNavigation();
      openWorkspaceDocument(null);
      return;
    }
    openCreateDialog(action);
  });
  document.addEventListener("click", function (event) {
    if (!moreMenu.hidden && !event.target.closest(".solo-more-wrap")) {
      moreWrap.classList.remove("is-open");
      moreMenu.hidden = true;
      moreCreate.setAttribute("aria-expanded", "false");
    }
  });
  $("upload-file-button").addEventListener("click", openFilePicker);
  $("upload-file-from-files").addEventListener("click", openFilePicker);
  $("file-picker").addEventListener("change", saveSelectedFiles);
  fileList.addEventListener("click", handleFileAction);
  recentUploadList.addEventListener("click", handleFileAction);
  $("view-all-uploads").addEventListener("click", function () { window.location.hash = "files"; });
  $("file-preview-close").addEventListener("click", closeFilePreview);
  filePreviewDialog.addEventListener("close", releaseFilePreview);
  filePreviewDialog.addEventListener("click", function (event) {
    if (event.target === filePreviewDialog) closeFilePreview();
  });
  meetingsList.addEventListener("click", function (event) {
    const button = event.target.closest("button[data-meeting-id]");
    if (!button) return;
    savedWorkspace.meetings = savedWorkspace.meetings.filter(function (meeting) {
      return meeting.id !== button.dataset.meetingId;
    });
    if (saveWorkspace()) renderMeetings();
  });
  $("dialog-close").addEventListener("click", closeDialog);
  $("dialog-cancel").addEventListener("click", closeDialog);
  dialog.addEventListener("click", function (event) {
    if (event.target === dialog) closeDialog();
  });
  dialogForm.addEventListener("submit", saveDialogItem);

  function closeNoteEditor() {
    noteForm.hidden = true;
    noteForm.reset();
    editingNoteId = null;
    $("notes-heading").focus({ preventScroll: true });
  }
  $("back-note").addEventListener("click", closeNoteEditor);
  $("cancel-note").addEventListener("click", closeNoteEditor);
  $("document-back").addEventListener("click", closeWorkspaceDocument);
  $("document-title").addEventListener("input", scheduleDocumentSave);
  $("document-content").addEventListener("input", scheduleDocumentSave);
  $("document-content").addEventListener("paste", function (event) {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    scheduleDocumentSave();
  });
  $("document-content").addEventListener("keydown", function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveDocumentChanges();
    }
  });
  $("document-toolbar").addEventListener("mousedown", function (event) {
    if (event.target.closest("[data-doc-command]")) event.preventDefault();
  });
  $("document-toolbar").addEventListener("click", handleDocumentFormat);
  $("document-download").addEventListener("click", downloadActiveDocument);
  $("document-print").addEventListener("click", function () {
    if (saveDocumentChanges()) window.print();
  });
  window.addEventListener("beforeunload", function () {
    if (activeDocumentId && documentSaveTimer) saveDocumentChanges();
  });
  $("work").addEventListener("click", function (event) {
    const filterButton = event.target.closest("[data-work-filter]");
    if (!filterButton) return;
    currentWorkTypeFilter = filterButton.dataset.workFilter;
    currentFilter = currentWorkTypeFilter === "starred" ? "starred" : "all";
    history.replaceState(null, "", currentFilter === "starred" ? "#starred" : "#work");
    updateNavigation();
  });
  $("notes-search").addEventListener("input", function (event) {
    searchTerm = event.target.value.trim().toLowerCase();
    renderNotes();
  });
  $("create-document-from-work").addEventListener("click", function () {
    currentFilter = "all";
    currentWorkTypeFilter = "documents";
    searchTerm = "";
    $("notes-search").value = "";
    openWorkspaceDocument(null);
  });
  $("add-task-button").addEventListener("click", function () {
    $("task-add-form").hidden = !$("task-add-form").hidden;
    if (!$("task-add-form").hidden) $("new-task-input").focus();
  });
  $("save-task-button").addEventListener("click", function () {
    const input = $("new-task-input");
    const title = input.value.trim();
    if (!title) {
      input.focus();
      return;
    }
    currentTasks().push({ id: createId(), title: title, done: false });
    if (!saveWorkspace()) return;
    input.value = "";
    renderTasks();
  });
  $("new-task-input").addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      $("save-task-button").click();
    }
  });
  tasksList.addEventListener("change", function (event) {
    const input = event.target.closest("input[data-task-id]");
    if (!input) return;
    const task = currentTasks().find(function (item) { return item.id === input.dataset.taskId; });
    if (!task) return;
    task.done = input.checked;
    if (saveWorkspace()) renderTasks();
  });
  tasksList.addEventListener("click", function (event) {
    const button = event.target.closest("button[data-task-remove]");
    if (!button) return;
    if (!window.confirm("Delete this task from your study plan? This can't be undone.")) return;
    if (persona === "student") {
      savedWorkspace.tasksStudent = savedWorkspace.tasksStudent.filter(function (task) {
        return task.id !== button.dataset.taskRemove;
      });
    } else {
      savedWorkspace.tasksProfessional = savedWorkspace.tasksProfessional.filter(function (task) {
        return task.id !== button.dataset.taskRemove;
      });
    }
    if (saveWorkspace()) renderTasks();
  });

  $("team-form").addEventListener("submit", createTeamWorkspace);
  $("team-dialog-close").addEventListener("click", function () { $("team-dialog").close(); });
  $("team-dialog-cancel").addEventListener("click", function () { $("team-dialog").close(); });
  $("team-dialog").addEventListener("click", function (event) {
    if (event.target === $("team-dialog")) $("team-dialog").close();
  });
  $("create-team-button").addEventListener("click", function () {
    $("team-form").reset();
    $("team-dialog-error").hidden = true;
    $("team-dialog").showModal();
    $("team-name").focus();
  });
  $("team-nav-link").addEventListener("click", function () {
    activeWorkspace = "team";
    loadTeamHubData().catch(function (error) {
      teamDataReady = false;
      teamDataError = error;
      console.error("Could not load the Team section:", error);
      showWorkspaceError(teamDataError && /noteflow_team_invites|noteflow_workspace_tasks|schema cache|404/i.test(teamDataError.message)
        ? "Team features need their database migrations. Run noteflow-team-invites.sql and noteflow-team-content.sql in Supabase SQL Editor."
        : "The Team section couldn't load. " + error.message);
    });
  });
  $("team-list").addEventListener("click", function (event) {
    const button = event.target.closest("[data-team-select]");
    if (!button) return;
    selectedTeamId = button.dataset.teamSelect;
    loadTeamHubData().catch(function (error) {
      showWorkspaceError("Team details couldn't load. " + error.message);
    });
  });
  $("team-invite-button").addEventListener("click", function () {
    if (!teamWorkspace || teamWorkspace.created_by !== accountId) return;
    $("team-invite-form").reset();
    $("team-invite-error").hidden = true;
    $("team-invite-dialog").showModal();
    $("team-invite-email").focus();
  });
  $("team-delete-button").addEventListener("click", deleteTeamWorkspace);
  $("team-invite-form").addEventListener("submit", inviteTeamMember);
  $("team-invite-close").addEventListener("click", function () { $("team-invite-dialog").close(); });
  $("team-invite-cancel").addEventListener("click", function () { $("team-invite-dialog").close(); });
  $("team-invite-dialog").addEventListener("click", function (event) {
    if (event.target === $("team-invite-dialog")) $("team-invite-dialog").close();
  });
  $("team-invite-list").addEventListener("click", function (event) {
    const accept = event.target.closest("button[data-invite-accept]");
    const decline = event.target.closest("button[data-invite-decline]");
    if (accept) respondToTeamInvite(accept.dataset.inviteAccept, true);
    else if (decline) respondToTeamInvite(decline.dataset.inviteDecline, false);
  });
  teamMemberList.addEventListener("click", function (event) {
    const button = event.target.closest("button[data-team-member-remove]");
    if (button) openTeamMemberRemovalDialog(button.dataset.teamMemberRemove, button.dataset.memberLabel);
  });
  $("team-member-remove-form").addEventListener("submit", removeTeamMember);
  $("team-member-remove-close").addEventListener("click", function () {
    $("team-member-remove-dialog").close();
    removingTeamMemberId = null;
  });
  $("team-member-remove-cancel").addEventListener("click", function () {
    $("team-member-remove-dialog").close();
    removingTeamMemberId = null;
  });
  $("team-member-remove-dialog").addEventListener("click", function (event) {
    if (event.target === $("team-member-remove-dialog")) {
      $("team-member-remove-dialog").close();
      removingTeamMemberId = null;
    }
  });
  $("team-item-create").addEventListener("click", function () { openTeamItemDialog(null); });
  $("team-file-upload").addEventListener("click", function () { teamFilePicker.click(); });
  $("team-file-share-existing").addEventListener("click", openTeamFileShareDialog);
  $("team-file-share-form").addEventListener("submit", shareSelectedPersonalFiles);
  $("team-file-share-close").addEventListener("click", function () { teamFileShareDialog.close(); });
  $("team-file-share-cancel").addEventListener("click", function () { teamFileShareDialog.close(); });
  teamFileShareDialog.addEventListener("click", function (event) {
    if (event.target === teamFileShareDialog) teamFileShareDialog.close();
  });
  teamFileShareList.addEventListener("change", function (event) {
    if (event.target.matches('input[name="team-share-file"]')) {
      teamFileShareError.hidden = true;
      teamFileShareSubmit.disabled = teamFileShareList.querySelectorAll('input[name="team-share-file"]:checked').length === 0;
    }
  });
  teamFilePicker.addEventListener("change", uploadTeamFiles);
  teamFileList.addEventListener("click", handleTeamFileAction);
  $("work-share-team-form").addEventListener("submit", shareWorkItemWithTeam);
  $("work-share-team-close").addEventListener("click", function () {
    workShareTeamDialog.close();
    workItemToShare = null;
  });
  $("work-share-team-cancel").addEventListener("click", function () {
    workShareTeamDialog.close();
    workItemToShare = null;
  });
  workShareTeamDialog.addEventListener("click", function (event) {
    if (event.target === workShareTeamDialog) {
      workShareTeamDialog.close();
      workItemToShare = null;
    }
  });
  $("team-item-form").addEventListener("submit", saveTeamItem);
  $("team-item-close").addEventListener("click", function () { $("team-item-dialog").close(); });
  $("team-item-cancel").addEventListener("click", function () { $("team-item-dialog").close(); });
  $("team-item-dialog").addEventListener("click", function (event) {
    if (event.target === $("team-item-dialog")) $("team-item-dialog").close();
  });
  teamSharedItemsElement.addEventListener("click", function (event) {
    const editButton = event.target.closest("button[data-team-item-edit]");
    const deleteButton = event.target.closest("button[data-team-item-delete]");
    if (editButton) {
      const item = teamSharedItems.find(function (entry) { return entry.id === editButton.dataset.teamItemEdit; });
      if (item) openTeamItemDialog(item);
    } else if (deleteButton) {
      deleteTeamItem(deleteButton.dataset.teamItemDelete);
    }
  });
  $("team-task-create").addEventListener("click", function () { openTeamTaskDialog(null); });
  $("team-task-form").addEventListener("submit", saveTeamTask);
  $("team-task-close").addEventListener("click", function () { $("team-task-dialog").close(); });
  $("team-task-cancel").addEventListener("click", function () { $("team-task-dialog").close(); });
  $("team-task-dialog").addEventListener("click", function (event) {
    if (event.target === $("team-task-dialog")) $("team-task-dialog").close();
  });
  teamSharedTasksElement.addEventListener("change", function (event) {
    const checkbox = event.target.closest("input[data-team-task-complete]");
    if (checkbox) setTeamTaskStatus(checkbox.dataset.teamTaskComplete, checkbox.checked);
  });
  teamSharedTasksElement.addEventListener("click", function (event) {
    const editButton = event.target.closest("button[data-team-task-edit]");
    const deleteButton = event.target.closest("button[data-team-task-delete]");
    if (editButton) {
      const task = teamTasks.find(function (entry) { return entry.id === editButton.dataset.teamTaskEdit; });
      if (task) openTeamTaskDialog(task);
    } else if (deleteButton) {
      deleteTeamTask(deleteButton.dataset.teamTaskDelete);
    }
  });
  $("team-request-create").addEventListener("click", function () { openTeamRequestDialog(null); });
  $("team-request-form").addEventListener("submit", saveTeamRequest);
  $("team-request-close").addEventListener("click", function () { $("team-request-dialog").close(); });
  $("team-request-cancel").addEventListener("click", function () { $("team-request-dialog").close(); });
  $("team-request-dialog").addEventListener("click", function (event) {
    if (event.target === $("team-request-dialog")) $("team-request-dialog").close();
  });
  teamRequestsElement.addEventListener("click", function (event) {
    const editButton = event.target.closest("button[data-team-request-edit]");
    const statusButton = event.target.closest("button[data-team-request-status]");
    const deleteButton = event.target.closest("button[data-team-request-delete]");
    if (editButton) {
      const request = teamRequests.find(function (item) { return item.id === editButton.dataset.teamRequestEdit; });
      if (request) openTeamRequestDialog(request);
    } else if (statusButton) {
      updateTeamRequestStatus(statusButton.dataset.teamRequestStatus, statusButton.dataset.nextStatus);
    } else if (deleteButton) {
      deleteTeamRequest(deleteButton.dataset.teamRequestDelete);
    }
  });
  $("team-session-create").addEventListener("click", openTeamStudySessionDialog);
  $("team-session-form").addEventListener("submit", saveTeamStudySession);
  $("team-session-close").addEventListener("click", function () { $("team-session-dialog").close(); });
  $("team-session-cancel").addEventListener("click", function () { $("team-session-dialog").close(); });
  $("team-session-dialog").addEventListener("click", function (event) {
    if (event.target === $("team-session-dialog")) $("team-session-dialog").close();
  });
  teamStudySessionsElement.addEventListener("click", function (event) {
    const cancelButton = event.target.closest("button[data-team-session-delete]");
    if (cancelButton) deleteTeamStudySession(cancelButton.dataset.teamSessionDelete);
  });
  window.setInterval(function () {
    if (teamDataReady && navigator.onLine) {
      loadTeamHubData().catch(function (error) {
        teamDataReady = false;
        teamDataError = error;
        console.error("Could not refresh team invitations:", error);
      });
    }
  }, 30000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && teamDataReady && navigator.onLine) {
      loadTeamHubData().catch(function (error) {
        teamDataReady = false;
        teamDataError = error;
        console.error("Could not refresh team invitations:", error);
      });
    }
  });
  const menuToggle = $("menu-toggle");
  const app = document.querySelector(".preview-app");
  function setNavigationOpen(isOpen, restoreFocus) {
    app.classList.toggle("nav-open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
    if (isOpen) $("workspace-navigation").querySelector("a.on").focus();
    else if (restoreFocus) window.requestAnimationFrame(function () { menuToggle.focus(); });
  }
  menuToggle.addEventListener("click", function () {
    setNavigationOpen(menuToggle.getAttribute("aria-expanded") !== "true");
  });
  $("menu-backdrop").addEventListener("click", function () {
    setNavigationOpen(false, true);
  });
  document.querySelectorAll(".preview-nav a").forEach(function (link) {
    link.addEventListener("click", function () {
      setNavigationOpen(false, window.matchMedia("(max-width: 760px)").matches);
      window.setTimeout(updateNavigation, 0);
    });
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && app.classList.contains("nav-open")) setNavigationOpen(false, true);
    if (event.key === "Escape" && !moreMenu.hidden) setMoreMenuOpen(false);
  });
  window.addEventListener("hashchange", updateNavigation);
  window.addEventListener("online", function () {
    if (cloudWorkspaceId) {
      cloudReady = true;
      scheduleCloudSync();
    } else {
      initializeCloudSync();
    }
  });
  window.addEventListener("offline", function () {
    if (cloudReady) {
      showWorkspaceError("Cloud sync is paused while offline. Changes are saved in this browser.");
    }
  });

  function updateNavigation() {
    const isTeamView = window.location.hash === "#team";
    if (isTeamView) activeWorkspace = "team";
    else if (activeWorkspace === "team") activeWorkspace = "solo";
    if (activeDocumentId && window.location.hash !== "#work") {
      saveDocumentChanges();
      activeDocumentId = null;
      $("document-editor").hidden = true;
      $("work-list-view").hidden = false;
      $("work-heading-actions").hidden = false;
    }
    if (window.location.hash === "#presentation" && (!activeDeckId || activeWorkspace !== "solo")) {
      history.replaceState(null, "", "#work");
    }
    const isPresentationView = window.location.hash === "#presentation" &&
      Boolean(activeDeckId) && activeWorkspace === "solo";
    currentFilter = window.location.hash === "#starred" ? "starred" : "all";
    if (currentFilter === "starred") currentWorkTypeFilter = "starred";
    else if (currentWorkTypeFilter === "starred") currentWorkTypeFilter = "all";
    const isWorkView = window.location.hash === "#work" || window.location.hash === "#starred";
    const isFilesView = window.location.hash === "#files";
    const isGuidesView = window.location.hash === "#guides";
    $("solo-dashboard").hidden = isTeamView || activeWorkspace === "team" || isPresentationView || isGuidesView;
    $("team-dashboard").hidden = !isTeamView && activeWorkspace !== "team";
    $("presentation-editor").hidden = !isPresentationView;
    $("guides").hidden = !isGuidesView || activeWorkspace !== "solo";
    $("solo-dashboard").classList.toggle("is-work-view", isWorkView);
    $("solo-dashboard").classList.toggle("is-files-view", isFilesView);
    $("files").hidden = !isFilesView || activeWorkspace !== "solo";
    $("notes-heading").textContent = activeDocumentId
      ? "Document editor"
      : currentFilter === "starred" ? "Starred work" : copy[persona].work;
    $("notes-subtitle").textContent = activeDocumentId
      ? "Write, format, and save your document here."
      : currentFilter === "starred" ? "Your saved favorites." : copy[persona].workSubtitle;
    document.querySelectorAll(".preview-nav a").forEach(function (link) {
      const isCurrentPage = link.getAttribute("href") === (isPresentationView ? "#work" : window.location.hash) ||
        (!window.location.hash && link.getAttribute("href") === "#overview");
      link.classList.toggle("on", isCurrentPage);
      if (isCurrentPage) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    renderNotes();
  }

  function updateGreeting() {
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour >= 5 && hour < 12
      ? ["Good morning", "☀"]
      : hour >= 12 && hour < 17
        ? ["Good afternoon", "☼"]
        : ["Good evening", "☾"];
    $("greeting-text").textContent = greeting[0];
    $("greeting-icon").textContent = greeting[1];
    $("preview-date").textContent = now.toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric"
    }).toUpperCase();
  }
  updateGreeting();
  window.setInterval(updateGreeting, 60 * 1000);
  updatePersona(persona);
  renderMeetings();
  renderFiles();
  renderTasks();
  updateNavigation();
  initializeCloudSync();
})();
