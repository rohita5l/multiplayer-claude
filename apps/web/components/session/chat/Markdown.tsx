"use client";
import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

function CopyButton({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { void navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); }}
      className="absolute right-1.5 top-1.5 rounded-md border border-border bg-background/80 p-1 text-muted-foreground opacity-0 transition group-hover/pre:opacity-100 hover:text-foreground"
      aria-label="Copy code"
    >
      {ok ? <Check className="size-3" /> : <Copy className="size-3" />}
    </button>
  );
}

function nodeText(n: ReactNode): string {
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(nodeText).join("");
  if (n && typeof n === "object" && "props" in n) return nodeText((n as { props: { children?: ReactNode } }).props.children);
  return "";
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        "text-sm leading-relaxed [&>*+*]:mt-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-medium [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li+li]:mt-0.5 [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_table]:text-xs [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_hr]:border-border",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }) => (
            <div className="group/pre relative">
              <pre className="overflow-x-auto rounded-md border border-border bg-muted/60 p-2.5 font-mono text-xs leading-relaxed [&_code]:bg-transparent [&_code]:p-0">{children}</pre>
              <CopyButton text={nodeText(children)} />
            </div>
          ),
          code: ({ className, children, ...props }) => (
            <code className={cn("rounded bg-muted px-1 py-0.5 font-mono text-[0.8em]", className)} {...props}>{children}</code>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
