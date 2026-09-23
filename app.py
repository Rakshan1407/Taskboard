from datetime import date
from threading import Lock

from flask import Flask, jsonify, request, render_template, session
from flask_cors import CORS
from flasgger import Swagger
import mysql.connector
from config import DB_CONFIG, SECRET_KEY
from auth import auth_bp, login_required

app = Flask(__name__)
app.secret_key = SECRET_KEY
CORS(app, supports_credentials=True)
app.register_blueprint(auth_bp)
swagger = Swagger(app)

@app.after_request
def hide_swagger_operation_ids(response):
    if request.path == "/apidocs/" and response.content_type.startswith("text/html"):
        html = response.get_data(as_text=True)

        css = """
        <style>
        .opblock-summary-operation-id {
            display: none !important;
        }
        </style>
        """

        html = html.replace("</head>", css + "</head>")
        response.set_data(html)

    return response

VALID_PRIORITIES = {"Low", "Medium", "High"}
VALID_STATUSES = {"Pending", "Completed"}
_due_date_schema_ready = False
_due_date_schema_lock = Lock()
_task_ownership_schema_ready = False


def parse_due_date(value):
    """Validate an optional ISO date and return a MySQL-compatible date."""
    if value in (None, ""):
        return None
    if not isinstance(value, str):
        raise ValueError("Due date must be a valid date")
    try:
      parsed_date = date.fromisoformat(value)
    except ValueError as err:
        raise ValueError("Due date must be a valid date") from err
    if parsed_date < date.today():
      raise ValueError("Due date cannot be in the past")
    return parsed_date


def get_db_connection():
    """Open a new connection to the MySQL database."""
    global _due_date_schema_ready, _task_ownership_schema_ready

    conn = mysql.connector.connect(**DB_CONFIG)
    if _due_date_schema_ready and _task_ownership_schema_ready:
        return conn

    with _due_date_schema_lock:
        if not _due_date_schema_ready:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' "
                "AND COLUMN_NAME = 'due_date'"
            )
            has_due_date = cursor.fetchone()[0]
            if not has_due_date:
                cursor.execute("ALTER TABLE tasks ADD COLUMN due_date DATE NULL AFTER status")
                conn.commit()
            cursor.close()
            _due_date_schema_ready = True
        if not _task_ownership_schema_ready:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
                "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' "
                "AND COLUMN_NAME = 'created_by'"
            )
            has_created_by = cursor.fetchone()[0]
            if not has_created_by:
                cursor.execute("ALTER TABLE tasks ADD COLUMN created_by INT NULL AFTER due_date")
                conn.commit()
            cursor.close()
            _task_ownership_schema_ready = True

    return conn


def task_to_dict(row):
    """Convert a DB row (dict cursor) into the JSON shape the frontend expects."""
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "priority": row["priority"],
        "status": row["status"],
        "due_date": row.get("due_date").isoformat() if row.get("due_date") else None,
        "created_by": row.get("created_by_username"),
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
    }


@app.route("/")
@app.route("/all")
@app.route("/pending")
@app.route("/completed")
@login_required
def index():
    return render_template("index.html", username=session.get("username"))


@app.route("/api/tasks", methods=["GET"])
@login_required
def get_tasks():
    """
    Get all tasks
    ---
    tags:
      - Tasks
    parameters:
      - in: query
        name: status
        type: string
        required: false
        enum:
          - Pending
          - Completed
        description: Optional status filter.
    responses:
      200:
        description: List of tasks.
      500:
        description: Database error.
    """
    status_filter = request.args.get("status")

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        if status_filter and status_filter in VALID_STATUSES:
            cursor.execute(
              "SELECT tasks.*, users.username AS created_by_username "
              "FROM tasks LEFT JOIN users ON users.id = tasks.created_by "
              "WHERE tasks.created_by = %s AND tasks.status = %s "
              "ORDER BY tasks.created_at DESC",
              (session["user_id"], status_filter),
            )
        else:
            cursor.execute(
              "SELECT tasks.*, users.username AS created_by_username "
              "FROM tasks LEFT JOIN users ON users.id = tasks.created_by "
              "WHERE tasks.created_by = %s ORDER BY tasks.created_at DESC",
              (session["user_id"],),
            )

        tasks = [task_to_dict(row) for row in cursor.fetchall()]
        cursor.close()
        return jsonify(tasks), 200

    except mysql.connector.Error as err:
        return jsonify({"error": str(err)}), 500
    finally:
        if conn and conn.is_connected():
            conn.close()


@app.route("/api/tasks", methods=["POST"])
@login_required
def create_task():
    """
    Create a task
    ---
    tags:
      - Tasks
    parameters:
      - in: body
        name: body
        required: true
        schema:
          type: object
          required:
            - title
          properties:
            title:
              type: string
              description: Task title.
            description:
              type: string
              description: Task description.
            priority:
              type: string
              enum: [Low, Medium, High]
              description: Task priority.
            due_date:
              type: string
              format: date
              description: Optional due date in YYYY-MM-DD format.
    responses:
      201:
        description: Task created successfully.
      400:
        description: Validation error.
      500:
        description: Database error.
    """
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Request body must be a JSON object"}), 400

    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    priority = data.get("priority", "Medium")
    try:
        due_date = parse_due_date(data.get("due_date"))
    except ValueError as err:
        return jsonify({"error": str(err)}), 400

    if not title:
        return jsonify({"error": "Task title is required"}), 400

    if priority not in VALID_PRIORITIES:
        return jsonify({"error": f"Priority must be one of {sorted(VALID_PRIORITIES)}"}), 400

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "INSERT INTO tasks (title, description, priority, status, due_date, created_by) "
            "VALUES (%s, %s, %s, 'Pending', %s, %s)",
            (title, description, priority, due_date, session["user_id"]),
        )
        conn.commit()
        new_id = cursor.lastrowid

        cursor.execute(
          "SELECT tasks.*, users.username AS created_by_username "
          "FROM tasks LEFT JOIN users ON users.id = tasks.created_by "
          "WHERE tasks.id = %s AND tasks.created_by = %s",
          (new_id, session["user_id"]),
        )
        new_task = cursor.fetchone()
        cursor.close()

        return jsonify(task_to_dict(new_task)), 201

    except mysql.connector.Error as err:
        return jsonify({"error": str(err)}), 500
    finally:
        if conn and conn.is_connected():
            conn.close()


@app.route("/api/tasks/<int:task_id>", methods=["PUT"])
@login_required
def update_task(task_id):
    """
    Update a task
    ---
    tags:
      - Tasks
    parameters:
      - in: path
        name: task_id
        type: integer
        required: true
        description: ID of the task to update.
      - in: body
        name: body
        required: true
        schema:
          type: object
          properties:
            title:
              type: string
            description:
              type: string
            priority:
              type: string
              enum: [Low, Medium, High]
            due_date:
              type: string
              format: date
            status:
              type: string
              enum: [Pending, Completed]
    responses:
      200:
        description: Task updated successfully.
      400:
        description: Validation error.
      404:
        description: Task not found.
      500:
        description: Database error.
    """
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
      return jsonify({"error": "Request body must be a JSON object"}), 400

    fields = []
    values = []

    if "title" in data:
        if not isinstance(data.get("title"), str):
            return jsonify({"error": "Task title must be a string"}), 400
        title = data["title"].strip()
        if not title:
            return jsonify({"error": "Task title cannot be empty"}), 400
        fields.append("title = %s")
        values.append(title)

    if "description" in data:
        description = data.get("description")
        if description is not None and not isinstance(description, str):
            return jsonify({"error": "Description must be a string"}), 400
        fields.append("description = %s")
        values.append((description or "").strip())

    if "priority" in data:
        if not isinstance(data["priority"], str) or data["priority"] not in VALID_PRIORITIES:
            return jsonify({"error": f"Priority must be one of {sorted(VALID_PRIORITIES)}"}), 400
        fields.append("priority = %s")
        values.append(data["priority"])

    if "due_date" in data:
        try:
            due_date = parse_due_date(data.get("due_date"))
        except ValueError as err:
            return jsonify({"error": str(err)}), 400
        fields.append("due_date = %s")
        values.append(due_date)

    if "status" in data:
        if not isinstance(data["status"], str) or data["status"] not in VALID_STATUSES:
            return jsonify({"error": f"Status must be one of {sorted(VALID_STATUSES)}"}), 400
        fields.append("status = %s")
        values.append(data["status"])

    if not fields:
        return jsonify({"error": "No valid fields provided to update"}), 400

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute(
          "SELECT id FROM tasks WHERE id = %s AND created_by = %s",
          (task_id, session["user_id"]),
        )
        if cursor.fetchone() is None:
            cursor.close()
            return jsonify({"error": "Task not found"}), 404

        values.append(task_id)
        cursor.execute(f"UPDATE tasks SET {', '.join(fields)} WHERE id = %s", values)
        conn.commit()

        cursor.execute(
          "SELECT tasks.*, users.username AS created_by_username "
          "FROM tasks LEFT JOIN users ON users.id = tasks.created_by "
          "WHERE tasks.id = %s AND tasks.created_by = %s",
          (task_id, session["user_id"]),
        )
        updated_task = cursor.fetchone()
        cursor.close()

        return jsonify(task_to_dict(updated_task)), 200

    except mysql.connector.Error as err:
        return jsonify({"error": str(err)}), 500
    finally:
        if conn and conn.is_connected():
            conn.close()


@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
@login_required
def delete_task(task_id):
    """
    Delete a task
    ---
    tags:
      - Tasks
    parameters:
      - in: path
        name: task_id
        type: integer
        required: true
        description: ID of the task to delete.
    responses:
      200:
        description: Task deleted successfully.
      404:
        description: Task not found.
      500:
        description: Database error.
    """
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute(
          "SELECT id FROM tasks WHERE id = %s AND created_by = %s",
          (task_id, session["user_id"]),
        )
        if cursor.fetchone() is None:
            cursor.close()
            return jsonify({"error": "Task not found"}), 404

        cursor.execute(
          "DELETE FROM tasks WHERE id = %s AND created_by = %s",
          (task_id, session["user_id"]),
        )
        conn.commit()
        cursor.close()

        return jsonify({"message": "Task deleted", "id": task_id}), 200

    except mysql.connector.Error as err:
        return jsonify({"error": str(err)}), 500
    finally:
        if conn and conn.is_connected():
            conn.close()


if __name__ == "__main__":
    app.run(debug=True, port=5000)
