import { afterEach, describe, expect, it } from "vitest";
import { isPasswordLoginEnabled, verifyOwnerCredentials } from "@/lib/auth/password";
import { env, resetEnvCache } from "@/lib/env";

function withOwner(email?: string, password?: string) {
  if (email === undefined) delete process.env.OWNER_EMAIL;
  else process.env.OWNER_EMAIL = email;
  if (password === undefined) delete process.env.OWNER_PASSWORD;
  else process.env.OWNER_PASSWORD = password;
  resetEnvCache();
}

afterEach(() => withOwner());

describe("Passwort-Login", () => {
  it("ist ohne Konfiguration deaktiviert", () => {
    withOwner();
    expect(isPasswordLoginEnabled()).toBe(false);
    expect(verifyOwnerCredentials("a@b.ch", "irgendwas")).toBe(false);
  });

  it("akzeptiert nur die richtigen Zugangsdaten (E-Mail ohne Groß-/Kleinschreibung)", () => {
    withOwner("Levin@Example.ch", "sehr-geheimes-pw");
    expect(isPasswordLoginEnabled()).toBe(true);
    expect(verifyOwnerCredentials("levin@example.ch", "sehr-geheimes-pw")).toBe(true);
    expect(verifyOwnerCredentials("levin@example.ch", "sehr-geheimes-pW")).toBe(false);
    expect(verifyOwnerCredentials("andere@example.ch", "sehr-geheimes-pw")).toBe(false);
  });

  it("lehnt zu kurze Passwörter in der Konfiguration ab", () => {
    withOwner("a@b.ch", "kurz");
    expect(() => env()).toThrow(/mindestens 12 Zeichen/);
  });
});
