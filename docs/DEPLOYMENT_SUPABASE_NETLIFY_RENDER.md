# Qatar Life deployment: Supabase, Netlify and Render

## Responsibilities

| Service | Responsibility |
| --- | --- |
| Supabase PostgreSQL | Durable users, profiles, world state, Virtual QAR ledger, jobs, inventory, homes, social and operations data |
| Render web service | Node/TypeScript REST API, authenticated WebSocket world gateway, migrations and catalog bootstrap |
| Netlify | Vite production bundle, PWA assets and client-side routing |

Qatar Life remains a fictional product. Supabase, Netlify and Render are infrastructure providers, not product affiliations.

## Supabase

1. Create a Supabase project.
2. Copy the pooled PostgreSQL connection string from the database connection panel.
3. Store it only as Render `DATABASE_URL`.
4. Use `DATABASE_SSL=require`.
5. Do not expose a Supabase service-role key in the browser. The current API uses the PostgreSQL connection through Render and keeps all authority on the server.

The Render start command runs:

```text
npm run db:migrate && npm start
```

Migrations create the schema, including the idempotency and access-integrity hardening in `0005_idempotency_and_integrity.sql`. There are no seed files. With `WORLD_BOOTSTRAP=true`, the API idempotently writes only static catalog/configuration rows from typed definitions in `server/life-catalog.ts` and `server/world-catalog.ts`. It never overwrites player balances, inventory, homes or social records.

## Render

Create the service from `render.yaml`, or configure manually:

- Runtime: Node
- Build: `npm ci --include=dev && npm run build`
- Start: `npm run db:migrate && npm start`

The repository includes `.npmrc` with `include=dev` because the build needs TypeScript/Vite type tooling and the current Render start command uses `tsx`. If configuring Render manually, use the explicit `--include=dev` flag rather than a production-only `npm install`.
- Health: `/api/health`
- Bind address: `0.0.0.0` through the application

Required environment variables:

```text
NODE_ENV=production
DATABASE_URL=<Supabase pooled PostgreSQL URL>
DATABASE_SSL=require
APP_ORIGIN=https://<your-netlify-site>.netlify.app
CORS_ORIGINS=https://<your-netlify-site>.netlify.app
SESSION_SECRET=<at least 32 random characters>
WORLD_BOOTSTRAP=true
RETURN_DEV_RESET_TOKEN=false
```

For a custom domain, use the final browser origin in `APP_ORIGIN`, `CORS_ORIGINS` and Netlify’s public URL configuration. If multiple browser origins are temporarily needed, comma-separate them in `CORS_ORIGINS`.

Render must support WebSocket upgrades on the same service. Do not put the world WebSocket behind a short-lived serverless function. The server validates the browser `Origin` on `/ws/world` against `CORS_ORIGINS`, authenticates the HTTP-only session cookie during the upgrade, and closes unauthenticated or unapproved upgrades.

## Netlify

Set:

```text
VITE_API_BASE_URL=https://<your-render-service>.onrender.com
VITE_WS_URL=wss://<your-render-service>.onrender.com/ws/world
```

Build settings are already in `netlify.toml`:

```text
Build command: npm ci --include=dev && npm run build
Publish directory: dist
```

The Netlify site makes credentialed requests to Render. The API sets an HTTP-only secure cookie with `SameSite=None` for the cross-origin deployment.

## Verification checklist

1. Render logs show migrations complete and `runtime_catalog_bootstrapped`.
2. `GET https://<render>/api/health` returns `mode: postgres`.
3. Netlify signup completes and the browser receives no exposed token.
4. Onboarding loads the catalog and enters the world.
5. Browser movement receives WebSocket acknowledgements.
6. A second browser account sees room-scoped presence only.
7. A reconnect preserves the server-side location and inside/outside state.
8. Virtual QAR displays only from server responses and every balance-changing action has an immutable ledger row.
9. Production logs contain no passwords, reset tokens, database URLs or service-role keys.

## Operational notes

- Use Supabase connection pooling and keep Render `DB_POOL_MAX` conservative.
- Before horizontal scaling, add Redis-backed realtime fan-out; the current world presence adapter is process-local.
- Keep Supabase Storage or another object store behind an API adapter. Never accept arbitrary client object keys without authorization.
- Use separate Supabase projects or databases for development, staging and production.
