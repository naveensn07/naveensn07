# Project Tracker Web App

A full-stack web app where users can:
- Sign up and log in
- Create projects and add team members
- Create and assign tasks
- Track task status and overdue tasks from a dashboard
- Enforce role-based access (`ADMIN`, `MEMBER`)

## Tech Stack

- Backend: Node.js + Express
- Database: PostgreSQL with Prisma ORM
- Auth: JWT + bcrypt password hashing
- Frontend: Vanilla HTML/CSS/JS
- Deployment: Railway

## API Overview

- `POST /api/auth/signup` - create account
- `POST /api/auth/login` - login
- `GET /api/auth/me` - current user
- `GET /api/users` - list users (system admin only)
- `POST /api/projects` - create project
- `GET /api/projects` - list current user's projects
- `POST /api/projects/:projectId/members` - add member (project admin only)
- `GET /api/projects/:projectId/tasks` - list project tasks
- `POST /api/projects/:projectId/tasks` - create task
- `PATCH /api/tasks/:taskId` - update task
- `GET /api/dashboard` - personal dashboard stats + tasks

## Local Setup

1. Install dependencies:
   - `npm install`
2. Copy env:
   - Use `.env.example` and set valid values.
3. Ensure PostgreSQL is running and `DATABASE_URL` points to it.
4. Push schema:
   - `npm run prisma:push`
5. Start app:
   - `npm run dev`
6. Open:
   - `http://localhost:3000`

## Railway Deployment (Mandatory)

1. Push this project to GitHub.
2. Create a new Railway project and link the GitHub repo.
3. Add a PostgreSQL service in Railway.
4. Set environment variables in Railway:
   - `DATABASE_URL` (from Railway PostgreSQL service)
   - `JWT_SECRET` (strong random secret)
   - `PORT` (optional; Railway provides one automatically)
5. Deploy. `railway.json` uses:
   - Start command: `npm run start:prod`
   - This runs Prisma generate + schema push, then starts the app.
6. Open the Railway provided domain and verify:
   - Signup/Login
   - Create project
   - Create tasks
   - Dashboard counts and overdue tasks

## Validation and RBAC Notes

- Request payloads use `zod` validation.
- Passwords are hashed with `bcryptjs`.
- JWT middleware protects private routes.
- Authorization checks:
  - System `ADMIN` required for `/api/users`
  - Project `ADMIN` required to add members
  - Project members can update task status; full task edits are limited to project admin, assignee, or creator
  - Task assignees must be members of that project
