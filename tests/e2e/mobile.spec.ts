import { expect, test } from "./fixtures";

test("Mobile: Bottom-Navigation (Home, Chat, Aufgaben, Kalender, Mehr)", async ({ authed: page }) => {
  const nav = page.getByRole("navigation", { name: "Navigation" });
  await expect(nav).toBeVisible();
  for (const label of ["Heute", "Chat", "Aufgaben", "Kalender", "Mehr"]) await expect(nav.getByText(label)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Hauptnavigation" })).toBeHidden();
  await nav.getByText("Mehr").click();
  await expect(page.getByRole("link", { name: "Einstellungen" })).toBeVisible();
  // Keine horizontale Scrollbar
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Mobile: Dark Mode umschalten", async ({ authed: page }) => {
  const before = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  await page.getByRole("button", { name: "Farbschema wechseln" }).click();
  expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(!before);
});
