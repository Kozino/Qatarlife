# Qatar Life Phase 1 security review

## Controls implemented

- Passwords are hashed server-side with bcryptjs work factor 12.
- Sessions are opaque random tokens; only SHA-256 hashes are stored.
- Session expiry, logout revocation and all-session revocation after password reset are implemented.
- Reset tokens are opaque, hashed, time-limited and one-time use.
- Auth and API endpoints are rate-limited.
- JSON bodies are limited to 20 KB.
- Helmet secure headers are enabled.
- `APP_ORIGIN` protects mutating requests in deployed environments.
- Profile/avatar writes use strict schemas and reject unknown fields.
- Player/admin boundaries are checked server-side using `admin_users` roles.
- Structured logs redact common credential/token fields and do not log request bodies.
- PostgreSQL queries use parameters.
- Production configuration requires database URL, app origin and a 32-character session secret.
- Secrets are read from environment variables and are not shipped to the frontend.

## Tests performed

- Protected route without a session returns 401.
- Normal player access to `/api/admin/me` returns 403.
- Explicit moderator access returns 200.
- Logout invalidates the session.
- Password reset invalidates all existing sessions.
- Reset token replay returns 400.
- Old password fails after reset; new password succeeds.
- Profile mass-assignment field is rejected.

## Deferred security work

These are intentionally part of later phases and must be reviewed before production:

- Production email delivery, email verification and password-reset link signing policy.
- Argon2id password hashing migration decision and rehash-on-login policy.
- Redis-backed distributed rate limits for multiple API instances.
- CSRF token layer for future cross-site integrations.
- WebSocket authentication, room authorization and movement anti-cheat.
- File-upload scanning, image transformations and object-storage policy.
- Account deletion/export workflows and privacy retention automation.
- Fraud/anomaly detection for Virtual QAR and reward systems.
- Dependency and container image scanning in CI.
- External penetration test and PostgreSQL deployment review.
