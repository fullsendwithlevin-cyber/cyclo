import { expect, test as base, type Page } from "@playwright/test";

export async function login(page: Page, email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`) {
  await page.goto("/login");
  await expect(page.getByText("Entwicklungsmodus")).toBeVisible();
  await page.getByLabel("E-Mail").fill(email);
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.waitForURL("/");
  return email;
}

export const test = base.extend<{ authed: Page }>({
  authed: async ({ page }, provide) => {
    await login(page);
    await provide(page);
  },
});
export { expect };
