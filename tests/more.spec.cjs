const { test, expect } = require("@playwright/test");
const { workspace, popup } = require("./fixtures.cjs");
test("slow startup cannot overwrite a newer cross-tab theme", async ({
  page,
}) => {
  await workspace(page, "docs", "dark", { readDelay: 150 });
  await page.evaluate(() => __changeTheme("cream"));
  await expect(page.locator("html")).toHaveAttribute("data-dd-theme", "cream");
  await page.waitForTimeout(200);
  await expect(page.locator("html")).toHaveAttribute("data-dd-theme", "cream");
});
test("failed initial preference reads keep pages original and popup disabled", async ({
  page,
}) => {
  await workspace(page, "docs", "dark", { failRead: true });
  await expect(page.locator("html")).not.toHaveAttribute("data-dd-theme");
  await popup(page, "dark", { failRead: true });
  await expect(page.locator("#theme")).toBeDisabled();
  await expect(page.locator("#status")).toContainText("Couldn’t load");
});
test("rapid theme selection persists the last selection last", async ({
  page,
}) => {
  await popup(page, "dark", { writeDelay: 35 });
  await expect(page.locator("#theme")).toBeEnabled();
  await page.locator("#theme").focus();
  for (const key of ["Home", "End", "Home", "End"])
    await page.keyboard.press(key);
  await expect(page.locator("#status")).toContainText("Saved");
  expect(await page.evaluate(() => __writes.at(-1))).toEqual({
    "darkerdocs.settings.v1": { theme: "cream" },
  });
});
