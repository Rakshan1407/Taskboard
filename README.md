## Prerequisites

- Python 3.9+
- MySQL Server 5.7+ (or MySQL 8)
- pip

## Setup

### 1. Create a virtual environment and install dependencies

```bash
python3 -m venv venv
path .\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2. Create the database

Log in to MySQL and run the schema file:

```bash
mysql -u root -p < schema.sql
```
This creates a `todo_db` database with a `tasks` and `users` table.

### 3. Configure database credentials in env

DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=todo_db

Update the values according to your MySQL configuration.

### 4. Run the app

```bash
python app.py
```
The app starts on **http://localhost:5000**. Open it in a browser to use the UI.