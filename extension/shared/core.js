/* Shared by the isolated content script, popup and dependency-free tests. */
(() => {
  "use strict";
  const THEMES = Object.freeze(["oled", "dark", "default", "cream"]);
  const LABELS = Object.freeze(["OLED Black", "Dark Grey", "Default", "Cream"]);
  const KEY = "darkerdocs.settings.v1";
  const PALETTES = Object.freeze({
    oled: {
      bg: "#000000",
      surface: "#080808",
      raised: "#161616",
      text: "#e8eaed",
      muted: "#aeb4bd",
      paper: "#000000",
      accent: "#a8c7fa",
    },
    dark: {
      bg: "#101214",
      surface: "#17191c",
      raised: "#23262b",
      text: "#e4e7ec",
      muted: "#aab1bc",
      paper: "#191b1e",
      accent: "#a8c7fa",
    },
    default: {
      bg: "#ffffff",
      surface: "#f0f4f9",
      raised: "#ffffff",
      text: "#1f1f1f",
      muted: "#5f6368",
      paper: "#ffffff",
      accent: "#0b57d0",
    },
    cream: {
      bg: "#f5d5a1",
      surface: "#ffe2b3",
      raised: "#ffeacc",
      text: "#3f2a18",
      muted: "#715237",
      paper: "#ffe4b7",
      accent: "#174d94",
    },
  });
  function normalize(value) {
    return { theme: THEMES.includes(value?.theme) ? value.theme : "dark" };
  }
  function route(input, { includeOutput = false } = {}) {
    let url;
    try {
      url = new URL(input);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" || url.hostname !== "docs.google.com")
      return null;
    const match = url.pathname.match(
      /^\/(document|spreadsheets|presentation|forms)\//,
    );
    if (!match) return null;
    const app = {
      document: "docs",
      spreadsheets: "sheets",
      presentation: "slides",
      forms: "forms",
    }[match[1]];
    const output =
      /\/(?:print|export|present|embed|htmlpresent)(?:\/|$)/.test(
        url.pathname,
      ) ||
      (app === "slides" && /\/(?:pub|pubembed)\/?$/.test(url.pathname)) ||
      url.searchParams.get("output") === "pdf";
    if (output && !includeOutput) return null;
    const file = /\/d\//.test(url.pathname);
    return {
      app,
      view: file
        ? app === "forms" && /\/viewform\/?$/.test(url.pathname)
          ? "respondent"
          : "file"
        : "home",
    };
  }
  function parseColor(value) {
    if (typeof value !== "string") return null;
    if (value === "transparent") return { rgb: [0, 0, 0], alpha: 0 };
    const hex = value.match(
      /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i,
    );
    if (hex) {
      const h =
        hex[1].length < 5 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
      return {
        rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)),
        alpha: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1,
      };
    }
    const m = value.match(
      /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/,
    );
    const srgb = value.match(
      /^color\(srgb\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)(?:\s*\/\s*([\d.]+))?\s*\)$/,
    );
    const parts = m || srgb;
    if (!parts) return null;
    return {
      rgb: parts
        .slice(1, 4)
        .map((channel) =>
          Math.max(0, Math.min(255, Number(channel) * (srgb ? 255 : 1))),
        ),
      alpha: parts[4] === undefined ? 1 : Number(parts[4]),
    };
  }
  function hsl(rgb) {
    const [r, g, b] = rgb.map((v) => v / 255),
      max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      d = max - min,
      l = (max + min) / 2;
    let h = 0,
      s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      h =
        (max === r
          ? (g - b) / d + (g < b ? 6 : 0)
          : max === g
            ? (b - r) / d + 2
            : (r - g) / d + 4) / 6;
    }
    return [h, s, l];
  }
  function rgbFromHsl(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    return [0, 8, 4].map((n) => {
      const k = (n + h * 12) % 12;
      return Math.round(
        255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))),
      );
    });
  }
  function luminance(rgb) {
    return rgb
      .map((v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      })
      .reduce((v, c, i) => v + c * [0.2126, 0.7152, 0.0722][i], 0);
  }
  function contrastRatio(a, b) {
    const first = typeof a === "string" ? parseColor(a)?.rgb : a;
    const second = typeof b === "string" ? parseColor(b)?.rgb : b;
    if (!first || !second) return 0;
    const values = [luminance(first), luminance(second)].sort((x, y) => y - x);
    return (values[0] + 0.05) / (values[1] + 0.05);
  }
  function contrastInk(rgb, background, alpha = 1) {
    const bg = parseColor(background);
    if (!bg || bg.alpha !== 1) return rgb;
    const composite = (ink) =>
      ink.map((v, i) => v * alpha + bg.rgb[i] * (1 - alpha));
    if (contrastRatio(composite(rgb), bg.rgb) >= 4.5) return rgb;
    const [h, s, l] = hsl(rgb);
    let best = rgb,
      distance = Infinity,
      highest = contrastRatio(composite(rgb), bg.rgb);
    // Keep the hue and saturation, including pastel families. Preserve alpha.
    for (let i = 0; i <= 100; i++) {
      const candidate = rgbFromHsl(h, s, i / 100);
      const ratio = contrastRatio(composite(candidate), bg.rgb);
      if (ratio >= 4.5 && Math.abs(i / 100 - l) < distance) {
        best = candidate;
        distance = Math.abs(i / 100 - l);
      } else if (distance === Infinity && ratio > highest) {
        best = candidate;
        highest = ratio;
      }
    }
    return best;
  }
  function mapColor(value, theme, role = "ink", background = null) {
    const color = parseColor(value),
      p = PALETTES[theme];
    if (!color || !p || theme === "default" || color.alpha === 0) return value;
    const [h, s, l] = hsl(color.rgb),
      chroma = Math.max(...color.rgb) - Math.min(...color.rgb);
    // UI surfaces include Google's faintly tinted neutral tokens. Authored
    // ink/paint uses a stricter rule so pastel green, pink and blue stay colored.
    const mono =
      role === "ui-bg" || role === "ui-border"
        ? chroma <= 24
        : chroma <= 3 || s <= 0.08;
    let rgb;
    if (role === "ui-ink" && mono)
      rgb = parseColor(l > 0.2 && l < 0.7 ? p.muted : p.text).rgb;
    else if (role === "ui-border" && mono)
      rgb = parseColor(
        theme === "cream"
          ? "#b5966a"
          : theme === "oled"
            ? "#383b40"
            : "#444950",
      ).rgb;
    else if (role === "ui-bg") {
      if (mono)
        rgb = parseColor(l > 0.96 ? p.surface : l > 0.8 ? p.bg : p.raised).rgb;
      else
        rgb = rgbFromHsl(
          h,
          Math.min(s, 0.65),
          theme === "cream"
            ? Math.min(0.84, Math.max(0.64, l))
            : 0.13 + 0.2 * (1 - l),
        );
    } else if (mono) {
      const paper = parseColor(p.paper).rgb,
        ink = parseColor(p.text).rgb;
      rgb = paper.map((v, i) => Math.round(v + (ink[i] - v) * (1 - l)));
    } else if (theme === "cream")
      rgb = rgbFromHsl(
        h,
        s,
        role.endsWith("ink")
          ? Math.min(l, 0.36)
          : Math.min(0.85, Math.max(0.24, l)),
      );
    else
      rgb = rgbFromHsl(
        h,
        s,
        role.endsWith("ink")
          ? Math.max(0.65, Math.min(0.8, 1 - l))
          : 0.1 + 0.72 * (1 - l),
      );
    if (theme !== "cream" && role === "paint" && !mono) {
      let light = hsl(rgb)[2];
      while (luminance(rgb) > 0.12 && light > 0.01) {
        light *= 0.9;
        rgb = rgbFromHsl(h, s, light);
      }
    }
    if (background && role.endsWith("ink"))
      rgb = contrastInk(rgb, background, color.alpha);
    return `rgba(${rgb.join(",")},${color.alpha})`;
  }
  function neutral(value) {
    const color = parseColor(value);
    if (!color || color.alpha < 0.95) return false;
    const rgb = color.rgb;
    // Used only for identified application controls, NEVER authored content.
    return Math.max(...rgb) - Math.min(...rgb) <= 24;
  }
  function outputView(root) {
    return [...root.querySelectorAll(".waffle-printing-pane")].some(
      (e) =>
        e.getClientRects().length &&
        getComputedStyle(e).visibility !== "hidden",
    );
  }
  globalThis.DarkerDocs = Object.freeze({
    THEMES,
    LABELS,
    KEY,
    PALETTES,
    normalize,
    route,
    neutral,
    parseColor,
    mapColor,
    contrastRatio,
    outputView,
  });
})();
