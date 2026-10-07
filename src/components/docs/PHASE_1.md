# Phase 1 — Foundation (implemented)

This historical phase record is superseded by the final implementation. The current product includes the original fictional Qatar-inspired public shell, secure account/session flow, onboarding, PWA assets, PostgreSQL migrations, typed runtime bootstrap and the later life-system phases.

For the current architecture and acceptance boundary, see [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`API.md`](./API.md) and [`DEPLOYMENT_SUPABASE_NETLIFY_RENDER.md`](./DEPLOYMENT_SUPABASE_NETLIFY_RENDER.md).

Static world and catalog data is never loaded from a seed file. It is provisioned from typed TypeScript definitions by `server/bootstrap.ts` only when `WORLD_BOOTSTRAP=true` and never overwrites player-generated records.
