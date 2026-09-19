"""
Task Management Application - Flask backend.

Exposes a small REST API backed by MySQL:

    GET    /api/tasks       -> list tasks (optionally filtered by status)
    POST   /api/tasks       -> create a task
    PUT    /api/tasks/<id>  -> update a task's fields / status
    DELETE /api/tasks/<id>  -> delete a task

The root route serves the single-page frontend from templates/index.html.
"""

from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
import mysql.connector

from config import DB_CONFIG

app = Flask(__name__)
CORS(app)

VALID_PRIORITIES = {"Low", "Medium", "High"}
VALID_STATUSES = {"Pending", "Completed"}


def get_db_connection():
    """Open a new connection to the MySQL database."""
    return mysql.connector.connect(**DB_CONFIG)


def task_to_dict(row):
    """Convert a DB row (dict cursor) into the JSON shape the frontend expects."""
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "priority": row["priority"],
        "status": row["status"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
    }


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    """Return all tasks, optionally filtered by ?status=Pending|Completed."""
    status_filter = request.args.get("status")

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        if status_filter and status_filter in VALID_STATUSES:
            cursor.execute(
                "SELECT * FROM tasks WHERE status = %s ORDER BY created_at DESC",
                (status_filter,),
            )
        else:
            cursor.execute("SELECT * FROM tasks ORDER BY created_at DESC")

        tasks = [task_to_dict(row) for row in cursor.fetchall()]
        cursor.close()
        return jsonify(tasks), 200

    except mysql.connector.Error as err:
        return jsonify({"error": str(err)}), 500
    finally:
        if conn and conn.is_connected():
            conn.close()


@app.route("/api/tasks", methods=["POST"])
def create_task():
    """Create a new task from JSON: { title, description, priority }."""
    data = request.get_json(silent=True) or {}

    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    priority = data.get("priority", "Medium")

    if not title:
        return jsonify({"error": "Task title is required"}), 400

    if priority not in VALID_PRIORITIES:
        return jsonify({"error": f"Priority must be one of {sorted(VALID_PRIORITIES)}"}), 400

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "INSERT INTO tasks (title, description, priority, status) "
            "VALUES (%s, %s, %s, 'Pending')",
            (title, description, priority),
        )
        conn.commit()
        new_id = cursor.lastrowid

        cursor.execute("SELECT * FROM tasks WHERE id = %s", (new_id,))
        new_task = cursor.fetchone()
        cursor.close()

        return jsonify(task_to_dict(new_task)), 201

    except mysql.connector.Error as err:
        return jsonify({"error": str(err)}), 500
    finally:
        if conn and conn.is_connected():
            conn.close()


@app.route("/api/tasks/<int:task_id>", methods=["PUT"])
def update_task(task_id):
    """Update any combination of title, description, priority, status."""
    data = request.get_json(silent=True) or {}

    fields = []
    values = []

    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            return jsonify({"error": "Task title cannot be empty"}), 400
        fields.append("title = %s")
        values.append(title)

    if "description" in data:
        fields.append("description = %s")
        values.append(data.get("description") or "")

    if "priority" in data:
        if data["priority"] not in VALID_PRIORITIES:
            return jsonify({"error": f"Priority must be one of {sorted(VALID_PRIORITIES)}"}), 400
        fields.append("priority = %s")
        values.append(data["priority"])

    if "status" in data:
        if data["status"] not in VALID_STATUSES:
            return jsonify({"error": f"Status must be one of {sorted(VALID_STATUSES)}"}), 400
        fields.append("status = %s")
        values.append(data["status"])

    if not fields:
        return jsonify({"error": "No valid fields provided to update"}), 400

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT id FROM tasks WHERE id = %s", (task_id,))
        if cursor.fetchone() is None:
            cursor.close()
            return jsonify({"error": "Task not found"}), 404

        values.append(task_id)
        cursor.execute(f"UPDATE tasks SET {', '.join(fields)} WHERE id = %s", values)
        conn.commit()

        cursor.execute("SELECT * FROM tasks WHERE id = %s", (task_id,))
        updated_task = cursor.fetchone()
        cursor.close()

        return jsonify(task_to_dict(updated_task)), 200

    except mysql.connector.Error as err:
        return jsonify({"error": str(err)}), 500
    finally:
        if conn and conn.is_connected():
            conn.close()


@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM tasks WHERE id = %s", (task_id,))
        if cursor.fetchone() is None:
            cursor.close()
            return jsonify({"error": "Task not found"}), 404

        cursor.execute("DELETE FROM tasks WHERE id = %s", (task_id,))
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
