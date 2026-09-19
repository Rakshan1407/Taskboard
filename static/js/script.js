const API_BASE = "/api/tasks";

const taskListEl = document.getElementById("task-list");
const emptyStateEl = document.getElementById("empty-state");
const loadingStateEl = document.getElementById("loading-state");
const formEl = document.getElementById("task-form");
const dueDateEl = document.getElementById("due-date");
const formErrorEl = document.getElementById("form-error");
const pageTitleEl = document.getElementById("page-title");
const pageSubtitleEl = document.getElementById("page-subtitle");
const deleteModalEl = document.getElementById("delete-modal");
const confirmDeleteEl = document.getElementById("confirm-delete");
const cancelDeleteEls = deleteModalEl.querySelectorAll("[data-modal-cancel]");
const editModalEl = document.getElementById("edit-modal");
const editFormEl = document.getElementById("edit-form");
const editTitleEl = document.getElementById("edit-title");
const editDescriptionEl = document.getElementById("edit-description");
const editPriorityEl = document.getElementById("edit-priority");
const editDueDateEl = document.getElementById("edit-due-date");
const editStatusEl = document.getElementById("edit-status");
const saveEditEl = document.getElementById("save-edit");
const editFormErrorEl = document.getElementById("edit-form-error");
const editFieldErrorEls = {
  title: document.getElementById("edit-title-error"),
  description: document.getElementById("edit-description-error"),
  priority: document.getElementById("edit-priority-error"),
  dueDate: document.getElementById("edit-due-date-error"),
  status: document.getElementById("edit-status-error"),
};
const filterButtons = document.querySelectorAll(".filter-item");
const countAllEl = document.getElementById("count-all");
const countPendingEl = document.getElementById("count-pending");
const countCompletedEl = document.getElementById("count-completed");
const searchEl = document.getElementById("task-search");
const sortEl = document.getElementById("task-sort");
const userMenuEl = document.getElementById("user-menu");
const userMenuButtonEl = document.getElementById("user-menu-button");
const userMenuDropdownEl = document.getElementById("user-menu-dropdown");
const toastContainerEl = document.createElement("div");
toastContainerEl.className = "toast-container";
toastContainerEl.setAttribute("aria-live", "polite");
toastContainerEl.setAttribute("aria-atomic", "false");
document.body.appendChild(toastContainerEl);

let allTasks = [];
let currentFilter = "all";
let searchQuery = "";
let sortOrder = "newest";
let deleteModalResolve = null;
let deleteModalPreviousFocus = null;
let editingTask = null;
let editModalPreviousFocus = null;

const FILTER_COPY = {
  all: { title: "All tasks", subtitle: "Everything on your plate, in one list." },
  Pending: { title: "Pending", subtitle: "Tasks still waiting to be done." },
  Completed: { title: "Completed", subtitle: "Tasks you've already finished." },
};

init();

function init() {
  currentFilter = getFilterFromPath();
  dueDateEl.min = getLocalDateString();
  formEl.addEventListener("submit", handleAddTask);
  searchEl.addEventListener("input", (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderTasks();
  });
  sortEl.addEventListener("change", (e) => {
    sortOrder = e.target.value;
    renderTasks();
  });
  userMenuButtonEl.addEventListener("click", toggleUserMenu);
  document.addEventListener("click", closeUserMenuOnOutsideClick);
  confirmDeleteEl.addEventListener("click", () => closeDeleteModal(true));
  cancelDeleteEls.forEach((el) => el.addEventListener("click", () => closeDeleteModal(false)));
  editFormEl.addEventListener("submit", handleEditTask);
  document.getElementById("cancel-edit-modal").addEventListener("click", closeEditModal);
  document.getElementById("close-edit-modal").addEventListener("click", closeEditModal);
  document.addEventListener("keydown", handleDeleteModalKeydown);

  filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => setFilter(btn.dataset.filter));
  });
  window.addEventListener("popstate", () => setFilter(getFilterFromPath(), false));

  updateFilterUI();
  loadTasks();
}

function toggleUserMenu() {
  const isOpen = userMenuButtonEl.getAttribute("aria-expanded") === "true";
  userMenuButtonEl.setAttribute("aria-expanded", String(!isOpen));
  userMenuDropdownEl.hidden = isOpen;
}

function closeUserMenuOnOutsideClick(e) {
  if (!userMenuEl.contains(e.target)) {
    userMenuButtonEl.setAttribute("aria-expanded", "false");
    userMenuDropdownEl.hidden = true;
  }
}

async function loadTasks() {
  showLoading(true);
  try {
    const res = await fetch(API_BASE);
    if (!res.ok) throw new Error("Failed to load tasks");
    allTasks = await res.json();
    renderTasks();
  } catch (err) {
    showFormError("Could not reach the server. Is the Flask app running?");
  } finally {
    showLoading(false);
  }
}

function setFilter(filter) {
  currentFilter = filter;
  if (arguments.length < 2 || arguments[1]) {
    window.history.pushState({}, "", getPathForFilter(filter));
  }

  updateFilterUI();
  renderTasks();
}

function updateFilterUI() {
  formEl.hidden = currentFilter === "Completed";
  filterButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.filter === currentFilter);
  });

  const copy = FILTER_COPY[currentFilter];
  pageTitleEl.textContent = copy.title;
  pageSubtitleEl.textContent = copy.subtitle;
}

function getFilterFromPath() {
  const pathFilter = window.location.pathname.slice(1).toLowerCase();
  return pathFilter === "pending" || pathFilter === "completed" ? pathFilter[0].toUpperCase() + pathFilter.slice(1) : "all";
}

function getPathForFilter(filter) {
  return filter === "all" ? "/all" : `/${filter.toLowerCase()}`;
}

function renderTasks() {
  const visible = allTasks
    .filter((task) => currentFilter === "all" || task.status === currentFilter)
    .filter((task) => {
      if (!searchQuery) return true;
      return `${task.title} ${task.description || ""}`.toLowerCase().includes(searchQuery);
    })
    .slice()
    .sort(compareTasks);

  updateCounts();

  taskListEl.innerHTML = "";

  if (visible.length === 0) {
    emptyStateEl.hidden = false;
    return;
  }
  emptyStateEl.hidden = true;

  visible.forEach((task) => taskListEl.appendChild(buildTaskRow(task)));
}

function compareTasks(a, b) {
  if (sortOrder === "oldest") {
    return new Date(a.created_at) - new Date(b.created_at);
  }
  if (sortOrder === "priority") {
    const priorityRank = { High: 0, Medium: 1, Low: 2 };
    return priorityRank[a.priority] - priorityRank[b.priority];
  }
  if (sortOrder === "due-date") {
    if (!a.due_date && !b.due_date) return new Date(b.created_at) - new Date(a.created_at);
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  }
  return new Date(b.created_at) - new Date(a.created_at);
}

function buildTaskRow(task) {
  const li = document.createElement("li");
  li.className = "task-row" + (task.status === "Completed" ? " is-completed" : "");
  if (isOverdue(task)) li.classList.add("is-overdue");
  li.dataset.priority = task.priority;
  li.dataset.id = task.id;

  li.innerHTML = `
    <button class="status-toggle" title="Mark ${task.status === "Completed" ? "pending" : "completed"}" aria-label="Toggle status">
      <svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.2 12L13 4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div class="task-main">
      <p class="task-title"></p>
      <p class="task-desc"></p>
    </div>
    <span class="task-created-by"></span>
    <div class="task-priority">
      <span class="priority-tag" data-priority="${task.priority}">
        <span class="priority-dot"></span>${task.priority}
      </span>
    </div>
    <span class="task-due-date">
      ${formatDueDate(task.due_date)}${isOverdue(task) ? '<span class="overdue-label">Overdue</span>' : ""}
    </span>
    <span class="task-date"></span>
    <div class="task-actions">
      <button class="btn-edit" title="Edit task" aria-label="Edit task">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="m4 16.5-.7 3.7 3.7-.7L18.5 8a2.1 2.1 0 0 0-3-3L4 16.5Z" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="m14 6 4 4" stroke-linecap="round"/>
        </svg>
      </button>
      <button class="btn-delete" title="Delete task" aria-label="Delete task">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  `;

  li.querySelector(".task-title").textContent = task.title;
  li.querySelector(".task-created-by").textContent = task.created_by || "Unknown user";

  const descEl = li.querySelector(".task-desc");
  if (task.description) {
    descEl.textContent = task.description;
  } else {
    descEl.remove();
  }

  li.querySelector(".task-date").textContent = formatDate(task.created_at);

  li.querySelector(".status-toggle").addEventListener("click", () => toggleStatus(task));
  li.querySelector(".btn-edit").addEventListener("click", () => openEditModal(task));
  li.querySelector(".btn-delete").addEventListener("click", () => deleteTask(task.id));

  return li;
}

function openEditModal(task) {
  editingTask = task;
  editModalPreviousFocus = document.activeElement;
  editTitleEl.value = task.title || "";
  editDescriptionEl.value = task.description || "";
  editPriorityEl.value = task.priority || "Medium";
  editDueDateEl.value = task.due_date || "";
  editStatusEl.value = task.status || "Pending";
  editDueDateEl.min = getLocalDateString();
  clearEditValidation();
  editModalEl.hidden = false;
  document.body.classList.add("modal-open");
  editTitleEl.focus();
}

function closeEditModal() {
  if (editModalEl.hidden) return;
  editModalEl.hidden = true;
  document.body.classList.remove("modal-open");
  editingTask = null;
  clearEditValidation();
  if (editModalPreviousFocus instanceof HTMLElement) editModalPreviousFocus.focus();
  editModalPreviousFocus = null;
}

function clearEditValidation() {
  Object.values(editFieldErrorEls).forEach((el) => {
    el.hidden = true;
    el.textContent = "";
  });
  editFormErrorEl.hidden = true;
  editFormErrorEl.textContent = "";
}

function setEditFieldError(field, message) {
  const errorEl = editFieldErrorEls[field];
  errorEl.textContent = message;
  errorEl.hidden = false;
}

async function handleEditTask(e) {
  e.preventDefault();
  clearEditValidation();

  const title = editTitleEl.value.trim();
  const description = editDescriptionEl.value.trim();
  const priority = editPriorityEl.value;
  const dueDate = editDueDateEl.value;
  const status = editStatusEl.value;
  let firstInvalidEl = null;

  if (!title) {
    setEditFieldError("title", "Task title is required.");
    firstInvalidEl = editTitleEl;
  }
  if (dueDate && dueDate < editDueDateEl.min) {
    setEditFieldError("dueDate", "Due date cannot be in the past.");
    firstInvalidEl ||= editDueDateEl;
  }
  if (!["Low", "Medium", "High"].includes(priority)) {
    setEditFieldError("priority", "Priority must be High, Medium, or Low.");
    firstInvalidEl ||= editPriorityEl;
  }
  if (!["Pending", "Completed"].includes(status)) {
    setEditFieldError("status", "Choose a valid status.");
    firstInvalidEl ||= editStatusEl;
  }
  if (firstInvalidEl) {
    firstInvalidEl.focus();
    return;
  }

  saveEditEl.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/${editingTask.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, priority, due_date: dueDate || null, status }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not update task");

    const idx = allTasks.findIndex((task) => task.id === editingTask.id);
    if (idx !== -1) allTasks[idx] = data;
    closeEditModal();
    renderTasks();
    await loadTasks();
    showToast("Task updated successfully ✓", "success", "✓");
  } catch (err) {
    editFormErrorEl.textContent = err.message || "Could not update task.";
    editFormErrorEl.hidden = false;
    showToast(err.message || "Could not update task.", "error", "!");
  } finally {
    saveEditEl.disabled = false;
  }
}

async function handleAddTask(e) {
  e.preventDefault();
  hideFormError();

  const title = document.getElementById("title").value.trim();
  const description = document.getElementById("description").value.trim();
  const priority = document.getElementById("priority").value;
  const dueDate = dueDateEl.value;

  if (!title) {
    showFormError("Give the task a name before adding it.");
    return;
  }

  if (dueDate && dueDate < dueDateEl.min) {
    showFormError("Due date cannot be in the past.");
    return;
  }

  const duplicateExists = allTasks.some(
    (task) =>
      task.title.trim().toLowerCase() === title.toLowerCase() &&
      task.priority === priority
  );
  if (duplicateExists) {
    showToast("Duplicate title detected. Task created successfully.", "warning", "!");
  }

  const submitBtn = formEl.querySelector(".btn-add");
  submitBtn.disabled = true;

  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, priority, due_date: dueDate || null }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not add task");

    allTasks.unshift(data);
    formEl.reset();
    document.getElementById("priority").value = "Medium";
    dueDateEl.value = "";
    renderTasks();
  } catch (err) {
    showFormError(err.message);
  } finally {
    submitBtn.disabled = false;
  }
}

async function toggleStatus(task) {
  const newStatus = task.status === "Completed" ? "Pending" : "Completed";

  try {
    const res = await fetch(`${API_BASE}/${task.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not update task");

    const idx = allTasks.findIndex((t) => t.id === task.id);
    allTasks[idx] = data;
    renderTasks();
    showToast(
      newStatus === "Completed" ? "Task marked as Completed" : "Task marked as Pending",
      newStatus === "Completed" ? "success" : "pending",
      newStatus === "Completed" ? "✓" : "↻"
    );
  } catch (err) {
    showToast(err.message || "Could not update task.", "error", "!");
  }
}

async function deleteTask(id) {
  if (!(await requestDeleteConfirmation())) return;

  try {
    const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not delete task");

    allTasks = allTasks.filter((t) => t.id !== id);
    renderTasks();
    showToast("Task deleted successfully.", "delete-success", "✓");
  } catch (err) {
    showToast(err.message || "Could not delete task.", "error", "!");
  }
}

function requestDeleteConfirmation() {
  if (deleteModalResolve) return Promise.resolve(false);

  deleteModalPreviousFocus = document.activeElement;
  deleteModalEl.hidden = false;
  document.body.classList.add("modal-open");
  cancelDeleteEls[0].focus();

  return new Promise((resolve) => {
    deleteModalResolve = resolve;
  });
}

function closeDeleteModal(confirmed) {
  if (!deleteModalResolve) return;

  const resolve = deleteModalResolve;
  deleteModalResolve = null;
  deleteModalEl.hidden = true;
  document.body.classList.remove("modal-open");
  resolve(confirmed);

  if (deleteModalPreviousFocus instanceof HTMLElement) {
    deleteModalPreviousFocus.focus();
  }
  deleteModalPreviousFocus = null;
}

function handleDeleteModalKeydown(e) {
  if (deleteModalEl.hidden) return;

  if (e.key === "Escape") {
    e.preventDefault();
    closeDeleteModal(false);
  }
}

function updateCounts() {
  const pending = allTasks.filter((t) => t.status === "Pending").length;
  const completed = allTasks.filter((t) => t.status === "Completed").length;

  countAllEl.textContent = allTasks.length;
  countPendingEl.textContent = pending;
  countCompletedEl.textContent = completed;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDueDate(iso) {
  if (!iso) return "No due date";
  const dueDate = new Date(`${iso}T00:00:00`);
  return `Due ${dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function getLocalDateString() {
  const today = new Date();
  return [today.getFullYear(), today.getMonth() + 1, today.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
}

function isOverdue(task) {
  if (task.status !== "Pending" || !task.due_date) return false;
  const today = new Date();
  const todayIso = [today.getFullYear(), today.getMonth() + 1, today.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
  return task.due_date < todayIso;
}

function showFormError(message) {
  formErrorEl.textContent = message;
  formErrorEl.hidden = false;
}

function hideFormError() {
  formErrorEl.hidden = true;
  formErrorEl.textContent = "";
}

function showLoading(isLoading) {
  loadingStateEl.hidden = !isLoading;
}

function showToast(message, type, icon) {
  const toastEl = document.createElement("div");
  toastEl.className = `toast toast-${type}`;
  toastEl.setAttribute("role", type === "error" ? "alert" : "status");
  toastEl.innerHTML = `
    <span class="toast-icon" aria-hidden="true">${icon}</span>
    <span class="toast-message"></span>
  `;
  toastEl.querySelector(".toast-message").textContent = message;
  toastContainerEl.appendChild(toastEl);

  window.setTimeout(() => {
    toastEl.classList.add("is-hiding");
    toastEl.addEventListener("animationend", () => toastEl.remove(), { once: true });
  }, 3000);
}
