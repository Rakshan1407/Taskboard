-- Database schema for the Task Management Application
-- Run this once against your MySQL server before starting the Flask app.

CREATE DATABASE IF NOT EXISTS todo_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE todo_db;

CREATE TABLE IF NOT EXISTS tasks (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    title       VARCHAR(150) NOT NULL,
    description TEXT,
    priority    ENUM('Low', 'Medium', 'High') NOT NULL DEFAULT 'Medium',
    status      ENUM('Pending', 'Completed') NOT NULL DEFAULT 'Pending',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- A couple of sample rows so the UI isn't empty on first run.
-- Safe to delete once you start adding your own tasks.
INSERT INTO tasks (title, description, priority, status) VALUES
    ('Set up development environment', 'Install Python, MySQL and clone the repo', 'High', 'Completed'),
    ('Write project README', 'Document setup and run instructions', 'Medium', 'Pending');
