(() => {
  "use strict";
  const results = document.querySelector("#results");
  const status = document.querySelector("#status");
  const copy = document.querySelector("#copy");
  const fallback = document.querySelector("#copy-fallback");
  const entries = new Map();
  const version = chrome.runtime.getManifest().version;
  let requestId, timeout;
  let themeRevision = 0;
  document.querySelector("#version").textContent = version;
  const appearanceLabels = {
    theme: "Theme applied",
    pending: "Theme change pending",
    default: "Google’s original appearance",
    output: "Original for print, export, or playback",
    "page-fallback": "Original page (preservation fallback)",
    "surface-fallback": "Some surfaces stay original (preservation fallback)",
    unavailable: "Original appearance · Theme unavailable",
  };
  function themeLabel(theme) {
    return DarkerDocs.LABELS[DarkerDocs.THEMES.indexOf(theme)] ?? "Unavailable";
  }

  function rendererData(value) {
    try {
      return typeof value === "string" ? JSON.parse(value) : value || {};
    } catch {
      return {};
    }
  }
  function sanitize(data) {
    // Export a fixed schema: never arbitrary message properties, classes or URLs.
    const renderer = rendererData(data.renderer);
    const numeric = (value) =>
      Number.isFinite(value) && value >= 0 ? value : 0;
    return {
      app: ["docs", "sheets", "slides", "forms"].includes(data.app)
        ? data.app
        : "unknown",
      selectedTheme: DarkerDocs.THEMES.includes(data.selectedTheme)
        ? data.selectedTheme
        : null,
      appliedTheme: DarkerDocs.THEMES.includes(data.appliedTheme)
        ? data.appliedTheme
        : null,
      appearance: Object.hasOwn(appearanceLabels, data.appearance)
        ? data.appearance
        : "unavailable",
      overlays: numeric(data.overlays),
      colors: numeric(data.colors),
      colorLimit: numeric(data.colorLimit),
      domCapacity: data.domCapacity === true,
      notes: data.notes
        ? {
            svg: numeric(data.notes.svg),
            canvas: numeric(data.notes.canvas),
            paint: (Array.isArray(data.notes.paint) ? data.notes.paint : [])
              .slice(0, 8)
              .map((item) =>
                Object.fromEntries(
                  ["color", "fill", "background"].map((key) => [
                    key,
                    DarkerDocs.parseColor(item[key]) ? item[key] : null,
                  ]),
                ),
              ),
          }
        : null,
      renderer: Object.fromEntries(
        [
          "surfaces",
          "painted",
          "overflow",
          "preserved",
          "operations",
          "bitmapBytes",
          "retainedBytes",
          "scratchBytes",
          "limitBytes",
        ].map((key) => [key, numeric(renderer[key])]),
      ),
      reasons: Object.fromEntries(
        ["gradient", "pattern", "history", "memory", "display"].map((key) => [
          key,
          numeric(renderer.reasons?.[key]),
        ]),
      ),
    };
  }
  function render() {
    results.replaceChildren();
    const names = {
      docs: "Google Docs",
      sheets: "Google Sheets",
      slides: "Google Slides",
      forms: "Google Forms",
      unknown: "Workspace",
    };
    const reasons = {
      gradient: "Original gradient artwork",
      pattern: "Original patterned artwork",
      history: "Drawing-history limit",
      memory: "Display-memory limit",
      display: "Display copy unavailable",
    };
    for (const [index, data] of [...entries.values()].entries()) {
      const card = document.createElement("section");
      card.className = "result";
      const heading = document.createElement("h2");
      heading.textContent = `${names[data.app]} · Page ${index + 1}`;
      const dl = document.createElement("dl");
      const rows = [
        ["Selected theme", themeLabel(data.selectedTheme)],
        ["Applied theme", themeLabel(data.appliedTheme)],
        ["Appearance", appearanceLabels[data.appearance]],
        ["Display copies", data.overlays],
        ["Color rules", `${data.colors} / ${data.colorLimit}`],
        [
          "Estimated resources",
          `${(data.renderer.retainedBytes / 1048576).toFixed(1)} MiB / ${(data.renderer.limitBytes / 1048576).toFixed(0)} MiB`,
        ],
        ["Recorded operations", data.renderer.operations],
        [
          "Fallback reasons",
          Object.entries(data.reasons)
            .filter(([, count]) => count)
            .map(([key, count]) => `${reasons[key]} (${count})`)
            .join(", ") || "None reported",
        ],
      ];
      for (const [label, value] of rows) {
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = value;
        dl.append(dt, dd);
      }
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Technical details";
      const pre = document.createElement("pre");
      pre.textContent = JSON.stringify(data, null, 2);
      details.append(summary, pre);
      card.append(heading, dl, details);
      results.append(card);
    }
    copy.disabled = !entries.size;
    status.textContent = `${entries.size} supported page${entries.size === 1 ? "" : "s"} responded.`;
  }
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (
      sender.id !== chrome.runtime.id ||
      message?.type !== "darkerdocs:diagnostics:result" ||
      message.requestId !== requestId ||
      !DarkerDocs.route(sender.url || "", { includeOutput: true })
    )
      return;
    entries.set(sender.tab?.id, sanitize(message.data || {}));
    render();
  });
  async function refresh() {
    clearTimeout(timeout);
    entries.clear();
    results.replaceChildren();
    copy.disabled = true;
    fallback.hidden = true;
    requestId = Math.max(Date.now(), (requestId || 0) + 1);
    status.textContent = "Waiting for supported Workspace pages…";
    try {
      await chrome.storage.local.set({
        "darkerdocs.diagnostics.request": requestId,
      });
      timeout = setTimeout(() => {
        if (!entries.size)
          status.textContent =
            "No supported pages responded. Open or reload a Docs, Sheets, Slides or Forms page, then retry.";
      }, 2500);
    } catch {
      status.textContent =
        "Couldn’t request diagnostics. Select Refresh diagnostics to retry.";
    }
  }
  copy.addEventListener("click", async () => {
    const text = JSON.stringify(
      { extension: "DarkerDocs", version, pages: [...entries.values()] },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(text);
      status.textContent =
        "Diagnostics copied. No document text or URLs included.";
    } catch {
      fallback.value = text;
      fallback.hidden = false;
      fallback.focus();
      fallback.select();
      status.textContent = "Copy the selected diagnostics text manually.";
    }
  });
  document.querySelector("#refresh").addEventListener("click", refresh);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[DarkerDocs.KEY]) {
      themeRevision++;
      document.documentElement.dataset.ddTheme = DarkerDocs.normalize(
        changes[DarkerDocs.KEY].newValue,
      ).theme;
    }
  });
  chrome.storage.local
    .get(DarkerDocs.KEY)
    .then((values) => {
      if (!themeRevision)
        document.documentElement.dataset.ddTheme = DarkerDocs.normalize(
          values[DarkerDocs.KEY],
        ).theme;
    })
    .catch(() => {});
  refresh();
})();
