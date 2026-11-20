const { test, expect } = require("@playwright/test");
const { workspace, popup, paths } = require("./fixtures.cjs");
const themes = ["oled", "dark", "default", "cream"];
async function settle(page, theme) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.dataset.ddTheme || "default",
      ),
    )
    .toBe(theme);
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  await expect(page.locator("html")).not.toHaveAttribute("data-dd-animating");
}
async function pixel(page, x, y) {
  const screenshot = (await page.screenshot()).toString("base64");
  return page.evaluate(
    async ({ screenshot, x, y }) => {
      const image = new Image();
      image.src = "data:image/png;base64," + screenshot;
      await image.decode();
      const c = document.createElement("canvas");
      c.width = image.width;
      c.height = image.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(image, 0, 0);
      return [...ctx.getImageData(x, y, 1, 1).data];
    },
    { screenshot, x: Math.round(x), y: Math.round(y) },
  );
}
for (const app of Object.keys(paths))
  for (const theme of themes)
    test(`${app} / ${theme}: full surfaces, dynamic UI and original source`, async ({
      page,
    }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await workspace(page, app, theme);
      await settle(page, theme);
      const source = await page
        .locator("#canvas")
        .evaluate((c) => c.toDataURL());
      if (theme === "default")
        await expect(page.locator("html")).not.toHaveAttribute("data-dd-theme");
      else {
        await expect(page.locator("#docs-chrome")).toHaveAttribute("data-dd-b");
        await expect(page.locator("#authored")).toHaveAttribute("data-dd-b");
      }
      await page.locator("#menu-button").click();
      if (theme !== "default")
        await expect(page.locator(".goog-menu")).toHaveAttribute("data-dd-b");
      await expect(
        page.locator(".goog-palette [data-dd-b],img[data-dd-c]"),
      ).toHaveCount(0);
      expect(await page.locator("#canvas").evaluate((c) => c.toDataURL())).toBe(
        source,
      );
      await page.screenshot({
        path: `artifacts/screenshots/${app}-${theme}.png`,
      });
      expect(errors).toEqual([]);
    });
for (const theme of themes)
  test(`popup / ${theme}: selected theme, complete panel below height cap and screenshot`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 384, height: 600 });
    await popup(page, theme);
    await expect(page.locator("#theme")).toBeEnabled();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator("html")).toHaveAttribute("data-dd-theme", theme);
    expect(
      await page.locator("body").evaluate((e) => e.scrollHeight),
    ).toBeLessThanOrEqual(580);
    await expect(page.locator("footer")).toBeInViewport();
    await page.screenshot({
      path: `artifacts/screenshots/popup-${theme}.png`,
      fullPage: true,
    });
  });
for (const app of Object.keys(paths))
  test(`${app}: all theme transitions change display, preserve native pixels and restore Default`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await workspace(page, app);
    await settle(page, "dark");
    const native = await page.locator("#canvas").evaluate((c) => ({
      pixels: c.toDataURL(),
      style: c.getAttribute("style"),
    }));
    for (const from of themes)
      for (const to of themes) {
        await page.evaluate((t) => __changeTheme(t), from);
        await settle(page, from);
        await page.evaluate((t) => __changeTheme(t), to);
        await settle(page, to);
        expect(
          await page.locator("#canvas").evaluate((c) => ({
            pixels: c.toDataURL(),
            style: c.getAttribute("style"),
          })),
        ).toEqual(native);
        if (to === "default")
          await expect(page.locator("darkerdocs-surface")).toHaveCount(0);
      }
  });
test("native print surfaces and serialization stay original in every theme", async ({
  page,
}) => {
  await workspace(page);
  for (const theme of themes) {
    await page.evaluate((t) => __changeTheme(t), theme);
    await settle(page, theme);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("#docs-chrome")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await expect(page.locator("#authored")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await expect(page.locator("#canvas")).toHaveCSS("opacity", "1");
    await page.emulateMedia({ media: "screen" });
  }
});
test("keyboard slider, labels, persistence and storage failure retry", async ({
  page,
}) => {
  await popup(page);
  const slider = page.locator("#theme");
  await expect(slider).toBeEnabled();
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(slider).toHaveAttribute("aria-valuetext", "OLED Black");
  await page.keyboard.press("End");
  await expect(slider).toHaveAttribute("aria-valuetext", "Cream");
  await page.keyboard.press("ArrowLeft");
  await expect(slider).toHaveAttribute("aria-valuetext", "Default");
  await page.evaluate(() => (__failWrite = true));
  await page.locator("[data-theme=cream]").click();
  await expect(page.locator("#status")).toContainText("Couldn’t save");
  await page.evaluate(() => (__failWrite = false));
  await page.locator("[data-theme=dark]").click();
  await expect(page.locator("#status")).toContainText("Saved");
});
test("a transparent title layer stays transparent and native styles never change", async ({
  page,
}) => {
  await workspace(page);
  await page
    .locator("#docs-chrome")
    .evaluate((e) =>
      e.insertAdjacentHTML(
        "beforeend",
        '<label class="docs-title-input-label" style="color:#000">Document</label><input class="docs-title-input" style="color:transparent;-webkit-text-fill-color:transparent" value="Document">',
      ),
    );
  await expect(page.locator(".docs-title-input-label")).toHaveCSS(
    "color",
    "rgb(228, 231, 236)",
  );
  await expect(page.locator(".docs-title-input")).toHaveCSS(
    "color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.locator(".docs-title-input")).toHaveCSS(
    "-webkit-text-fill-color",
    "rgba(0, 0, 0, 0)",
  );
});
test("Forms cards, editable text, pastel backgrounds and newly inserted dialogs all theme", async ({
  page,
}) => {
  await workspace(page, "forms");
  await settle(page, "dark");
  await page
    .locator("body")
    .evaluate((e) =>
      e.insertAdjacentHTML(
        "beforeend",
        '<section id="form" style="background:#eeedfc;color:#000"><article style="background:#fff"><div contenteditable="true" style="color:#000">Question</div></article></section>',
      ),
    );
  await expect(page.locator("#form")).toHaveAttribute("data-dd-b");
  await expect(page.locator("#form [contenteditable]")).toHaveCSS(
    "color",
    "rgb(228, 231, 236)",
  );
  expect(
    await page.locator("#form [contenteditable]").getAttribute("style"),
  ).toBe("color:#000");
});
test("Slides artwork and preview SVGs stay original; surrounding sidebar themes", async ({
  page,
}) => {
  await workspace(page, "slides");
  await page
    .locator("body")
    .evaluate((e) =>
      e.insertAdjacentHTML(
        "beforeend",
        '<aside id="themes" style="background:#f0f4f9;color:#000"><p>Themes</p><svg id="artwork" width="100" height="50" style="color:#000"><rect width="100" height="50" fill="#fff"/><text y="25" fill="currentColor">Original</text></svg></aside>',
      ),
    );
  await expect(page.locator("#themes")).toHaveAttribute("data-dd-b");
  await expect(page.locator("#artwork text")).toHaveCSS("fill", "rgb(0, 0, 0)");
  await expect(page.locator("#artwork rect")).toHaveCSS(
    "fill",
    "rgb(255, 255, 255)",
  );
});
test("reduced motion skips the theme animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await popup(page);
  await expect(page.locator("#theme")).toBeEnabled();
  await page.locator("[data-theme=cream]").click();
  await expect(page.locator("html")).toHaveAttribute("data-dd-theme", "cream");
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});
test("tooltips, CSS arrows, title focus and changing native control states stay readable", async ({
  page,
}) => {
  await workspace(page);
  await page
    .locator("#docs-chrome")
    .evaluate((e) =>
      e.insertAdjacentHTML(
        "beforeend",
        '<div class="docs-title-widget"><label class="docs-title-input-label">Title</label><input class="docs-title-input" value="Title"></div><div id="tip" role="tooltip" style="background:#202124;color:#fff">Tooltip</div><i id="arrow" style="border:6px solid transparent;border-top-color:#000"></i><span id="change" style="background:#fff;color:#000">Dynamic</span>',
      ),
    );
  await expect(page.locator("#tip")).toHaveCSS("color", "rgb(228, 231, 236)");
  await expect(page.locator("#arrow")).toHaveCSS(
    "border-left-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.locator("#arrow")).not.toHaveCSS(
    "border-top-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.locator(".docs-title-input")).toHaveCSS(
    "-webkit-text-fill-color",
    "rgba(0, 0, 0, 0)",
  );
  await page.locator(".docs-title-input").focus();
  await expect(page.locator(".docs-title-input-label")).toHaveCSS(
    "visibility",
    "hidden",
  );
  await expect(page.locator(".docs-title-input")).toHaveCSS(
    "-webkit-text-fill-color",
    "rgb(228, 231, 236)",
  );
  await page.locator("#change").evaluate((e) => {
    e.style.background = "transparent";
    e.style.color = "transparent";
  });
  await expect(page.locator("#change")).not.toHaveAttribute("data-dd-b");
  await expect(page.locator("#change")).not.toHaveAttribute("data-dd-c");
});
test("theme transition finishes without waiting for a suppressed animation frame", async ({
  page,
}) => {
  await workspace(page);
  await expect(page.locator("html")).toHaveAttribute("data-dd-theme", "dark");
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    __changeTheme("cream");
  });
  await expect(page.locator("html")).toHaveAttribute("data-dd-theme", "cream");
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().length), {
      timeout: 2000,
      intervals: [50, 100, 200],
    })
    .toBe(0);
});
test("masked UI icons use foreground contrast while retaining their native mask", async ({
  page,
}) => {
  await workspace(page);
  await page
    .locator("#docs-chrome")
    .evaluate((e) =>
      e.insertAdjacentHTML(
        "beforeend",
        '<span id="lock" style="display:block;width:18px;height:18px;background:#004a77;mask-image:linear-gradient(#000,#000)"></span>',
      ),
    );
  await expect(page.locator("#lock")).toHaveAttribute("data-dd-m");
  const value = await page.locator("#lock").evaluate((e) => {
    const s = getComputedStyle(e);
    return {
      rgb: DarkerDocs.parseColor(s.backgroundColor).rgb,
      mask: s.maskImage,
    };
  });
  expect(value.rgb[2]).toBeGreaterThan(200);
  expect(value.mask).toContain("linear-gradient");
});
test("file browser rows, section headings and gutters share a consistent surface", async ({
  page,
}) => {
  await workspace(page);
  await page.evaluate(() => {
    history.pushState({}, "", "/spreadsheets/u/0/");
    dispatchEvent(new Event("popstate"));
    document.body.insertAdjacentHTML(
      "beforeend",
      '<section id="browser" style="background:#111"><header style="background:#fff">Today</header><div role="listbox" style="background:#eee"><div role="option" style="background:#fff">Test file</div></div></section>',
    );
  });
  for (const selector of [
    "#browser",
    "#browser header",
    "#browser [role=listbox]",
    "#browser [role=option]",
  ])
    await expect(page.locator(selector)).toHaveCSS(
      "background-color",
      "rgb(16, 18, 20)",
    );
  await page.locator("#browser [role=option]").hover();
  await expect(page.locator("#browser [role=option]")).not.toHaveCSS(
    "background-color",
    "rgb(16, 18, 20)",
  );
});
module.exports = { settle, pixel };
