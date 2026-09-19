"""
Authentication for the Task Management Application.

Session-based auth (Flask's signed cookie session — no extra library
required): a user signs up, we store a hashed password, and on login we
put their user id in the session. A small `login_required` decorator
protects the task routes and any other view that needs a logged-in user.
"""

import re
from functools import wraps

from flask import Blueprint, jsonify, request, session, render_template, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash
import mysql.connector

from config import DB_CONFIG

auth_bp = Blueprint("auth", __name__)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def get_db_connection():
    return mysql.connector.connect(**DB_CONFIG)


def login_required(view_func):
    """Redirect browser requests to /login and reject API requests with 401."""

    @wraps(view_func)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            if request.path.startswith("/api/"):
                return jsonify({"error": "Authentication required"}), 401
            return redirect(url_for("auth.login_page"))
        return view_func(*args, **kwargs)

    return wrapped


# ---------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------

@auth_bp.route("/signup", methods=["GET"])
def signup_page():
    if "user_id" in session:
        return redirect(url_for("index"))
    return render_template("signup.html")


@auth_bp.route("/login", methods=["GET"])
def login_page():
    if "user_id" in session:
        return redirect(url_for("index"))
    return render_template("login.html")


@auth_bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return redirect(url_for("auth.login_page"))


# ---------------------------------------------------------------------
# API
# ---------------------------------------------------------------------

@auth_bp.route("/api/signup", methods=["POST"])
def api_signup():
    data = request.get_json(silent=True) or {}

    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if len(username) < 3:
        return jsonify({"error": "Username must be at least 3 characters"}), 400
    if not EMAIL_RE.match(email):
        return jsonify({"error": "Enter a valid email address"}), 400
    if (
        len(password) < 8
        or not re.search(r"[A-Z]", password)
        or not re.search(r"[a-z]", password)
        or not re.search(r"[0-9]", password)
        or not re.search(r"[!@#$%^&*]", password)
    ):
        return jsonify({
            "error": "Password must be at least 8 characters and include an uppercase letter, lowercase letter, number, and special character."
        }), 400

    password_hash = generate_password_hash(password)

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute(
            "SELECT id FROM users WHERE username = %s OR email = %s",
            (username, email),
        )
        if cursor.fetchone() is not None:
            cursor.close()
            return jsonify({"error": "Username or email is already taken"}), 409

        cursor.execute(
            "INSERT INTO users (username, email, password_hash) VALUES (%s, %s, %s)",
            (username, email, password_hash),
        )
        conn.commit()
        user_id = cursor.lastrowid
        cursor.close()

        session["user_id"] = user_id
        session["username"] = username

        return jsonify({"id": user_id, "username": username, "email": email}), 201

    except mysql.connector.Error as err:
        return jsonify({"error": str(err)}), 500
    finally:
        if conn and conn.is_connected():
            conn.close()


@auth_bp.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or {}

    identifier = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not identifier or not password:
        return jsonify({"error": "Username/email and password are required"}), 400

    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT * FROM users WHERE username = %s OR email = %s",
            (identifier, identifier.lower()),
        )
        user = cursor.fetchone()
        cursor.close()

        if user is None or not check_password_hash(user["password_hash"], password):
            return jsonify({"error": "Incorrect username or password"}), 401

        session["user_id"] = user["id"]
        session["username"] = user["username"]

        return jsonify({"id": user["id"], "username": user["username"], "email": user["email"]}), 200

    except mysql.connector.Error as err:
        return jsonify({"error": str(err)}), 500
    finally:
        if conn and conn.is_connected():
            conn.close()


@auth_bp.route("/api/me", methods=["GET"])
def api_me():
    if "user_id" not in session:
        return jsonify({"error": "Not logged in"}), 401
    return jsonify({"id": session["user_id"], "username": session["username"]}), 200
