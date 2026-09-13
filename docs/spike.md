# Phase 0 spike: WebSocket on a Vercel Sandbox port (2026-09-13)

Script: `scripts/spike-sandbox-ws.ts` (`pnpm spike`). Image `vercel/sandbox/universal:latest`, port 3001, persistent.

| Question | Result |
|---|---|
| Does `wss://` to `sandbox.domain(3001)` work from outside? | **Yes.** Handshake + echo succeeded through `https://sb-….vercel.run`. |
| Is the URL stable across `stop()` → `Sandbox.get()`? | **Yes.** Identical domain after resume. |
| Do files survive? | Yes (snapshot restored `spike/` incl. `node_modules`). |
| Do processes survive? | No. Health returned 502 right after `Sandbox.get()`. |
| When does `onResume` fire? | **Lazily**: only when the next command runs, not on `Sandbox.get()` itself. |
| Timings | create ≈ 0.2–0.6 s, resume ≈ 0.1 s (+ server boot). |

Environment facts (universal image): user `ubuntu` (passwordless sudo), `HOME`/cwd = `/vercel` (**not** `/vercel/sandbox`), Node 24.19, `claude` preinstalled at `/usr/local/bin/claude`, 64 GB disk.

Auth: the development OIDC token from `vercel env pull` was rejected (403 `invalidToken`) by the Sandbox API, and the SDK prefers `VERCEL_OIDC_TOKEN` when present. Locally use `VERCEL_TOKEN` + `VERCEL_TEAM_ID` + `VERCEL_PROJECT_ID` (root `.env.local`, gitignored). On Vercel, OIDC is automatic.

Design consequences:
- Transport = WebSocket (no SSE fallback needed).
- `POST /api/sessions/[id]/connect` must: `Sandbox.get()` → HTTP health probe → if down, run the start command (this triggers resume) → poll health → return `{ wsUrl, ticket }`.
- Working directory for repo + agent: `/vercel/work/repo` and `/vercel/work/agent`.
