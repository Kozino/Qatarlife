# Qatar Life

**Live Your Qatar Story**

Qatar Life is an original browser/PWA social virtual-life simulation inspired by Qatar. It is fictional and is not affiliated with the Qatari government or any public service. Virtual QAR, jobs, homes and businesses have no real-world monetary value.

## Production hosting target

- **Frontend:** Netlify serves the Vite/PWA build.
- **API and authenticated WebSocket:** Render runs the Node/TypeScript service.
- **Database:** Supabase PostgreSQL stores durable game state.
- **Optional object storage:** Supabase Storage or another S3-compatible provider through the object-storage adapter boundary.

The browser uses `VITE_API_BASE_URL` and `VITE_WS_URL` for the Render service. The API uses `CORS_ORIGINS`, secure cross-site HTTP-only cookies and a Supabase PostgreSQL URL.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

- Web: Vite on port `5173`
- API: Express on port `8787`
- If `DATABASE_URL` is absent, the app uses a clearly labelled in-memory preview store.
- If PostgreSQL is configured, run `npm run db:migrate` before starting the API.
- `.npmrc` keeps the TypeScript/Vite tooling available when a host sets `NODE_ENV=production` during installation.
- There are intentionally no seed files. With `WORLD_BOOTSTRAP=true`, the Render API idempotently provisions static catalog/configuration rows from typed application definitions after migrations. Player data is never overwritten.

## Commands

```bash
npm test             # validation + integration tests
npm run test:auth    # authentication and RBAC integration tests
npm run build        # type-check + production web build
npm run dev          # web + API in parallel
npm run db:migrate   # apply ordered PostgreSQL migrations
```

## Supabase + Render setup

1. Create a Supabase project and copy its pooled PostgreSQL connection string into Render as `DATABASE_URL`.
2. Set `DATABASE_SSL=require`.
3. Run the Render start command, which applies migrations and then starts the API.
4. Set `APP_ORIGIN` and `CORS_ORIGINS` to the Netlify site origin(s), comma-separated if needed.
5. Set Netlify environment variables:
   - `VITE_API_BASE_URL=https://<your-render-service>.onrender.com`
   - `VITE_WS_URL=wss://<your-render-service>.onrender.com/ws/world`
6. Confirm `/api/health` before enabling the Netlify site.

Do not put Supabase service-role keys, database URLs or session secrets in Netlify variables. The browser needs only the public Render API URL.

The system plan is in `docs/ARCHITECTURE.md`, the API contract in `docs/API.md`, the final implementation record in `docs/FINAL_IMPLEMENTATION.md`, and hosting details in `docs/DEPLOYMENT_SUPABASE_NETLIFY_RENDER.md`.
