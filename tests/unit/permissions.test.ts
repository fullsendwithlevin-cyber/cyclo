import { describe, expect, it } from "vitest";
import { decidePermission, type PolicyInput } from "@/lib/permissions/policy";

const base: PolicyInput = { category: "READ", scope: "internal", mode: "ASSISTED", override: null, tainted: false };
const d = (p: Partial<PolicyInput>) => decidePermission({ ...base, ...p }).decision;

describe("Permission-Policy", () => {
  it("erlaubt Lesen in jedem Modus automatisch", () => {
    for (const mode of ["SAFE", "ASSISTED", "AUTONOMOUS"] as const) {
      expect(d({ mode, scope: "internal" })).toBe("ALLOW");
      expect(d({ mode, scope: "external" })).toBe("ALLOW");
    }
  });

  it("ASSISTED: interne Änderungen (Aufgaben, Erinnerungen) automatisch, externe vorschlagen", () => {
    expect(d({ category: "WRITE", scope: "internal" })).toBe("ALLOW");
    expect(d({ category: "WRITE", scope: "external" })).toBe("CONFIRM");
  });

  it("SAFE: jede Änderung braucht Bestätigung", () => {
    expect(d({ mode: "SAFE", category: "WRITE", scope: "internal" })).toBe("CONFIRM");
    expect(d({ mode: "SAFE", category: "WRITE", scope: "external" })).toBe("CONFIRM");
  });

  it("AUTONOMOUS: Schreiben automatisch, aber Senden/Löschen/Externe Aktionen bestätigen", () => {
    expect(d({ mode: "AUTONOMOUS", category: "WRITE", scope: "external" })).toBe("ALLOW");
    expect(d({ mode: "AUTONOMOUS", category: "SEND", scope: "external" })).toBe("CONFIRM");
    expect(d({ mode: "AUTONOMOUS", category: "DELETE", scope: "external" })).toBe("CONFIRM");
    expect(d({ mode: "AUTONOMOUS", category: "EXTERNAL_ACTION", scope: "external" })).toBe("CONFIRM");
  });

  it("E-Mail senden braucht standardmäßig immer Bestätigung", () => {
    for (const mode of ["SAFE", "ASSISTED", "AUTONOMOUS"] as const) expect(d({ mode, category: "SEND", scope: "external" })).toBe("CONFIRM");
  });

  it("Finanzielle und sensible Aktionen sind nicht per Override freischaltbar", () => {
    expect(d({ category: "FINANCIAL", override: "ALLOW", mode: "AUTONOMOUS" })).toBe("CONFIRM");
    expect(d({ category: "SENSITIVE", override: "ALLOW", mode: "AUTONOMOUS" })).toBe("CONFIRM");
  });

  it("DENY-Override gewinnt immer, auch für Lesen", () => {
    expect(d({ category: "READ", override: "DENY" })).toBe("DENY");
    expect(d({ category: "FINANCIAL", override: "DENY" })).toBe("DENY");
  });

  it("ALLOW-Override erlaubt Senden ohne Taint …", () => {
    expect(d({ category: "SEND", scope: "external", override: "ALLOW" })).toBe("ALLOW");
  });

  it("… aber die Taint-Regel erzwingt Bestätigung nach untrusted Inhalten", () => {
    for (const category of ["SEND", "DELETE", "EXTERNAL_ACTION"] as const) {
      expect(d({ category, scope: "external", override: "ALLOW", tainted: true, mode: "AUTONOMOUS" })).toBe("CONFIRM");
    }
    // Normales Schreiben bleibt trotz Taint möglich (z. B. Aufgabe aus einer Mail anlegen)
    expect(d({ category: "WRITE", scope: "internal", tainted: true })).toBe("ALLOW");
  });

  it("CONFIRM-Override macht auch interne Änderungen bestätigungspflichtig", () => {
    expect(d({ category: "WRITE", scope: "internal", override: "CONFIRM" })).toBe("CONFIRM");
  });

  it("liefert eine verständliche Begründung", () => {
    expect(decidePermission({ ...base, category: "SEND", scope: "external", tainted: true }).reason).toMatch(/externen Quellen/);
  });
});
