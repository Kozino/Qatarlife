# Qatar Life API contract — Phases 1–7

Base path: `/api`. All requests/responses use JSON. Browser requests use `credentials: include`; the session is an HTTP-only cookie and is never exposed to client JavaScript.

Errors use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the highlighted fields.",
    "fields": { "email": "Enter a valid email address." }
  }
}
```

## `GET /health`

Returns service status without secrets.

```json
{ "ok": true, "service": "qatar-life-api", "mode": "preview-memory", "timestamp": "2026-10-06T00:00:00.000Z" }
```

`mode` is `postgres` when `DATABASE_URL` is configured and `preview-memory` otherwise. Preview-memory is not a production deployment mode.

## Authentication

### `POST /auth/signup`

Request:

```json
{ "email": "player@example.com", "password": "A secure password 123" }
```

The server normalizes the email, hashes the password, creates the user/profile/avatar/character/wallet/starter-ledger rows atomically and issues an opaque session cookie.

### `POST /auth/login`

Request:

```json
{ "email": "player@example.com", "password": "A secure password 123" }
```

Invalid credentials return the same generic error regardless of whether the email exists. A successful login creates a new server-side session.

### `POST /auth/logout`

Revokes the current server-side session and clears the cookie. Returns `{ "ok": true }`.

### `GET /auth/me`

Requires a valid session. Returns the current user bundle, including profile, basic avatar, character level and Virtual QAR projection.

### `POST /auth/password-reset/request`

Request:

```json
{ "email": "player@example.com" }
```

Always returns a generic success message to avoid account enumeration. In local development/test only, `RETURN_DEV_RESET_TOKEN=true` adds `devResetToken` so the flow can be exercised without an email provider.

Production mail delivery is an adapter boundary and must deliver a one-time link containing the raw token; only its SHA-256 hash is stored.

### `POST /auth/password-reset/confirm`

Request:

```json
{ "token": "opaque-reset-token", "password": "A new secure password 456" }
```

The server checks expiry and one-time use, updates the password in a transaction, marks the token consumed and revokes all existing sessions for the user.

## Profile and avatar

### `GET /profile`

Requires authentication. Returns the profile, avatar and character projection for the current player.

### `PUT /profile`

Requires authentication.

```json
{ "displayName": "Noor", "bio": "Finding my first chapter." }
```

The request is strict; unknown fields such as `role` are rejected to prevent mass assignment.

### `GET /avatar`

Requires authentication. Returns the basic avatar configuration.

### `PUT /avatar`

Requires authentication.

```json
{
  "presentation": "abaya-inspired",
  "skinTone": "pearl",
  "hairstyle": "soft-waves",
  "hairColor": "chestnut",
  "faceShape": "oval"
}
```

### `PUT /onboarding`

Requires authentication. Completes the first profile/character setup.

```json
{
  "displayName": "Noor",
  "startingRegion": "doha",
  "presentation": "modern-casual",
  "skinTone": "warm-sand",
  "hairstyle": "natural-short"
}
```

## World and realtime presence

### `GET /world/locations`

Requires authentication. Returns the active, configurable playable location catalog, including district, coordinates, opening status, activities and interaction points.

### `GET /world/state`

Requires authentication. Loads or creates the player’s server-side location state and returns the current location, validated position, entry state, sequence and nearby players.

### `GET /world/nearby`

Requires authentication. Returns only active players in the current location room.

### `POST /world/move`

Requires authentication.

```json
{ "x": 53.5, "y": 50, "sequence": 4 }
```

The server validates bounds, maximum movement distance and strictly increasing sequence numbers. Client coordinates are never accepted as authoritative without validation.

### `POST /world/enter`

Requires authentication.

```json
{ "locationId": "souq-lantern-lane" }
```

Sets the server-side location and marks the player as inside the selected location.

### `POST /world/exit`

Requires authentication. Marks the player outside the current location while preserving the current world node.

### WebSocket `/ws/world`

The WebSocket handshake authenticates the same HTTP-only session cookie. Messages are room-scoped and validated server-side:

- `world:move`
- `world:enter`
- `world:exit`
- `world:ping`

Server messages include:

- `world:ready`
- `world:state`
- `world:move_ack`
- `presence:snapshot`
- `world:error`

The current presence adapter is process-local. Redis fan-out is required before horizontal API scaling.

## RBAC

### `GET /admin/me`

Requires authentication and one of the roles stored in `admin_users`:

- `super_admin`
- `admin`
- `moderator`
- `support`
- `business_manager`
- `advertiser_manager`

Normal player sessions receive `403 FORBIDDEN`. `POST /admin/bootstrap` is a one-time, authenticated first-admin claim protected by `ADMIN_BOOTSTRAP_TOKEN`; it is not a seed mechanism. Operational routes cover events, advertisements, reports/moderation, analytics summary and the configurable Sokoni Hub boundary.

## Security and operational rules

- Auth and API writes are rate-limited.
- Mutating requests are checked against `CORS_ORIGINS`; WebSocket upgrades validate the browser `Origin` against the same allowlist.
- Production cross-origin requests use credentialed HTTPS with an HTTP-only `SameSite=None; Secure` session cookie.
- `helmet` applies secure response headers.
- JSON bodies are limited to 20 KB.
- Passwords and reset tokens are never logged or returned in production.
- Structured request logs contain a request ID, method, path, status and duration but no secrets.
- PostgreSQL queries use parameters; profile/avatar payloads are strict Zod objects.
- Session rows contain only a token hash, user ID, expiry and revocation timestamps.
- Password reset tokens are hashed, expire, are one-time use and revoke all sessions after success.

## Implemented life-system groups

All of the following are authenticated, validated server routes rather than placeholder controls:

- `/life/overview`, `/jobs/*`, `/work/*`, `/wallet/transactions`, `/inventory`, `/shops/*`
- `/homes/*`, `/activities/*`, `/passport`
- `/events/*`, `/friends/*`, `/chat/location`, `/notifications/*`
- `/businesses/*`, `/business-products/*`, `/marketplace/*`
- `/ads/*`, `/analytics/events`
- `/admin/events`, `/admin/ads`, `/admin/reports/*`, `/admin/analytics/summary`, `/admin/integrations/sokoni-hub/sync`, `/admin/bootstrap`

Every balance-changing command uses Virtual QAR minor units, server-loaded prices/rewards, an actor-scoped idempotency key, a locked wallet projection and an append-only ledger row. Future real-world integrations must remain outside this ledger.