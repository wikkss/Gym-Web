# Plan: APATNATAO GymLog with a real backend

## Primary goal

A member can create an account, check in and out at APATNATAO, and see their own visits. Front desk staff can see who is inside, manage memberships, and read attendance, with all data kept on a server instead of one browser.

## Phase 0: Documentation discovery

**How this serves the primary goal:** it fixes which APIs exist before any code is written, so the backend does not rely on invented calls.

Allowed APIs, with sources:
- Vercel Functions: files in a root `api/` folder become endpoints, and `public/` is served as static files. Sources: Vercel docs on Functions and the vanilla-vercel-functions example.
- Neon driver: `import { neon } from "@neondatabase/serverless"; const sql = neon(process.env.DATABASE_URL); await sql\`SELECT ...\``. Source: the @neondatabase/serverless README. `DATABASE_URL` comes from the Neon integration or `vercel env add`.
- Password hashing and sessions: Node built-ins `scryptSync`, `randomBytes`, `timingSafeEqual` from `node:crypto`.

Anti-patterns to avoid: one `sql` call with several statements, storing plain-text passwords, trusting the browser for roles.

## Phase 1: Frontend cleanup

**How this serves the primary goal:** members see the gym's real name, hours, and a sign-up that asks only what the gym needs.

Remove the theme and accent controls. Set the gym name to APATNATAO and hours to 6 AM to 8 PM. Sign-up asks for name, email, mobile number, and a password. No plan question. Verify: grep finds no theme code.

## Phase 2: Backend

**How this serves the primary goal:** accounts, visits, and memberships persist and are shared between member and staff screens.

`lib/db.js` (helpers and schema), `api/auth.js` (sign up, log in, log out), `api/data.js` (role-scoped read), `api/act.js` (scan, manage, register). Members can only scan themselves. Staff only for manage and register. Verify: every file passes `node --check`.

## Phase 3: Wire the frontend

**How this serves the primary goal:** the screens show real server data without being rewritten.

Replace the body of the `Gym` module with calls to `/api`. The screens keep calling the same interface. Verify: no `localStorage` left in `public/index.html`.

## Phase 4: Verification

**How this serves the primary goal:** proves the pieces are consistent before the person deploys.

Syntax check all files, grep for anti-patterns, then deploy and run the manual checklist: sign up, staff adds 30 days, member checks in and out, staff sees the visit, suspended member is denied.

## Not now

Auto check-out, rate limiting on log in, password reset, email or SMS, real QR scanning and door hardware.
