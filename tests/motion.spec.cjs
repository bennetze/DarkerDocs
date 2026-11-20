const { test, expect } = require("@playwright/test");
const { workspace, popup, paths } = require("./fixtures.cjs");

test("popup colors overlap in surface, ink, control order and retarget rapid input", async ({
  page,
}) => {
  await popup(page);
  await expect(page.locator("#theme")).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  const initial = await page
    .locator("h2")
    .evaluate((e) => getComputedStyle(e).color);
  await page.locator("[data-theme=cream]").click();
  await expect(page.locator("#theme")).toHaveValue("3");
  await expect(page.locator("#selection")).toHaveText("Cream");
  const stages = await page.evaluate(() => {
    const animations = document.getAnimations();
    const find = (selector, property) => {
      const a = animations.find(
        (a) =>
          a.effect.target.matches(selector) &&
          a.transitionProperty === property,
      );
      return (
        a && {
          delay: a.effect.getTiming().delay,
          duration: a.effect.getTiming().duration,
        }
      );
    };
    animations.forEach((a) => {
      a.pause();
      a.currentTime = 100;
    });
    return {
      surface: find("body", "background-color"),
      ink: find("h2", "color"),
      control: find("output", "color"),
      inkAt100: getComputedStyle(document.querySelector("h2")).color,
    };
  });
  expect(stages.surface).toEqual({ delay: 0, duration: 900 });
  expect(stages.ink).toEqual({ delay: 120, duration: 760 });
  expect(stages.control).toEqual({ delay: 240, duration: 740 });
  expect(stages.inkAt100).toBe(initial);
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
  await page.locator("#theme").focus();
  for (const key of ["Home", "End", "ArrowLeft", "Home"])
    await page.keyboard.press(key);
  await expect(page.locator("#status")).toContainText("Saved");
  await expect(page.locator("html")).toHaveAttribute("data-dd-theme", "oled");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
  expect(await page.evaluate(() => __writes.at(-1))).toEqual({
    "darkerdocs.settings.v1": { theme: "oled" },
  });
});

for (const app of Object.keys(paths))
  test(`${app}: staggered snapshots keep source pixels original and release their names`, async ({
    page,
  }) => {
    await workspace(page, app);
    await expect(page.locator("html")).toHaveAttribute("data-dd-theme", "dark");
    const original = await page
      .locator("#canvas")
      .evaluate((c) => c.toDataURL());
    await page.evaluate(() => __changeTheme("cream"));
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.getAnimations().filter((a) => a.animationName === "dd-in")
              .length,
        ),
      )
      .toBeGreaterThan(2);
    const stages = await page.evaluate(() => {
      const animations = document.getAnimations();
      animations.forEach((a) => a.pause());
      return animations
        .filter((a) => a.animationName === "dd-in")
        .map((a) => ({
          pseudo: a.effect.pseudoElement,
          delay: a.effect.getTiming().delay,
          duration: a.effect.getTiming().duration,
        }));
    });
    expect(stages).toEqual(
      expect.arrayContaining([
        { pseudo: "::view-transition-new(root)", delay: 0, duration: 900 },
        {
          pseudo: "::view-transition-new(dd-text-0)",
          delay: 120,
          duration: 760,
        },
        {
          pseudo: "::view-transition-new(dd-control-0)",
          delay: 240,
          duration: 740,
        },
      ]),
    );
    expect(await page.locator("#canvas").evaluate((c) => c.toDataURL())).toBe(
      original,
    );
    await page.evaluate(() =>
      document.getAnimations().forEach((a) => {
        a.currentTime = 450;
      }),
    );
    const box = await page.locator("img").boundingBox();
    const png = (
      await page.screenshot({
        path: `artifacts/screenshots/${app}-transition-midpoint.png`,
      })
    ).toString("base64");
    const imagePixels = await page.evaluate(
      async ({ png, x, y }) => {
        const image = new Image();
        image.src = "data:image/png;base64," + png;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        return [15, 50].map((offset) => [
          ...ctx.getImageData(Math.round(x + offset), Math.round(y + 15), 1, 1)
            .data,
        ]);
      },
      { png, x: box.x, y: box.y },
    );
    // Snapshot alpha compositing can round an 8-bit channel by one level.
    const expected = [
      [234, 67, 53, 255],
      [66, 133, 244, 255],
    ];
    imagePixels.forEach((pixel, i) =>
      pixel.forEach((value, c) =>
        expect(Math.abs(value - expected[i][c])).toBeLessThanOrEqual(1),
      ),
    );
    await page.evaluate(() =>
      document.getAnimations().forEach((a) => a.finish()),
    );
    await expect(
      page.locator("[data-dd-motion],html[data-dd-animating]"),
    ).toHaveCount(0);
    await expect(page.locator("#menu-button")).toHaveCSS(
      "view-transition-name",
      "none",
    );
  });

test("printing and reduced motion interrupt active page snapshots cleanly", async ({
  page,
}) => {
  await workspace(page);
  await expect(page.locator("html")).toHaveAttribute("data-dd-theme", "dark");
  await page.evaluate(() => __changeTheme("cream"));
  await expect(page.locator("html")).toHaveAttribute("data-dd-animating", "");
  await page.emulateMedia({ media: "print" });
  await expect(
    page.locator("[data-dd-motion],html[data-dd-animating]"),
  ).toHaveCount(0);
  await expect(page.locator("#canvas")).toHaveCSS("opacity", "1");
  await expect(page.locator("#authored")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.emulateMedia({ media: "screen", reducedMotion: "reduce" });
  for (const app of Object.keys(paths)) {
    await workspace(page, app);
    await page.evaluate(() => __changeTheme("oled"));
    await expect(page.locator("html")).toHaveAttribute("data-dd-theme", "oled");
    await expect(
      page.locator("[data-dd-motion],html[data-dd-animating]"),
    ).toHaveCount(0);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  }
});

test("page transitions survive rapid changes and entering the Sheets output pane", async ({
  page,
}) => {
  await workspace(page, "sheets");
  await expect(page.locator("html")).toHaveAttribute("data-dd-theme", "dark");
  await page.evaluate(() => {
    __changeTheme("cream");
    __changeTheme("default");
    __changeTheme("oled");
  });
  await expect(page.locator("html")).toHaveAttribute("data-dd-theme", "oled");
  await expect(
    page.locator("[data-dd-motion],html[data-dd-animating]"),
  ).toHaveCount(0);
  await page.evaluate(() => __changeTheme("cream"));
  await expect(page.locator("html")).toHaveAttribute("data-dd-animating", "");
  await page.evaluate(() => {
    const pane = document.createElement("div");
    pane.className = "waffle-printing-pane";
    pane.textContent = "Original print preview";
    document.body.append(pane);
  });
  await expect(page.locator("html")).not.toHaveAttribute("data-dd-theme");
  await expect(
    page.locator("[data-dd-motion],html[data-dd-animating],darkerdocs-surface"),
  ).toHaveCount(0);
  await page.locator(".waffle-printing-pane").evaluate((e) => e.remove());
  await expect(page.locator("html")).toHaveAttribute("data-dd-theme", "cream");
});
