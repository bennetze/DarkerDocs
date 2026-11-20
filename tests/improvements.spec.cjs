const { test, expect } = require("@playwright/test");
const { workspace, popup, read } = require("./fixtures.cjs");
async function frame(page) {
  await page.evaluate(() => new Promise(requestAnimationFrame));
}
async function metrics(page) {
  return page.evaluate(() => {
    document.dispatchEvent(new Event("darkerdocs:metrics"));
    return JSON.parse(document.documentElement.dataset.ddRenderer || "{}");
  });
}

test("failed startup read cannot replace a newer page selection", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await workspace(page, "docs", "dark", { readDelay: 400, failRead: true });
  await page.evaluate(() => __changeTheme("cream"));
  await page.waitForTimeout(500);
  await expect(page.locator("html")).toHaveAttribute("data-dd-theme", "cream");
});
for (const failRead of [false, true])
  test(`popup startup preserves newer cross-tab selection when read ${failRead ? "fails" : "succeeds"}`, async ({
    page,
  }) => {
    await popup(page, "dark", { readDelay: 400, failRead });
    await page.evaluate(() => __changeTheme("cream"));
    await page.waitForTimeout(500);
    await expect(page.locator("html")).toHaveAttribute(
      "data-dd-theme",
      "cream",
    );
    await expect(page.locator("#theme")).toHaveValue("3");
    await expect(page.locator("#theme")).toBeEnabled();
  });
test("explicit Retry recovers preference read and write failures", async ({
  page,
}) => {
  await popup(page, "dark", { failRead: true });
  await expect(page.locator("#retry")).toBeVisible();
  await page.evaluate(() => (__failRead = false));
  await page.locator("#retry").click();
  await expect(page.locator("#theme")).toBeEnabled();
  await page.evaluate(() => (__failWrite = true));
  await page.locator("[data-theme=cream]").click();
  await expect(page.locator("#retry")).toBeVisible();
  await page.evaluate(() => (__failWrite = false));
  await page.locator("#retry").click();
  await expect(page.locator("#status")).toContainText("Saved");
  await expect(page.locator("#retry")).toBeHidden();
  expect(await page.evaluate(() => __writes.at(-1))).toEqual({
    "darkerdocs.settings.v1": { theme: "cream" },
  });
});
test("a storage update after a failed read unlocks the popup", async ({
  page,
}) => {
  await popup(page, "dark", { failRead: true });
  await expect(page.locator("#retry")).toBeVisible();
  await expect(page.locator("#theme")).toBeDisabled();
  await page.evaluate(() => __changeTheme("cream"));
  await expect(page.locator("#retry")).toBeHidden();
  await expect(page.locator("#theme")).toBeEnabled();
  await expect(page.locator("#theme")).toHaveValue("3");
  await page.locator("[data-theme=oled]").click();
  await expect(page.locator("#status")).toContainText("Saved");
  expect(await page.evaluate(() => __writes.at(-1))).toEqual({
    "darkerdocs.settings.v1": { theme: "oled" },
  });
});
test("themed palette switches reuse color tokens and still remeasure changed DOM", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await workspace(page);
  const toolbar = page.locator(".goog-toolbar").first();
  const rule = await toolbar.getAttribute("data-dd-b");
  expect(rule).toBeTruthy();
  await page.evaluate(() => {
    window.__colorChanges = [];
    const toolbar = document.querySelector(".goog-toolbar");
    new MutationObserver((records) => __colorChanges.push(...records)).observe(
      toolbar,
      { attributes: true, attributeFilter: ["data-dd-b"] },
    );
    __changeTheme("cream");
  });
  await expect(toolbar).toHaveCSS("background-color", "rgb(245, 213, 161)");
  expect(await page.evaluate(() => __colorChanges.length)).toBe(0);
  await toolbar.evaluate((e) => {
    e.style.backgroundColor = "#4e9b37";
    __changeTheme("oled");
  });
  await expect(toolbar).not.toHaveAttribute("data-dd-b", rule);
  await page.evaluate(() => __changeTheme("default"));
  await expect(toolbar).not.toHaveAttribute("data-dd-b");
  await expect(toolbar).toHaveCSS("background-color", "rgb(78, 155, 55)");
});
test("illustrative previews never change the shared setting and Slides paper stays original", async ({
  page,
}) => {
  await popup(page, "oled");
  await expect(page.locator("#theme")).toBeEnabled();
  for (const app of ["sheets", "slides", "forms", "docs"]) {
    await page.locator(`[data-preview=${app}]`).click();
    await expect(page.locator(`[data-preview=${app}]`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    if (app === "slides")
      await expect(page.locator(".preview-sheet")).toHaveCSS(
        "background-color",
        "rgb(255, 255, 255)",
      );
  }
  expect(await page.evaluate(() => __writes.length)).toBe(0);
  await expect(page.locator("#selection")).toHaveAttribute(
    "aria-live",
    "polite",
  );
  await expect(page.locator(".help-link")).toHaveAttribute(
    "href",
    "../diagnostics.html",
  );
});
test("generated CSS reuses slots through color churn and releases detached elements", async ({
  page,
}) => {
  await workspace(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    const e = document.createElement("span");
    e.id = "churn";
    document.body.append(e);
  });
  for (let i = 0; i < 40; i++) {
    await page.locator("#churn").evaluate((e, i) => {
      e.style.color = `rgb(${i * 5},40,90)`;
    }, i);
    await frame(page);
  }
  const count = await page.evaluate(
    () =>
      document.querySelector("#darkerdocs-colors").sheet.cssRules[0].cssRules
        .length,
  );
  expect(count).toBeLessThan(350);
  await page.locator("#churn").evaluate((e) => {
    window.__detached = e;
    e.remove();
  });
  await frame(page);
  expect(await page.evaluate(() => __detached.hasAttribute("data-dd-c"))).toBe(
    false,
  );
  await page.evaluate(() => __changeTheme("default"));
  await expect(page.locator("#darkerdocs-colors,[data-dd-c]")).toHaveCount(0);
});
test("live color rule capacity is bounded with an explicit preservation fallback", async ({
  page,
}) => {
  test.setTimeout(45000);
  await workspace(page);
  await page.evaluate(() => {
    const root = document.createElement("div");
    root.id = "many-colors";
    for (let i = 0; i < 4300; i++) {
      const e = document.createElement("span");
      e.style.color = `rgb(${i % 256},${Math.floor(i / 256)},80)`;
      root.append(e);
    }
    document.body.append(root);
  });
  await expect(page.locator("#darkerdocs-notice")).toContainText(
    "many different styles",
  );
  await expect(page.locator("#darkerdocs-colors")).toHaveCount(0);
  await expect(page.locator("#darkerdocs-notice")).toHaveCSS(
    "position",
    "fixed",
  );
  await expect(page.locator("#darkerdocs-notice summary")).toBeInViewport();
  await expect(page.locator("html")).not.toHaveAttribute("data-dd-theme");
  await expect(page.locator("darkerdocs-surface,[data-dd-c]")).toHaveCount(0);
  await page.locator("#many-colors").evaluate((e) => e.remove());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => __changeTheme("cream"));
  await frame(page);
  await expect(page.locator("#darkerdocs-notice")).toHaveCount(0);
});
test("aggregate canvas memory is bounded and Default releases display bitmaps", async ({
  page,
}) => {
  await workspace(page, "sheets", "oled");
  const result = await page.evaluate(() => {
    window.__large = [];
    for (let i = 0; i < 8; i++) {
      const c = document.createElement("canvas");
      c.width = 2000;
      c.height = 2000;
      document.body.append(c);
      const x = c.getContext("2d");
      x.fillStyle = "#fff";
      x.fillRect(0, 0, 2000, 2000);
      __large.push(c);
    }
    return __large.map((c) => [
      ...c.getContext("2d").getImageData(0, 0, 1, 1).data,
    ]);
  });
  result.forEach((pixel) => expect(pixel).toEqual([255, 255, 255, 255]));
  const current = await metrics(page);
  expect(current.reasons.memory).toBeGreaterThan(0);
  expect(current.retainedBytes + current.scratchBytes).toBeLessThanOrEqual(
    current.limitBytes,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => __changeTheme("default"));
  expect((await metrics(page)).bitmapBytes).toBe(0);
  await expect(page.locator("darkerdocs-surface")).toHaveCount(0);
});
test("bookkeeping errors cannot escape after a successful native draw", async ({
  page,
}) => {
  await workspace(page, "docs", "oled");
  const result = await page.locator("#canvas").evaluate((c) => {
    const x = c.getContext("2d"),
      pixels = x.createImageData(1, 1);
    pixels.data.set([30, 60, 90, 255]);
    const Original = window.ImageData;
    window.ImageData = class {
      constructor() {
        throw Error("simulated copy failure");
      }
    };
    let returned, error;
    try {
      returned = x.putImageData(pixels, 0, 0);
    } catch (e) {
      error = e.message;
    } finally {
      window.ImageData = Original;
    }
    return {
      returned: returned === undefined,
      error,
      pixel: [...x.getImageData(0, 0, 1, 1).data],
    };
  });
  expect(result).toEqual({
    returned: true,
    error: undefined,
    pixel: [30, 60, 90, 255],
  });
  await expect(page.locator("#canvas")).toHaveAttribute(
    "data-dd-canvas-fallback",
  );
  expect((await metrics(page)).reasons.display).toBe(1);
});
test("preservation notices explain persistent limits, can expand and dismiss", async ({
  page,
}) => {
  await workspace(page, "docs", "oled");
  await page
    .locator("#canvas")
    .evaluate((c) =>
      c.getContext("2d").putImageData(new ImageData(2000, 2000), 0, 0),
    );
  const notice = page.locator("#darkerdocs-notice");
  await expect(notice).toContainText("temporarily");
  await notice.locator("summary").click();
  await expect(notice.locator("p")).toBeVisible();
  await notice.getByRole("button", { name: "Dismiss" }).click();
  await expect(notice).toHaveCount(0);
  await page
    .locator("body")
    .evaluate((e) => e.append(document.createElement("div")));
  await frame(page);
  await expect(notice).toHaveCount(0);
});
for (const theme of ["oled", "dark", "cream"])
  test(`${theme}: actual text/background pairs retain readable contrast`, async ({
    page,
  }) => {
    await workspace(page, "forms", theme);
    await page.evaluate(() => {
      for (const background of [
        "#fff",
        "#202124",
        "#ffff00",
        "#d9ead3",
        "#4285f4",
      ])
        for (const color of ["#000", "#777", "#ea4335", "#4285f4", "#34a853"]) {
          const e = document.createElement("span");
          e.className = "contrast-pair";
          e.style.cssText = `background:${background};color:${color};padding:8px`;
          e.textContent = "Question";
          document.body.append(e);
        }
    });
    await expect(page.locator(".contrast-pair[data-dd-c]")).toHaveCount(25);
    const ratios = await page.locator(".contrast-pair").evaluateAll((nodes) =>
      nodes.map((e) => {
        const s = getComputedStyle(e);
        return DarkerDocs.contrastRatio(s.color, s.backgroundColor);
      }),
    );
    ratios.forEach((value) => expect(value).toBeGreaterThanOrEqual(4.5));
  });
test("popup enlarged text stays keyboard reachable with vertical scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 384, height: 600 });
  await popup(page);
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({
    content:
      "body{font-size:18px}h2{font-size:23px}.theme-labels button{font-size:12px}.preservation,.help-link,.status{font-size:13px}",
  });
  await expect(page.locator("#theme")).toBeEnabled();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(384);
  await page.locator(".help-link").focus();
  await expect(page.locator(".help-link")).toBeFocused();
  await page.locator("#theme").focus();
  await page.keyboard.press("End");
  await expect(page.locator("#theme")).toHaveAttribute(
    "aria-valuetext",
    "Cream",
  );
});

test("diagnostics correlate requests, omit private fields, and recover clipboard failures", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const listeners = [];
    let request;
    window.chrome = {
      runtime: {
        id: "fixture-extension",
        getManifest: () => ({ version: "0.3.1" }),
        onMessage: { addListener: (fn) => listeners.push(fn) },
      },
      storage: {
        local: {
          get: async () => ({}),
          set: async (values) => {
            request = values["darkerdocs.diagnostics.request"];
          },
        },
        onChanged: { addListener() {} },
      },
    };
    window.__respond = (data, valid = true) =>
      listeners.forEach((fn) =>
        fn(
          {
            type: "darkerdocs:diagnostics:result",
            requestId: valid ? request : 0,
            data,
          },
          {
            id: "fixture-extension",
            url: "https://docs.google.com/document/d/private/edit",
            tab: { id: 1 },
          },
        ),
      );
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw Error("denied");
        },
      },
    });
  });
  await page.route("https://diagnostics.test/**", (route) => {
    const name =
      new URL(route.request().url()).pathname.slice(1) || "diagnostics.html";
    const type = name.endsWith(".js")
      ? "application/javascript"
      : name.endsWith(".css")
        ? "text/css"
        : name.endsWith(".html")
          ? "text/html"
          : "application/octet-stream";
    return route.fulfill({ contentType: type, body: read(name) });
  });
  await page.goto("https://diagnostics.test/diagnostics.html");
  await page.evaluate(() =>
    __respond(
      {
        app: "docs",
        selectedTheme: "dark",
        appliedTheme: "dark",
        appearance: "surface-fallback",
        text: "private document text",
        url: "secret",
        renderer: JSON.stringify({
          reasons: { memory: 1 },
          overflow: 1,
          retainedBytes: 1024,
          limitBytes: 10000,
        }),
      },
      false,
    ),
  );
  await expect(page.locator(".result")).toHaveCount(0);
  await page.evaluate(() =>
    __respond({
      app: "docs",
      selectedTheme: "dark",
      appliedTheme: "dark",
      appearance: "surface-fallback",
      text: "private document text",
      url: "secret",
      surfaces: [{ classes: "private content" }],
      renderer: JSON.stringify({
        reasons: { memory: 1 },
        overflow: 1,
        retainedBytes: 1024,
        limitBytes: 10000,
      }),
    }),
  );
  await expect(page.locator(".result")).toContainText("Display-memory limit");
  await expect(page.locator(".result")).toContainText(
    "Some surfaces stay original (preservation fallback)",
  );
  await page.locator("#copy").click();
  await expect(page.locator("#copy-fallback")).toBeVisible();
  const data = await page.locator("#copy-fallback").inputValue();
  expect(data).not.toMatch(/private|secret|https:/);
  expect(JSON.parse(data)).toMatchObject({
    version: "0.3.1",
    pages: [
      {
        selectedTheme: "dark",
        appliedTheme: "dark",
        appearance: "surface-fallback",
      },
    ],
  });
});

for (const mode of ["oled", "dark", "default", "cream"])
  test(`Slides notes SVG text adapts independently of original artwork / ${mode}`, async ({
    page,
  }) => {
    await workspace(page, "slides", mode);
    await page.evaluate(() =>
      document.body.insertAdjacentHTML(
        "beforeend",
        '<section aria-label="Speaker notes" style="background:#fff;color:#000"><svg width="200" height="40"><text id="note-ink" y="25" fill="#000">Notes fixture</text></svg></section><svg id="slide-art" width="200" height="40"><rect width="200" height="40" fill="#fff"/><text y="25" fill="#000">Slide artwork</text></svg>',
      ),
    );
    if (mode === "default")
      await expect(page.locator("#note-ink")).toHaveCSS("fill", "rgb(0, 0, 0)");
    else {
      await expect(page.locator("#note-ink")).toHaveAttribute("data-dd-f");
      const fill = await page
        .locator("#note-ink")
        .evaluate((e) => getComputedStyle(e).fill);
      expect(fill).not.toBe("rgb(0, 0, 0)");
    }
    await expect(page.locator("#slide-art text")).toHaveCSS(
      "fill",
      "rgb(0, 0, 0)",
    );
    await expect(page.locator("#slide-art rect")).toHaveCSS(
      "fill",
      "rgb(255, 255, 255)",
    );
  });
