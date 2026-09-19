"""
Configuration for the Task Management application.

Database credentials are read from environment variables so real
credentials never need to be committed to source control. Sensible
local defaults are provided for quick setup during development.
"""

import os

DB_CONFIG = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "user": os.environ.get("DB_USER", "root"),
    "password": os.environ.get("DB_PASSWORD", ""),
    "database": os.environ.get("DB_NAME", "todo_db"),
}
