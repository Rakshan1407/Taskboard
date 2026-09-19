import os

SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-me")

DB_CONFIG = {
    "host": os.environ.get("DB_HOST"),
    "user": os.environ.get("DB_USER", "root"),
    "password": os.environ.get("DB_PASSWORD", ""),
    "database": os.environ.get("DB_NAME", "todo_db"),
}
