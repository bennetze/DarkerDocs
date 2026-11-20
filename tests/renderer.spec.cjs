const { test, expect } = require("@playwright/test");
const { workspace } = require("./fixtures.cjs");
async function theme(page, t) {
  await page.evaluate((t) => __changeTheme(t), t);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.dataset.ddTheme || "default",
      ),
    )
    .toBe(t);
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  await expect(page.locator("html")).not.toHaveAttribute("data-dd-animating");
}
async function visualPixel(page, x, y) {
  const png = (await page.screenshot()).toString("base64");
  return page.evaluate(
    async ({ png, x, y }) => {
      const image = new Image();
      image.src = "data:image/png;base64," + png;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const c = canvas.getContext("2d");
      c.drawImage(image, 0, 0);
      return [...c.getImageData(Math.round(x), Math.round(y), 1, 1).data];
    },
    { png, x, y },
  );
}
test("Docs/Sheets display copies recolor solid paint but keep monochrome image pixels and exports", async ({
  page,
}) => {
  await workspace(page);
  await theme(page, "oled");
  await page.locator("#canvas").evaluate((c) => {
    c.width = 300;
    c.height = 90;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 300, 90);
    ctx.fillStyle = "#000";
    ctx.fillRect(10, 10, 30, 30);
    const image = document.createElement("canvas");
    image.width = 20;
    image.height = 20;
    const ic = image.getContext("2d");
    const pixels = ic.createImageData(20, 20);
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
      pixels.data[i + 3] = 255;
    }
    ic.putImageData(pixels, 0, 0);
    ctx.drawImage(image, 80, 10);
  });
  await expect(page.locator("darkerdocs-surface")).not.toHaveCount(0);
  const box = await page.locator("#canvas").boundingBox();
  expect((await visualPixel(page, box.x + 60, box.y + 50)).slice(0, 3)).toEqual(
    [0, 0, 0],
  );
  expect((await visualPixel(page, box.x + 20, box.y + 20)).slice(0, 3)).toEqual(
    [232, 234, 237],
  );
  expect((await visualPixel(page, box.x + 85, box.y + 15)).slice(0, 3)).toEqual(
    [255, 255, 255],
  );
  const native = await page
    .locator("#canvas")
    .evaluate((c) => [...c.getContext("2d").getImageData(60, 50, 1, 1).data]);
  expect(native).toEqual([255, 255, 255, 255]);
  await theme(page, "cream");
  expect((await visualPixel(page, box.x + 60, box.y + 50)).slice(0, 3)).toEqual(
    [255, 228, 183],
  );
  expect((await visualPixel(page, box.x + 85, box.y + 15)).slice(0, 3)).toEqual(
    [255, 255, 255],
  );
});
test("offscreen drawing replay updates nested text tiles across themes", async ({
  page,
}) => {
  await workspace(page);
  await theme(page, "oled");
  await page.locator("#canvas").evaluate((c) => {
    c.width = 300;
    const src = document.createElement("canvas");
    src.width = 60;
    src.height = 60;
    const s = src.getContext("2d");
    s.fillStyle = "#fff";
    s.fillRect(0, 0, 60, 60);
    s.fillStyle = "#000";
    s.fillRect(10, 10, 20, 20);
    c.getContext("2d").drawImage(src, 0, 0);
  });
  const box = await page.locator("#canvas").boundingBox();
  expect((await visualPixel(page, box.x + 45, box.y + 45)).slice(0, 3)).toEqual(
    [0, 0, 0],
  );
  await theme(page, "cream");
  expect((await visualPixel(page, box.x + 45, box.y + 45)).slice(0, 3)).toEqual(
    [255, 228, 183],
  );
});
test("canvas width resets, clipping and transforms preserve native serialization", async ({
  page,
}) => {
  await workspace(page);
  await theme(page, "dark");
  const original = await page.locator("#canvas").evaluate((c) => {
    c.setAttribute("width", "300");
    const x = c.getContext("2d");
    x.save();
    x.translate(20, 10);
    x.beginPath();
    x.rect(0, 0, 50, 50);
    x.clip();
    x.fillStyle = "#fff";
    x.fillRect(0, 0, 100, 100);
    x.restore();
    return c.toDataURL();
  });
  for (const t of ["cream", "oled", "default", "dark"]) {
    await theme(page, t);
    expect(await page.locator("#canvas").evaluate((c) => c.toDataURL())).toBe(
      original,
    );
  }
});
test("oversized replay preserves a readable original surface and reports a reload fallback", async ({
  page,
}) => {
  await workspace(page);
  await theme(page, "oled");
  const native = await page.locator("#canvas").evaluate((c) => {
    c.getContext("2d").putImageData(new ImageData(2000, 2000), 0, 0);
    return c.toDataURL();
  });
  await expect(page.locator("#canvas")).toHaveAttribute(
    "data-dd-canvas-fallback",
  );
  await expect(page.locator("#canvas")).not.toHaveAttribute(
    "data-dd-source-canvas",
  );
  await expect(page.locator("#darkerdocs-notice")).toBeVisible();
  expect(await page.locator("#canvas").evaluate((c) => c.toDataURL())).toBe(
    native,
  );
  await theme(page, "default");
  await expect(page.locator("#darkerdocs-notice")).toHaveCount(0);
  await expect(page.locator("#canvas")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
});
test("large scratch tiles and repeated cropped draws stay themed across scrolling and theme switches", async ({
  page,
}) => {
  await workspace(page, "sheets", "oled");
  await theme(page, "oled");
  await page.locator("#canvas").evaluate((c) => {
    c.width = 300;
    c.height = 100;
    const tile = document.createElement("canvas");
    tile.width = 4000;
    tile.height = 2000;
    const x = tile.getContext("2d");
    x.fillStyle = "#fff";
    x.fillRect(0, 0, 4000, 2000);
    const out = c.getContext("2d");
    for (let i = 0; i < 100; i++)
      out.drawImage(tile, 0, 0, 30, 30, 0, 0, 30, 30);
  });
  await expect(page.locator("#canvas")).not.toHaveAttribute(
    "data-dd-canvas-fallback",
  );
  await theme(page, "cream");
  await expect(page.locator("#canvas")).not.toHaveAttribute(
    "data-dd-canvas-fallback",
  );
  const b = await page.locator("#canvas").boundingBox();
  expect((await visualPixel(page, b.x + 10, b.y + 10)).slice(0, 3)).toEqual([
    255, 228, 183,
  ]);
});
test("repeated image repainting reuses an unchanged image and preserves its pixels", async ({
  page,
}) => {
  await workspace(page, "docs", "oled");
  await theme(page, "oled");
  await page.locator("#canvas").evaluate(async (c) => {
    c.width = 300;
    c.height = 100;
    const source = document.createElement("canvas");
    source.width = 400;
    source.height = 400;
    const x = source.getContext("2d");
    x.fillStyle = "#fff";
    x.fillRect(0, 0, 400, 400);
    const image = new Image();
    image.src = source.toDataURL();
    await image.decode();
    for (let i = 0; i < 100; i++)
      c.getContext("2d").drawImage(image, 0, 0, 50, 50);
  });
  await expect(page.locator("#canvas")).not.toHaveAttribute(
    "data-dd-canvas-fallback",
  );
  await theme(page, "cream");
  const b = await page.locator("#canvas").boundingBox();
  expect((await visualPixel(page, b.x + 10, b.y + 10)).slice(0, 3)).toEqual([
    255, 255, 255,
  ]);
});
test("ambiguous gradient artwork preserves its whole surface without changing native drawing", async ({
  page,
}) => {
  await workspace(page);
  await theme(page, "oled");
  const original = await page.locator("#canvas").evaluate((c) => {
    const x = c.getContext("2d"),
      g = x.createLinearGradient(0, 0, 300, 0);
    g.addColorStop(0, "#fff");
    g.addColorStop(1, "#ff0000");
    x.fillStyle = g;
    x.fillRect(0, 0, 300, 100);
    x.fillStyle = "#000";
    x.fillText("Original gradient artwork", 10, 30);
    return c.toDataURL();
  });
  await expect(page.locator("#canvas")).toHaveAttribute(
    "data-dd-canvas-fallback",
  );
  await expect(page.locator("#canvas")).toHaveCSS("opacity", "1");
  await expect(page.locator("#darkerdocs-notice")).toContainText(
    "original appearance",
  );
  expect(await page.locator("#canvas").evaluate((c) => c.toDataURL())).toBe(
    original,
  );
  await page
    .locator("body")
    .evaluate((e) =>
      e.insertAdjacentHTML(
        "beforeend",
        '<div class="waffle-printing-pane" style="height:100px">Print settings</div>',
      ),
    );
  await expect(page.locator("#darkerdocs-notice")).toHaveCount(0);
});
test("complete repaints release obsolete image history without losing paths or state", async ({
  page,
}) => {
  await workspace(page);
  await theme(page, "oled");
  await page.locator("#canvas").evaluate((c) => {
    c.width = 300;
    c.height = 100;
    const source = document.createElement("canvas");
    source.width = 1000;
    source.height = 1000;
    source.getContext("2d").fillRect(0, 0, 1000, 1000);
    const x = c.getContext("2d");
    for (let i = 0; i < 5; i++) {
      x.clearRect(0, 0, 300, 100);
      x.drawImage(source, 0, 0, 100, 100);
    }
    x.beginPath();
    x.rect(110, 10, 20, 20);
    x.clearRect(0, 0, 300, 100);
    x.fillStyle = "#000";
    x.fill();
  });
  await expect(page.locator("#canvas")).not.toHaveAttribute(
    "data-dd-canvas-fallback",
  );
  await theme(page, "cream");
  const b = await page.locator("#canvas").boundingBox();
  expect((await visualPixel(page, b.x + 120, b.y + 20)).slice(0, 3)).toEqual([
    63, 42, 24,
  ]);
});
test("non-finite rectangle calls do not discard earlier paint when replaying", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await workspace(page, "docs", "oled");
  const native = await page.locator("#canvas").evaluate((canvas) => {
    canvas.width = 300;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ea4335";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const original = canvas.toDataURL();
    ctx.clearRect(NaN, 0, canvas.width, canvas.height);
    ctx.fillRect(0, 0, Infinity, canvas.height);
    return { original, current: canvas.toDataURL() };
  });
  expect(native.current).toBe(native.original);
  const box = await page.locator("#canvas").boundingBox();
  await theme(page, "cream");
  expect(await visualPixel(page, box.x + 12, box.y + 12)).toEqual([
    234, 67, 53, 255,
  ]);
  await theme(page, "default");
  expect(await page.locator("#canvas").evaluate((c) => c.toDataURL())).toBe(
    native.original,
  );
});
test("mutable OffscreenCanvas pixels stay frozen at the time of the draw", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await workspace(page, "sheets", "oled");
  const original = await page.locator("#canvas").evaluate((canvas) => {
    canvas.width = 300;
    const source = new OffscreenCanvas(40, 40);
    const image = source.getContext("2d");
    image.fillStyle = "#f00";
    image.fillRect(0, 0, 40, 40);
    canvas.getContext("2d").drawImage(source, 0, 0);
    image.fillStyle = "#0f0";
    image.fillRect(0, 0, 40, 40);
    return canvas.toDataURL();
  });
  const box = await page.locator("#canvas").boundingBox();
  for (const mode of ["cream", "default", "dark", "oled"]) {
    await theme(page, mode);
    expect(await visualPixel(page, box.x + 12, box.y + 12)).toEqual([
      255, 0, 0, 255,
    ]);
    expect(await page.locator("#canvas").evaluate((c) => c.toDataURL())).toBe(
      original,
    );
  }
});
test("display copies track the source canvas visibility and opacity", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await workspace(page, "docs", "oled");
  const canvas = page.locator("#canvas");
  const copy = page.locator("darkerdocs-surface");
  await expect(copy).toBeVisible();
  await canvas.evaluate((e) => {
    e.style.visibility = "hidden";
    e.style.opacity = "0.45";
  });
  await expect(copy).toBeHidden();
  await theme(page, "cream");
  await expect(copy).toBeHidden();
  await canvas.evaluate((e) => (e.style.visibility = "visible"));
  await expect(copy).toBeVisible();
  await expect(copy).toHaveCSS("opacity", "0.45");
  await theme(page, "default");
  await expect(copy).toHaveCount(0);
  await expect(canvas).toHaveCSS("opacity", "0.45");
});
for (const mode of ["oled", "dark", "default", "cream"])
  test(`Sheets in-app print preview stays original and restores ${mode} on exit`, async ({
    page,
  }) => {
    await workspace(page, "sheets", mode);
    await theme(page, mode);
    const native = await page.locator("#canvas").evaluate((c) => c.toDataURL());
    await page
      .locator("body")
      .evaluate((e) =>
        e.insertAdjacentHTML(
          "beforeend",
          '<div class="waffle-printing-pane" style="width:500px;height:100px;background:#fff;color:#000">Print settings</div>',
        ),
      );
    await expect(page.locator("html")).not.toHaveAttribute("data-dd-theme");
    await expect(page.locator("darkerdocs-surface")).toHaveCount(0);
    await expect(page.locator(".waffle-printing-pane")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await expect(page.locator("#canvas")).toHaveCSS("opacity", "1");
    await page
      .locator(".waffle-printing-pane")
      .evaluate((e) => (e.style.display = "none"));
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.dataset.ddTheme || "default",
        ),
      )
      .toBe(mode);
    expect(await page.locator("#canvas").evaluate((c) => c.toDataURL())).toBe(
      native,
    );
    const pane = page.locator(".waffle-printing-pane");
    await pane.evaluate((e) => {
      e.hidden = true;
      e.style.display = "";
    });
    await theme(page, mode);
    await pane.evaluate((e) => (e.hidden = false));
    await expect(pane).toBeVisible();
    await expect(page.locator("html")).not.toHaveAttribute("data-dd-theme");
    await expect(page.locator("darkerdocs-surface")).toHaveCount(0);
    await expect(page.locator("#canvas")).toHaveCSS("opacity", "1");
    await pane.evaluate((e) => (e.hidden = true));
    await expect(pane).toBeHidden();
    if (mode !== "default")
      await expect(page.locator("html")).toHaveAttribute("data-dd-theme", mode);
    else await expect(page.locator("html")).not.toHaveAttribute("data-dd-theme");
    expect(await page.locator("#canvas").evaluate((c) => c.toDataURL())).toBe(
      native,
    );
  });
