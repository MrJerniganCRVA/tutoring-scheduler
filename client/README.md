# RR Tutoring Scheduler — Client

React frontend for the RR Tutoring Scheduler. See the [root README](../README.md) for the full project overview, database schema, and API reference.

## Local Development

```bash
npm install
npm start
```

The app runs at http://localhost:3000 and expects the server running at http://localhost:5000 by default — override with `REACT_APP_API_BASE_URL` if needed.

Sign-in uses Google OAuth, restricted to your school's Google Workspace domain. The server must already have a Teacher record with your email for sign-in to succeed (see "Create your first admin" in the root README for a brand-new database).

## Building for Production

```bash
npm run build
```

Produces a static `build/` folder. Serve it as a single-page app, with unknown paths falling back to `index.html`; `Caddyfile` and `nixpacks.toml` are a ready-made Caddy setup for this. `REACT_APP_API_BASE_URL` is baked in at build time (Create React App inlines `REACT_APP_*` vars into the bundle), so it must be set correctly *before* building, not just at runtime.
