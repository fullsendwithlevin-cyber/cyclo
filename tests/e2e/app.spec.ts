import { mkdirSync, writeFileSync } from "node:fs";
import { expect, login, test } from "./fixtures";

test("nicht angemeldete Benutzer landen auf dem Login", async ({ page }) => {
  await page.goto("/tasks");
  await expect(page).toHaveURL(/\/login\?returnTo=%2Ftasks/);
  await expect(page.getByRole("heading", { name: "Chief of Staff" })).toBeVisible();
});

test("Dashboard zeigt alle Bereiche mit ehrlichen Leerzuständen", async ({ authed: page }) => {
  for (const title of ["Heute", "Inbox", "Aufgaben", "Prüfungen", "Agent-Aktivität", "Projekte", "Dokumente"])
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.getByText("Keine Termine heute")).toBeVisible();
  await expect(page.getByText("Google Calendar ist nicht verbunden")).toBeVisible();
});

test("Aufgaben: anlegen, priorisieren, erledigen", async ({ authed: page }) => {
  await page.goto("/tasks");
  await page.getByLabel("Neue Aufgabe").fill("C-Übung abgeben");
  await page.keyboard.press("Enter");
  await expect(page.getByText("C-Übung abgeben")).toBeVisible();
  await page.getByText("C-Übung abgeben").click();
  await page.getByLabel("Priorität").selectOption("URGENT");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Dringend")).toBeVisible();
  await page.getByLabel("„C-Übung abgeben“ erledigt").click();
  await expect(page.getByText("Keine Aufgaben")).toBeVisible();
  await page.getByRole("tab", { name: "Erledigt" }).click();
  await expect(page.getByText("C-Übung abgeben")).toBeVisible();
});

test("Kalender-Schnelleingabe erkennt „Prüfung … Freitag 10:00“ und legt Prüfung + Termin an", async ({ authed: page }) => {
  await page.goto("/calendar");
  await page.getByLabel("Schnelleingabe").fill("Prüfung Elektrotechnik Freitag 10:00");
  await page.getByRole("button", { name: "Erkennen" }).click();
  await expect(page.getByText("Prüfung", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Fr\.?,? .*10:00/)).toBeVisible();
  await page.getByRole("button", { name: "Eintragen" }).click();
  await expect(page.getByText("Prüfung und Termin erstellt")).toBeVisible();
  await page.goto("/exams");
  await expect(page.getByText("Elektrotechnik", { exact: true })).toBeVisible();
});

test("Agent: Prüfung organisieren im Modus „Sicher“ → Plan sichtbar → Bestätigung → Lernblöcke im Kalender", async ({ authed: page }) => {
  // Prüfung in 6 Tagen anlegen
  await page.goto("/exams");
  await page.getByRole("button", { name: "Prüfung" }).click();
  await page.getByLabel("Fach").fill("Mathematik");
  const d = new Date(Date.now() + 6 * 864e5);
  const pad = (n: number) => String(n).padStart(2, "0");
  await page.getByLabel("Datum & Zeit").fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Mathematik", { exact: true })).toBeVisible();

  // Modus „Sicher“: jede Änderung braucht Bestätigung
  await page.goto("/settings?tab=permissions");
  await page.getByLabel("Standard-Autonomie").selectOption("SAFE");
  await expect(page.getByText("Aktuell: mit Bestätigung").first()).toBeVisible();

  await page.goto("/chat");
  await page.getByLabel("Nachricht", { exact: true }).fill("Organisiere meine nächste Prüfung.");
  await page.getByRole("button", { name: "Senden" }).click();
  await expect(page).toHaveURL(/\/chat\/[a-z0-9]+/);
  await expect(page.getByText("Mehrere Termine erstellen").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Lernplan erstellen").first()).toBeVisible();
  await expect(page.getByText("Unterlagen durchsuchen").first()).toBeVisible();
  await expect(page.getByText(/Modus „Sicher“/)).toBeVisible();
  await page.getByRole("button", { name: "Bestätigen" }).click();
  await expect(page.getByText("Fertig: Lernplan erstellt und Lerntermine eingetragen.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Ausgeführt", { exact: true })).toBeVisible();

  await page.goto("/exams");
  await expect(page.getByText(/0\/2 Lernblöcke/)).toBeVisible();
  await page.goto("/activity");
  await expect(page.getByText("Organisiere meine nächste Prüfung.").first()).toBeVisible();
  await expect(page.getByText("Lerntermine eintragen").first()).toBeVisible();
});

test("Dokument hochladen → im Hintergrund indexiert → durchsuchbar", async ({ authed: page }) => {
  mkdirSync("storage", { recursive: true });
  const file = "storage/e2e-kirchhoff.md";
  writeFileSync(file, `# Kirchhoff ${Date.now()}\n\nKnotenregel: Summe der Ströme ist null.`);
  await page.goto("/documents");
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByText(/hochgeladen – wird verarbeitet/)).toBeVisible();
  await expect(page.getByText("Durchsuchbar", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.goto("/search?q=Knotenregel");
  await expect(page.getByText("e2e-kirchhoff")).toBeVisible();
});

test("Einstellungen zeigen Integrationen ehrlich als nicht verbunden/konfiguriert", async ({ authed: page }) => {
  await page.goto("/settings");
  await expect(page.getByText("Google Calendar")).toBeVisible();
  await expect(page.getByText("nicht verbunden").first()).toBeVisible();
  await expect(page.getByText(/GOOGLE_CLIENT_ID\/SECRET/).first()).toBeVisible();
  await expect(page.getByLabel("ICS-URL")).toBeVisible();
  // SSRF-Schutz: interne Adressen werden abgelehnt
  await page.getByLabel("ICS-URL").fill("http://127.0.0.1/kalender.ics");
  await page.getByRole("button", { name: "Verbinden" }).click();
  await expect(page.getByText(/internes Netzwerk|Interne Adressen/)).toBeVisible();
});

test("Globale Suche per Tastenkürzel", async ({ page }) => {
  await login(page);
  await page.keyboard.press("Control+k");
  await expect(page.getByLabel("Suchbegriff")).toBeVisible();
  await page.getByLabel("Suchbegriff").fill("Kalender");
  await page.keyboard.press("Enter");
  // Erster Eintrag: „Assistent fragen“ → Chat startet mit der Frage
  await expect(page).toHaveURL(/\/chat/);
  await expect(page.getByText("Ich habe verstanden: „Kalender“. (Test-Modus)")).toBeVisible({ timeout: 20_000 });
});
