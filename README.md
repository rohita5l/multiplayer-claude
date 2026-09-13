# Multiplayer Claude

Agent-native collaborative code review: a real Claude Code session runs in a cloud sandbox, the author drives it from a chat, and reviewers join by link to watch the transcript, plan, and diff live and leave line comments that Claude then addresses.

## Stack

- **Web**: Next.js 16 (App Router), shadcn/ui (Base UI), Tailwind v4, Geist. Hosted on Vercel.
- **Control plane**: Next.js route handlers + Supabase (email/password + anonymous auth, Postgres with RLS, Realtime for comments and presence).
- **Sessions**: one persistent **Vercel Sandbox** per session, booted from a prebuilt snapshot, running `packages/agent-server` (Node + `@anthropic-ai/claude-agent-sdk`). Browsers connect to it directly over WebSocket.

```
apps/web                 Next.js app (UI + API routes)
packages/protocol        shared WebSocket protocol + ticket signing
packages/agent-server    the server that runs inside each sandbox
scripts/build-snapshot   builds the sandbox snapshot (repo cloned + deps + SDK)
scripts/spike-sandbox-ws Phase-0 spike (see docs/spike.md)
supabase/                config + migrations
```

## Local development

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # fill in Supabase keys, APP_ENCRYPTION_KEY, SANDBOX_SNAPSHOT_ID
# Sandboxes from localhost need VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID in apps/web/.env.local
pnpm dev                                        # http://localhost:3000
```

- Schema: `supabase db push` (linked project) — migrations live in `supabase/migrations`.
- Snapshot: `pnpm snapshot:build` prints a `SANDBOX_SNAPSHOT_ID`. Rebuild when the demo repo or SDK should be refreshed.
- Agent server only: `pnpm --filter agent-server build`, then run `dist/agent-server.mjs` with `REPO_DIR`, `SESSION_ID`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`.

## Demo script

1. Sign up → paste an Anthropic API key on **Connect Claude** (validated, stored encrypted).
2. **New session** (repo defaults to `vercel/shop`). The sandbox boots from the snapshot in a few seconds.
3. Ask: *“Add a ‘Free shipping on orders over $50’ banner to the product page in apps/template.”* Watch tool calls, file changes and the Diff tab update live.
4. **Share** → open the link in an incognito window, join with a name (no account), click a line in the diff and comment.
5. Back as the owner: **Address N open comments** → Claude fixes them and the comments flip to *addressed*.
6. Close the tab, reopen the session later: the sandbox resumes and the transcript rehydrates from the saved Claude session id.

## How it works

- `POST /api/sessions` creates the row + sandbox, writes the agent bundle in, starts it with the owner's decrypted key, and stores the public URL.
- `POST /api/sessions/[id]/connect` resumes the sandbox if needed (health-check → restart with `CLAUDE_SESSION_ID` so the SDK `resume`s) and mints a short-lived HMAC ticket; the browser opens `wss://…vercel.run/ws?ticket=…`.
- The agent server holds one `query()` with an async input queue, broadcasts every SDK message, runs `git diff` after each edit, and reports the Claude session id back for later resume.
- Comments live in Postgres (RLS: session members) and stream to everyone via Realtime; “Address comments” composes one user turn listing `file:line — comment`.
