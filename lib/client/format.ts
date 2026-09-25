const LOCALE = "de-CH";

export const fmtTime = (iso: string | Date, tz?: string) =>
  new Date(iso).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: tz });
export const fmtDate = (iso: string | Date, tz?: string) =>
  new Date(iso).toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short", timeZone: tz });
export const fmtDateTime = (iso: string | Date, tz?: string) => `${fmtDate(iso, tz)}, ${fmtTime(iso, tz)}`;
export const fmtLongDate = (iso: string | Date, tz?: string) =>
  new Date(iso).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long", timeZone: tz });

export function relativeDays(iso: string | Date, now = new Date()): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(d) - start(now)) / 864e5);
  if (diff === 0) return "heute";
  if (diff === 1) return "morgen";
  if (diff === -1) return "gestern";
  if (diff > 1) return `in ${diff} Tagen`;
  return `vor ${-diff} Tagen`;
}

export function toLocalInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const x = new Date(d);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${z(x.getMonth() + 1)}-${z(x.getDate())}T${z(x.getHours())}:${z(x.getMinutes())}`;
}

export const fmtSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
