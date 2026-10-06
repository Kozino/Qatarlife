# Qatar Life — foundation record (superseded)

The original foundation notes described an early scaffold and are kept only for historical context. The final implementation no longer uses seed files, seed commands or admin seed scripts.

The maintained source of truth is:

- `server/bootstrap.ts` — guarded, idempotent startup provisioning from typed catalog definitions.
- `database/migrations/` — ordered PostgreSQL schema changes.
- `server/index.ts`, `server/life-store.ts`, `server/social-store.ts` — authenticated server use cases.
- `docs/ARCHITECTURE.md` and `docs/DEPLOYMENT_SUPABASE_NETLIFY_RENDER.md` — current architecture and deployment.

Player data, balances, inventory, homes, social records and ledger history are never overwritten by catalog bootstrap.
