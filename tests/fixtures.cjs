const fs = require("node:fs");
const path = require("node:path");
const extension = path.resolve(__dirname, "../extension");
const read = (name) => fs.readFileSync(path.join(extension, name), "utf8");
const paths = {
  docs: "document",
  sheets: "spreadsheets",
  slides: "presentation",
  forms: "forms",
};
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#fff;color:#202124;font:14px Arial}#docs-chrome{background:#fff;padding:18px;border-bottom:1px solid #dadce0}.docs-titlebar{font-size:22px;margin-bottom:16px}.goog-toolbar{background:#edf2fa;border-radius:18px;padding:12px;display:flex;gap:10px}button,input{font:inherit;color:#202124;background:#fff;border:1px solid #dadce0;border-radius:6px;padding:8px}.kix-appview-editor{min-height:550px;padding:30px}.kix-page{background:white;color:black;padding:32px;max-width:560px;margin:auto;box-shadow:0 0 0 1px #ddd}.kix-page h1{font-size:24px}.swatches{display:flex;gap:8px}.swatches span{display:block;width:45px;height:25px}.goog-menu{background:#fff;color:#202124;padding:12px;border:1px solid #dadce0;position:absolute;top:190px;left:30px}.docs-homescreen-container{padding:20px;background:#f1f3f4}.punch-filmstrip-thumbnail{background:#fff;color:#000;padding:10px}.goog-palette{display:flex;background:#fff;padding:10px}.goog-palette-cell{width:24px;height:24px}.authored{color:black;background:white}table{border-collapse:collapse}td{border:1px solid #999;padding:8px}
</style></head><body>
<div id="docs-chrome"><div class="docs-titlebar">DarkerDocs Test — Workspace</div><div class="goog-toolbar" role="toolbar"><button id="menu-button">File</button><button>Undo</button><button>Print</button><button disabled>Disabled</button><input aria-label="Title" value="Preservation fixture"><span style="color:#1a73e8">Google blue link</span></div></div>
<div class="kix-appview-editor"><article class="kix-page" id="authored"><h1>Original content colors</h1><p>Default text and <b>bold text</b>. <a href="https://example.com">A link</a>.</p><p><span style="color:#ea4335">Red</span> <span style="color:#4285f4">Blue</span> <span style="color:#34a853">Green</span> <span style="color:#777">Explicit grey</span> <span style="color:#fff;background:#202124">White on charcoal</span></p><div class="swatches"><span style="background:#4285f4"></span><span style="background:#ea4335"></span><span style="background:#fbbc04"></span><span style="background:#34a853"></span></div><table><tr><td>Neutral</td><td style="background:#d9ead3">Green fill</td><td style="background:#000;color:#fff">Black fill</td></tr></table><canvas id="canvas" class="kix-canvas-tile-content" width="300" height="90"></canvas><img alt="Transparent image" width="80" height="30" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='30'%3E%3Ccircle cx='15' cy='15' r='13' fill='%23ea4335'/%3E%3Cpath d='M35 2h40v25H35z' fill='%234285f4'/%3E%3C/svg%3E"></article></div>
<div id="boundaries" class="goog-toolbar"><div class="goog-palette"><div class="goog-palette-cell" style="background:#fff"></div><div class="goog-palette-cell" style="background:#000"></div><div class="goog-palette-cell" style="background:#ea4335"></div></div><div class="punch-filmstrip-thumbnail">Original slide thumbnail</div><div class="authored" contenteditable="true">Authored editable text</div><svg width="25" height="25"><rect width="25" height="25" fill="#202124"/></svg></div>
<script>document.getElementById('menu-button').onclick=()=>{const e=document.createElement('div');e.className='goog-menu';e.setAttribute('role','menu');e.innerHTML='<div role="menuitem">New</div><div role="menuitem">Download</div>';document.body.append(e)};const ctx=document.querySelector('canvas').getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,300,90);ctx.fillStyle='#000';ctx.fillText('Default and explicitly black are indistinguishable here',8,22);ctx.fillStyle='#ea4335';ctx.fillRect(8,36,60,35);ctx.fillStyle='#4285f4';ctx.fillRect(80,36,60,35);</script></body></html>`;
async function mockStorage(page, theme = "dark", options = {}) {
  await page.addInitScript(
    ({ theme, options }) => {
      const KEY = "darkerdocs.settings.v1";
      let state = theme === null ? {} : { [KEY]: { theme } };
      const listeners = [];
      window.__writes = [];
      window.__storageListeners = listeners;
      window.__failRead = Boolean(options.failRead);
      window.__changeTheme = (theme) => {
        const oldValue = state[KEY];
        state[KEY] = { theme };
        listeners.forEach((fn) =>
          fn({ [KEY]: { oldValue, newValue: { theme } } }, "local"),
        );
      };
      window.chrome = {
        storage: {
          local: {
            async get() {
              const snapshot = structuredClone(state);
              if (options.readDelay)
                await new Promise((r) => setTimeout(r, options.readDelay));
              if (window.__failRead) throw Error("read");
              return snapshot;
            },
            async set(values) {
              window.__writes.push(values);
              if (options.writeDelay)
                await new Promise((r) => setTimeout(r, options.writeDelay));
              if (window.__failWrite) throw Error("write");
              const oldValue = state[KEY];
              Object.assign(state, values);
              listeners.forEach((fn) =>
                fn({ [KEY]: { oldValue, newValue: values[KEY] } }, "local"),
              );
            },
          },
          onChanged: {
            addListener(fn) {
              listeners.push(fn);
            },
            removeListener(fn) {
              const i = listeners.indexOf(fn);
              if (i >= 0) listeners.splice(i, 1);
            },
          },
        },
      };
    },
    { theme, options },
  );
}
async function workspace(page, app = "docs", theme = "dark", options = {}) {
  await mockStorage(page, theme, options);
  await page.addInitScript({
    content: read("shared/core.js") + "\n" + read("content/renderer.js"),
  });
  await page.route("https://docs.google.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );
  await page.goto(`https://docs.google.com/${paths[app]}/d/test/edit`);
  await page.addStyleTag({
    content: read("shared/themes.css") + "\n" + read("content/content.css"),
  });
  const baseline = await page.locator("#authored").screenshot();
  await page.addScriptTag({ content: read("shared/core.js") });
  await page.addScriptTag({ content: read("content/content.js") });
  return baseline;
}
async function popup(page, theme = "dark", options = {}) {
  await mockStorage(page, theme, options);
  await page.route("https://darkerdocs.test/**", (route) => {
    const file = new URL(route.request().url()).pathname;
    const name = file === "/" ? "popup/popup.html" : file.slice(1);
    if (!fs.existsSync(path.join(extension, name)))
      return route.fulfill({ status: 404, body: "" });
    const contentType = name.endsWith(".css")
      ? "text/css"
      : name.endsWith(".js")
        ? "application/javascript"
        : name.endsWith(".ttf")
          ? "font/ttf"
          : name.endsWith(".png")
            ? "image/png"
            : "text/html";
    return route.fulfill({
      contentType,
      body: fs.readFileSync(path.join(extension, name)),
    });
  });
  await page.goto("https://darkerdocs.test/popup/popup.html");
}
module.exports = { workspace, popup, paths, read, html, mockStorage };
