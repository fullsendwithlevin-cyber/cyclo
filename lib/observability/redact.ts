/**
 * Entfernt sensible Inhalte vor dem Logging: Tokens/Secrets vollständig,
 * lange Texte (Mailinhalte, Dokumente) gekürzt.
 */
const SECRET_KEYS = /token|secret|password|passwort|authorization|cookie|api[_-]?key|refresh|credential|p256dh|auth$/i;
const LONG_TEXT_KEYS = /^(body|content|text|html|raw|data|snippet)$/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[…]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 200)}… [${value.length} Zeichen]` : value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    const items = value.slice(0, 20).map((v) => redact(v, depth + 1));
    return value.length > 20 ? [...items, `[+${value.length - 20} weitere]`] : items;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.test(k)) out[k] = "[REDACTED]";
    else if (LONG_TEXT_KEYS.test(k) && typeof v === "string" && v.length > 120)
      out[k] = `${v.slice(0, 80)}… [${v.length} Zeichen]`;
    else out[k] = redact(v, depth + 1);
  }
  return out;
}
