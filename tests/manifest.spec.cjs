const { test, expect, chromium } = require("@playwright/test");
const { html } = require("./fixtures.cjs");
const path = require("node:path");
const crypto = require("node:crypto");
test("real manifest injection, four-app propagation and error-free reloads", async () => {
  const extension = path.resolve(__dirname, "../extension");
  const id = [
    ...crypto.createHash("sha256").update(extension).digest("hex").slice(0, 32),
  ]
    .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
    .join("");
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const errors = [];
  context.on("weberror", (error) => errors.push(error.error().message));
  try {
    await context.route("https://docs.google.com/**", (route) =>
      route.fulfill({ contentType: "text/html; charset=utf-8", body: html }),
    );
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup/popup.html`);
    await expect(popup.locator("#theme")).toBeEnabled();
    const first = await context.newPage();
    await first.goto("https://docs.google.com/document/d/test/edit");
    const second = await context.newPage();
    await second.goto("https://docs.google.com/spreadsheets/d/test/edit");
    const pages = [first, second];
    for (const app of ["presentation", "forms"]) {
      const page = await context.newPage();
      await page.goto(`https://docs.google.com/${app}/d/test/edit`);
      pages.push(page);
    }
    for (const page of pages)
      await expect(page.locator("html")).toHaveAttribute(
        "data-dd-theme",
        "dark",
      );
    await popup.locator("[data-theme=cream]").click();
    for (const page of pages)
      await expect(page.locator("html")).toHaveAttribute(
        "data-dd-theme",
        "cream",
      );
    // Reloading must inject the isolated core again, independently of MAIN.
    for (const page of pages) {
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute(
        "data-dd-theme",
        "cream",
      );
    }
    await popup.reload();
    await expect(popup.locator("#theme")).toHaveValue("3");
    await popup.locator("[data-theme=oled]").click();
    for (const page of pages)
      await expect(page.locator("html")).toHaveAttribute(
        "data-dd-theme",
        "oled",
      );
    const slides = pages[2];
    const original = await first
      .locator("#canvas")
      .evaluate((c) => c.toDataURL());
    // SPA route changes must suspend output before any further DOM mutation.
    await first.evaluate(() =>
      history.pushState(null, "", "/document/d/test/print"),
    );
    await slides.evaluate(() =>
      history.replaceState(null, "", "/presentation/d/test/present"),
    );
    for (const page of [first, slides]) {
      await expect(page.locator("html")).not.toHaveAttribute("data-dd-theme");
      await expect(page.locator("[data-dd-b]")).toHaveCount(0);
      await expect(page.locator("darkerdocs-surface")).toHaveCount(0);
    }
    await expect(first.locator("#canvas")).toHaveCSS("opacity", "1");
    const diagnostics = await context.newPage();
    await diagnostics.goto(`chrome-extension://${id}/diagnostics.html`);
    await expect(diagnostics.locator(".result")).toHaveCount(4);
    for (const app of ["Docs", "Slides", "Sheets", "Forms"]) {
      const output = app === "Docs" || app === "Slides";
      const card = diagnostics.locator(".result").filter({
        has: diagnostics.getByRole("heading", { name: `Google ${app} · Page` }),
      });
      await expect(card.locator('dt:text-is("Selected theme") + dd')).toHaveText(
        "OLED Black",
      );
      await expect(card.locator('dt:text-is("Applied theme") + dd')).toHaveText(
        output ? "Default" : "OLED Black",
      );
      await expect(card.locator('dt:text-is("Appearance") + dd')).toHaveText(
        output ? "Original for print, export, or playback" : "Theme applied",
      );
    }
    await first.goBack();
    await slides.evaluate(() =>
      history.replaceState(null, "", "/presentation/d/test/edit"),
    );
    for (const page of [first, slides])
      await expect(page.locator("html")).toHaveAttribute(
        "data-dd-theme",
        "oled",
      );
    await expect(first.locator("darkerdocs-surface")).toHaveCount(1);
    expect(await first.locator("#canvas").evaluate((c) => c.toDataURL())).toBe(
      original,
    );
    await popup.locator("[data-theme=default]").click();
    for (const page of pages) {
      await expect(page.locator("[data-dd-b]")).toHaveCount(0);
      await expect(page.locator("darkerdocs-surface")).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
