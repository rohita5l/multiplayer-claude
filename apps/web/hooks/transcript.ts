/**
 * Reduces raw Claude Agent SDK events (as broadcast by the agent server) into a UI transcript model.
 */
import type { AgentEvent } from "@mpc/protocol";

export type ToolBlock = {
  type: "tool_use";
  final?: boolean;
  id: string;
  name: string;
  input: Record<string, unknown>;
  partialInput?: string; // streaming JSON
  result?: { content: string; isError: boolean };
};
export type TextBlock = { type: "text"; text: string; final?: boolean };
export type ThinkingBlock = { type: "thinking"; text: string; final?: boolean };
export type Block = TextBlock | ToolBlock | ThinkingBlock;

export type TranscriptItem =
  | { kind: "user"; id: string; text: string; at: number; synthetic?: boolean; from?: { userId: string; name: string }; attachedComments?: { id: string; filePath: string; lineStart: number; lineEnd: number; body: string; authorName: string }[] }
  | { kind: "assistant"; id: string; blocks: Block[]; streaming: boolean; at: number }
  | { kind: "result"; id: string; text: string; costUsd?: number; numTurns?: number; isError: boolean; at: number }
  | { kind: "system"; id: string; text: string; at: number };

export interface TranscriptState {
  items: TranscriptItem[];
  pendingId: string | null; // assistant message currently streaming
}

export const emptyTranscript: TranscriptState = { items: [], pendingId: null };

let seq = 0;
const nid = () => `t${++seq}`;

type AnyBlock = { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; content?: unknown; is_error?: boolean; thinking?: string };

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((b) => (typeof b === "string" ? b : b?.type === "text" ? b.text : b?.type === "image" ? "[image]" : "")).filter(Boolean).join("\n");
  return "";
}

function findTool(items: TranscriptItem[], toolUseId: string): ToolBlock | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind !== "assistant") continue;
    const b = it.blocks.find((x) => x.type === "tool_use" && x.id === toolUseId) as ToolBlock | undefined;
    if (b) return b;
  }
  return undefined;
}

export function reduceTranscript(state: TranscriptState, ev: AgentEvent): TranscriptState {
  const at = Date.now();
  const items = state.items.slice();

  switch (ev.type) {
    case "user": {
      const msg = ev.message as { content?: unknown } | undefined;
      const content = msg?.content;
      if (Array.isArray(content) && content.some((b: AnyBlock) => b?.type === "tool_result")) {
        for (const b of content as AnyBlock[]) {
          if (b.type !== "tool_result" || !b.tool_use_id) continue;
          const tool = findTool(items, b.tool_use_id);
          if (tool) tool.result = { content: contentToText(b.content).slice(0, 20_000), isError: Boolean(b.is_error) };
        }
        return { ...state, items };
      }
      let text = contentToText(content);
      if (!text) return state;
      // strip the speaker prefix we add for Claude when this is a replayed transcript line
      if (!ev.from) text = text.replace(/^\[[^\]\n]{1,80}\]: /, "");
      // internal machinery (subagent notifications, system reminders) — not for the chat
      if (/^\s*<(task-notification|system-reminder|local-command)/.test(text)) return state;
      items.push({ kind: "user", id: (ev.uuid as string) ?? nid(), text, at, synthetic: Boolean(ev.isSynthetic), from: ev.from as { userId: string; name: string } | undefined, attachedComments: ev.attachedComments as Extract<TranscriptItem, { kind: "user" }>["attachedComments"] });
      return { ...state, items };
    }

    case "assistant": {
      const msg = ev.message as { id?: string; content?: AnyBlock[] } | undefined;
      const id = msg?.id ?? (ev.uuid as string) ?? nid();
      let item = items.find((x) => x.kind === "assistant" && x.id === id) as Extract<TranscriptItem, { kind: "assistant" }> | undefined;
      if (!item) {
        // The final message's id can differ from the stream's message_start id: merge into the
        // most recent assistant item that still has streamed (non-final) blocks.
        for (let i = items.length - 1; i >= 0; i--) {
          const x = items[i];
          if (x.kind !== "assistant") continue;
          if (x.blocks.some((b) => !b.final)) { x.id = id; item = x; }
          break;
        }
      }
      if (!item) {
        item = { kind: "assistant", id, blocks: [], streaming: false, at };
        items.push(item);
      }
      const blocks = item.blocks.slice();
      for (const b of msg?.content ?? []) {
        if (b.type === "text") {
          // replace the streamed (not yet final) text block, else append
          const streamed = blocks.find((x) => x.type === "text" && !x.final) as TextBlock | undefined;
          if (streamed) { streamed.text = b.text ?? ""; streamed.final = true; }
          else if (b.text) blocks.push({ type: "text", text: b.text, final: true });
        } else if (b.type === "tool_use" && b.id) {
          const existing = blocks.find((x) => x.type === "tool_use" && x.id === b.id) as ToolBlock | undefined;
          if (existing) { existing.input = b.input ?? {}; existing.partialInput = undefined; existing.final = true; }
          else blocks.push({ type: "tool_use", id: b.id, name: b.name ?? "tool", input: b.input ?? {}, final: true });
        } else if (b.type === "thinking" && b.thinking) {
          const streamed = blocks.find((x) => x.type === "thinking" && !x.final) as ThinkingBlock | undefined;
          if (streamed) { streamed.text = b.thinking; streamed.final = true; }
          else blocks.push({ type: "thinking", text: b.thinking, final: true });
        }
      }
      // drop empty streamed text blocks
      for (let i = blocks.length - 1; i >= 0; i--) if (blocks[i].type === "text" && !(blocks[i] as TextBlock).text.trim()) blocks.splice(i, 1);
      item.blocks = blocks;
      item.streaming = false;
      return { items, pendingId: null };
    }

    case "stream_event": {
      const e = ev.event as { type: string; message?: { id: string }; index?: number; content_block?: AnyBlock; delta?: { type: string; text?: string; partial_json?: string; thinking?: string } } | undefined;
      if (!e) return state;
      if (e.type === "message_start" && e.message?.id) {
        if (!items.some((x) => x.kind === "assistant" && x.id === e.message!.id)) items.push({ kind: "assistant", id: e.message.id, blocks: [], streaming: true, at });
        return { items, pendingId: e.message.id };
      }
      const pending = items.find((x) => x.kind === "assistant" && x.id === state.pendingId) as Extract<TranscriptItem, { kind: "assistant" }> | undefined;
      if (!pending) return state;
      if (e.type === "content_block_start" && e.content_block) {
        const cb = e.content_block;
        if (cb.type === "text") pending.blocks.push({ type: "text", text: cb.text ?? "" });
        else if (cb.type === "tool_use" && cb.id) pending.blocks.push({ type: "tool_use", id: cb.id, name: cb.name ?? "tool", input: {}, partialInput: "" });
        else if (cb.type === "thinking") pending.blocks.push({ type: "thinking", text: "" });
      } else if (e.type === "content_block_delta" && e.delta) {
        const last = pending.blocks[pending.blocks.length - 1];
        if (!last) return state;
        if (e.delta.type === "text_delta" && last.type === "text") last.text += e.delta.text ?? "";
        else if (e.delta.type === "input_json_delta" && last.type === "tool_use") {
          last.partialInput = (last.partialInput ?? "") + (e.delta.partial_json ?? "");
          try { last.input = JSON.parse(last.partialInput); } catch {}
        } else if (e.delta.type === "thinking_delta" && last.type === "thinking") last.text += e.delta.thinking ?? "";
      } else if (e.type === "message_stop") {
        pending.streaming = false;
        return { items, pendingId: null };
      }
      return { items, pendingId: state.pendingId };
    }

    case "result": {
      const r = ev as { result?: string; total_cost_usd?: number; num_turns?: number; is_error?: boolean; subtype?: string };
      items.push({ kind: "result", id: (ev.uuid as string) ?? nid(), text: r.result ?? "", costUsd: r.total_cost_usd, numTurns: r.num_turns, isError: Boolean(r.is_error) || (r.subtype ?? "").startsWith("error"), at });
      return { items, pendingId: null };
    }

    case "system": {
      if (ev.subtype === "init") return state;
      if (ev.subtype === "compact_boundary") items.push({ kind: "system", id: nid(), text: "Context compacted", at });
      return { ...state, items };
    }
    default:
      return state;
  }
}
