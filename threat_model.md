# Threat Model

## Project Overview

This project is a QR-based attendance and session tracking application deployed publicly on Replit. The production app consists of a React frontend in `artifacts/qr-tracker`, an Express API in `artifacts/api-server`, and PostgreSQL-backed persistence via Drizzle in `lib/db`.

Users authenticate with username/password and receive a server-side session cookie. Admins manage staff accounts, linked users, session records, and audit logs. Staff can sign in, use the QR scanning flow, and review their own session history.

## Assets

- **User and staff accounts** -- usernames, password hashes, roles, and active session cookies. Compromise allows impersonation and unauthorized access to operational functions.
- **Attendance/session records** -- check-in/check-out timestamps, duration, and linked user identities. These are business records and can expose user activity patterns.
- **Linked user records** -- names, notes, QR codes, and optional linkage to staff accounts. Exposure can leak personally identifying or operational information.
- **Audit logs** -- login events and account-management actions. These support incident review and contain sensitive operational history.
- **Application secrets** -- database credentials and the session signing secret. Compromise can lead to full account takeover or backend compromise.

## Trust Boundaries

- **Browser to API** -- all frontend requests cross from an untrusted client into the Express backend. Authentication, authorization, and input validation must be enforced server-side.
- **Unauthenticated to authenticated API surface** -- `/api/healthz` and `/api/auth/*` are public; all other API routes are intended to require a valid session.
- **Authenticated to admin boundary** -- account management, audit logs, user management, and broader session reporting are restricted to admins and must not be reachable by regular staff.
- **API to PostgreSQL** -- the API holds direct database access through Drizzle. Any auth bypass or injection issue at the API layer would expose the full application dataset.
- **Cross-origin web boundary** -- the deployed app is public on the internet. Any browser-origin trust granted by the API must be tightly scoped because arbitrary third-party sites are attacker-controlled.
- **Production vs dev-only boundary** -- `artifacts/mockup-sandbox` is treated as dev-only and should not drive production findings unless there is evidence it is deployed.

## Scan Anchors

- **Production entry points:** `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/index.ts`, `artifacts/qr-tracker/src/App.tsx`
- **Highest-risk code areas:** session/CORS setup in `artifacts/api-server/src/app.ts`; auth flow in `artifacts/api-server/src/routes/auth.ts`; RBAC middleware in `artifacts/api-server/src/middleware/auth.ts`; admin routes in `artifacts/api-server/src/routes/{users,accounts,audit-logs,sessions}.ts`
- **Public surfaces:** `/api/healthz`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`
- **Authenticated surfaces:** all other `/api/*` routes after `requireAuth`
- **Admin-only surfaces:** `/users`, `/accounts`, `/audit-logs`, `/sessions`, `/sessions/summary`, `/sessions/today`, `/sessions/:id`
- **Usually ignore:** `artifacts/mockup-sandbox` unless production reachability is demonstrated

## Threat Categories

### Spoofing

The application relies on username/password login plus a server-side session cookie for identity. The system must resist credential stuffing and brute-force guessing on `/api/auth/login`, and session cookies must only be accepted when they were issued by the server under a strong, deployment-specific secret.

Required guarantees:
- `/api/auth/login` must enforce effective brute-force resistance appropriate for a public internet deployment.
- Session identifiers and signatures must be based on a strong secret that is never hardcoded or shared across environments.
- Every protected API route must verify an authenticated session server-side.

### Tampering

Attendance data, user linkages, account roles, and password changes are security-sensitive state changes. The server must ensure only authorized roles can perform them and must never trust the browser to enforce those permissions.

Required guarantees:
- Role checks must be enforced server-side for all admin operations.
- QR/session operations must only be reachable by intended authenticated roles.
- Password updates and account deletion flows must verify both caller authorization and target safety invariants.

### Information Disclosure

The API exposes account data, linked user records, session histories, and audit logs. Because the app is publicly deployed, any overly broad CORS policy or missing authorization check can leak this data to arbitrary external sites or unauthorized users.

Required guarantees:
- Authenticated API responses must not be readable from arbitrary web origins.
- Session histories and user/account data must be scoped to the authenticated principal or restricted admin role as intended.
- Logs and error responses must not reveal secrets or unnecessary internals.

### Denial of Service

The login endpoint, public auth endpoints, and data export endpoints can be abused to consume resources or lock out legitimate use if left unthrottled. Publicly reachable routes must tolerate hostile traffic patterns.

Required guarantees:
- Public authentication endpoints must rate-limit repeated failed attempts.
- Expensive list/export endpoints should enforce bounded pagination or equivalent controls.
- The app should not permit trivial automated abuse from the public internet.

### Elevation of Privilege

Compromise of a session cookie, bypass of admin-only route protection, or cross-origin reading of authenticated API responses would allow an attacker to act as staff or admin and access broader operational data.

Required guarantees:
- Session cookies must not be forgeable or reusable across deployments.
- Cross-origin requests must not be able to read credentialed API responses unless the origin is explicitly trusted.
- Admin-only routes must remain inaccessible to staff and unauthenticated users under direct API access, not just through frontend navigation.
