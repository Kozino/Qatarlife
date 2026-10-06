# Superseded deployment note

This historical Phase 1 note is retained as a pointer only. The deployment target is now the final Supabase PostgreSQL + Render API/WebSocket + Netlify frontend arrangement.

Use [`DEPLOYMENT_SUPABASE_NETLIFY_RENDER.md`](./DEPLOYMENT_SUPABASE_NETLIFY_RENDER.md) for the current release sequence. It uses ordered migrations followed by the guarded, idempotent TypeScript catalog bootstrap. There are no seed files or seed commands.
