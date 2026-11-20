// Synthetic workload only: never connects to the user's browser or account.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { workspace, popup } = require("../tests/fixtures.cjs");
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const sizing = await browser.newPage({
      viewport: { width: 225, height: 600 },
    });
    await popup(sizing);
    await sizing.waitForFunction(
      () => !document.querySelector("#theme").disabled,
    );
    await sizing.evaluate(() => document.fonts.ready);
    const popupLayout = await sizing.evaluate(() => ({
      width: document.body.getBoundingClientRect().width,
      height: document.body.scrollHeight,
    }));
    if (popupLayout.width !== 384 || popupLayout.height > 580)
      throw Error("Popup intrinsic sizing regressed");
    await sizing.close();
    const page = await browser.newPage();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await workspace(page, "sheets", "dark");
    const result = await page.evaluate(async () => {
      const root = document.createElement("section");
      for (let i = 0; i < 3000; i++) {
        const cell = document.createElement("span");
        cell.textContent = "Fixture cell";
        cell.style.cssText = `display:inline-block;padding:4px;background:rgb(${220 + (i % 35)},240,230);color:#202124`;
        root.append(cell);
      }
      document.body.append(root);
      const canvases = Array.from({ length: 16 }, () => {
        const c = document.createElement("canvas");
        c.width = 512;
        c.height = 256;
        root.append(c);
        return c;
      });
      await new Promise(requestAnimationFrame);
      const draw = [];
      for (let iteration = 0; iteration < 40; iteration++) {
        const start = performance.now();
        for (const canvas of canvases) {
          const c = canvas.getContext("2d");
          c.fillStyle = "#fff";
          c.fillRect(0, 0, 512, 256);
          c.fillStyle = "#000";
          c.fillText("Scrolling fixture", 10, 30);
        }
        draw.push(performance.now() - start);
        await new Promise(requestAnimationFrame);
      }
      const transitions = [];
      const dom = [];
      const renderer = [];
      const dispatch = document.dispatchEvent;
      let canvasTime = 0;
      document.dispatchEvent = function (event) {
        if (event.type !== "darkerdocs:theme") return dispatch.call(this, event);
        const start = performance.now();
        try {
          return dispatch.call(this, event);
        } finally {
          canvasTime += performance.now() - start;
        }
      };
      for (let i = 0; i < 12; i++) {
        canvasTime = 0;
        const start = performance.now();
        __changeTheme(["oled", "cream", "default", "dark"][i % 4]);
        dom.push(performance.now() - start - canvasTime);
        renderer.push(canvasTime);
        await new Promise(requestAnimationFrame);
        transitions.push(performance.now() - start);
      }
      delete document.dispatchEvent;
      document.dispatchEvent(new Event("darkerdocs:metrics"));
      const stats = (values) => {
        values.sort((a, b) => a - b);
        return {
          medianMs: values[Math.floor(values.length / 2)],
          p95Ms: values[Math.floor(values.length * 0.95)],
        };
      };
      return {
        fixture: {
          domCells: 3000,
          canvases: 16,
          drawIterations: 40,
          themeChanges: 12,
        },
        draw: stats(draw),
        themeChange: stats(transitions),
        themeChangeDom: stats(dom),
        themeChangeRenderer: stats(renderer),
        resources: JSON.parse(document.documentElement.dataset.ddRenderer),
        colorRules:
          document.querySelector("#darkerdocs-colors").sheet.cssRules[0]
            .cssRules.length,
      };
    });
    if (
      result.resources.retainedBytes + result.resources.scratchBytes >
        result.resources.limitBytes ||
      result.colorRules > 4096 * 3
    )
      throw Error("Synthetic workload exceeded the resource budget");
    result.popupLayout = popupLayout;
    result.environment = {
      browser: await browser.version(),
      platform: process.platform,
      arch: process.arch,
    };
    const output = process.argv[2] || "artifacts/performance.json";
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
