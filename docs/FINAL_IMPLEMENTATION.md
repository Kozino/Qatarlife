# Qatar Life — final planned-phase implementation record

## Architecture decision

The product keeps a thin React/Vite PWA client, a Node/Express REST and authenticated WebSocket service, and PostgreSQL as the authority for identity, world state, progression, Virtual QAR and social records. Store interfaces keep the in-memory preview path available without making it a production mode. Netlify talks to Render through credentialed HTTPS and WSS; Render talks to Supabase PostgreSQL.

Static world and catalog data is defined in typed TypeScript and applied by `server/bootstrap.ts` only when `WORLD_BOOTSTRAP=true`. The bootstrap uses slug-based upserts, is safe to repeat, and does not reset player balances, inventory, ownership, social records or mutable product stock. No seed files or seed commands are used.

## Delivered phases

- **Phase 1:** fictional Qatar-inspired product boundary, PWA shell, authentication, onboarding, profile/avatar, sessions and RBAC.
- **Phase 2:** original playable world, server-validated movement, location entry/exit, nearby presence and room-scoped authenticated WebSocket.
- **Phase 3:** jobs, work sessions, energy/experience, shops, inventory, homes and immutable Virtual QAR ledger.
- **Phase 4:** location-aware activities, cooldowns, rewards, durable passport achievements and events with capacity/waitlist handling.
- **Phase 5:** resident businesses and offers, atomic business orders, player marketplace transfers, advertisement retrieval and telemetry, plus the configurable Sokoni Hub boundary.
- **Phase 6:** notifications, analytics summary, reports/moderation, audit/RBAC paths, one-time admin bootstrap, access hardening and actor-scoped idempotency.
- **Phase 7 boundary:** any future legitimate external commerce is isolated behind configuration and kept outside Virtual QAR; no real payments or real-world value are created by the current product.

## Frontend integration

`src/components/LifeSystems.tsx` is mounted in `src/App.tsx` and provides responsive server-backed panels for life overview, jobs, shops/inventory, homes, activities, events, social/chat, businesses/offers, marketplace and notifications. Passport progress is loaded from `/api/passport`; hardcoded progress counters were removed. Mobile navigation and compact layouts are included in `src/styles.css`.

## Database changes

- `database/schema.sql` is the current full snapshot.
- `database/migrations/0001`–`0004` establish identity, world and life/social tables.
- `database/migrations/0005_idempotency_and_integrity.sql` adds actor-scoped idempotency indexes, the business-order idempotency key, access-path indexes and the wallet reference constraint for already-provisioned PostgreSQL/Supabase databases.
- The ledger remains append-only through the database trigger. Balance-changing commands lock the wallet projection and write the ledger in the same transaction; purchase/activity response metadata is inserted with the ledger row rather than updated afterward. Business and marketplace transfers lock both wallets in deterministic order.
- Passport progress is computed from durable onboarding, movement, work, housing, activity, friendship and ledger records, with typed achievement targets rather than fabricated UI counters.

## Deployment

- Render runs `npm run db:migrate && npm start` and keeps `DATABASE_URL`, session secrets, bootstrap token and integration credentials in environment variables.
- `WORLD_BOOTSTRAP=true` is configured in `render.yaml` and must remain an explicit deployment setting.
- `CORS_ORIGINS` controls credentialed Netlify requests and WebSocket `Origin` validation; API preflight requests return a 204 response. Production cookies are HTTP-only, secure and `SameSite=None`.
- Netlify uses `VITE_API_BASE_URL` and `VITE_WS_URL`; `netlify.toml` provides SPA fallback routing.

## Verification

- `npm run build` passes TypeScript checking and the Vite production build.
- `npm test -- --run` passes all 6 Vitest files and 22 tests.
- `npx vitest run server/social.integration.test.ts` passes 2 tests, including request-ID-backed friend acceptance and repeated business/marketplace idempotency.
- A real Supabase/PostgreSQL migration/bootstrap run is the remaining environment-specific validation; no production credentials are present in the workspace.

The remaining scale boundary is documented rather than hidden: process-local realtime presence needs Redis fan-out before horizontal Render instances; production load, disaster recovery, mail delivery and object-storage adapters still require environment-specific operational work.
