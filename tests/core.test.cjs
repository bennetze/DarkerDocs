const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
require("../extension/shared/core.js");
const { normalize, route, neutral, THEMES } = globalThis.DarkerDocs;
test("display palettes preserve transparency, hue families and original Default colors", () => {
  const { mapColor, parseColor, PALETTES } = DarkerDocs;
  assert.equal(mapColor("#e63b24", "default"), "#e63b24");
  assert.equal(mapColor("rgba(0,0,0,0)", "oled"), "rgba(0,0,0,0)");
  for (const theme of ["oled", "dark", "cream"]) {
    const red = parseColor(mapColor("#e63b24", theme)).rgb,
      blue = parseColor(mapColor("#245be6", theme)).rgb;
    assert.ok(red[0] > red[1] && red[0] > red[2]);
    assert.ok(blue[2] > blue[0] && blue[2] > blue[1]);
    assert.deepEqual(
      parseColor(mapColor("#000", theme)).rgb,
      parseColor(PALETTES[theme].text).rgb,
    );
    assert.deepEqual(
      parseColor(mapColor("#fff", theme)).rgb,
      parseColor(PALETTES[theme].paper).rgb,
    );
    const green = parseColor(mapColor("#d9ead3", theme, "paint")).rgb;
    assert.ok(
      green[1] > green[0] && green[1] > green[2],
      "pastel green must retain its color family",
    );
    if (theme !== "cream") {
      const lum = (rgb) =>
        rgb
          .map((v) => {
            v /= 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          })
          .reduce((v, c, i) => v + c * [0.2126, 0.7152, 0.0722][i], 0);
      const yellow = parseColor(mapColor("#ffff00", theme, "paint")).rgb;
      assert.ok(
        (lum(parseColor(PALETTES[theme].text).rgb) + 0.05) /
          (lum(yellow) + 0.05) >=
          4.5,
        "monochrome text must stay readable on a yellow highlight",
      );
    }
  }
  assert.ok(
    parseColor(PALETTES.cream.paper).rgb[0] >
      parseColor(PALETTES.cream.paper).rgb[2],
  );
});
test("settings handle first run, corrupted values, and all four themes", () => {
  for (const value of [
    undefined,
    null,
    {},
    { theme: "invalid" },
    "oled",
    { theme: 2 },
  ])
    assert.deepEqual(normalize(value), { theme: "dark" });
  for (const theme of THEMES)
    assert.deepEqual(normalize({ theme, junk: true }), { theme });
});
test("routing restricts origin and paths; never themes presentations or export routes", () => {
  for (const path of ["document", "spreadsheets", "presentation", "forms"]) {
    assert.equal(route(`https://docs.google.com/${path}/u/0/`).view, "home");
    assert.equal(
      route(`https://docs.google.com/${path}/d/test/edit`).view,
      "file",
    );
    assert.equal(route(`https://docs.google.com/${path}/d/test/export`), null);
  }
  assert.equal(
    route("https://docs.google.com/forms/d/e/test/viewform").view,
    "respondent",
  );
  assert.deepEqual(
    route("https://docs.google.com/document/d/test/print", {
      includeOutput: true,
    }),
    { app: "docs", view: "file" },
  );
  assert.equal(
    route("https://evil.test/document/d/test/print", { includeOutput: true }),
    null,
  );
  for (const url of [
    "file:///document/",
    "http://docs.google.com/document/",
    "https://evil.test/document/",
    "https://docs.google.com.evil.test/document/",
    "https://docs.google.com/drive/",
    "https://docs.google.com/presentation/d/test/present",
    "https://docs.google.com/presentation/d/test/embed",
    "https://docs.google.com/document/d/test/print",
    "bad",
  ])
    assert.equal(route(url), null);
});
test("UI color classification excludes chromatic and translucent paint", () => {
  assert.equal(neutral("rgb(255, 255, 255)"), true);
  assert.equal(neutral("rgb(32, 33, 36)"), true);
  assert.equal(neutral("color(srgb 0.121569 0.121569 0.121569)"), true);
  assert.equal(neutral("color(srgb 0.121569 0.121569 0.121569 / 0.7)"), false);
  for (const color of [
    "rgb(234, 67, 53)",
    "rgba(0, 0, 0, 0)",
    "rgba(255,255,255,0.5)",
    "transparent",
    "url(image.png)",
  ])
    assert.equal(neutral(color), false);
});
test("manifest ships only scoped static scripts and local storage permission", () => {
  const manifest = JSON.parse(
    fs.readFileSync("extension/manifest.json", "utf8"),
  );
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background, undefined);
  assert.equal(manifest.content_scripts[0].run_at, "document_start");
  assert.equal(manifest.content_scripts[1].matches.length, 4);
  assert.equal(manifest.content_scripts[0].world, "MAIN");
  for (const section of manifest.content_scripts)
    for (const path of [...section.js, ...(section.css || [])])
      assert.ok(fs.existsSync(`extension/${path}`), path);
});
test("content-script dependencies stay ordered and script paths are distinct across worlds", () => {
  const manifest = JSON.parse(
    fs.readFileSync("extension/manifest.json", "utf8"),
  );
  const main = manifest.content_scripts.find(
    (section) => section.world === "MAIN",
  );
  const isolated = manifest.content_scripts.find(
    (section) => (section.world || "ISOLATED") === "ISOLATED",
  );
  assert.deepEqual(main.js, ["content/renderer.bundle.js"]);
  assert.deepEqual(isolated.js, ["shared/core.js", "content/content.js"]);
  for (const script of main.js)
    assert.ok(
      !isolated.js.includes(script),
      "shared paths can skip the isolated core injection",
    );
  const bundle = fs.readFileSync(`extension/${main.js[0]}`, "utf8");
  const core = fs.readFileSync("extension/shared/core.js", "utf8");
  const renderer = fs.readFileSync("extension/content/renderer.js", "utf8");
  assert.ok(
    bundle.endsWith(core + "\n" + renderer),
    "MAIN bundle must contain the current core before the renderer",
  );
});

test("contextual ink mapping retains hue and contrast against mapped highlights", () => {
  const { mapColor, contrastRatio, parseColor } = DarkerDocs;
  for (const theme of ["oled", "dark", "cream"])
    for (const background of [
      "#fff",
      "#ffff00",
      "#d9ead3",
      "#4285f4",
      "#202124",
    ])
      for (const ink of ["#000", "#777", "#ea4335", "#4285f4", "#34a853"]) {
        const mappedBackground = mapColor(background, theme, "ui-bg");
        const mappedInk = mapColor(ink, theme, "ui-ink", mappedBackground);
        assert.ok(
          contrastRatio(mappedInk, mappedBackground) >= 4.5,
          `${theme} ${ink} on ${background}`,
        );
        if (ink === "#4285f4") {
          const [r, g, b] = parseColor(mappedInk).rgb;
          assert.ok(b > r && b > g);
        }
        assert.equal(
          mapColor("transparent", theme, "ui-ink", mappedBackground),
          "transparent",
        );
      }
  assert.equal(mapColor("#777", "default", "ui-ink", "#fff"), "#777");
});
