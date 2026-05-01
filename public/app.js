const messageEl = document.getElementById("message");
const authSection = document.getElementById("auth-section");
const appSection = document.getElementById("app-section");
const loginFormEl = document.getElementById("login-form");
const signupFormEl = document.getElementById("signup-form");
const authToggleBtnEl = document.getElementById("auth-toggle-btn");
const signupRoleEl = document.getElementById("signup-role");
const signupAdminIdEl = document.getElementById("signup-admin-id");
const userInfoEl = document.getElementById("user-info");
const projectsListEl = document.getElementById("projects-list");
const taskProjectEl = document.getElementById("task-project");
const dashboardStatsEl = document.getElementById("dashboard-stats");
const dashboardTasksEl = document.getElementById("dashboard-tasks");
const taskFormEl = document.getElementById("task-form");
const projectFormEl = document.getElementById("project-form");
const copyIdBtnEl = document.getElementById("copy-id-btn");
const refreshDashboardBtnEl = document.getElementById("refresh-dashboard");

function bindEvent(el, eventName, handler) {
  if (!el) return;
  el.addEventListener(eventName, handler);
}

const state = {
  token: sessionStorage.getItem("token") || "",
  user: null,
  projects: [],
  authMode: "login",
};

function showMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.style.color = isError ? "#b91c1c" : "#047857";
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      state.token = "";
      sessionStorage.removeItem("token");
      toggleSections(false);
      setAuthMode("login");
    }
    const firstIssue = Array.isArray(data.errors) && data.errors.length > 0 ? data.errors[0] : null;
    const issueText = firstIssue
      ? `${firstIssue.path?.join(".") || "field"}: ${firstIssue.message}`
      : null;
    throw new Error(issueText || data.message || "Request failed");
  }
  return data;
}

function toggleSections(loggedIn) {
  authSection.classList.toggle("hidden", loggedIn);
  appSection.classList.toggle("hidden", !loggedIn);
  document.body.classList.toggle("auth-page", !loggedIn);
  document.body.classList.toggle("dashboard-page", loggedIn);
}

function setAuthMode(mode) {
  state.authMode = mode;
  const showLogin = mode === "login";
  loginFormEl.classList.toggle("hidden", !showLogin);
  signupFormEl.classList.toggle("hidden", showLogin);
  authToggleBtnEl.textContent = showLogin
    ? "Need an account? Go to Signup"
    : "Already have an account? Go to Login";
}

function syncSignupFields() {
  const isMember = signupRoleEl.value === "MEMBER";
  signupAdminIdEl.classList.toggle("hidden", !isMember);
  signupAdminIdEl.required = isMember;
  if (!isMember) signupAdminIdEl.value = "";
}

function renderProjects() {
  projectsListEl.innerHTML = "";
  taskProjectEl.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = state.projects.length
    ? "Select a project"
    : "No projects yet. Create a project first";
  placeholder.disabled = true;
  placeholder.selected = true;
  taskProjectEl.appendChild(placeholder);

  state.projects.forEach((project) => {
    const li = document.createElement("li");
    li.textContent = `${project.name} (${project.membershipRole}) - ${project._count.tasks} tasks`;
    projectsListEl.appendChild(li);

    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    taskProjectEl.appendChild(option);
  });

  if (state.projects.length > 0) {
    taskProjectEl.value = state.projects[0].id;
  }

  const canCreateTask = state.projects.length > 0;
  taskProjectEl.required = canCreateTask;
  [...taskFormEl.querySelectorAll("input, textarea, select, button")].forEach((el) => {
    if (el.name !== "projectId") {
      el.disabled = !canCreateTask;
    }
  });
}

function renderDashboard(stats, tasks) {
  dashboardStatsEl.textContent = JSON.stringify(stats, null, 2);
  dashboardTasksEl.innerHTML = "";
  tasks.forEach((task) => {
    const li = document.createElement("li");
    const dueText = task.dueDate ? new Date(task.dueDate).toLocaleString() : "No due date";
    const details = document.createElement("span");
    details.textContent = `[${task.status}] ${task.title} | ${task.project.name} | Due: ${dueText} `;
    li.appendChild(details);

    const statusBtn = document.createElement("button");
    statusBtn.type = "button";
    statusBtn.dataset.taskId = task.id;
    statusBtn.dataset.nextStatus = task.status === "DONE" ? "TODO" : "DONE";
    statusBtn.textContent = task.status === "DONE" ? "Reopen" : "Mark Complete";
    li.appendChild(statusBtn);

    dashboardTasksEl.appendChild(li);
  });
}

async function loadAppData() {
  const me = await api("/api/auth/me");
  state.user = me.user;
  const identity = state.user.role === "ADMIN" ? state.user.adminId : state.user.memberId;
  const adminOwner =
    state.user.role === "MEMBER" && state.user.adminUser
      ? ` | Admin: ${state.user.adminUser.name} (${state.user.adminUser.adminId})`
      : "";
  userInfoEl.textContent = `${state.user.name} (${state.user.role}) - ID: ${identity}${adminOwner}`;
  projectFormEl.classList.toggle("hidden", state.user.role === "MEMBER");

  const projectsData = await api("/api/projects");
  state.projects = projectsData.projects;
  renderProjects();

  const dashboard = await api("/api/dashboard");
  renderDashboard(dashboard.stats, dashboard.tasks);
}

bindEvent(signupFormEl, "submit", async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const body = Object.fromEntries(formData.entries());
  try {
    const data = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(body),
    });
    state.token = data.token;
    sessionStorage.setItem("token", state.token);
    toggleSections(true);
    await loadAppData();
    const createdId = data.user.adminId || data.user.memberId;
    showMessage(`Signup successful. Your ID: ${createdId}`);
  } catch (error) {
    showMessage(error.message, true);
  }
});

bindEvent(loginFormEl, "submit", async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const body = Object.fromEntries(formData.entries());
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    });
    state.token = data.token;
    sessionStorage.setItem("token", state.token);
    toggleSections(true);
    await loadAppData();
    showMessage("Login successful");
  } catch (error) {
    showMessage(error.message, true);
  }
});

bindEvent(projectFormEl, "submit", async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const body = Object.fromEntries(formData.entries());
  if (!body.description) delete body.description;

  try {
    await api("/api/projects", {
      method: "POST",
      body: JSON.stringify(body),
    });
    await loadAppData();
    e.target.reset();
    showMessage("Project created");
  } catch (error) {
    showMessage(error.message, true);
  }
});

bindEvent(taskFormEl, "submit", async (e) => {
  e.preventDefault();
  if (!state.projects.length) {
    showMessage("Create a project first, then add tasks.", true);
    return;
  }
  const formData = new FormData(e.target);
  const body = Object.fromEntries(formData.entries());
  const projectId = body.projectId;
  delete body.projectId;

  if (!body.description) delete body.description;
  if (!body.dueDate) delete body.dueDate;
  if (body.dueDate) body.dueDate = new Date(body.dueDate).toISOString();

  try {
    await api(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    await loadAppData();
    e.target.reset();
    showMessage("Task created");
  } catch (error) {
    showMessage(error.message, true);
  }
});

bindEvent(refreshDashboardBtnEl, "click", async () => {
  try {
    await loadAppData();
    showMessage("Dashboard refreshed");
  } catch (error) {
    showMessage(error.message, true);
  }
});

bindEvent(copyIdBtnEl, "click", async () => {
  const identity = state.user?.role === "ADMIN" ? state.user?.adminId : state.user?.memberId;
  if (!identity) {
    showMessage("User ID not available.", true);
    return;
  }

  try {
    await navigator.clipboard.writeText(identity);
    showMessage(`Copied ID: ${identity}`);
  } catch (error) {
    const tempInput = document.createElement("input");
    tempInput.value = identity;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand("copy");
    document.body.removeChild(tempInput);
    showMessage(`Copied ID: ${identity}`);
  }
});

bindEvent(authToggleBtnEl, "click", () => {
  const nextMode = state.authMode === "login" ? "signup" : "login";
  setAuthMode(nextMode);
});

bindEvent(signupRoleEl, "change", syncSignupFields);
bindEvent(dashboardTasksEl, "click", async (e) => {
  const button = e.target.closest("button[data-task-id]");
  if (!button) return;

  const { taskId, nextStatus } = button.dataset;
  if (!taskId || !nextStatus) return;

  button.disabled = true;
  try {
    await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: nextStatus }),
    });
    await loadAppData();
    showMessage(`Task updated to ${nextStatus}`);
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
});

async function boot() {
  syncSignupFields();
  setAuthMode("login");
  toggleSections(false);
  if (!state.token) {
    return;
  }
  try {
    await loadAppData();
    toggleSections(true);
  } catch (error) {
    state.token = "";
    sessionStorage.removeItem("token");
    toggleSections(false);
  }
}

boot();
