# Qatar Life — product and system architecture

## 0. Product boundary

Qatar Life is an original, fictional social virtual-life simulation. It is inspired by the atmosphere, geography and cultural variety of Qatar, but it is **not** a government service, a public-service portal, a property or jobs marketplace, a financial product, or an official representation of Qatar. Every balance, job, home, business and reward is simulated and has no real-world monetary value.

Real place names may be used as cultural/geographical inspiration. Maps, characters, illustrations and UI are original. Licensed brands can be connected later through an adapter; no unlicensed logos, photographs or government marks are used.

## 1. Product architecture

### Experience surfaces

1. **Public shell** — the brand, safety boundary, world preview and onboarding entry point.
2. **Life hub** — the authenticated mobile-first home for the player’s current district, Virtual QAR, passport progress and next actions.
3. **World client** — a lightweight 2D/2.5D renderer and interaction layer. Phase 2 now provides the first playable map, server-authoritative movement, location entry/exit and room-scoped presence.
4. **Social surfaces** — location chat, direct messages, friends, groups and notifications.
5. **Progression surfaces** — jobs, work sessions, activities, achievements and Qatar Life Passport.
6. **Creator/business surfaces** — virtual businesses, marketplace discovery and future external-commerce offers.
7. **Operations console** — separate role-gated admin/moderation/analytics tooling, never the primary player UX.

### Product principles encoded in the design

- Fictional systems are labelled as **Virtual QAR**, **simulated**, or **fictional world**.
- The server is authoritative for identity, location, rewards and the economy.
- No client-provided balance, reward, price or movement is trusted.
- Realtime is selective: presence and chat are room-scoped; durable state remains REST/API + PostgreSQL.
- Player privacy is the default. Email and private account data are never exposed in player-facing discovery.
- The initial client is installable as a PWA and works on low-bandwidth mobile devices.

## 2. System architecture

```text
                     +---------------------------+
                     |  Browser / PWA             |
                     |  React + TypeScript        |
                     |  2D world client           |
                     +-------------+-------------+
                                   |
                 HTTPS REST        |        WSS (world gateway)
                                   v
+----------------------+    +------+----------------------+
| CDN / edge           |--->| Node.js API                 |
| static assets        |    | auth, validation, RBAC      |
+----------------------+    | economy, social, game rules|
                             +------+----------+-----------+
                                    |          |
                              +-----v----+ +---v----------------+
                              | Postgres | | Realtime gateway   |
                              | durable  | | Redis adapter later|
                              | state    | | room fan-out       |
                              +----------+ +--------------------+
                                    |
                         +----------v----------+
                         | Object storage      |
                         | avatar/media        |
                         +---------------------+

          +-----------------+  +------------------+  +------------------+
          | telemetry/OTel  |  | queue/worker     |  | admin console    |
          | product events  |  | jobs, analytics  |  | RBAC + audit     |
          +-----------------+  +------------------+  +------------------+
```

### Technology choices

- **Frontend:** React 18 + TypeScript + Vite. A tokenized CSS component layer is used in Phase 1 to keep the initial bundle small and make the brand system explicit; utility classes can be introduced later without changing feature boundaries.
- **Backend:** Node.js + TypeScript + Express in Phase 1. The API is kept framework-neutral behind service/store boundaries so Fastify can be adopted if load testing shows a material benefit.
- **Database:** PostgreSQL, accessed through parameterized queries in the initial adapter. PostgreSQL is the source of truth for accounts, profiles, world state and the immutable economy ledger.
- **Realtime:** WebSocket gateway with room-scoped subscriptions. Redis Pub/Sub or a managed realtime layer is added when more than one API instance is deployed.
- **Validation:** Zod at every public API boundary; database constraints are a second line of defence.
- **Authentication:** bcryptjs with a work factor of 12 in the runnable Phase 1 foundation. The session boundary is an opaque HTTP-only, same-site cookie; only a SHA-256 token hash is stored in PostgreSQL, with expiry and revocation support. An Argon2id migration remains a production-hardening option before launch.
- **Storage:** S3-compatible object-storage interface for avatars and user content. No file upload is exposed in Phase 1.
- **Deployment:** static web assets behind a CDN; stateless API containers; managed PostgreSQL; managed Redis once horizontal realtime fan-out is enabled.

### Environments

- `development`: local Vite + API, preview-memory store when `DATABASE_URL` is absent.
- `staging`: isolated database, storage bucket, secrets, realtime namespace and moderation data.
- `production`: managed database with PITR backups, private networking, WAF/rate limits, secret manager and alerting.

The memory store is intentionally labelled in the API health response and is not a production deployment mode.

## 3. Folder structure

```text
qatar-life/
├── database/
│   ├── schema.sql                 # normalized PostgreSQL schema + ledger guard
│   └── migrations/                # ordered schema changes, including later integrity hardening
├── docs/
│   ├── ARCHITECTURE.md            # this document
│   ├── API.md                     # HTTP contract and error model
│   └── DEPLOYMENT_SUPABASE_NETLIFY_RENDER.md
├── public/
│   ├── icon.svg
│   ├── manifest.webmanifest
│   └── sw.js
├── server/
│   ├── db.ts                      # store interface, preview store, PostgreSQL adapter
│   ├── bootstrap.ts               # guarded idempotent typed catalog bootstrap
│   ├── life-catalog.ts             # static jobs, shops, homes, activities and achievements
│   ├── life-store.ts               # progression, economy and immutable-ledger commands
│   ├── social-store.ts             # social, events, businesses, marketplace and operations
│   ├── index.ts                   # HTTP server, middleware and API routes
│   ├── realtime.ts                # authenticated room-scoped WebSocket gateway
│   ├── validation.ts              # public request schemas
│   └── *.integration.test.ts      # auth, world, life and social acceptance tests
├── src/
│   ├── components/
│   │   ├── AuthDialog.tsx
│   │   ├── Brand.tsx
│   │   ├── Onboarding.tsx
│   │   ├── PassportPanel.tsx
│   │   └── WorldMap.tsx
│   ├── lib/api.ts                 # typed browser API client
│   ├── App.tsx                    # public shell, auth routing and life hub
│   ├── main.tsx
│   ├── styles.css
│   └── types.ts
├── .env.example
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## 4. Database architecture

PostgreSQL is normalized around identity, world state, social state, progression and immutable financial events. IDs are UUIDs; timestamps are UTC `timestamptz`; money is stored as integer minor units (`Virtual QAR` cents) to avoid floating-point errors.

The required tables are present in `database/schema.sql`: `users`, `profiles`, `avatars`, `characters`, `world_regions`, `locations`, `player_locations`, `player_sessions`, `jobs`, `job_levels`, `player_jobs`, `work_sessions`, `wallets`, `wallet_transactions`, `items`, `inventory`, `shops`, `products`, `homes`, `home_ownership`, `vehicles`, `friends`, `friend_requests`, `relationships`, `messages`, `chat_rooms`, `chat_messages`, `businesses`, `business_products`, `business_orders`, `events`, `event_attendees`, `advertisements`, `ad_impressions`, `ad_clicks`, `achievements`, `player_achievements`, `notifications`, `reports`, `moderation_actions`, `admin_users`, `audit_logs`, and `analytics_events`.

### Economy invariant

A wallet balance is a cached projection. The ledger is append-only. Every credit/debit is written in the same database transaction as the projection update, with an idempotency key and a non-negative balance constraint. The database trigger rejects ledger updates/deletes. Future services must use a single ledger command, never `UPDATE wallets` directly.

### Data lifecycle

- Account deletion marks the account for deletion, revokes sessions, anonymizes player-facing content where required, and removes object-storage content through a worker.
- Analytics events use a generated player/session key and avoid collecting unnecessary personal data.
- Chat retention and moderation retention are policy-configurable; audit records are retained longer than ordinary chat content.

## 5. API specification

The Phase 1 contract is documented in `docs/API.md` and implemented in `server/index.ts`:

- `GET /api/health`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `PUT /api/onboarding`

All JSON writes are validated, rate-limited where appropriate, return generic auth errors, and use a consistent `{ error: { code, message, fields? } }` shape on failure. The API now covers authenticated world movement, Virtual QAR progression, jobs, inventory, homes, activities, passport, events, friends, room chat, businesses, marketplace, advertising, notifications, analytics and guarded operations routes.

## 6. Authentication and authorization

1. Signup validates email/password policy, normalizes the email, hashes the password, creates the profile/character/wallet atomically and issues an HTTP-only cookie.
2. Login uses a generic error for unknown email or wrong password, applies an auth rate limit and issues the same cookie.
3. The cookie is `httpOnly`, `sameSite=lax` locally and `SameSite=None` with `secure` in staging/production for the Netlify-to-Render deployment, and expires in seven days. `CORS_ORIGINS` enables strict Origin checks for mutating requests and WebSocket upgrades.
4. API handlers load the user from a verified token and apply resource ownership/RBAC checks. The client never receives a password hash or secret.
5. Phase 1 now uses a server-side session table and password reset tokens. Phase 3+ can add refresh-token rotation, email verification, OAuth providers and WebAuthn-ready account linking.
6. Admin permissions use `admin_users.role` and an explicit policy map. Moderation actions and sensitive configuration writes always create audit events.

## 7. Realtime architecture

The world is divided into location rooms. A player subscribes only to the current location and an optional party/friend room. The server validates movement against a navigation graph and broadcasts a throttled snapshot (not every pointer event). Chat goes through a message service that applies membership, rate, length, spam and moderation checks before fan-out. Durable chat messages are stored in PostgreSQL; ephemeral presence is stored in Redis with TTL when scaled horizontally.

```text
client input -> WSS gateway -> auth + room membership -> game rules
                                      |                 |
                                      v                 v
                                Postgres event     room broadcast
```

## 8. World/map architecture

`world_districts` are broad cultural/geographical zones provisioned for the playable slice: Doha, Souq district, Corniche, Msheireb, West Bay, Katara, The Pearl, Lusail, Desert and Beach. `locations` are playable nodes such as a lantern lane, corniche promenade, pearl marina, desert camp and story-driven community spaces. Static rows come from typed definitions through the `WORLD_BOOTSTRAP`-guarded startup bootstrap; there are no seed files.

Phase 2 renders an original lightweight 2D/2.5D scene from the location catalog and validates movement within server bounds. A location has a safe display name, coordinates, opening status, activity tags and interaction points. A future navigation graph, richer scenes and capacity rules can consume the same location and interaction contracts without changing identity, economy or social services.

## 9. Economy architecture

- The currency label in every player-facing surface is **Virtual QAR**.
- A player starts with a configurable seed balance (Phase 1 default: 5,000.00 Virtual QAR).
- Commands such as `startWork`, `payRent`, `buyItem` and `completeActivity` are server-side use cases.
- A command accepts an idempotency key; the service locks the wallet row, verifies requirements, appends a ledger record, updates the projection and emits a non-sensitive analytics event in one transaction.
- No reward is accepted from the client. Prices, cooldowns, energy, job duration and location are loaded from server configuration/data.
- Economy dashboards consume ledger facts, not mutable client state.

## 10. Development roadmap

### Phase 1 — Foundation and first life (implemented)

- Original visual identity, landing page, PWA shell and fictional-world boundary.
- Secure email/password signup/login/logout, profile, character, district selection and starter Virtual QAR wallet.
- PostgreSQL schema, migrations, validation, session security and API contract.

### Phase 2 — World movement and presence (implemented)

- Server-authoritative playable location catalog and validated movement.
- Authenticated WebSocket world room, nearby-player presence, location entry/exit and mobile/desktop controls.
- Netlify-to-Render REST/WebSocket configuration with secure cross-origin cookies and origin checks.

### Phase 3 — Jobs, inventory and housing (implemented)

- Typed, bootstrapped jobs/job levels, work sessions, energy, cooldowns, shops, items, inventory and ledger history.
- Rental/ownership rules for homes and server-authoritative Virtual QAR commands.

### Phase 4 — Activities, passport and events (implemented)

- Location-aware activities, cooldowns, rewards, achievement progress and server-backed passport UI.
- Published events, registration, capacity/waitlist handling and notifications.

### Phase 5 — Businesses, marketplace and advertising (implemented)

- Player businesses, products/services, atomic Virtual QAR orders, marketplace listings/transfers and advertisement telemetry.
- Configurable Sokoni Hub adapter boundary; disabled unless explicitly configured and never connected to real payments.

### Phase 6 — Operations, scale and trust (implemented foundation)

- Admin RBAC, one-time token-protected bootstrap, moderation reports/actions, audit records, analytics summary and notification read state.
- Idempotency/integrity migration, immutable ledger trigger, rate limits and authenticated WebSocket room boundary.
- Redis fan-out, queues, object-storage production adapter, load testing and disaster-recovery exercises remain operational scaling work before a high-volume launch.

### Phase 7 — Optional real-world integrations (boundary implemented)

External offers can only be added after legal, safety, privacy, licensing and payment reviews. The Sokoni Hub adapter is generic/configurable, clearly fictional-world scoped, and keeps any future legitimate transaction outside the Virtual QAR ledger.

## 11. Definition of done for a feature

A feature is not considered complete until it has a user-facing state, backend use case, database change or explicit no-storage decision, input validation, authorization, error/loading/empty states, rate/abuse controls where relevant, telemetry that avoids unnecessary personal data, and appropriate tests. Buttons that are not connected to a real flow are not shipped; planned modules appear as roadmap copy instead.
