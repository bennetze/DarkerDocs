/* MAIN-world adapter. Native canvas pixels and serialization stay original.
   The themed screen copy lives in a pointer-transparent closed shadow root. */
(() => {
  "use strict";
  const { route, mapColor, outputView } = globalThis.DarkerDocs;
  if (
    !["docs", "sheets"].includes(route(location.href)?.app) ||
    !globalThis.CanvasRenderingContext2D
  )
    return;
  const proto = CanvasRenderingContext2D.prototype,
    cp = HTMLCanvasElement.prototype;
  const getContext = cp.getContext,
    descriptors = Object.getOwnPropertyDescriptors(proto),
    native = {};
  for (const [name, d] of Object.entries(descriptors))
    if (typeof d.value === "function") native[name] = d.value;
  const contexts = new WeakMap(),
    canvases = new WeakMap(),
    active = new Set(),
    mirrors = new WeakSet(),
    hosts = new WeakMap(),
    imageCache = new WeakMap(),
    watchedImages = new WeakSet();
  const commands = new Set(
    "save restore beginPath closePath moveTo lineTo bezierCurveTo quadraticCurveTo arc arcTo ellipse rect roundRect clip fill stroke clearRect fillRect strokeRect fillText strokeText drawImage putImageData setTransform resetTransform transform scale rotate translate setLineDash drawFocusIfNeeded reset".split(
      " ",
    ),
  );
  const colors = new Set(["fillStyle", "strokeStyle", "shadowColor"]);
  let theme = "default",
    replaying = false,
    queued = false,
    printing = false,
    replayDepth = 0,
    lastSnapshot = null;
  const MAX_OPS = 60000,
    MAX_BYTES = 12 * 1024 * 1024,
    MAX_TOTAL_BYTES = 96 * 1024 * 1024;
  let retainedBytes = 0,
    scratchBytes = 0;
  const temporarySurfaces = [];
  function resourceError() {
    return Object.assign(new Error("Display memory budget"), {
      ddReason: "memory",
    });
  }
  function reserve(bytes) {
    if (retainedBytes + scratchBytes + bytes <= MAX_TOTAL_BYTES) return;
    each(() => {}); // Collect accounting for records reclaimed by the browser.
    if (retainedBytes + scratchBytes + bytes > MAX_TOTAL_BYTES)
      throw resourceError();
  }
  function account(r) {
    if (!r.ref) return;
    const next =
      (r.opBytes || 0) +
      r.bytes +
      (r.snapshot ? r.snapshot.ops.length * 8 : 0) +
      (r.mirror ? r.mirror.width * r.mirror.height * 4 : 0);
    const delta = next - r.ref.bytes;
    if (delta > 0) reserve(delta);
    retainedBytes += delta;
    r.ref.bytes = next;
  }
  function releaseMirror(r) {
    r.host?.remove();
    r.host = null;
    r.layout = null;
    if (r.mirror) {
      r.mirror.width = 0;
      r.mirror.height = 0;
    }
    r.mirror = null;
    r.mc = null;
    r.canvas.removeAttribute("data-dd-source-canvas");
    account(r);
  }
  function releaseTemporary() {
    for (const canvas of temporarySurfaces) {
      canvas.width = 0;
      canvas.height = 0;
    }
    temporarySurfaces.length = 0;
    scratchBytes = 0;
    lastSnapshot = null;
  }
  function safely(r, fn) {
    try {
      return fn();
    } catch (error) {
      // Bookkeeping and display failures must never escape into Workspace.
      try {
        fallback(r, Boolean(error.ddPreserve), error.ddReason || "display");
      } catch {}
    } finally {
      if (!replayDepth) releaseTemporary();
    }
  }
  function each(fn) {
    for (const ref of active) {
      const r = ref.deref();
      if (r) fn(r);
      else {
        retainedBytes -= ref.bytes || 0;
        active.delete(ref);
      }
    }
  }
  function paintValue(name, value) {
    return name === "shadowColor" ? value : mapColor(value, theme, "paint");
  }
  function seed(r) {
    for (const name of colors) {
      const d = descriptors[name];
      if (d?.get && d?.set)
        d.set.call(r.mc, paintValue(name, d.get.call(r.ctx)));
    }
  }
  function reset(r) {
    releaseMirror(r);
    r.width = r.canvas.width;
    r.height = r.canvas.height;
    r.ops = [];
    r.opBytes = 0;
    r.bytes = 0;
    r.overflow = false;
    r.preserved = false;
    r.reason = null;
    r.clipped = false;
    r.clipStack = [];
    r.revision = (r.revision || 0) + 1;
    r.assets = new WeakSet();
    r.snapshot = null;
    r.canvas.removeAttribute("data-dd-canvas-fallback");
    account(r);
  }
  function record(ctx) {
    if (mirrors.has(ctx.canvas)) return null;
    let r = contexts.get(ctx);
    if (!r) {
      r = {
        ctx,
        canvas: ctx.canvas,
        width: ctx.canvas.width,
        height: ctx.canvas.height,
        ops: [],
        opBytes: 0,
        bytes: 0,
        overflow: false,
        mirror: null,
        host: null,
        painted: 0,
      };
      r.ref = new WeakRef(r);
      r.ref.bytes = 0;
      contexts.set(ctx, r);
      canvases.set(ctx.canvas, r);
      active.add(r.ref);
    }
    if (r.width !== r.canvas.width || r.height !== r.canvas.height) reset(r);
    return r;
  }
  function fallback(r, preserved = false, reason = "history") {
    if (!r) return;
    r.overflow = true;
    r.preserved = preserved;
    r.reason = reason;
    r.ops = [];
    r.opBytes = 0;
    r.snapshot = null;
    r.assets = new WeakSet();
    r.bytes = 0;
    releaseMirror(r);
    r.canvas.setAttribute("data-dd-canvas-fallback", "");
    status();
  }
  function remember(r, op) {
    if (r.overflow) return;
    if (r.ops.length >= MAX_OPS || r.bytes + (r.opBytes || 0) > MAX_BYTES) {
      fallback(r, false, "history");
      return;
    }
    const valueCost = (value) =>
      typeof value === "string"
        ? value.length * 2
        : Array.isArray(value)
          ? value.length * 8
          : 0;
    op.bytes =
      48 +
      valueCost(op.value) +
      (op.args || []).reduce((sum, value) => sum + valueCost(value), 0);
    if (r.bytes + (r.opBytes || 0) + op.bytes > MAX_BYTES) {
      fallback(r, false, "history");
      return;
    }
    r.ops.push(op);
    r.opBytes = (r.opBytes || 0) + op.bytes;
    r.revision = (r.revision || 0) + 1;
    account(r);
  }
  const pixelCalls = new Set(
    "fill stroke fillRect strokeRect fillText strokeText drawImage putImageData clearRect".split(
      " ",
    ),
  );
  function pruneCoveredPixels(r, name, args) {
    if (r.overflow || r.clipped || !["clearRect", "fillRect"].includes(name))
      return;
    const [x, y, w, h] = args,
      t = r.ctx.getTransform();
    if (
      ![x, y, w, h].every(Number.isFinite) ||
      w <= 0 ||
      h <= 0 ||
      x > 0 ||
      y > 0 ||
      x + w < r.width ||
      y + h < r.height ||
      t.a !== 1 ||
      t.b !== 0 ||
      t.c !== 0 ||
      t.d !== 1 ||
      t.e !== 0 ||
      t.f !== 0
    )
      return;
    if (
      name === "fillRect" &&
      (r.ctx.globalAlpha !== 1 ||
        r.ctx.globalCompositeOperation !== "source-over" ||
        r.ctx.filter !== "none" ||
        DarkerDocs.parseColor(r.ctx.fillStyle)?.alpha !== 1)
    )
      return;
    // A complete, unclipped repaint covers previous pixels. Keep paths and
    // drawing state, but release obsolete raster snapshots and paint calls.
    r.ops = r.ops.filter(
      (op) => op.kind !== "call" || !pixelCalls.has(op.name),
    );
    r.bytes = 0;
    r.opBytes = r.ops.reduce((sum, op) => sum + (op.bytes || 48), 0);
    r.assets = new WeakSet();
    r.snapshot = null;
    account(r);
  }
  function displaySource(source) {
    const r = canvases.get(source);
    return (theme !== "default" && !r?.overflow && r?.mirror) || source;
  }
  function copyImage(source) {
    const recorded = canvases.get(source);
    if (recorded && !recorded.overflow && recorded.ops.length) {
      if (
        !recorded.snapshot ||
        recorded.snapshot.revision !== recorded.revision
      )
        recorded.snapshot = {
          width: source.width,
          height: source.height,
          ops: recorded.ops.slice(),
          bytes: (recorded.opBytes || 0) + recorded.bytes,
          revision: recorded.revision,
        };
      // Recorded tiles retain drawing commands, not a full pixel buffer. A
      // retina-sized scratch canvas must not consume its logical bitmap size
      // in the history budget for every small cropped draw.
      try {
        account(recorded);
      } catch (error) {
        recorded.snapshot = null;
        throw error;
      }
      return { snapshot: recorded.snapshot, bytes: recorded.snapshot.bytes };
    }
    if (
      !source ||
      !(
        source instanceof HTMLCanvasElement ||
        (globalThis.OffscreenCanvas && source instanceof OffscreenCanvas) ||
        source instanceof HTMLVideoElement ||
        source instanceof HTMLImageElement ||
        (globalThis.ImageBitmap && source instanceof ImageBitmap)
      )
    )
      return { display: source, bytes: 0 };
    if (source instanceof HTMLImageElement) {
      const cached = imageCache.get(source),
        display = cached?.display.deref();
      if (display && cached.src === source.currentSrc)
        return { display, bytes: cached.bytes };
      if (!watchedImages.has(source)) {
        watchedImages.add(source);
        source.addEventListener("load", () => imageCache.delete(source));
      }
    }
    const width = source.videoWidth || source.naturalWidth || source.width,
      height = source.videoHeight || source.naturalHeight || source.height;
    if (!width || !height || width * height * 4 > MAX_BYTES)
      return { display: displaySource(source), bytes: MAX_BYTES + 1 };
    reserve(width * height * 4);
    const c = document.createElement("canvas");
    mirrors.add(c);
    c.width = width;
    c.height = height;
    native.drawImage.call(
      getContext.call(c, "2d"),
      displaySource(source),
      0,
      0,
    );
    const image = { display: c, bytes: width * height * 4 };
    if (source instanceof HTMLImageElement)
      imageCache.set(source, {
        src: source.currentSrc,
        display: new WeakRef(c),
        bytes: image.bytes,
      });
    return image;
  }
  function snapshotSurface(snapshot) {
    if (lastSnapshot?.source === snapshot) return lastSnapshot.canvas;
    const bytes = snapshot.width * snapshot.height * 4;
    reserve(bytes);
    const canvas = document.createElement("canvas");
    mirrors.add(canvas);
    canvas.width = snapshot.width;
    canvas.height = snapshot.height;
    scratchBytes += bytes;
    temporarySurfaces.push(canvas);
    const ctx = getContext.call(canvas, "2d");
    const r = {
      canvas,
      ctx,
      width: snapshot.width,
      height: snapshot.height,
      ops: snapshot.ops,
      mirror: canvas,
      mc: ctx,
      host: null,
    };
    repaint(r);
    lastSnapshot = { source: snapshot, canvas };
    return canvas;
  }
  function execute(r, name, args) {
    const m = r.mc;
    if (
      [
        "fill",
        "stroke",
        "fillRect",
        "strokeRect",
        "fillText",
        "strokeText",
      ].includes(name)
    ) {
      const property = name.startsWith("stroke") ? "strokeStyle" : "fillStyle",
        paint = r.ink?.[property] ?? descriptors[property].get.call(r.ctx);
      if (globalThis.CanvasPattern && paint instanceof CanvasPattern)
        throw Object.assign(new Error("Preserve patterned surface"), {
          ddPreserve: true,
          ddReason: "pattern",
        });
      if (globalThis.CanvasGradient && paint instanceof CanvasGradient)
        throw Object.assign(new Error("Preserve gradient surface"), {
          ddPreserve: true,
          ddReason: "gradient",
        });
    }
    if (name === "drawImage")
      args = [
        args[0]?.ddImage
          ? args[0].snapshot
            ? snapshotSurface(args[0].snapshot)
            : args[0].display
          : displaySource(args[0]),
        ...args.slice(1),
      ];
    if (name === "fillText" || name === "strokeText" || name === "fill") {
      const property = name === "strokeText" ? "strokeStyle" : "fillStyle",
        d = descriptors[property],
        previous = d.get.call(m);
      d.set.call(
        m,
        mapColor(r.ink?.[property] ?? d.get.call(r.ctx), theme, "ink"),
      );
      try {
        native[name].apply(m, args);
      } finally {
        d.set.call(m, previous);
      }
    } else {
      native[name]?.apply(m, args);
      if (name === "reset") seed(r);
    }
  }
  function makeMirror(r) {
    if (r.mirror) return;
    reserve(r.width * r.height * 4);
    r.mirror = document.createElement("canvas");
    mirrors.add(r.mirror);
    r.mirror.width = r.width;
    r.mirror.height = r.height;
    r.mc = getContext.call(r.mirror, "2d");
    if (!r.mc) throw new Error("Display context unavailable");
    account(r);
    seed(r);
  }
  function measureLayout(r) {
    const s = getComputedStyle(r.canvas),
      left = r.canvas.offsetLeft,
      top = r.canvas.offsetTop;
    return `position:absolute;left:${left}px;top:${top}px;width:${s.width};height:${s.height};transform:${s.transform};transform-origin:${s.transformOrigin};z-index:${s.zIndex};opacity:${s.opacity};visibility:${s.visibility};pointer-events:none;display:${s.display === "none" ? "none" : "block"};margin:0;padding:0;border:0;`;
  }
  function mount(r, layout) {
    if (!r.host) {
      r.host = document.createElement("darkerdocs-surface");
      hosts.set(r.host, new WeakRef(r.canvas));
      r.host.setAttribute("aria-hidden", "true");
      r.host.attachShadow({ mode: "closed" }).append(r.mirror);
      r.mirror.style.cssText =
        "display:block;width:100%;height:100%;pointer-events:none";
    }
    if (r.layout !== layout) {
      r.host.style.cssText = layout;
      r.layout = layout;
    }
    if (r.host.parentNode !== r.canvas.parentNode) r.canvas.after(r.host);
    if (!r.canvas.hasAttribute("data-dd-source-canvas"))
      r.canvas.setAttribute("data-dd-source-canvas", "");
  }
  function layoutMirrors() {
    const html = document.documentElement;
    if (!html || theme === "default" || printing) return;
    const layouts = [];
    // Read native geometry and opacity together before changing any hosts.
    html.setAttribute("data-dd-measuring-canvas", "");
    try {
      each((r) => {
        if (r.mirror && r.canvas.isConnected)
          safely(r, () => layouts.push([r, measureLayout(r)]));
      });
    } finally {
      html.removeAttribute("data-dd-measuring-canvas");
    }
    for (const [r, layout] of layouts) safely(r, () => mount(r, layout));
  }
  function repaint(r) {
    if (theme === "default") {
      releaseMirror(r);
      return;
    }
    if (r.overflow) return;
    makeMirror(r);
    r.mirror.width = r.canvas.width;
    r.mirror.height = r.canvas.height;
    r.ink = { fillStyle: "#000000", strokeStyle: "#000000" };
    const stack = [];
    descriptors.fillStyle.set.call(r.mc, mapColor("#000000", theme, "paint"));
    descriptors.strokeStyle.set.call(r.mc, mapColor("#000000", theme, "paint"));
    replaying = true;
    replayDepth++;
    try {
      for (const op of r.ops) {
        if (op.kind === "set") {
          if (colors.has(op.name)) r.ink[op.name] = op.value;
          descriptors[op.name].set.call(
            r.mc,
            colors.has(op.name) ? paintValue(op.name, op.value) : op.value,
          );
        } else {
          if (op.name === "save") stack.push({ ...r.ink });
          if (op.name === "restore" && stack.length) r.ink = stack.pop();
          execute(r, op.name, op.args);
        }
      }
    } finally {
      replayDepth--;
      replaying = replayDepth > 0;
      r.ink = null;
    }
  }
  cp.getContext = function (type, ...args) {
    const ctx = getContext.call(this, type, ...args);
    if (type === "2d" && ctx && !mirrors.has(this))
      safely(canvases.get(this), () => record(ctx));
    return ctx;
  };
  function recordCall(r, name, args, image) {
    if (name === "reset") reset(r);
    if (r.overflow) return;
    if (name === "save") (r.clipStack ??= []).push(Boolean(r.clipped));
    if (name === "restore" && r.clipStack?.length)
      r.clipped = r.clipStack.pop();
    if (name === "clip") r.clipped = true;
    pruneCoveredPixels(r, name, args);
    const stored = args.map((v) =>
      globalThis.Path2D && v instanceof Path2D ? new Path2D(v) : v,
    );
    if (name === "setLineDash") stored[0] = native.getLineDash.call(r.ctx);
    if (image) {
      const asset = image.snapshot || image.display;
      r.assets ??= new WeakSet();
      if (asset && typeof asset === "object" && !r.assets.has(asset)) {
        r.assets.add(asset);
        r.bytes += image.bytes;
      }
      stored[0] = { ...image, ddImage: true };
    }
    if (name === "putImageData" && args[0]) {
      reserve(args[0].data.byteLength);
      stored[0] = new ImageData(
        new Uint8ClampedArray(args[0].data),
        args[0].width,
        args[0].height,
        { colorSpace: args[0].colorSpace },
      );
      r.bytes += stored[0].data.byteLength;
    }
    remember(r, { kind: "call", name, args: stored });
    r.painted++;
    if (theme !== "default" && !r.overflow) {
      if (!r.mirror) repaint(r);
      else execute(r, name, args);
      if (!printing && !r.host && r.canvas.isConnected)
        mount(r, measureLayout(r));
    }
  }
  for (const [name, d] of Object.entries(descriptors)) {
    if (d.set && d.get)
      Object.defineProperty(proto, name, {
        ...d,
        set(value) {
          d.set.call(this, value); // Native validation always runs outside our guard.
          let r = contexts.get(this);
          safely(r, () => {
            r = record(this);
            if (!r || replaying) return;
            const actual = d.get.call(this);
            remember(r, { kind: "set", name, value: actual });
            if (r.mc)
              d.set.call(
                r.mc,
                colors.has(name) ? paintValue(name, actual) : actual,
              );
          });
        },
      });
    else if (commands.has(name) && native[name])
      Object.defineProperty(proto, name, {
        ...d,
        value: function (...args) {
          let r = contexts.get(this),
            image,
            preparationError;
          // Freeze image sources before a native self-draw can change them.
          try {
            r = record(this);
            if (r && name === "drawImage" && !r.overflow && !replaying)
              image = copyImage(args[0]);
          } catch (error) {
            preparationError = error;
          }
          const result = native[name].apply(this, args);
          if (!r || replaying) return result;
          safely(r, () => {
            if (preparationError) throw preparationError;
            recordCall(r, name, args, image);
          });
          return result;
        },
      });
  }
  for (const name of ["width", "height"]) {
    const d = Object.getOwnPropertyDescriptor(cp, name);
    Object.defineProperty(cp, name, {
      ...d,
      set(value) {
        d.set.call(this, value);
        if (mirrors.has(this)) return;
        const r = canvases.get(this);
        if (r) safely(r, () => reset(r));
      },
    });
  }
  for (const name of ["setAttribute", "removeAttribute"]) {
    const original = cp[name];
    cp[name] = function (...args) {
      const result = original.apply(this, args);
      if (["width", "height"].includes(String(args[0]).toLowerCase())) {
        const r = canvases.get(this);
        if (r) safely(r, () => reset(r));
      }
      return result;
    };
  }
  function status() {
    let surfaces = 0,
      painted = 0,
      overflow = 0,
      preserved = 0,
      operations = 0,
      bitmapBytes = 0;
    const reasons = {};
    each((r) => {
      operations += r.ops.length;
      bitmapBytes += r.mirror ? r.mirror.width * r.mirror.height * 4 : 0;
      if (r.canvas.isConnected) {
        surfaces++;
        painted += r.painted;
        if (r.overflow) {
          overflow++;
          if (r.preserved) preserved++;
          reasons[r.reason] = (reasons[r.reason] || 0) + 1;
        }
      }
    });
    const html = document.documentElement;
    if (html) {
      const data = JSON.stringify({
        surfaces,
        painted,
        overflow,
        preserved,
        reasons,
        operations,
        bitmapBytes,
        retainedBytes,
        scratchBytes,
        limitBytes: MAX_TOTAL_BYTES,
      });
      if (html.dataset.ddRenderer !== data) html.dataset.ddRenderer = data;
      if (overflow > preserved) html.dataset.ddNeedsReload = "true";
      else delete html.dataset.ddNeedsReload;
      if (preserved) html.dataset.ddPreserved = "true";
      else delete html.dataset.ddPreserved;
    }
  }
  function refresh() {
    const next = !route(location.href) || outputView(document)
      ? "default"
      : document.documentElement?.dataset.ddTheme || "default";
    if (next !== theme) {
      theme = next;
      each((r) => safely(r, () => repaint(r)));
    }
    each((r) =>
      safely(r, () => {
        if (r.canvas.isConnected && !r.overflow) {
          r.wasConnected = true;
          if (!r.mirror && theme !== "default") repaint(r);
        } else if (r.wasConnected) {
          releaseMirror(r);
          r.wasConnected = false;
        }
      }),
    );
    layoutMirrors();
    document.querySelectorAll("darkerdocs-surface").forEach((host) => {
      if (!hosts.get(host)?.deref()?.isConnected) host.remove();
    });
    status();
  }
  const observer = new MutationObserver((records) => {
    if (
      records.every(
        (r) =>
          r.target.nodeName === "DARKERDOCS-SURFACE" ||
          (r.type === "childList" &&
            [...r.addedNodes, ...r.removedNodes].every(
              (n) => n.nodeName === "DARKERDOCS-SURFACE",
            )),
      )
    )
      return;
    if (!queued) {
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        refresh();
      });
    }
  });
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      "data-dd-theme",
      "style",
      "class",
      "hidden",
      "width",
      "height",
    ],
  });
  addEventListener("resize", layoutMirrors);
  document.addEventListener("darkerdocs:theme", refresh);
  document.addEventListener("darkerdocs:metrics", status);
  addEventListener("beforeprint", () => {
    printing = true;
    each((r) => {
      r.host?.remove();
      r.canvas.removeAttribute("data-dd-source-canvas");
    });
  });
  addEventListener("afterprint", () => {
    printing = false;
    refresh();
  });
})();
