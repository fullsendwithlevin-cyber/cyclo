/**
 * Strukturierter Fehler: Aktion, Status, Grund, mögliche Lösung.
 * Wird an UI und Agent weitergegeben, damit Fehler verständlich statt generisch sind.
 */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "INTEGRATION_NOT_CONNECTED"
  | "INTEGRATION_EXPIRED"
  | "INTEGRATION_ERROR"
  | "NOT_CONFIGURED"
  | "PERMISSION_DENIED"
  | "UNSUPPORTED"
  | "CONFLICT"
  | "INTERNAL";

const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  RATE_LIMITED: 429,
  INTEGRATION_NOT_CONNECTED: 409,
  INTEGRATION_EXPIRED: 409,
  INTEGRATION_ERROR: 502,
  NOT_CONFIGURED: 503,
  PERMISSION_DENIED: 403,
  UNSUPPORTED: 415,
  CONFLICT: 409,
  INTERNAL: 500,
};

export interface ErrorInfo {
  code: ErrorCode;
  action: string;
  reason: string;
  solution?: string;
}

export class AppError extends Error implements ErrorInfo {
  code: ErrorCode;
  action: string;
  reason: string;
  solution?: string;

  constructor(info: ErrorInfo) {
    super(`${info.action}: ${info.reason}`);
    this.name = "AppError";
    this.code = info.code;
    this.action = info.action;
    this.reason = info.reason;
    this.solution = info.solution;
  }

  get httpStatus() {
    return HTTP_STATUS[this.code];
  }

  toJSON(): ErrorInfo {
    return { code: this.code, action: this.action, reason: this.reason, solution: this.solution };
  }
}

export function toErrorInfo(err: unknown, action = "Aktion"): ErrorInfo {
  if (err instanceof AppError) return err.toJSON();
  return {
    code: "INTERNAL",
    action,
    reason: err instanceof Error ? err.message : "Unbekannter Fehler",
    solution: "Bitte erneut versuchen. Bleibt der Fehler bestehen, das Aktivitätsprotokoll prüfen.",
  };
}

export function formatError(info: ErrorInfo): string {
  return `${info.action} fehlgeschlagen – ${info.reason}${info.solution ? ` Lösung: ${info.solution}` : ""}`;
}
