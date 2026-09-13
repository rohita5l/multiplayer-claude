import type { DiffFile, FileEntry } from "@mpc/protocol";

export type FileStatus = NonNullable<FileEntry["status"]> | DiffFile["status"];

export const statusClass: Record<string, string> = {
  M: "bg-amber-100 text-amber-800 border-amber-200",
  A: "bg-emerald-100 text-emerald-800 border-emerald-200",
  D: "bg-red-100 text-red-800 border-red-200",
  R: "bg-sky-100 text-sky-800 border-sky-200",
  "?": "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export function statusLabel(s: string | undefined) {
  return s === "?" ? "A" : (s ?? "");
}

export function extOf(path: string) {
  const m = path.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "";
}

export function isMarkdown(path: string) {
  const e = extOf(path);
  return e === "md" || e === "mdx" || e === "markdown";
}

export function basename(path: string) {
  return path.split("/").pop() ?? path;
}

export function dirname(path: string) {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/** Map extension to a highlighter language name used by @git-diff-view. */
export function diffLang(path: string): string | undefined {
  const e = extOf(path);
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
    json: "json", css: "css", scss: "scss", md: "markdown", mdx: "markdown", html: "html", yml: "yaml", yaml: "yaml",
    sh: "bash", bash: "bash", py: "python", go: "go", rs: "rust", toml: "toml", sql: "sql",
  };
  return map[e];
}

export function timeAgo(ts: number | string) {
  const t = typeof ts === "string" ? new Date(ts).getTime() : ts;
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(t).toLocaleDateString();
}
