import chokidar from "chokidar";
import { relative } from "node:path";

/** Watches the repo and emits debounced batches of changed relative paths. */
export function watchRepo(dir: string, onChange: (paths: string[]) => void) {
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | null = null;
  const flush = () => {
    timer = null;
    if (!pending.size) return;
    const paths = [...pending];
    pending.clear();
    onChange(paths);
  };
  const watcher = chokidar.watch(dir, {
    ignored: (p) => /(^|[\/\\])(node_modules|\.git|\.next|dist|\.turbo)([\/\\]|$)/.test(p),
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
  });
  watcher.on("all", (_event, path) => {
    pending.add(relative(dir, path));
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 250);
  });
  return watcher;
}
