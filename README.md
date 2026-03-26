# Tutoring Scheduler

A web application for managing tutoring programs in educational institutions. It streamlines scheduling and tracking of tutoring sessions between teachers and students, with configurable slots, subject-priority overrides, and calendar integration.

## Features

### For Teachers
- **Dashboard** - View today's incoming students and students from your classes leaving for tutoring elsewhere
- **Session Requests** - Create single or bulk tutoring session requests with priority-aware date selection
- **Request List** - View, filter, and cancel your upcoming requests; track calendar invite status
- **Analytics** - Review your tutoring history and per-student data

### For Admins
- **School Configuration** - Set blocked days, enable/configure subject priority scheduling
- **Tutoring Slots** - Define and manage the named time slots available for tutoring (e.g. "A Lunch")
- **Academic Periods** - Define class periods and assign teachers to students per period

## Tech Stack

### Frontend
- **React** - User interface framework
- **Material-UI (MUI)** - Component library
- **React Router** - Client-side routing
- **date-fns / MUI DatePicker** - Date handling

### Backend
- **Node.js + Express.js** - Server and API
- **Sequelize ORM** - Database abstraction
- **PostgreSQL** - Production database
- **SQLite** - Local development database (zero config)

### Infrastructure
- **Railway** - Cloud deployment
- **Google Calendar API** - Calendar invite integration

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Local Development

```bash
# Install server dependencies
cd server && npm install

# Seed the database with sample data (creates SQLite DB automatically)
node init.js

# Start the server (port 5000)
node server.js

# In a separate terminal, install and start the frontend (port 3000)
cd client && npm install && npm start
```

The React dev server proxies API requests to `http://localhost:5000`.

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | SQLite fallback |
| `SESSION_SECRET` | Express session secret | required in prod |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | optional |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | optional |

## Project Structure

```
tutoring-scheduler/
├── client/                 # React frontend
│   └── src/
│       ├── components/     # UI components
│       ├── contexts/       # TutoringContext (shared state)
│       └── utils/          # apiService.js
├── server/                 # Express backend
│   ├── models/             # Sequelize models
│   ├── routes/             # API route handlers
│   ├── middleware/         # auth, adminAuth
│   └── server.js
└── README.md
```

## Database Schema

### Teachers
- `id`, `first_name`, `last_name`, `email`, `subject`, `lunch`, `is_admin`

### Students
- `id` (9-digit student ID), `first_name`, `last_name`, `email`
- **TutoringSlots** — many-to-many: which slots the student is available in
- **StudentPeriodAssignments** — which teacher teaches this student each period

### Periods
- `id`, `name` (e.g. "R1"), `order`

### StudentPeriodAssignment
- Links a Student to a Teacher for a given Period

### TutoringSlots
- `id`, `name` (e.g. "A Lunch"), `startTime`, `endTime`, `order`
- Configured by admins; referenced by both students and tutoring requests

### TutoringRequests
- `id`, `StudentId`, `TeacherId`, `date`, `status`, `invite_sent`, `calendar_event_id`
- **TutoringSlots** — many-to-many: which slots this session covers

### SchoolConfig
- Key-value store for school-wide settings (`no_tutoring_days`, `subject_priority_enabled`, `subject_priority_map`)

## API Endpoints

### Auth
- `POST /api/auth/login` — Log in as a teacher

### Teachers
- `GET /api/teachers` — All teachers
- `GET /api/teachers/:id` — Single teacher
- `POST /api/teachers` — Create teacher

### Students
- `GET /api/students` — All students (includes TutoringSlots and StudentPeriodAssignments)
- `GET /api/students/:id` — Single student
- `POST /api/students` — Create student
- `PUT /api/students/:id` — Update student (admin only)
- `POST /api/students/bulk-rr` — Bulk update student slot assignments (admin only)

### Tutoring
- `GET /api/tutoring` — All tutoring requests
- `GET /api/tutoring/:id` — Single request
- `POST /api/tutoring` — Create request (pass `override: true` to force priority override)
- `PUT /api/tutoring/cancel/:id` — Cancel a request
- `GET /api/tutoring/priority/:date` — Priority subject for a given date
- `GET /api/tutoring/schedule-config` — Public scheduling config (blocked days, priority map)

### Admin
- `GET /api/admin/config` — Get all SchoolConfig values
- `PUT /api/admin/config` — Update SchoolConfig values
- `GET /api/admin/tutoring-slots` — List tutoring slots
- `POST /api/admin/tutoring-slots` — Create slot
- `PUT /api/admin/tutoring-slots/:id` — Update slot
- `DELETE /api/admin/tutoring-slots/:id` — Delete slot
- `GET /api/admin/periods` — List periods
- `POST /api/admin/periods` — Create period
- `PUT /api/admin/periods/:id` — Update period
- `DELETE /api/admin/periods/:id` — Delete period

### Analytics
- `GET /api/analytics/:teacherId` — Teacher summary stats
- `GET /api/analytics/:teacherId/student/:studentId` — Per-student history

### Calendar
- `POST /api/calendar/send-invites` — Send pending Google Calendar invites
- `GET /api/calendar/pending-count` — Count of uninvited active requests
- `PATCH /api/calendar/mark-sent/:id` — Manually mark invite sent
- `PATCH /api/calendar/unmark-sent/:id` — Undo manual mark

## License

MIT

## Developer

**Mr. Jernigan** — [@MrJerniganCRVA](https://github.com/MrJerniganCRVA)
