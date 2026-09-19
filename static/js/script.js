/**
 * Taskboard frontend
 * Talks to the Flask REST API (/api/tasks) and renders the task list.
 * No frameworks — plain fetch + DOM updates.
 */

const API_BASE = "/api/tasks";

const taskListEl = document.getElementById("task-list");
const emptyStateEl = document.getElementById("empty-state");
const loadingStateEl = document.getElementById("loading-state");
const formEl = document.getElementById("task-form");
const formErrorEl = document.getElementById("form-error");
const pageTitleEl = document.getElementById("page-title");
const pageSubtitleEl = document.getElementById("page-subtitle");

const filterButtons = document.querySelectorAll(".filter-item");
const countAllEl = document.getElementById("count-all");
const countPendingEl = document.getElementById("count-pending");
const countCompletedEl = document.getElementById("count-completed");

let allTasks = [];
let currentFilter = "all";

const FILTER_COPY = {
  all: { title: "All tasks", subtitle: "Everything on your plate, in one list." },
  Pending: { title: "Pending", subtitle: "Tasks still waiting to be done." },
  Completed: { title: "Completed", subtitle: "Tasks you've already finished." },
};

init();

function init() {
  formEl.addEventListener("submit", handleAddTask);

  filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => setFilter(btn.dataset.filter));
  });

  loadTasks();
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

  filterButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.filter === filter);
  });

  const copy = FILTER_COPY[filter];
  pageTitleEl.textContent = copy.title;
  pageSubtitleEl.textContent = copy.subtitle;

  renderTasks();
}

function renderTasks() {
  const visible = allTasks.filter((t) =>
    currentFilter === "all" ? true : t.status === currentFilter
  );

  updateCounts();

  taskListEl.innerHTML = "";

  if (visible.length === 0) {
    emptyStateEl.hidden = false;
    return;
  }
  emptyStateEl.hidden = true;

  visible
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .forEach((task) => taskListEl.appendChild(buildTaskRow(task)));
}

function buildTaskRow(task) {
  const li = document.createElement("li");
  li.className = "task-row" + (task.status === "Completed" ? " is-completed" : "");
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
    <div class="task-priority">
      <span class="priority-tag" data-priority="${task.priority}">
        <span class="priority-dot"></span>${task.priority}
      </span>
    </div>
    <span class="task-date"></span>
    <div class="task-actions">
      <button class="btn-delete" title="Delete task" aria-label="Delete task">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  `;

  li.querySelector(".task-title").textContent = task.title;

  const descEl = li.querySelector(".task-desc");
  if (task.description) {
    descEl.textContent = task.description;
  } else {
    descEl.remove();
  }

  li.querySelector(".task-date").textContent = formatDate(task.created_at);

  li.querySelector(".status-toggle").addEventListener("click", () => toggleStatus(task));
  li.querySelector(".btn-delete").addEventListener("click", () => deleteTask(task.id));

  return li;
}

async function handleAddTask(e) {
  e.preventDefault();
  hideFormError();

  const title = document.getElementById("title").value.trim();
  const description = document.getElementById("description").value.trim();
  const priority = document.getElementById("priority").value;

  if (!title) {
    showFormError("Give the task a name before adding it.");
    return;
  }

  const submitBtn = formEl.querySelector(".btn-add");
  submitBtn.disabled = true;

  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, priority }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not add task");

    allTasks.unshift(data);
    formEl.reset();
    document.getElementById("priority").value = "Medium";
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
  } catch (err) {
    showFormError(err.message);
  }
}

async function deleteTask(id) {
  try {
    const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not delete task");

    allTasks = allTasks.filter((t) => t.id !== id);
    renderTasks();
  } catch (err) {
    showFormError(err.message);
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
