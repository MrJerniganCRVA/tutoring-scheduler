# RR Tutoring Scheduler

A web app for running a lunch-period tutoring program in a school. Teachers book students for tutoring during one or more lunch blocks, the app resolves scheduling conflicts using a day-of-week subject priority, sends Google Calendar invites, and tells each student's homeroom ("Raptor Rotation", or RR) teacher who is leaving their room and where they are going. Admins manage rosters, see school-wide trends, and pull reports; special-education case managers track service minutes for the students on their caseload.

## Contents

- [How it works](#how-it-works)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Adapting it to your school](#adapting-it-to-your-school)
- [Deploying to production](#deploying-to-production)
- [Database scripts](#database-scripts)
- [Project structure](#project-structure)
- [Data model](#data-model)
- [API reference](#api-reference)

## How it works

A few terms the app uses throughout:

- **RR (Raptor Rotation)** — the homeroom-style period students are in when they get pulled for tutoring. Each student has one RR teacher. The RR teacher sees a "Leaving RR Today" board of their students who are booked elsewhere.
- **Lunch blocks** — the school day has four lunch blocks, **A, B, C, D**. A tutoring request books a student for any combination of them on one date. Each teacher also has their own lunch, recorded on their profile.
- **Periods / enrollments** — a student's classes are stored as enrollments: a period label (`R1`, `R2`, `RR`, `R4`, `R5`, or any other label, such as an online class) pointing at a teacher. A teacher sees the students enrolled with them when scheduling.
- **Priority days** — each weekday belongs to one subject. On its day, a teacher of that subject can override a booking another subject's teacher already made for the same student.
- **SPED caseload** — a case manager is stored as an enrollment with period `SPED`. Case managers get a page totalling the tutoring their caseload students received, in sessions and service minutes.

Sign-in is Google OAuth only. A person can sign in only if an admin has already created a Teacher record with their email address, and only with an address on your school's Google Workspace domain. The same sign-in grants the app permission to create Google Calendar events on the teacher's behalf.

## Features

### For teachers

- **Raptor Rotation** (`/dashboard`) — the home page. **Leaving RR Today** lists your RR students booked elsewhere today, who they're going to, and which lunch; **Coming For Tutoring** lists the students you've booked today. Use **Are you covering today?** to pick another teacher's RR when you're subbing for them and see which of their students should leave (names only, today only).
- **Requests** (`/tutoring`) — book tutoring for one student or several at once. Pick a date and lunch blocks; the form checks for conflicts with other teachers' bookings before you submit.
- **Priority scheduling** — Monday CS, Tuesday Math, Thursday Humanities, Friday Science. No tutoring on Wednesdays or weekends. If your subject owns the day and the student is already booked by a teacher of another subject, the app warns you and names that teacher. Confirming the override cancels their booking, sends them an in-app notification, and removes the student from their calendar invite. Any other collision is first come, first served.
- **Events** (`/calendar`) — the Tutoring Request List of your upcoming and past sessions, which you can search by student name and cancel, plus Google Calendar invites for them. One invite goes out per run of consecutive lunch blocks (an A+B+D booking becomes two events), with the student as an attendee. You can also mark an invite as sent manually. Cancelling a booking withdraws the student from its invite.
- **Attendance** — booked students are counted present unless you say otherwise. On today's **Coming For Tutoring** list, tap **Mark absent** for a no-show (the undo arrow reverses it). For an earlier day, switch the Tutoring Request List on the Events page to **Past** and mark it there. Only the teacher who booked a session can mark it, and only on or after its date.
- **Analytics** (`/analytics`) — your own tutoring over any date range (defaults to this school year): sessions delivered, students tutored, absences, and how many of your class students you haven't tutored yet; charts of sessions per week and per weekday; your upcoming sessions; and **My Students**, a searchable list of everyone you teach or have tutored, with their SPED case manager if they have one. Click a name to see every session you held with that student.
- **Caseload** (`/caseload`, SPED case managers only) — for each student on your caseload: sessions, absences, and **service minutes**, in total, by subject, and by tutoring teacher, over any date range. Click a name for every session's date, lunches, minutes, teacher and subject. The tab appears only for teachers who have caseload students.
- **Notifications** — a bell in the header lists overrides that cancelled one of your bookings.

**How service minutes are counted:** a session's minutes are the sum of its booked lunch blocks (A, B and C are 23 minutes, D is 24). Passing time between back-to-back lunches isn't counted, so A+B is 46 minutes. Sessions the student was marked absent from add no minutes or sessions and appear in a separate Absences column instead. A session's subject is the tutoring teacher's subject.

### For admins

Teachers with `is_admin` set get two extra tabs.

- **Roster** (`/roster`) — add and edit students and teachers, mark teachers inactive, grant admin, and edit a student's class enrollments. Bulk tools:
  - **Bulk Student Import** — `student_id,first_name,last_name,email,r1_teacher,r2_teacher,rr_teacher,r4_teacher,r5_teacher` (teacher columns take the teacher's email and may be blank).
  - **Bulk Teacher Import** — `teacher_id,first_name,last_name,email,subject,lunch` (`lunch` is optional).
  - **Bulk RR Update** — `student_id,student_name,rr_teacher`, to move students between RRs.
  - **Bulk Caseload Update** — `student_id,student_name,case_manager_email`, to assign SPED case managers. You can also assign one student at a time from the Student Roster (Edit → add a class with period `SPED`).

  Each import previews the rows before saving and can download a CSV template. Rows whose ID or email already exists are reported as errors rather than overwritten.
- **Admin** (`/admin`):
  - **Today** — the day's priority subject and a searchable list of every student leaving RR: from whose RR, to which tutoring teacher, and which lunch.
  - **Student Lookup** — any student's tutoring, by teacher and subject, over a date range, with a per-session breakdown.
  - **School-wide Trends** — over any date range: sessions per week, by department, by teacher, by grade level, by day of week, and by status.
  - **Download full report** — an Excel workbook from the optional [report service](#optional-excel-report-service).

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18 (Create React App), Material UI 5, MUI X Date Pickers, React Router 6, Chart.js, Axios |
| Backend | Node.js, Express 5, Passport (Google OAuth 2.0), express-session, Helmet, express-rate-limit |
| Data | Sequelize 6 with PostgreSQL in production and SQLite for local development; sessions are stored in the same database |
| Integrations | Google Calendar API (via `googleapis`); an optional, separate Excel report service |

## Getting started

### Prerequisites

- Node.js 18 or newer, and npm
- A Google Cloud project where you can create OAuth credentials
- A Google Workspace domain for your school (sign-in is restricted to one domain; see [Adapting it to your school](#adapting-it-to-your-school))

### 1. Create Google OAuth credentials

1. In the [Google Cloud Console](https://console.cloud.google.com/), create or choose a project.
2. Enable the **Google Calendar API** (APIs & Services → Library).
3. Configure the OAuth consent screen. An **Internal** app is simplest if your school uses Google Workspace. Add the scopes `email`, `profile` and `https://www.googleapis.com/auth/calendar.events`.
4. Create an **OAuth client ID** of type *Web application*, with:
   - Authorized JavaScript origin: `http://localhost:3000`
   - Authorized redirect URI: `http://localhost:5000/auth/google/callback`
5. Keep the client ID and client secret for the next step.

### 2. Install and configure

```bash
git clone <your-fork-url> rr-tutoring-app
```

```bash
cd rr-tutoring-app/server && npm install
```

```bash
cp .env.example .env
```

Edit `server/.env` and fill in at least `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `SESSION_SECRET` (any long random string, e.g. the output of `openssl rand -hex 32`). The defaults for everything else work locally. See [Configuration](#configuration) for every variable.

```bash
cd ../client && npm install
```

### 3. Create your first admin

Sign-in only works for emails that already have a Teacher record, and creating teachers inside the app requires being signed in. On a new, empty database, create the first admin directly:

```bash
cd server
ADMIN_ID=1001 ADMIN_FIRST_NAME=Jane ADMIN_LAST_NAME=Doe \
ADMIN_EMAIL=jane.doe@yourschool.org ADMIN_SUBJECT=Math ADMIN_LUNCH=C \
npm run admin:bootstrap
```

`ADMIN_ID` is the teacher's ID number (IDs aren't auto-generated). The email must be on your allowed domain. The script does nothing if that ID or email already exists. The first start of the server creates the tables, so if the script reports missing tables, start the server once (step 4) and run it again.

To explore with sample data instead, run `npm run db:seed-dev`, which wipes the local SQLite database and fills it with sample teachers, students and requests. Edit `server/init.js` first so at least one sample teacher has your own email, or you won't be able to sign in.

### 4. Run it

In one terminal:

```bash
cd server && npm run dev
```

In another:

```bash
cd client && npm start
```

Open http://localhost:3000 and sign in with Google. The API runs on http://localhost:5000, and the local SQLite database is written to `server/database.db`.

From the **Roster** tab you can then add the rest of your teachers and students, by hand or with the CSV imports.

## Configuration

### Server (`server/.env`)

| Variable | Required | Description |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Yes | OAuth client ID from Google Cloud. |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth client secret. |
| `CALLBACK_URL` | Yes | The server's OAuth callback, e.g. `http://localhost:5000/auth/google/callback`. Must match a redirect URI on the OAuth client. |
| `CLIENT_URL` | Yes | The frontend's origin, e.g. `http://localhost:3000`. Used for CORS and for redirects after sign-in. |
| `SESSION_SECRET` | Yes | Secret used to sign session cookies. Use a long random string. |
| `NODE_ENV` | Yes | `development` locally. Must be exactly `production` when deployed: that turns on secure, cross-site session cookies. |
| `PORT` | No | Port the API listens on. Default `5000`. |
| `DATABASE_URL` | Production | PostgreSQL connection string. When unset, the server uses SQLite at `server/database.db`. Set it as a real environment variable: it is read before `.env` is loaded. The connection requires SSL. |
| `TRUST_PROXY` | No | Number of reverse-proxy hops to trust. Default `1`, which suits a single load balancer or platform edge. Leave it unset unless you know you need another value; it must be a whole number. |
| `RUN_MIGRATION` | No | When `true`, the server runs `sequelize.sync({ alter: true })` to bring existing tables up to date with the models, then exits instead of serving. |
| `REPORT_SERVICE_URL` | No | Base URL of the Excel report service. Without it, the admin download button reports that the service isn't configured. |
| `REPORT_TOKEN` | No | Shared secret the server sends to the report service. Set it only on the server and the report service, never on the frontend. |

### Client

| Variable | Description |
| --- | --- |
| `REACT_APP_API_BASE_URL` | The API's URL. Defaults to `http://localhost:5000`. Create React App compiles `REACT_APP_*` variables into the bundle, so set this **before** `npm run build`, not at runtime, and never put secrets in it. |

## Adapting it to your school

Several school-specific rules live in code rather than configuration. Review these before using the app anywhere new:

| What | Where |
| --- | --- |
| Allowed Google sign-in domain | `server/config/passport.js` and `server/bootstrap-admin.js` (search for `@coderva.org`) |
| Priority subject for each weekday | `getPrioritySubjectForDay` in `server/utils/tutoringQueries.js` (enforced) and `client/src/components/PriorityDatePicker.js` (shown in the date picker) |
| Lunch block start and end times, used for calendar invites and service minutes | `server/utils/lunchTimes.js` |
| School time zone, which decides what "today" means | `SCHOOL_TIME_ZONE` in `server/utils/tutoringScope.js` |
| School year start (August 1), the default lower bound for date ranges | `schoolYearStartDate` in `server/utils/tutoringScope.js` |
| Shared RRs: teachers who co-teach one RR, mapped to the teacher students are enrolled under | `RR_GROUPS` in `server/utils/tutoringScope.js`. Empty it (`{}`) if every RR has one teacher. |
| Grade level, inferred from the first two digits of the student ID (the year they entered) | `gradeLevel` in `server/routes/admin.js` |
| Branding (logo, name, colors) | `client/public/`, `client/src/components/Header.js` |

Subjects are free text on each teacher. For priority days to work, teachers' subjects must exactly match the names in the priority map (`CS`, `Math`, `Humanities`, `Science` by default).

## Deploying to production

The app is three pieces: the API (`server/`), a static frontend (`client/build/`), and a PostgreSQL database. They can run on any platform that runs Node.js and serves static files.

1. **Database** — provision PostgreSQL and set `DATABASE_URL` on the API. Tables are created automatically on first start. After pulling a release that adds model fields, deploy once with `RUN_MIGRATION=true` (the process exits after migrating), then remove it.
2. **API** — run `npm start` in `server/` with `NODE_ENV=production`, `CLIENT_URL` set to the frontend's public URL, `CALLBACK_URL` set to `https://<api-host>/auth/google/callback`, and the other variables above.
3. **Frontend** — run `npm run build` in `client/` with `REACT_APP_API_BASE_URL=https://<api-host>`, then serve `build/` as a single-page app (unknown paths must fall back to `index.html`). `client/Caddyfile` and `client/nixpacks.toml` are a working setup for serving it with Caddy.
4. **Google OAuth** — add the production frontend origin and callback URL to your OAuth client.
5. **First admin** — run `npm run admin:bootstrap` once against the production database (with `DATABASE_URL` set), as in [step 3](#3-create-your-first-admin).

The frontend and API are expected on different origins, so in production session cookies are `Secure` and `SameSite=None`, and the API must be served over HTTPS. If sign-in succeeds at Google but you land back on the login page, the API most likely doesn't see the request as HTTPS: check `TRUST_PROXY`, and look for the `[auth] FATAL CONFIG` line in the server log.

### Optional: Excel report service

The admin **Download full report** button is backed by [tutoring-analytics-report](https://github.com/MrJerniganCRVA/tutoring-analytics-report), a separate Kotlin service that reads the same database and returns an `.xlsx`. Only the API talks to it:

1. Deploy the report service (it builds from its Dockerfile) with access to the same database and a `REPORT_TOKEN` of your choosing. Keep it on a private network; it doesn't need a public address.
2. On the API, set `REPORT_SERVICE_URL` to the service's address and `REPORT_TOKEN` to the same value.

## Database scripts

Run these from `server/`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the API with automatic restarts (nodemon). |
| `npm start` | Start the API. |
| `npm run admin:bootstrap` | Create the first admin teacher from `ADMIN_*` environment variables. Safe to re-run. |
| `npm run db:seed-dev` | **Destructive.** Delete the local SQLite database and refill it with sample data. |
| `npm run db:reset-dev` | **Destructive.** Drop and recreate every table, empty. |

Both destructive scripts ask you to type `RESET` first. If `DATABASE_URL` is set they refuse to run against PostgreSQL unless you also set `ALLOW_DESTRUCTIVE_RESET=yes`.

`server/api-tests.http` has sample requests for the VS Code REST Client extension.

## Project structure

```
rr-tutoring-app/
├── client/                    React frontend
│   ├── public/                HTML template, icons, logo
│   ├── src/
│   │   ├── components/        Pages, dialogs and bulk-import tools
│   │   ├── contexts/          Auth and tutoring-data providers
│   │   ├── utils/             API client, date and enrollment helpers
│   │   └── App.js             Routes
│   ├── Caddyfile              Static-file server config for production
│   └── nixpacks.toml          Build config that installs and runs Caddy
└── server/                    Express API
    ├── config/                Database connection and Passport (Google OAuth)
    ├── middleware/            Auth, admin check, rate limiters
    ├── models/                Sequelize models
    ├── routes/                API endpoints, one file per area
    ├── utils/                 Scheduling rules, lunch times, calendar, shared queries
    ├── bootstrap-admin.js     First-admin script
    ├── init.js                Sample-data seeder (dev only)
    ├── migrate.js             Empty-schema reset (dev only)
    └── server.js              App setup and startup
```

## Data model

**Teacher** — `id` (assigned, not auto-generated), `first_name`, `last_name`, `email` (unique), `subject`, `lunch` (A–D), `is_admin`, `active`, and Google OAuth fields (`google_id`, `access_token`, `refresh_token`, `token_expiry`) filled in on first sign-in.

**Student** — `id` (the student ID number, assigned), `first_name`, `last_name`, `email`, `schoolYear`, `active`.

**Enrollment** — links a student to a teacher for one `period` label, with an optional `schoolYear`. A student can have any number of enrollments but at most one per period. Period `RR` is the student's homeroom; `SPED` is their case manager.

**TutoringRequest** — one student booked with one teacher on one `date`, with a flag per lunch block (`lunchA`–`lunchD`). Also `status` (`active`, `cancelled` or `conflict`), `priority`, `conflictReason` (who overrode it, when cancelled by an override), attendance (`absent`, `absentMarkedAt`), and calendar tracking (`calendar_event_id`, `invite_sent`, `invite_sent_at`).

**Notification** — an in-app message to a teacher (`TeacherId` is the recipient) about a student (`StudentId`): `type`, `message`, `relatedDate`, `read`, `readAt`. Written when a priority override cancels a teacher's booking, the one case where the app takes away a session someone else scheduled. The overriding teacher is named in `message`, not stored as a separate key.

Sessions are stored in a `sessions` table in the same database.

## API reference

Every route requires a signed-in session unless noted. Admin-only routes return `403` for other teachers. Routes that take `from` and `to` expect `YYYY-MM-DD` and default to the current school year so far. Requests are rate-limited per teacher (per IP before sign-in); a limited request gets `429`.

### Auth

| Method | Path | Description |
| --- | --- | --- |
| GET | `/auth/google` | Start Google sign-in. No session required. |
| GET | `/auth/google/callback` | OAuth callback; redirects to the frontend. No session required. |
| GET | `/auth/current` | The signed-in teacher, including `isAdmin` and `hasCaseload`. `401` if not signed in. |
| GET | `/auth/logout` | Sign out. |

### Teachers

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/teachers` | All teachers. |
| GET | `/api/teachers/:id` | One teacher. |
| POST | `/api/teachers` | Create a teacher. Admin. |
| POST | `/api/teachers/bulk-create` | Create teachers from a CSV import. Admin. |
| PUT | `/api/teachers/:id` | Update a teacher. Admin. |

### Students

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/students` | All students. |
| GET | `/api/students/teacher/:teacherId` | Students enrolled with a teacher, in any period. |
| POST | `/api/students` | Create a student. |
| POST | `/api/students/bulk-create` | Create students from a CSV import. Admin. |
| POST | `/api/students/bulk-rr` | Update RR assignments in bulk. Admin. |
| POST | `/api/students/bulk-enrollment` | Set one period's teacher per student, where `period` is `RR` or `SPED`. Admin. |
| PUT | `/api/students/:id` | Update a student's enrollments. Admin. |

### Tutoring

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/tutoring` | Tutoring requests. `scope=mine` (default: the caller's own, this school year), `scope=rr` (students in the caller's RR), or `scope=student&studentId=…` (one student across all teachers; for non-admins, active requests from today on only). Optional `from`, `to`, `date`, `status`. |
| GET | `/api/tutoring/:id` | One request, for the teacher who booked it, the student's RR teacher, or an admin; `404` for anyone else. |
| POST | `/api/tutoring` | Book a session. Returns a conflict if another teacher has the student; send `override: true` to confirm a priority-day override. |
| PATCH | `/api/tutoring/:id/attendance` | Mark the student absent (`{ "absent": true }`) or present again. Only the booking teacher, and only on or after the session date. |
| PUT | `/api/tutoring/cancel/:id` | Cancel a request and withdraw the student from its calendar invite. |
| GET | `/api/tutoring/priority/:date` | The priority subject for a date. No session required. |
| GET | `/api/tutoring/rr-teachers` | Teachers whose RR can be covered (names only). |
| GET | `/api/tutoring/coverage/:teacherId` | Students leaving that RR today (names only). |

An override cancels the other teacher's request, creates a Notification for them, and removes the student from their Calendar event, deleting the event if the student was its only attendee.

### Calendar

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/calendar/send-invites` | Send Google Calendar invites for the caller's requests that don't have one yet. |
| GET | `/api/calendar/pending-count` | How many of the caller's requests are awaiting an invite. |
| PATCH | `/api/calendar/mark-sent/:id` | Mark a request's invite as sent without sending one. |
| PATCH | `/api/calendar/unmark-sent/:id` | Mark it as not sent. |

### Notifications

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/notifications` | The caller's notifications, newest first. `?unread=true` for unread only. |
| PATCH | `/api/notifications/:id/read` | Mark one as read. |
| PATCH | `/api/notifications/read-all` | Mark all as read. |

### Analytics

Teachers can read only their own analytics (`:teacherId` must be the caller); admins can read anyone's. All routes take `from` and `to`, and count only the teacher's own sessions.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/analytics/:teacherId` | Totals, sessions per week and per weekday, and upcoming sessions. |
| GET | `/api/analytics/:teacherId/students` | Every student the teacher teaches or tutored in the range: sessions, absences, last session, whether they're in the teacher's class, and their case manager. |
| GET | `/api/analytics/:teacherId/students/:studentId/sessions` | The teacher's sessions with one student. `404` unless the teacher teaches or has tutored them. |

### Caseload

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/caseload` | The caller's SPED caseload: per student, sessions, absences and service minutes, in total, by subject and by tutoring teacher. Takes `from`, `to`. |
| GET | `/api/caseload/students/:id/sessions` | Every session for one student on the caller's caseload. Takes `from`, `to`. `404` if the student isn't on it. |

### Admin

All admin-only.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/admin/today` | Today's priority subject and every student leaving RR: from where, to whom, and which lunch. |
| GET | `/api/admin/trends` | Sessions per week, by department, teacher (with percentile), weekday, grade level, and status. Takes `from`, `to`. |
| GET | `/api/admin/students/:id/tutoring` | One student's sessions and service minutes, in total, by subject and by teacher. Takes `from`, `to`. |
| GET | `/api/admin/students/:id/sessions` | Every session for one student. Takes `from`, `to`. |
| GET | `/api/admin/report` | Streams the Excel report from the report service. |

## Acknowledgments

Built for a school's tutoring program, with thanks to the teachers whose feedback shaped it and to the open-source projects it's built on.
