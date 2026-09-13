"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { EditorView, Decoration, WidgetType, gutter, GutterMarker, type DecorationSet } from "@codemirror/view";
import { StateField, StateEffect, Facet, type Extension, EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { css } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { githubLight, githubDark } from "@uiw/codemirror-theme-github";
import { useTheme } from "next-themes";
import type { Comment, NewComment } from "@/hooks/useComments";
import { AddCommentForm, CommentThread } from "./CommentThread";
import { extOf } from "./util";

export interface CodeViewerProps {
  path: string;
  content: string;
  threads: Comment[]; // top-level threads for this file
  repliesOf: (id: string) => Comment[];
  canComment: boolean;
  isOwner: boolean;
  onAdd: (c: NewComment) => Promise<unknown>;
  onSetStatus: (ids: string[], status: Comment["status"]) => Promise<unknown>;
  scrollToLine?: { line: number; nonce: number } | null;
}

function langFor(path: string): Extension[] {
  switch (extOf(path)) {
    case "ts": case "tsx": case "js": case "jsx": case "mjs": case "cjs": return [javascript({ jsx: true, typescript: true })];
    case "json": return [json()];
    case "css": case "scss": return [css()];
    case "md": case "mdx": case "markdown": return [markdown()];
    case "html": case "htm": return [html()];
    default: return [];
  }
}

/** Block widget hosting a React tree. */
class ReactWidget extends WidgetType {
  private root: Root | null = null;
  constructor(readonly key: string, readonly render: () => React.ReactNode) { super(); }
  eq(other: ReactWidget) { return other.key === this.key; }
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-react-widget px-2 py-1.5";
    el.style.fontFamily = "var(--font-sans, ui-sans-serif, system-ui)";
    this.root = createRoot(el);
    this.root.render(this.render());
    return el;
  }
  updateDOM() { return false; }
  destroy() { const r = this.root; this.root = null; queueMicrotask(() => r?.unmount()); }
  ignoreEvent() { return true; }
}

const setWidgets = StateEffect.define<DecorationSet>();
const widgetField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setWidgets)) return e.value;
    return value.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

class DotMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-comment-dot";
    el.title = "Has comments";
    return el;
  }
}
const dot = new DotMarker();
const setMarkedLines = StateEffect.define<Set<number>>();
const markedLinesField = StateField.define<Set<number>>({
  create: () => new Set(),
  update(v, tr) { for (const e of tr.effects) if (e.is(setMarkedLines)) return e.value; return v; },
});
const commentGutter = gutter({
  class: "cm-comment-gutter",
  lineMarker(view, line) {
    const n = view.state.doc.lineAt(line.from).number;
    return view.state.field(markedLinesField).has(n) ? dot : null;
  },
  lineMarkerChange: (u) => u.transactions.some((tr) => tr.effects.some((e) => e.is(setMarkedLines))),
});

/** Per-instance config passed via facets so the module-level DOM handler can read it without closures over render state. */
const gutterClickFacet = Facet.define<{ enabled: boolean; onLine: (line: number) => void }, { enabled: boolean; onLine: (line: number) => void }>({
  combine: (v) => v[0] ?? { enabled: false, onLine: () => {} },
});
const gutterClickHandler = EditorView.domEventHandlers({
  mousedown(event, view) {
    const cfg = view.state.facet(gutterClickFacet);
    if (!cfg.enabled) return false;
    const t = event.target as HTMLElement;
    if (!t.closest(".cm-lineNumbers")) return false;
    const block = view.lineBlockAtHeight(event.clientY - view.documentTop);
    cfg.onLine(view.state.doc.lineAt(block.from).number);
    event.preventDefault();
    return true;
  },
});

const theme = EditorView.theme({
  "&": { fontSize: "12.5px", height: "100%" },
  ".cm-scroller": { fontFamily: "var(--font-geist-mono, ui-monospace, SFMono-Regular, Menlo, monospace)", lineHeight: "1.55" },
  ".cm-gutters": { cursor: "pointer", userSelect: "none" },
  ".cm-lineNumbers .cm-gutterElement:hover": { color: "#0969da", fontWeight: "600" },
  ".cm-comment-gutter": { width: "8px" },
  ".cm-comment-dot": { display: "inline-block", width: "6px", height: "6px", borderRadius: "999px", background: "#d97706", margin: "0 1px" },
  ".cm-react-widget": { background: "#fafafa", borderTop: "1px solid #e5e7eb", borderBottom: "1px solid #e5e7eb" },
});

export function CodeViewer(props: CodeViewerProps) {
  const { resolvedTheme } = useTheme();
  const { path, content, threads, repliesOf, canComment, isOwner, onAdd, onSetStatus, scrollToLine } = props;
  const ref = useRef<ReactCodeMirrorRef>(null);
  const [addAt, setAddAt] = useState<number | null>(null);
  const extensions = useMemo<Extension[]>(
    () => [
      ...langFor(path),
      widgetField, markedLinesField, commentGutter, gutterClickHandler, theme, EditorView.lineWrapping, EditorState.readOnly.of(true),
      gutterClickFacet.of({ enabled: canComment, onLine: (line) => setAddAt((cur) => (cur === line ? null : line)) }),
    ],
    [path, canComment],
  );

  // (re)build block widgets when threads / add-form change
  useEffect(() => {
    const view = ref.current?.view;
    if (!view) return;
    const doc = view.state.doc;
    const byLine = new Map<number, Comment[]>();
    for (const t of threads) (byLine.get(t.line_end) ?? byLine.set(t.line_end, []).get(t.line_end)!).push(t);
    const decos: { pos: number; deco: Decoration }[] = [];
    const clamp = (n: number) => Math.min(Math.max(1, n), doc.lines);
    for (const [line, ts] of byLine) {
      const pos = doc.line(clamp(line)).to;
      const key = `threads:${line}:${ts.map((t) => `${t.id}:${t.status}:${repliesOf(t.id).length}`).join(",")}`;
      decos.push({
        pos,
        deco: Decoration.widget({
          block: true, side: 1,
          widget: new ReactWidget(key, () => (
            <div className="space-y-1.5">
              {ts.map((t) => (
                <CommentThread key={t.id} thread={t} replies={repliesOf(t.id)} isOwner={isOwner} canComment={canComment} onReply={onAdd} onSetStatus={onSetStatus} compact />
              ))}
            </div>
          )),
        }),
      });
    }
    if (addAt != null) {
      const pos = doc.line(clamp(addAt)).to;
      decos.push({
        pos,
        deco: Decoration.widget({
          block: true, side: 2,
          widget: new ReactWidget(`add:${addAt}`, () => (
            <AddCommentForm filePath={path} line={addAt} onSubmit={onAdd} onCancel={() => setAddAt(null)} />
          )),
        }),
      });
    }
    decos.sort((a, b) => a.pos - b.pos);
    view.dispatch({
      effects: [setWidgets.of(Decoration.set(decos.map((d) => d.deco.range(d.pos)))), setMarkedLines.of(new Set(byLine.keys()))],
    });
  }, [threads, addAt, path, canComment, isOwner, onAdd, onSetStatus, repliesOf, content]);

  useEffect(() => {
    if (!scrollToLine) return;
    const view = ref.current?.view;
    if (!view) return;
    const line = Math.min(Math.max(1, scrollToLine.line), view.state.doc.lines);
    const pos = view.state.doc.line(line).from;
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
  }, [scrollToLine, content]);

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <CodeMirror
        ref={ref}
        value={content}
        height="100%"
        theme={resolvedTheme === "dark" ? githubDark : githubLight}
        editable={false}
        readOnly
        extensions={extensions}
        basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false, dropCursor: false, allowMultipleSelections: false, indentOnInput: false, autocompletion: false, searchKeymap: true }}
        className="h-full [&_.cm-editor]:h-full"
      />
    </div>
  );
}
