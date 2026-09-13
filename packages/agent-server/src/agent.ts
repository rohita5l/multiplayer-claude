import { randomUUID } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { query, getSessionMessages, type Options, type PermissionMode as SDKPermissionMode, type Query, type SDKMessage, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentEvent, AgentState, Effort, PermissionMode, ReviewComment } from "@mpc/protocol";

export interface AgentHost {
  broadcast(event: AgentEvent): void;
  onState(state: AgentState): void;
  onPlan(text: string): void;
  onSummary(summary: { text: string; costUsd?: number; numTurns?: number }): void;
  onToolDone(toolName: string, input: unknown): void;
  onSessionId(id: string): void;
  onCommentsDone(ids: string[]): void;
  log(...args: unknown[]): void;
}

/** Async queue that feeds user turns into a single long-lived `query()` call. */
class InputQueue implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = [];
  private waiters: ((v: IteratorResult<SDKUserMessage>) => void)[] = [];
  private closed = false;
  push(m: SDKUserMessage) {
    const w = this.waiters.shift();
    if (w) w({ value: m, done: false });
    else this.items.push(m);
  }
  close() {
    this.closed = true;
    for (const w of this.waiters.splice(0)) w({ value: undefined as never, done: true });
  }
  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const item = this.items.shift();
        if (item) return Promise.resolve({ value: item, done: false });
        if (this.closed) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((res) => this.waiters.push(res));
      },
    };
  }
}

export class AgentSession {
  readonly history: AgentEvent[] = [];
  state: AgentState = "starting";
  mode: PermissionMode;
  claudeSessionId: string | null;
  private queue = new InputQueue();
  private q: Query | null = null;
  private abort = new AbortController();
  private runPromise: Promise<void> | null = null;
  private lastAssistantText = "";
  private lastSent: { text: string; at: number } | null = null;
  private lastPlanFile: string | null = null;
  private pendingCommentIds: string[] = [];
  model = process.env.AGENT_MODEL || "claude-sonnet-5";
  effort: Effort = (process.env.AGENT_EFFORT as Effort) || "medium";

  constructor(
    private readonly repoDir: string,
    private readonly host: AgentHost,
    opts: { resume?: string | null; mode?: PermissionMode; historyLimit?: number },
  ) {
    this.claudeSessionId = opts.resume ?? null;
    this.mode = opts.mode ?? "bypassPermissions";
  }

  /** Rehydrate prior transcript from the on-disk JSONL when resuming. */
  async loadHistory() {
    if (!this.claudeSessionId) return;
    try {
      const msgs = await getSessionMessages(this.claudeSessionId, { dir: this.repoDir });
      for (const m of msgs) {
        this.history.push({ type: m.type, uuid: m.uuid, session_id: m.session_id, message: m.message, parent_tool_use_id: m.parent_tool_use_id, replayed: true });
      }
      this.host.log(`rehydrated ${msgs.length} messages from session ${this.claudeSessionId}`);
    } catch (e) {
      this.host.log("history load failed", e);
    }
  }

  start() {
    if (this.runPromise) return;
    this.runPromise = this.run().catch((e) => {
      this.host.log("agent loop crashed", e);
      this.setState("error");
      this.host.broadcast({ type: "error", message: String(e?.message ?? e) });
    });
  }

  private setState(s: AgentState) {
    if (this.state === s) return;
    this.state = s;
    this.host.onState(s);
  }

  private options(): Options {
    const sdkMode: SDKPermissionMode = this.mode;
    return {
      cwd: this.repoDir,
      // Fast model for a snappy demo; override with AGENT_MODEL / AGENT_EFFORT.
      model: this.model,
      effort: this.effort,
      permissionMode: sdkMode,
      allowDangerouslySkipPermissions: true,
      includePartialMessages: true,
      resume: this.claudeSessionId ?? undefined,
      settingSources: ["project"], // load the repo's CLAUDE.md, nothing from the sandbox user
      abortController: this.abort,
      // In plan mode Claude ends its planning turn by calling ExitPlanMode. We capture the plan,
      // show it to the team, and tell Claude to stop; the owner approves from the UI.
      canUseTool: async (toolName, input) => {
        if (toolName === "ExitPlanMode") {
          const plan = await this.readPlan((input as { plan?: string })?.plan);
          if (plan) this.host.onPlan(plan);
          // End the turn now so Claude doesn't retry ExitPlanMode or narrate; the owner approves from the UI.
          setTimeout(() => void this.interrupt(), 100);
          return { behavior: "deny", message: "The plan has been shared with the team for review. Stop here and wait for approval before implementing anything." };
        }
        return { behavior: "allow", updatedInput: input };
      },
      stderr: (d) => this.host.log("[claude]", d.trimEnd()),
      systemPrompt: {
        type: "preset",
        preset: "claude_code",
        append:
          "You are running inside a shared, live code-review session: the author and reviewers watch your transcript and file changes in real time. " +
          "Be fast and focused: prefer reading the one or two files you need over broad exploration, and do not spawn subagents. " +
          "Keep progress notes to one short sentence. " +
          "When asked to plan first: read only what is necessary, write a concise plan (a short title, then at most 6 bullets covering what changes, in which file, and how to verify), then call ExitPlanMode and stop. " +
          "When asked to address review comments, handle each comment, and finish with a brief summary listing what changed per comment.",
      },
      // Single-file demo edits don't need subagents; they add 20-40s of exploration.
      disallowedTools: ["Agent", "Task"],
      hooks: {
        PostToolUse: [
          {
            matcher: "Edit|Write|MultiEdit|NotebookEdit|Bash",
            hooks: [
              async (input) => {
                if (input.hook_event_name === "PostToolUse") {
                  const fp = (input.tool_input as { file_path?: string } | undefined)?.file_path;
                  if (fp && /[\/]\.claude[\/]plans[\/]/.test(fp)) this.lastPlanFile = fp; // Claude Code writes plans here in plan mode
                  this.host.onToolDone(input.tool_name, input.tool_input);
                }
                return {};
              },
            ],
          },
        ],
      },
    };
  }

  private async run() {
    this.q = query({ prompt: this.queue, options: this.options() });
    this.setState("idle");
    for await (const msg of this.q) {
      this.handle(msg);
    }
    this.setState("idle");
  }

  private handle(msg: SDKMessage) {
    const ev = msg as unknown as AgentEvent;
    // The SDK may echo the user turn we just injected; we already broadcast it ourselves in send().
    if (msg.type === "user" && this.lastSent && Date.now() - this.lastSent.at < 15_000) {
      const c = (msg as { message?: { content?: unknown } }).message?.content;
      const text = typeof c === "string" ? c : Array.isArray(c) ? (c as { type: string; text?: string }[]).filter((b) => b.type === "text").map((b) => b.text).join("\n") : "";
      if (text && text === this.lastSent.text) return;
    }
    // keep history compact: don't store token-level stream events
    if (msg.type !== "stream_event") this.history.push(ev);
    this.host.broadcast(ev);

    switch (msg.type) {
      case "system":
        if (msg.subtype === "init" && msg.session_id && msg.session_id !== this.claudeSessionId) {
          this.claudeSessionId = msg.session_id;
          this.host.onSessionId(msg.session_id);
        }
        break;
      case "assistant": {
        this.setState("running");
        const content = (msg.message as { content?: unknown[] })?.content ?? [];
        for (const block of content as Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>) {
          if (block.type === "text" && block.text) this.lastAssistantText = block.text;
          if (block.type === "tool_use" && block.name === "ExitPlanMode") {
            const plan = String(block.input?.plan ?? this.lastAssistantText ?? "");
            if (plan) this.host.onPlan(plan);
          }
        }
        break;
      }
      case "result": {
        const r = msg as { result?: string; total_cost_usd?: number; num_turns?: number; subtype: string };
        // (plans are only surfaced via ExitPlanMode, see canUseTool — end-of-turn text is not a plan)
        this.host.onSummary({ text: r.result ?? this.lastAssistantText ?? "", costUsd: r.total_cost_usd, numTurns: r.num_turns });
        if (this.pendingCommentIds.length && !(r.subtype ?? "").startsWith("error")) {
          this.host.onCommentsDone(this.pendingCommentIds);
          this.pendingCommentIds = [];
        }
        this.setState("idle");
        break;
      }
      default:
        break;
    }
  }

  /** On (re)start: surface the most recent plan Claude wrote in this sandbox, if any. */
  async restorePlan(): Promise<{ text: string; at: number } | null> {
    try {
      const dir = join(process.env.CLAUDE_CONFIG_DIR ?? join(process.env.HOME ?? "/vercel", ".claude"), "plans");
      const files = await readdir(dir);
      const withTime = await Promise.all(files.filter((f) => f.endsWith(".md")).map(async (f) => ({ f: join(dir, f), t: (await stat(join(dir, f))).mtimeMs })));
      withTime.sort((a, b) => b.t - a.t);
      if (!withTime[0]) return null;
      const text = (await readFile(withTime[0].f, "utf8")).trim();
      if (text.length < 40) return null;
      this.lastPlanFile = withTime[0].f;
      return { text, at: withTime[0].t };
    } catch {
      return null;
    }
  }

  /** Plan text: the plan file Claude wrote (preferred), else the ExitPlanMode input, else the last assistant text. */
  private async readPlan(inputPlan?: string): Promise<string> {
    const candidates: string[] = [];
    if (this.lastPlanFile) candidates.push(this.lastPlanFile);
    try {
      const dir = join(process.env.CLAUDE_CONFIG_DIR ?? join(process.env.HOME ?? "/vercel", ".claude"), "plans");
      const files = await readdir(dir);
      const withTime = await Promise.all(files.filter((f) => f.endsWith(".md")).map(async (f) => ({ f: join(dir, f), t: (await stat(join(dir, f))).mtimeMs })));
      withTime.sort((a, b) => b.t - a.t);
      if (withTime[0] && Date.now() - withTime[0].t < 30 * 60_000) candidates.push(withTime[0].f);
    } catch {}
    for (const c of candidates) {
      try {
        const txt = (await readFile(c, "utf8")).trim();
        if (txt.length > 40) return txt;
      } catch {}
    }
    const fallback = (inputPlan ?? "").trim();
    return fallback.length > 40 ? fallback : this.lastAssistantText || fallback;
  }

  async send(text: string, from: { userId: string; name: string; role?: string }, opts: { planFirst?: boolean } = {}) {
    if (this.state === "error") throw new Error("agent is in error state");
    // "plan first" in the message -> plan mode for this turn; the owner approves from the Plan card.
    const wantsPlan = opts.planFirst || /\b(plan (first|it|this|before)|(make|write|create|propose|draft|give me) (a |the )?plan)\b/i.test(text);
    if (wantsPlan && this.mode !== "plan") await this.setMode("plan");
    this.setState("running");
    // Broadcast + record the user turn ourselves so every client (and reconnecting clients) sees it with the sender's name.
    const ev: AgentEvent = { type: "user", uuid: randomUUID(), session_id: this.claudeSessionId ?? undefined, message: { role: "user", content: text }, parent_tool_use_id: null, from: { userId: from.userId, name: from.name } };
    this.history.push(ev);
    this.host.broadcast(ev);
    // Claude sees who is speaking (the session is shared by an author and reviewers).
    const forClaude = from.userId === "system" ? text : `[${from.name}${from.role ? ` — ${from.role}` : ""}]: ${text}`;
    this.lastSent = { text: forClaude, at: Date.now() };
    this.queue.push({
      type: "user",
      message: { role: "user", content: forClaude },
      parent_tool_use_id: null,
      origin: { kind: "human" } as never,
    } as SDKUserMessage);
    this.host.log(`user(${from.name}): ${text.slice(0, 80)}`);
  }

  sendReviewComments(comments: ReviewComment[], from: { userId: string; name: string; role?: string }, userText?: string) {
    const lines = comments.map((c, i) => `${i + 1}. \`${c.filePath}\` line${c.lineEnd !== c.lineStart ? `s ${c.lineStart}-${c.lineEnd}` : ` ${c.lineStart}`} (${c.authorName}): ${c.body}`);
    const intro = userText?.trim() ? `${userText.trim()}\n\nHere are the open review comments from the session:` : "Please address the following review comments.";
    const text = `${intro}\n\n${lines.join("\n")}\n\nFor each comment, make the change (or explain why not), then finish with a short summary per comment.`;
    this.pendingCommentIds = comments.map((c) => c.id);
    void this.send(text, from);
  }

  async interrupt() {
    await this.q?.interrupt();
  }

  async setModel(model: string) {
    this.model = model;
    await this.q?.setModel(model);
  }

  /** Effort can't change on a live query: restart the loop (resuming the same Claude session). Only when idle. */
  async setEffort(effort: Effort) {
    if (this.state === "running") throw new Error("Wait for Claude to finish the current turn before changing effort.");
    this.effort = effort;
    await this.restartLoop();
  }

  private async restartLoop() {
    this.queue.close();
    this.abort.abort();
    await this.runPromise?.catch(() => {});
    this.queue = new InputQueue();
    this.abort = new AbortController();
    this.runPromise = null;
    this.start();
  }

  async setMode(mode: PermissionMode) {
    this.mode = mode;
    await this.q?.setPermissionMode(mode);
  }

  async approvePlan() {
    await this.setMode("bypassPermissions");
    await this.send("The plan is approved. Go ahead and implement it now.", { userId: "system", name: "owner" });
  }

  async close() {
    this.queue.close();
    this.abort.abort();
  }
}
