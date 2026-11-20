(() => {
  "use strict";
  const { THEMES, LABELS, KEY, normalize } = DarkerDocs;
  const slider = document.querySelector("#theme");
  const status = document.querySelector("#status");
  const buttons = [...document.querySelectorAll("[data-theme]")];
  const retry = document.querySelector("#retry");
  let queue = Promise.resolve();
  let revision = 0;
  let saving = false;
  let retryAction;
  function message(text, action) {
    status.textContent = text;
    retryAction = action;
    retry.hidden = !action;
  }
  function selection(theme) {
    const index = THEMES.indexOf(theme);
    slider.value = index;
    slider.setAttribute("aria-valuetext", LABELS[index]);
    document.querySelector("#selection").value = LABELS[index];
    buttons.forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.theme === theme),
      ),
    );
  }
  function render(theme) {
    selection(theme);
    document.documentElement.dataset.ddTheme = theme;
  }
  function choose(theme) {
    document.documentElement.setAttribute("data-dd-ready", "");
    selection(theme);
    // Property transitions can stagger ink independently of its background and
    // smoothly retarget from the current color during rapid input.
    document.documentElement.dataset.ddTheme = theme;
    saving = true;
    message("Saving…");
    const current = ++revision;
    // Serialize writes so rapid dragging cannot persist an older selection last.
    queue = queue
      .catch(() => {})
      .then(() => chrome.storage.local.set({ [KEY]: { theme } }))
      .then(() => {
        if (current === revision) {
          saving = false;
          message("Saved · Open Workspace pages update automatically");
          // Reconcile an external storage event that arrived during our write.
          chrome.storage.local
            .get(KEY)
            .then((values) => {
              if (current === revision && !saving)
                render(normalize(values[KEY]).theme);
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        if (current === revision) {
          saving = false;
          message("Couldn’t save your preference.", () => choose(theme));
        }
      });
  }
  slider.addEventListener("input", () => choose(THEMES[Number(slider.value)]));
  buttons.forEach((button) =>
    button.addEventListener("click", () => choose(button.dataset.theme)),
  );
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[KEY] && !saving) {
      revision++;
      render(normalize(changes[KEY].newValue).theme);
      enable();
      message("");
    }
  });
  function enable() {
    slider.disabled = false;
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
  async function load() {
    const initial = revision;
    message("Loading your preference…");
    try {
      const values = await chrome.storage.local.get(KEY);
      if (revision === initial) {
        render(normalize(values[KEY]).theme);
        message("");
      }
      enable();
    } catch {
      if (revision === initial) message("Couldn’t load your preference.", load);
      else enable();
    }
  }
  retry.addEventListener("click", () => retryAction?.());
  const previews = [...document.querySelectorAll("[data-preview]")];
  previews.forEach((button) =>
    button.addEventListener("click", () => {
      document.querySelector(".preview").dataset.app = button.dataset.preview;
      previews.forEach((item) =>
        item.setAttribute("aria-pressed", String(item === button)),
      );
      document.querySelector("#preview-caption").textContent =
        button.dataset.preview === "slides"
          ? "Slides artwork stays original. The workspace adapts."
          : "Comfort on screen. Original in your files.";
    }),
  );
  load();
})();
