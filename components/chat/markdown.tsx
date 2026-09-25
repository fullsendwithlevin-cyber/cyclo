import { Fragment, type ReactNode } from "react";

/**
 * Minimaler, sicherer Markdown-Renderer (kein HTML aus dem Modell, kein dangerouslySetInnerHTML).
 * Unterstützt Absätze, Überschriften, Listen, **fett**, *kursiv*, `code`, Codeblöcke, Links und [n]-Quellenverweise.
 */
function safeHref(href: string): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const u = new URL(href);
    return u.protocol === "https:" || u.protocol === "http:" || u.protocol === "mailto:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function inline(text: string, keyBase: string, onCite?: (n: number) => void): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\[\d{1,2}\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{tok.slice(1, -1)}</code>);
    else if (/^\[\d{1,2}\]$/.test(tok)) {
      const n = Number(tok.slice(1, -1));
      out.push(
        <button key={key} type="button" onClick={() => onCite?.(n)} className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-accent px-1 align-text-top text-[10px] font-semibold text-accent-foreground" title={`Quelle ${n}`}>
          {n}
        </button>,
      );
    } else if (tok.startsWith("[")) {
      const [, label, href] = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) ?? [];
      const safe = href ? safeHref(href) : null;
      out.push(
        safe ? (
          <a key={key} href={safe} target={safe.startsWith("/") ? undefined : "_blank"} rel="noopener noreferrer nofollow" className="text-primary underline underline-offset-2">
            {label}
          </a>
        ) : (
          <Fragment key={key}>{label}</Fragment>
        ),
      );
    } else out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, onCite }: { text: string; onCite?: (n: number) => void }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) code.push(lines[i++]);
      i++;
      blocks.push(<pre key={k++} className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs"><code>{code.join("\n")}</code></pre>);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      blocks.push(<p key={k++} className="mt-2 font-semibold">{inline(h[2], `h${k}`, onCite)}</p>);
      i++;
      continue;
    }
    if (/^\s*([-*•]|\d+\.|□|☐|✓)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+\.|□|☐|✓)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*•]|\d+\.)\s+/, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={k++} className={`${ordered ? "list-decimal" : "list-disc"} space-y-0.5 pl-5`}>
          {items.map((it, j) => <li key={j}>{inline(it, `l${k}-${j}`, onCite)}</li>)}
        </List>,
      );
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*([-*•]|\d+\.)\s+)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(
      <p key={k++}>
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(p, `p${k}-${j}`, onCite)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className="space-y-2 text-sm leading-relaxed">{blocks}</div>;
}
