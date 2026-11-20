const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const { workspace } = require("./fixtures.cjs");

for (const app of ["docs", "sheets", "slides", "forms"])
  test(`${app}: richer editing fixtures and original printed output in every theme`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await workspace(page, app, "default");
    await page.evaluate(async (app) => {
      const region = document.createElement("section");
      region.id = "workflow";
      region.style.cssText = "background:#fff;color:#202124;padding:12px";
      const image = document.createElement("img");
      image.id = "workflow-image";
      image.width = 40;
      image.height = 20;
      const source = document.createElement("canvas");
      source.width = 40;
      source.height = 20;
      const x = source.getContext("2d");
      const pixels = x.createImageData(40, 20);
      for (let i = 0; i < pixels.data.length; i += 4)
        pixels.data.set([20, 150, 80, 255], i);
      x.putImageData(pixels, 0, 0);
      image.src = source.toDataURL();
      await image.decode();
      region.append(image);
      if (app === "docs")
        region.insertAdjacentHTML(
          "beforeend",
          '<div contenteditable="true" id="writing" aria-label="Document text">Original paragraph</div><aside id="comment" style="background:#fff;color:#333">Comment fixture</aside><ins style="background:#d9ead3;color:#174b20">Suggested text</ins><table><tr><td contenteditable="true" id="table-cell">Original cell</td></tr></table>',
        );
      if (app === "sheets")
        region.insertAdjacentHTML(
          "beforeend",
          '<div role="tablist" aria-label="Sheets"><button role="tab" aria-selected="true" id="sheet-one">Sheet 1</button><button role="tab" aria-selected="false" id="sheet-two">Sheet 2</button></div><div id="conditional" style="color:#000;background:#d9ead3">Conditional fill</div><svg width="100" height="40"><rect width="35" height="30" fill="#4285f4"/><rect x="45" width="35" height="20" fill="#ea4335"/></svg>',
        );
      if (app === "slides")
        region.insertAdjacentHTML(
          "beforeend",
          '<svg id="rich-artwork" width="160" height="70" style="color:#000"><rect width="160" height="70" fill="#fff"/><circle cx="30" cy="35" r="20" fill="#ea4335"/><text x="60" y="40" fill="currentColor">Original</text></svg><textarea id="notes" aria-label="Speaker notes">Original notes</textarea>',
        );
      if (app === "forms")
        region.insertAdjacentHTML(
          "beforeend",
          '<form id="questions"><section id="section-one"><label>Required answer <input id="required-answer" required></label><label>Email <input type="email" value="fixture@example.test"></label><label>Number <input type="number" min="1" value="2"></label><label>Date <input type="date" value="2026-11-16"></label><label>Time <input type="time" value="10:00"></label><label>Multiple choice <input id="radio-answer" type="radio" name="choice"></label><label>Checkbox <input type="checkbox"></label><label>Dropdown <select><option>Option one</option><option>Option two</option></select></label><label>Paragraph <textarea>Fixture answer</textarea></label></section><section id="section-two" hidden>Second section</section></form>',
        );
      document.querySelector("#authored").append(region);
    }, app);
    await page.evaluate(() => document.fonts.ready);
    const image = await page.locator("#workflow-image").getAttribute("src");
    const native = await page.locator("#canvas").evaluate((c) => c.toDataURL());
    let printBaseline;
    fs.mkdirSync("artifacts/synthetic-output", { recursive: true });
    for (const theme of ["default", "oled", "dark", "cream"]) {
      await page.evaluate((t) => __changeTheme(t), theme);
      if (theme === "default")
        await expect(page.locator("html")).not.toHaveAttribute("data-dd-theme");
      else await expect(page.locator("#workflow")).toHaveAttribute("data-dd-b");
      if (app === "docs") {
        await page.locator("#writing").fill(`Paragraph in ${theme}`);
        await page.locator("#table-cell").fill(`Cell in ${theme}`);
        await expect(page.locator("#writing")).toHaveText(
          `Paragraph in ${theme}`,
        );
        // Keep output identical across states after exercising native input.
        await page.locator("#writing").fill("Original paragraph");
        await page.locator("#table-cell").fill("Original cell");
      }
      if (app === "sheets") {
        await page
          .locator("#sheet-two")
          .evaluate((e) => e.setAttribute("aria-selected", "true"));
        await expect(page.locator("#sheet-two")).toHaveAttribute(
          "aria-selected",
          "true",
        );
        await page
          .locator("#sheet-two")
          .evaluate((e) => e.setAttribute("aria-selected", "false"));
      }
      if (app === "slides") {
        await page.locator("#notes").fill(`Notes in ${theme}`);
        await expect(page.locator("#notes")).toHaveValue(`Notes in ${theme}`);
        await page.locator("#notes").fill("Original notes");
        await expect(page.locator("#rich-artwork rect")).toHaveCSS(
          "fill",
          "rgb(255, 255, 255)",
        );
        await expect(page.locator("#rich-artwork circle")).toHaveCSS(
          "fill",
          "rgb(234, 67, 53)",
        );
        await expect(page.locator("#rich-artwork text")).toHaveCSS(
          "fill",
          "rgb(0, 0, 0)",
        );
      }
      if (app === "forms") {
        expect(
          await page.locator("#questions").evaluate((e) => e.checkValidity()),
        ).toBe(false);
        await page.locator("#required-answer").fill("Fixture only");
        await page.locator("#radio-answer").check();
        expect(
          await page.locator("#questions").evaluate((e) => e.checkValidity()),
        ).toBe(true);
        await page.locator("#section-two").evaluate((e) => (e.hidden = false));
        await expect(page.locator("#section-two")).toBeVisible();
        await page.locator("#section-two").evaluate((e) => (e.hidden = true));
        await page.locator("#required-answer").fill("");
        await page
          .locator("#radio-answer")
          .evaluate((e) => (e.checked = false));
      }
      await page.locator("#workflow").click({ position: { x: 2, y: 2 } });
      expect(await page.locator("#workflow-image").getAttribute("src")).toBe(
        image,
      );
      expect(await page.locator("#canvas").evaluate((c) => c.toDataURL())).toBe(
        native,
      );
      await page.emulateMedia({ media: "print" });
      await expect(page.locator("#workflow")).toHaveCSS(
        "background-color",
        "rgb(255, 255, 255)",
      );
      await expect(page.locator("#canvas")).toHaveCSS("opacity", "1");
      const print = await page.screenshot({
        fullPage: true,
        path: `artifacts/synthetic-output/${app}-${theme}-print.png`,
      });
      if (!printBaseline) printBaseline = print;
      else expect(print.equals(printBaseline)).toBe(true);
      const pdf = await page.pdf({
        path: `artifacts/synthetic-output/${app}-${theme}.pdf`,
        width: "1120px",
        height: "1600px",
        printBackground: true,
        margin: { top: 0, bottom: 0, left: 0, right: 0 },
      });
      expect(
        (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length,
      ).toBe(1);
      await page.emulateMedia({ media: "screen" });
    }
  });
