import { describe, expect, it } from "vitest";
import { decrypt, encrypt, encryptJson, decryptJson, safeEqual } from "@/lib/security/crypto";
import { assertPublicUrl, isPrivateIp } from "@/lib/security/ssrf";
import { redact } from "@/lib/observability/redact";
import { checkRateLimit, resetRateLimits } from "@/lib/http/rate-limit";
import { safeReturnTo, pkceChallenge } from "@/lib/auth/oauth";
import { isStorable, classifyMemory } from "@/lib/memory/service";

describe("Token-Verschlüsselung", () => {
  it("verschlüsselt authentifiziert und zufällig", () => {
    const a = encrypt("ya29.secret");
    expect(a).not.toContain("ya29");
    expect(a).not.toBe(encrypt("ya29.secret"));
    expect(decrypt(a)).toBe("ya29.secret");
    expect(decryptJson<{ x: number }>(encryptJson({ x: 1 }))).toEqual({ x: 1 });
  });

  it("erkennt Manipulation", () => {
    const parts = encrypt("geheim").split(".");
    parts[3] = Buffer.from("manipuliert").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });

  it("vergleicht zeitkonstant", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});

describe("SSRF-Schutz", () => {
  it("erkennt private und reservierte Adressen", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "100.64.0.1"])
      expect(isPrivateIp(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) expect(isPrivateIp(ip), ip).toBe(false);
  });

  it("blockiert interne Ziele, fremde Protokolle und Zugangsdaten in URLs", async () => {
    await expect(assertPublicUrl("http://127.0.0.1/admin", "Test")).rejects.toThrow(/intern/);
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data", "Test")).rejects.toThrow(/intern/);
    await expect(assertPublicUrl("http://localhost:3000", "Test")).rejects.toThrow(/Interne/);
    await expect(assertPublicUrl("file:///etc/passwd", "Test")).rejects.toThrow(/http/);
    await expect(assertPublicUrl("https://user:pw@example.com", "Test")).rejects.toThrow(/Zugangsdaten/);
    await expect(assertPublicUrl("https://8.8.8.8/", "Test")).resolves.toBeInstanceOf(URL);
  });
});

describe("Log-Redaction", () => {
  it("entfernt Tokens und kürzt lange Inhalte", () => {
    const r = redact({ accessToken: "abc", nested: { password: "x", body: "a".repeat(500), title: "ok" } }) as Record<string, unknown>;
    expect(r.accessToken).toBe("[REDACTED]");
    const n = r.nested as Record<string, string>;
    expect(n.password).toBe("[REDACTED]");
    expect(n.body.length).toBeLessThan(150);
    expect(n.title).toBe("ok");
  });
});

describe("Rate Limiting", () => {
  it("begrenzt Bursts und füllt wieder auf", () => {
    resetRateLimits();
    const rule = { capacity: 3, refillPerMinute: 60 };
    const t = 1_000_000;
    expect([1, 2, 3].map(() => checkRateLimit("u", rule, t).ok)).toEqual([true, true, true]);
    expect(checkRateLimit("u", rule, t).ok).toBe(false);
    expect(checkRateLimit("u", rule, t + 1_100).ok).toBe(true);
  });
});

describe("OAuth-Helfer", () => {
  it("verhindert Open Redirects", () => {
    expect(safeReturnTo("/chat")).toBe("/chat");
    expect(safeReturnTo("//evil.com")).toBe("/");
    expect(safeReturnTo("/\\evil.com")).toBe("/");
    expect(safeReturnTo("https://evil.com")).toBe("/");
  });

  it("PKCE S256 (RFC 7636 Testvektor)", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("Memory-Regeln", () => {
  it("speichert keine Zugangsdaten oder Kartennummern", () => {
    expect(isStorable("Mein Passwort: hunter2").ok).toBe(false);
    expect(isStorable("Karte 4111 1111 1111 1111").ok).toBe(false);
    expect(isStorable("Ich lerne am liebsten abends").ok).toBe(true);
  });

  it("klassifiziert heuristisch", () => {
    expect(classifyMemory("Ich lerne am liebsten abends")).toBe("PREFERENCE");
    expect(classifyMemory("Ich arbeite an einem Projekt für die Firma")).toBe("TASK");
    expect(classifyMemory("Habe am 3. Oktober die Mathe-Prüfung bestanden")).toBe("EPISODIC");
    expect(classifyMemory("Ich studiere Elektrotechnik an der HF")).toBe("SEMANTIC");
  });
});
