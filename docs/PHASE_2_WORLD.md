# Qatar Life — world record (implemented and superseded)

The playable world is now part of the final application rather than a Phase 2-only boundary. The authenticated WebSocket gateway, server-authoritative movement, location entry/exit, room-scoped presence and mobile controls remain implemented in `server/realtime.ts` and `src/components/PlayableWorld.tsx`.

Static world rows are provisioned by `server/bootstrap.ts` from typed `server/world-catalog.ts` definitions when `WORLD_BOOTSTRAP=true`. There is no `database/seed-world.sql`, no seed command and no dependency on seed files.

Current deployment and scaling guidance lives in [`DEPLOYMENT_SUPABASE_NETLIFY_RENDER.md`](./DEPLOYMENT_SUPABASE_NETLIFY_RENDER.md). Presence is process-local until Redis fan-out is added before horizontal API scaling.
