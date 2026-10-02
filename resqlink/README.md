# ResQLink — Emergency Response System

A full-stack emergency response platform: React + Vite + Leaflet frontend,
Node.js + Express + MongoDB backend, with an AI response layer (Gemini,
with deterministic local fallbacks when no key is configured).

```
resqlink/
  backend/     Express API + MongoDB models/routes/services
  frontend/    React (Vite) app
```

## 1. Prerequisites

- Node.js 18+ (Node 22 was used to build/verify this project)
- npm (comes with Node)
- MongoDB running locally, **or** a MongoDB Atlas connection string
- (Optional) a Google Gemini API key — the app runs without one, using
  its built-in local/rule-based fallbacks for every AI feature

## 2. Backend setup (Windows / VS Code terminal)

```
cd backend
copy .env.example .env
```

Open the new `backend\.env` and fill in:

| Variable        | Required? | Notes |
|-----------------|-----------|-------|
| `PORT`          | No        | Defaults to `5000`. The frontend is hardcoded to call `http://localhost:5000/api`, so only change this if you also update the frontend's `API` constant in every page. |
| `MONGO_URI`     | **Yes**   | e.g. `mongodb://127.0.0.1:27017/resqlink` for a local MongoDB, or an Atlas connection string. |
| `GEMINI_API_KEY`| No        | Leave blank to run entirely on the local/deterministic AI fallbacks. Set it to enable live Gemini responses for the AI Emergency Agent, AI Team Decision and AI Assistant. |
| `GEMINI_MODEL`  | No        | Defaults to `gemini-2.5-flash`. |

Install dependencies and run:

```
npm install
npm run dev
```

- `npm run dev` runs `nodemon server.js` (auto-restarts on file changes).
- `npm start` runs `node server.js` (no auto-restart) — use this for a
  more "production-like" run.

You should see:
```
🚨 ResQLink server running on port 5000
```

(Optional) seed the database with demo emergencies/teams/resources via
the existing `/api/seed` route once the server is running (see
`backend/routes/seedRoutes.js` for the exact endpoint).

## 3. Frontend setup (in a **second** terminal)

```
cd frontend
npm install
npm run dev
```

Vite will print a local URL — open:

```
http://localhost:5173
```

The frontend expects the backend to be reachable at
`http://localhost:5000/api` (hardcoded — there is no frontend `.env`,
since none of the pages read any Vite env variables).

## 4. What's LIVE vs LOCAL/DEMO

13 of the 19 roadmap features run against real MongoDB data and/or the
Gemini API (falling back to deterministic local logic if no API key is
set). 6 are explicitly labelled **LOCAL** or **SIMULATION** in the UI
because they depend on an external service this project doesn't have
credentials for (live traffic/routing, hospital bed APIs, government
agency APIs). Those are real, working, clearly-labelled local models —
not fake buttons.

## 5. Known limitations

- No dark mode persistence conflict: dark mode is a single shared
  preference (`localStorage` key `resqlink_dark_mode`) applied across
  every page.
- Features 9/10/13/15 will only become "LIVE" once real external API
  credentials (routing, hospital, government) are integrated — there's
  nothing to configure for this in `.env` today because no such
  integration exists yet.
- This project was assembled/verified in a Linux sandbox without
  network access, so the final `npm run build` / `npm install` could
  not be executed end-to-end there. Every backend file was verified
  with `node --check` (real syntax validation) and every frontend file
  was verified for balanced braces/parens, but you should still treat
  your local `npm install` + `npm run dev` + `npm run build` on Windows
  as the real, authoritative verification.
