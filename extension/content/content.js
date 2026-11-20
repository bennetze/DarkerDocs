(() => {
  "use strict";
  const { KEY, THEMES, normalize, route, parseColor, mapColor, outputView } =
    DarkerDocs;
  const ATTRS = [
    "data-dd-c",
    "data-dd-b",
    "data-dd-m",
    "data-dd-ot",
    "data-dd-or",
    "data-dd-ob",
    "data-dd-ol",
    "data-dd-f",
    "data-dd-s",
    "data-dd-t",
    "data-dd-original",
  ];
  const MEDIA =
    "img,picture,video,iframe,canvas,darkerdocs-surface,defs,clipPath,mask,filter,linearGradient,radialGradient,pattern,[data-dd-preserve],.docs-icon-img,.goog-palette,.goog-palette-cell,.docs-colormenu,.docs-colorpalette,[data-color]";
  const capacityFallbacks = new Set();
  const marked = new Set(),
    pending = new Set(),
    registry = new Map();
  const printMedia = matchMedia("print");
  let settings = { theme: "default" },
    activeRoute = null,
    frame = 0,
    version = 0,
    loaded = false,
    preferenceAvailable = false,
    printing = false,
    transition,
    styleNode,
    notice;
  const MAX_COLOR_TOKENS = 4096;
  const properties = {
    c: "color",
    b: "background-color",
    m: "background-color",
    ot: "border-top-color",
    or: "border-right-color",
    ob: "border-bottom-color",
    ol: "border-left-color",
    f: "fill",
    s: "stroke",
    t: "-webkit-text-fill-color",
  };
  const tokensById = new Map(),
    slots = [],
    freeSlots = [];
  const pendingRules = new Set();
  let nextToken = 0;
  let colorRules,
    domCapacity = false,
    domSuspended = false,
    dismissedNotice = "";
  function ensureRules() {
    if (styleNode?.isConnected) return;
    styleNode = document.createElement("style");
    styleNode.id = "darkerdocs-colors";
    styleNode.textContent = "@media screen {}";
    (document.head || document.documentElement).append(styleNode);
    colorRules = styleNode.sheet.cssRules[0];
    slots.length = 0;
    freeSlots.length = 0;
    for (const entry of registry.values()) {
      entry.slot = slots.length;
      slots.push(null);
      pendingRules.add(entry);
    }
  }
  function applyRules() {
    // CSSOM edits are delayed until all native measurements finish. Updating
    // rules between getComputedStyle calls makes large documents quadratic.
    for (const entry of pendingRules) {
      if (!entry.refs) continue;
      const rules = slots[entry.slot] || [];
      THEMES.filter((theme) => theme !== "default").forEach((theme, i) => {
        const selector = `html[data-dd-theme="${theme}"]:not([data-dd-measuring]) [data-dd-${entry.kind}="${entry.id}"]`;
        const role =
          entry.kind === "b"
            ? "ui-bg"
            : entry.kind.startsWith("o")
              ? "ui-border"
              : "ui-ink";
        const background =
          entry.background && mapColor(entry.background, theme, "ui-bg");
        const value = entry.original
          ? entry.value
          : mapColor(entry.value, theme, role, background);
        if (rules[i]) {
          rules[i].selectorText = selector;
          rules[i].style.setProperty(
            properties[entry.kind],
            value,
            "important",
          );
        } else {
          const index = colorRules.insertRule(
            `${selector}{${properties[entry.kind]}:${value}!important}`,
            colorRules.cssRules.length,
          );
          rules.push(colorRules.cssRules[index]);
        }
      });
      slots[entry.slot] = rules;
    }
    pendingRules.clear();
  }
  function collectTokens() {
    for (const [key, entry] of registry) {
      if (entry.refs) continue;
      registry.delete(key);
      tokensById.delete(entry.id);
      for (const rule of slots[entry.slot] || [])
        rule.selectorText = ":root:not(*)";
      freeSlots.push(entry.slot);
    }
  }
  function releaseRules() {
    registry.clear();
    tokensById.clear();
    slots.length = 0;
    freeSlots.length = 0;
    styleNode?.remove();
    styleNode = null;
    colorRules = null;
    domCapacity = false;
    capacityFallbacks.clear();
    pendingRules.clear();
    nextToken = 0;
  }
  let motionStyle, finishMotion;
  let backgroundCache = new WeakMap();
  function stopTransition() {
    transition?.skipTransition();
    transition = null;
    finishMotion?.();
    finishMotion = null;
  }
  function motionLayers() {
    const html = document.documentElement,
      targets = [];
    if (!motionStyle?.isConnected) {
      motionStyle = document.createElement("style");
      motionStyle.id = "darkerdocs-motion";
      let css = "";
      for (const [stage, limit, duration, delay] of [
        ["text", 12, 760, 120],
        ["control", 16, 740, 240],
      ])
        for (let i = 0; i < limit; i++) {
          const name = `dd-${stage}-${i}`;
          css += `[data-dd-motion="${name}"]{view-transition-name:${name}!important}html[data-dd-animating]::view-transition-group(${name}){--dd-motion-duration:${duration}ms;--dd-motion-delay:${delay}ms}`;
        }
      motionStyle.textContent = css;
      (document.head || html).append(motionStyle);
    }
    // Bound the number of extra snapshots. Canvas content stays in the root
    // crossfade so authored drawing commands and image pixels remain untouched.
    for (const [stage, selector, limit] of [
      [
        "control",
        'button,[role="button"],input,select,textarea,[role="tab"]',
        16,
      ],
      [
        "text",
        'h1,h2,h3,[role="heading"],.docs-titlebar,.docs-title-input-label',
        12,
      ],
    ]) {
      let count = 0;
      for (const e of document.querySelectorAll(selector)) {
        if (count === limit) break;
        if (
          e.closest(MEDIA + ",svg,[data-dd-original]") ||
          e.closest("[data-dd-motion]") ||
          e.querySelector("[data-dd-motion]") ||
          !e.getClientRects().length
        )
          continue;
        const s = getComputedStyle(e);
        if (s.visibility !== "visible" || s.viewTransitionName !== "none")
          continue;
        e.setAttribute("data-dd-motion", `dd-${stage}-${count++}`);
        targets.push(e);
      }
    }
    html.setAttribute("data-dd-animating", "");
    finishMotion = () => {
      html.removeAttribute("data-dd-animating");
      targets.forEach((e) => e.removeAttribute("data-dd-motion"));
    };
    return finishMotion;
  }
  function token(value, kind, original = false, background = null) {
    const key = [kind, original, value, background].join("|");
    let entry = registry.get(key);
    if (!entry) {
      if (registry.size >= MAX_COLOR_TOKENS) collectTokens();
      if (registry.size >= MAX_COLOR_TOKENS) {
        domCapacity = true;
        return null;
      }
      const slot = freeSlots.length ? freeSlots.pop() : slots.length;
      entry = {
        id: "c" + nextToken++,
        slot,
        kind,
        original,
        value,
        background,
        refs: 0,
      };
      registry.set(key, entry);
      tokensById.set(entry.id, entry);
      if (slot === slots.length) slots.push(null);
      pendingRules.add(entry);
    }
    entry.refs++;
    return entry.id;
  }
  function clear(e) {
    capacityFallbacks.delete(e);
    for (const attr of ATTRS) {
      const entry = tokensById.get(e.getAttribute(attr));
      if (entry) entry.refs--;
      e.removeAttribute(attr);
    }
    marked.delete(e);
  }
  function isOriginalSvg(e) {
    return (
      activeRoute?.app === "slides" &&
      e.localName === "svg" &&
      !e.closest(
        '#docs-chrome,[role="button"],button,[role="toolbar"],.docs-companion-app-switcher-container,[aria-label="Speaker notes"],.punch-viewer-speakernotes',
      )
    );
  }
  function mark(e, kind, value, original = false, background = null) {
    const id = token(value, kind, original, background);
    if (id === null) {
      capacityFallbacks.add(e);
      return;
    }
    e.setAttribute("data-dd-" + kind, id);
    marked.add(e);
  }
  function nativeBackground(e) {
    if (backgroundCache.has(e)) return backgroundCache.get(e);
    const value = getComputedStyle(e).backgroundColor;
    const background =
      parseColor(value)?.alpha === 1
        ? value
        : e.parentElement
          ? nativeBackground(e.parentElement)
          : "#fff";
    backgroundCache.set(e, background);
    return background;
  }
  function decorate(e, s, background) {
    if (
      e.matches(MEDIA) ||
      e.closest("darkerdocs-surface,.goog-palette,.docs-colormenu")
    )
      return;
    const fg = parseColor(s.color),
      bg = parseColor(s.backgroundColor),
      fill = parseColor(s.webkitTextFillColor);
    if (bg && bg.alpha > 0.01)
      mark(e, s.maskImage !== "none" ? "m" : "b", s.backgroundColor);
    // Google overlays a transparent title input over a visible label. Keep its
    // native transparency rather than painting a second, offset title.
    if (fg && fg.alpha > 0 && (!fill || fill.alpha > 0))
      mark(e, "c", s.color, false, background);
    if (e.matches("input,textarea") && fill && fill.alpha > 0)
      mark(e, "t", s.webkitTextFillColor, false, background);
    // Transparent sides form Google's CSS arrows; never color all four sides
    // from just the top edge or those arrows become solid rectangles.
    for (const [kind, side] of [
      ["ot", "Top"],
      ["or", "Right"],
      ["ob", "Bottom"],
      ["ol", "Left"],
    ])
      if (
        parseColor(s["border" + side + "Color"])?.alpha > 0 &&
        s["border" + side + "Style"] !== "none"
      )
        mark(e, kind, s["border" + side + "Color"]);
    if (e instanceof SVGElement) {
      if (parseColor(s.fill)?.alpha > 0) mark(e, "f", s.fill);
      if (parseColor(s.stroke)?.alpha > 0) mark(e, "s", s.stroke);
    }
    if (isOriginalSvg(e)) {
      for (const [kind, value] of [
        ["c", s.color],
        ["f", s.fill],
        ["s", s.stroke],
      ])
        if (parseColor(value)) {
          const previous = tokensById.get(e.getAttribute("data-dd-" + kind));
          if (previous) previous.refs--;
          mark(e, kind, value, true);
        }
      e.setAttribute("data-dd-original", "");
    }
  }
  const nativeProperties = [
    "color",
    "backgroundColor",
    "webkitTextFillColor",
    "maskImage",
    "fill",
    "stroke",
    ...["Top", "Right", "Bottom", "Left"].flatMap((side) => [
      "border" + side + "Color",
      "border" + side + "Style",
    ]),
  ];
  function measure(e, samples) {
    const style = getComputedStyle(e);
    const values = Object.fromEntries(
      nativeProperties.map((key) => [key, style[key]]),
    );
    samples.push({ e, style: values, background: nativeBackground(e) });
  }
  function scan(root, samples) {
    if (
      !(root instanceof Element) ||
      root.matches(MEDIA) ||
      root.closest("darkerdocs-surface,.goog-palette,.docs-colormenu")
    )
      return;
    measure(root, samples);
    if (isOriginalSvg(root)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        if (node.matches(MEDIA)) return NodeFilter.FILTER_REJECT;
        const svg = node.parentElement?.closest("svg");
        return svg && isOriginalSvg(svg)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) measure(walker.currentNode, samples);
  }
  function updateNotice() {
    const html = document.documentElement;
    let renderer = {};
    try {
      renderer = JSON.parse(html?.dataset.ddRenderer || "{}");
    } catch {}
    const reasons = renderer.reasons || {};
    const messages = [];
    if (reasons.gradient || html?.dataset.ddPreserved)
      messages.push(
        "Some artwork keeps its original appearance to preserve its colors.",
      );
    if (reasons.memory || reasons.history)
      messages.push(
        "A rendering limit was reached. The affected content stays original; reloading may only help temporarily.",
      );
    if (reasons.display)
      messages.push(
        "A display copy could not be drawn. The affected content stays original.",
      );
    if (!messages.length && html?.dataset.ddNeedsReload)
      messages.push(
        "Some content stays original because its display copy is unavailable.",
      );
    if (domCapacity)
      messages.push(
        "This page keeps its original appearance because it contains many different styles.",
      );
    const message = messages.join(" ");
    const needed =
      message &&
      settings.theme !== "default" &&
      (html?.dataset.ddTheme || domSuspended) &&
      !outputView(document);
    if (!needed || message === dismissedNotice) {
      notice?.remove();
      notice = null;
      return;
    }
    if (!document.body) return;
    if (!notice?.isConnected) {
      notice = document.createElement("aside");
      notice.id = "darkerdocs-notice";
      notice.setAttribute("data-dd-preserve", "");
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "DarkerDocs · Some content stays original";
      summary.setAttribute("role", "status");
      summary.setAttribute("aria-live", "polite");
      const text = document.createElement("p");
      text.setAttribute("role", "status");
      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.textContent = "Dismiss";
      dismiss.addEventListener("click", () => {
        dismissedNotice = text.textContent;
        notice.remove();
        notice = null;
      });
      details.append(summary, text, dismiss);
      notice.append(details);
      document.body.append(notice);
    }
    const text = notice.querySelector("p");
    if (text.textContent !== message) text.textContent = message;
  }
  function flush() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    activeRoute = route(location.href);
    const html = document.documentElement;
    if (!html) {
      pending.clear();
      return;
    }
    if (!activeRoute || outputView(document)) {
      stopTransition();
      if (html.dataset.ddTheme) {
        nativeMode();
        document.dispatchEvent(new Event("darkerdocs:theme"));
      } else updateNotice();
      pending.clear();
      return;
    }
    if (settings.theme === "default" || domSuspended) {
      pending.clear();
      if (domSuspended) updateNotice();
      return;
    }
    html.dataset.ddApp = activeRoute.app;
    html.dataset.ddView = activeRoute.view;
    ensureRules();
    const roots = [...pending].filter((e) => e?.isConnected);
    pending.clear();
    html.setAttribute("data-dd-measuring", "");
    try {
      marked.forEach((e) => {
        if (!e.isConnected) clear(e);
      });
      for (const e of capacityFallbacks)
        if (!e.isConnected) capacityFallbacks.delete(e);
      backgroundCache = new WeakMap();
      const samples = [];
      roots
        .filter((e) => !roots.some((other) => other !== e && other.contains(e)))
        .forEach((root) => scan(root, samples));
      // Separate native reads from all attribute and CSSOM writes.
      samples.forEach(({ e }) => clear(e));
      samples.forEach(({ e, style, background }) =>
        decorate(e, style, background),
      );
      collectTokens();
      applyRules();
      domCapacity = capacityFallbacks.size > 0;
    } finally {
      html.removeAttribute("data-dd-measuring");
    }
    if (domCapacity) {
      // A partly themed control can be unreadable. Keep the complete page
      // original until an explicit theme selection retries it.
      nativeMode();
      domCapacity = true;
      domSuspended = true;
      document.dispatchEvent(new Event("darkerdocs:theme"));
    }
    updateNotice();
  }
  function schedule(node) {
    if (
      !(node instanceof Element) ||
      node.closest(
        "darkerdocs-surface,#darkerdocs-colors,#darkerdocs-motion,#darkerdocs-notice",
      )
    )
      return;
    pending.add(node);
    if (!frame) frame = requestAnimationFrame(flush);
  }
  function nativeMode() {
    const html = document.documentElement;
    if (!html) return;
    delete html.dataset.ddTheme;
    delete html.dataset.ddApp;
    delete html.dataset.ddView;
    marked.forEach(clear);
    releaseRules();
    notice?.remove();
    notice = null;
    dismissedNotice = "";
  }
  function setTheme(value, animate = true) {
    const next = normalize(value);
    const changed = settings.theme !== next.theme;
    stopTransition();
    settings = next;
    const html = document.documentElement;
    if (!html) {
      schedule(document.documentElement);
      return;
    }
    activeRoute = route(location.href);
    const commit = () => {
      activeRoute = route(location.href);
      if (
        settings.theme === "default" ||
        !activeRoute ||
        outputView(document)
      ) {
        nativeMode();
        document.dispatchEvent(new Event("darkerdocs:theme"));
        return;
      }
      if (domSuspended) return;
      // The generated rules already cover every non-Default palette. Keep
      // native measurements and only scan new or invalidated DOM.
      if (
        !html.dataset.ddTheme ||
        html.dataset.ddApp !== activeRoute.app ||
        html.dataset.ddView !== activeRoute.view ||
        !styleNode?.isConnected
      )
        pending.add(html);
      html.dataset.ddTheme = settings.theme;
      html.dataset.ddApp = activeRoute.app;
      html.dataset.ddView = activeRoute.view;
      if (pending.size) flush();
      document.dispatchEvent(new Event("darkerdocs:theme"));
    };
    const motion = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (
      loaded &&
      changed &&
      animate &&
      motion &&
      activeRoute &&
      !outputView(document) &&
      document.startViewTransition
    ) {
      const cleanup = motionLayers();
      transition = document.startViewTransition(commit);
      const current = transition;
      current.finished
        .catch(() => {})
        .then(() => {
          if (transition === current) {
            cleanup();
            transition = null;
            finishMotion = null;
          }
        });
    } else commit();
    loaded = true;
  }
  const observer = new MutationObserver((records) => {
    if (
      records.every(
        (r) =>
          r.target === styleNode ||
          r.target?.closest?.(
            "darkerdocs-surface,#darkerdocs-colors,#darkerdocs-motion,#darkerdocs-notice",
          ) ||
          (r.type === "childList" &&
            [...r.addedNodes, ...r.removedNodes].every(
              (n) =>
                n === motionStyle ||
                n === styleNode ||
                (n instanceof Element &&
                  n.matches(
                    "darkerdocs-surface,#darkerdocs-notice,#darkerdocs-colors,#darkerdocs-motion",
                  )),
            )),
      )
    )
      return;
    for (const r of records) {
      if (r.type === "childList") {
        r.addedNodes.forEach(schedule);
        if (r.removedNodes.length) schedule(r.target);
      } else if (
        [
          "data-dd-needs-reload",
          "data-dd-preserved",
          "data-dd-renderer",
        ].includes(r.attributeName)
      )
        updateNotice();
      else schedule(r.target);
    }
    if (
      !document.documentElement?.dataset.ddApp &&
      !domSuspended &&
      settings.theme !== "default" &&
      document.documentElement &&
      route(location.href) &&
      !outputView(document)
    )
      setTheme(settings, false);
  });
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      "class",
      "style",
      "hidden",
      "aria-selected",
      "aria-disabled",
      "data-dd-needs-reload",
      "data-dd-preserved",
      "data-dd-renderer",
    ],
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[KEY]) {
      version++;
      preferenceAvailable = true;
      domSuspended = false;
      setTheme(changes[KEY].newValue);
    }
    if (
      changes["darkerdocs.diagnostics.request"] &&
      route(location.href, { includeOutput: true })
    )
      chrome.runtime
        .sendMessage({
          type: "darkerdocs:diagnostics:result",
          requestId: changes["darkerdocs.diagnostics.request"].newValue,
          data: diagnostics(),
        })
        .catch(() => {});
  });
  const initial = version;
  chrome.storage.local
    .get(KEY)
    .then((values) => {
      if (version === initial) {
        preferenceAvailable = true;
        setTheme(values[KEY], false);
      }
    })
    .catch(() => {
      if (version === initial) setTheme({ theme: "default" }, false);
    });
  function navigate() {
    setTheme(settings, false);
  }
  if (window.navigation) {
    window.navigation.addEventListener("currententrychange", (event) => {
      if (event.from?.url !== location.href) navigate();
    });
  } else {
    for (const event of ["popstate", "hashchange"])
      addEventListener(event, navigate);
  }
  addEventListener("beforeprint", () => {
    printing = true;
    stopTransition();
  });
  addEventListener("afterprint", () => {
    printing = false;
  });
  printMedia.addEventListener("change", (event) => {
    if (event.matches) stopTransition();
  });
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
    "change",
    (event) => {
      if (event.matches) stopTransition();
    },
  );
  // Read-only diagnostics: no document text, document model or authored data is returned.
  function diagnostics() {
    document.dispatchEvent(new Event("darkerdocs:metrics"));
    const dataset = document.documentElement?.dataset || {};
    const selectedTheme = preferenceAvailable ? settings.theme : null;
    const output =
      printing ||
      printMedia.matches ||
      !route(location.href) ||
      outputView(document);
    const appliedTheme = output ? "default" : dataset.ddTheme || "default";
    let appearance;
    if (output) appearance = "output";
    else if (domSuspended) appearance = "page-fallback";
    else if (transition && selectedTheme !== appliedTheme) appearance = "pending";
    else if (appliedTheme !== "default")
      appearance = dataset.ddNeedsReload || dataset.ddPreserved
        ? "surface-fallback"
        : "theme";
    else appearance = selectedTheme === "default" ? "default" : "unavailable";
    const selectors = [
      ".docs-title-input",
      ".docs-title-input-label",
      ".waffle-printing-pane",
      '[aria-label="Insertion"]',
    ];
    const notes = document.querySelector(
      '[aria-label="Speaker notes"],.punch-viewer-speakernotes',
    );
    return {
      notes: notes
        ? {
            svg: notes.querySelectorAll("svg").length,
            canvas: notes.querySelectorAll("canvas").length,
            paint: [...notes.querySelectorAll("text,[contenteditable=true]")]
              .slice(0, 8)
              .map((e) => {
                const s = getComputedStyle(e);
                return {
                  color: s.color,
                  fill: s.fill,
                  background: s.backgroundColor,
                };
              }),
          }
        : null,
      app: route(location.href, { includeOutput: true })?.app,
      selectedTheme,
      appliedTheme,
      appearance,
      renderer: dataset.ddRenderer || null,
      overlays: document.querySelectorAll("darkerdocs-surface").length,
      colors: registry.size,
      colorLimit: MAX_COLOR_TOKENS,
      domCapacity: domSuspended,
      surfaces: selectors.flatMap((selector) =>
        [...document.querySelectorAll(selector)].slice(0, 12).map((e) => {
          const s = getComputedStyle(e);
          return {
            selector,
            tag: e.tagName,
            classes: e.getAttribute("class"),
            color: s.color,
            fill: s.fill,
            background: s.backgroundColor,
            image: s.backgroundImage !== "none",
            mask: s.maskImage !== "none",
            opacity: s.opacity,
            width: s.width,
            height: s.height,
            parents: [e.parentElement?.className],
          };
        }),
      ),
    };
  }
  chrome.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    if (
      message?.type === "darkerdocs:diagnostics" &&
      route(location.href, { includeOutput: true })
    )
      sendResponse(diagnostics());
  });
})();
