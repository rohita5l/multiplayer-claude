import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { DiffFile, FileEntry } from "@mpc/protocol";

const exec = promisify(execFile);

export class Repo {
  constructor(public readonly dir: string) {}

  private async git(args: string[]): Promise<string> {
    const { stdout } = await exec("git", args, { cwd: this.dir, maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  }

  /** Commit that the session diff is computed against (captured at server start). */
  baseRef = "HEAD";

  async captureBase() {
    try {
      this.baseRef = (await this.git(["rev-parse", "HEAD"])).trim();
    } catch {
      this.baseRef = "HEAD";
    }
  }

  async listFiles(): Promise<FileEntry[]> {
    const tracked = (await this.git(["ls-files", "-z"])).split("\0").filter(Boolean);
    const untracked = (await this.git(["ls-files", "-z", "--others", "--exclude-standard"])).split("\0").filter(Boolean);
    const status = await this.statusMap();
    const all = new Set([...tracked, ...untracked]);
    for (const p of Object.keys(status)) if (status[p] !== "D") all.add(p);
    return [...all].sort().map((path) => ({ path, status: status[path] }));
  }

  async statusMap(): Promise<Record<string, FileEntry["status"]>> {
    const out = await this.git(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    const map: Record<string, FileEntry["status"]> = {};
    const parts = out.split("\0");
    for (let i = 0; i < parts.length; i++) {
      const line = parts[i];
      if (!line || line.length < 4) continue;
      const code = line.slice(0, 2);
      const path = line.slice(3);
      let s: FileEntry["status"] = "M";
      if (code === "??") s = "?";
      else if (code.includes("A")) s = "A";
      else if (code.includes("D")) s = "D";
      else if (code.includes("R")) { s = "R"; i++; }
      map[path] = s;
    }
    return map;
  }

  safePath(rel: string): string {
    const abs = resolve(this.dir, rel);
    if (!abs.startsWith(this.dir + sep) && abs !== this.dir) throw new Error("path escapes repo");
    return abs;
  }

  async readFile(rel: string): Promise<{ content: string | null; binary: boolean }> {
    const abs = this.safePath(rel);
    const st = await stat(abs);
    if (st.size > 2 * 1024 * 1024) return { content: null, binary: true };
    const buf = await readFile(abs);
    const sample = buf.subarray(0, 8000);
    const binary = sample.includes(0);
    return binary ? { content: null, binary: true } : { content: buf.toString("utf8"), binary: false };
  }

  /** Diff of working tree (incl. untracked files) against the base commit, split per file. */
  async diff(): Promise<DiffFile[]> {
    // include untracked files by temporarily adding them with intent-to-add
    try { await this.git(["add", "-N", "--all"]); } catch {}
    const raw = await this.git(["diff", this.baseRef, "--no-color", "--no-ext-diff", "-M", "--patch", "--stat=0"]).catch(() => "");
    const numstat = await this.git(["diff", this.baseRef, "--numstat", "-M"]).catch(() => "");
    const counts: Record<string, { additions: number; deletions: number }> = {};
    for (const line of numstat.split("\n")) {
      const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
      if (!m) continue;
      let path = m[3];
      const r = path.match(/\{(.*) => (.*)\}/);
      if (r) path = path.replace(r[0], r[2]);
      else if (path.includes(" => ")) path = path.split(" => ")[1];
      counts[path] = { additions: m[1] === "-" ? 0 : +m[1], deletions: m[2] === "-" ? 0 : +m[2] };
    }
    const files: DiffFile[] = [];
    const chunks = raw.split(/^(?=diff --git )/m).filter(Boolean);
    for (const chunk of chunks) {
      const head = chunk.match(/^diff --git a\/(.+?) b\/(.+)$/m);
      if (!head) continue;
      const oldPath = head[1], path = head[2];
      let status: DiffFile["status"] = "M";
      if (/^new file mode/m.test(chunk)) status = "A";
      else if (/^deleted file mode/m.test(chunk)) status = "D";
      else if (/^rename from/m.test(chunk)) status = "R";
      const c = counts[path] ?? { additions: 0, deletions: 0 };
      files.push({ path, oldPath: oldPath !== path ? oldPath : undefined, status, additions: c.additions, deletions: c.deletions, patch: chunk });
    }
    return files;
  }
}

export function repoJoin(dir: string, rel: string) {
  return join(dir, rel);
}
