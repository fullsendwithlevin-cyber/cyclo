import { z } from "zod";

/** ISO-8601 mit Zeitzonen-Offset → Date (verhindert Zeitzonenfehler bei Modell-Eingaben). */
export const isoDateTime = z
  .string()
  .describe("ISO 8601 mit Offset, z. B. 2026-10-14T10:00:00+02:00")
  .refine((s) => /T\d{2}:\d{2}/.test(s) && /(Z|[+-]\d{2}:?\d{2})$/.test(s) && !Number.isNaN(Date.parse(s)), {
    message: "Erwartet ISO 8601 mit Zeitzonen-Offset, z. B. 2026-10-14T10:00:00+02:00",
  })
  .transform((s) => new Date(s));

export const isoDateTimeOptional = isoDateTime.optional();

export const dayMs = 864e5;

export function iso(d: Date | string | null | undefined) {
  if (!d) return null;
  return (typeof d === "string" ? new Date(d) : d).toISOString();
}

export function clip(text: string, max = 4000) {
  return text.length > max ? `${text.slice(0, max)}… [gekürzt, ${text.length} Zeichen]` : text;
}
