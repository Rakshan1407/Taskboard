# Taskboard — Task Management Application

A simple full-stack to-do app built with **Flask**, **MySQL**, and vanilla **HTML/JavaScript**.
It lets you add tasks with a priority, mark them pending/completed, filter the list, and delete
tasks — all backed by a REST API.

## Features

- Add a task with a title, description, and priority (Low / Medium / High)
- View all tasks in a single list
- Mark a task as Pending or Completed
- Delete a task
- Filter tasks by All / Pending / Completed
- REST API built with Flask, data persisted in MySQL

## Tech stack

| Layer      | Technology              |
|------------|--------------------------|
| Frontend   | HTML, CSS, JavaScript (no frameworks) |
| Backend    | Python, Flask            |
| Database   | MySQL                    |

## Project structure

```
todo-app/
├── app.py                 # Flask app & REST API routes
├── config.py               # DB configuration (reads from env vars)
├── schema.sql               # MySQL table definition + sample data
├── requirements.txt
├── templates/
│   └── index.html          # Single-page frontend
├── static/
│   ├── css/style.css
│   └── js/script.js         # Fetch calls to the API + DOM rendering
├── .gitignore
└── README.md
```

## Prerequisites

- Python 3.9+
- MySQL Server 5.7+ (or MySQL 8) running locally or reachable over the network
- pip

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/todo-app.git
cd todo-app
```

### 2. Create a virtual environment and install dependencies

```bash
python3 -m venv venv
source venv/bin/activate        # on Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Create the database

Log in to MySQL and run the schema file:

```bash
mysql -u root -p < schema.sql
```

This creates a `todo_db` database with a `tasks` table (and two sample rows so the UI isn't
empty on first launch).

### 4. Configure database credentials

The app reads its DB connection settings from environment variables (see `config.py`). Set
the ones that differ from the defaults, e.g.:

```bash
export DB_HOST=localhost
export DB_USER=root
export DB_PASSWORD=your_mysql_password
export DB_NAME=todo_db
```

On Windows (PowerShell):

```powershell
$env:DB_HOST="localhost"
$env:DB_USER="root"
$env:DB_PASSWORD="your_mysql_password"
$env:DB_NAME="todo_db"
```

If no environment variables are set, the app defaults to `localhost` / `root` / no password /
`todo_db`, which works for a typical local MySQL install with no root password set.

### 5. Run the app

```bash
python app.py
```

The app starts on **http://localhost:5000**. Open it in a browser to use the UI.

## API reference

| Method | Endpoint            | Description                                  | Body (JSON)                                      |
|--------|----------------------|-----------------------------------------------|---------------------------------------------------|
| GET    | `/api/tasks`         | List all tasks. Optional `?status=Pending\|Completed` query param to filter. | – |
| POST   | `/api/tasks`         | Create a new task.                            | `{ "title": "...", "description": "...", "priority": "Low\|Medium\|High" }` |
| PUT    | `/api/tasks/<id>`    | Update a task (any subset of fields).         | `{ "title"?, "description"?, "priority"?, "status"? }` |
| DELETE | `/api/tasks/<id>`    | Delete a task.                                | – |

All endpoints return JSON. Validation errors return `400`, a missing task returns `404`.

### Example requests

```bash
# Create a task
curl -X POST http://localhost:5000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Buy groceries", "description": "Milk, eggs, bread", "priority": "Low"}'

# Mark a task completed
curl -X PUT http://localhost:5000/api/tasks/1 \
  -H "Content-Type: application/json" \
  -d '{"status": "Completed"}'

# Delete a task
curl -X DELETE http://localhost:5000/api/tasks/1
```

## Notes on design decisions

- **Validation** happens both client-side (required task name) and server-side (title
  required, priority/status must be one of the allowed values) since the API could be called
  directly.
- **Partial updates**: `PUT /api/tasks/<id>` only updates the fields you send, so the frontend
  can send just `{ "status": "Completed" }` when toggling a checkbox without resending the
  whole task.
- **Credentials** are never hard-coded — `config.py` reads them from environment variables so
  real passwords stay out of version control.

## Possible next steps

- Add authentication so tasks are scoped per user
- Add due dates and sorting/search
- Add pagination for large task lists
- Write automated tests for the API routes
