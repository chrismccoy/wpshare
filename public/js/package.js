(() => {
  const panes = [...document.querySelectorAll(".file-pane")];
  const treeFiles = [...document.querySelectorAll(".tree-file")];
  const rawSources = [...document.querySelectorAll("textarea[data-raw]")];

  const breadcrumb = document.getElementById("breadcrumb");
  const langBadge = document.getElementById("langBadge");
  const lineCount = document.getElementById("lineCount");
  const copyFileBtn = document.getElementById("copyFileBtn");
  const rawBtn = document.getElementById("rawBtn");
  const copyLinkBtn = document.getElementById("copyLinkBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const rawModal = document.getElementById("rawModal");
  const rawName = document.getElementById("rawName");
  const rawText = document.getElementById("rawText");
  const rawClose = document.getElementById("rawClose");
  const toast = document.getElementById("toast");
  const toastMsg = document.getElementById("toastMsg");
  const header = document.querySelector("header");
  const viewer = document.getElementById("viewer");
  const packageBar = document.getElementById("packageBar");

  const TOAST_MS = 2500;
  const FLASH_MS = 2000;

  let currentPath = panes.length ? panes[0].dataset.path : "";
  let toastTimer = null;
  const flashState = new WeakMap();

  const findPane = (path) => panes.find((pane) => pane.dataset.path === path);

  const getRawText = (path) => {
    const source = rawSources.find((el) => el.dataset.raw === path);
    return source ? source.value : null;
  };

  const setPreviewable = (enabled) => {
    for (const btn of [copyFileBtn, rawBtn]) {
      btn.disabled = !enabled;
      btn.classList.toggle("opacity-40", !enabled);
    }
  };

  const selectFile = (path) => {
    const activePane = findPane(path);
    if (!activePane) return;
    currentPath = path;

    panes.forEach((pane) => pane.classList.toggle("active", pane === activePane));
    treeFiles.forEach((btn) => btn.classList.toggle("active", btn.dataset.path === path));

    const isText = activePane.dataset.preview === "text";
    breadcrumb.textContent = path;
    langBadge.textContent = activePane.dataset.lang;
    lineCount.textContent = isText ? `${activePane.dataset.lines} lines` : "—";
    setPreviewable(isText);

    const coveredTo = Math.max(
      header.getBoundingClientRect().bottom,
      packageBar.getBoundingClientRect().bottom
    );
    if (viewer.getBoundingClientRect().top < coveredTo) {
      viewer.scrollIntoView({ block: "start" });
    }
  };

  const toggleFolder = (button) => {
    const folder = button.nextElementSibling;
    const icon = button.querySelector("[data-folder-icon]");
    const isHidden = folder.classList.toggle("hidden");
    icon.textContent = isHidden ? "▸" : "▾";
  };

  const flashButton = (btn, message) => {
    const state = flashState.get(btn) ?? { original: btn.textContent, timer: null };
    btn.textContent = message;
    btn.classList.add("text-emerald-300");

    clearTimeout(state.timer);
    state.timer = setTimeout(() => {
      btn.textContent = state.original;
      btn.classList.remove("text-emerald-300");
      flashState.delete(btn);
    }, FLASH_MS);
    flashState.set(btn, state);
  };

  const showToast = (message) => {
    toastMsg.textContent = message;
    toast.classList.remove("hidden-toast");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add("hidden-toast"), TOAST_MS);
  };

  const copyText = (text, btn, ok, failed) => {
    if (text === null || !navigator.clipboard) return flashButton(btn, failed);
    navigator.clipboard
      .writeText(text)
      .then(() => flashButton(btn, ok))
      .catch(() => flashButton(btn, failed));
  };

  const copyCurrent = () => copyText(getRawText(currentPath), copyFileBtn, "✓ Copied", "Copy failed");

  const copyUrl = () => copyText(copyLinkBtn.dataset.shareUrl, copyLinkBtn, "✓ COPIED", "FAILED");

  const showRaw = () => {
    const text = getRawText(currentPath);
    if (text === null) return;
    rawName.textContent = currentPath;
    rawText.value = text;
    rawModal.classList.remove("hidden");
  };

  const closeRaw = () => rawModal.classList.add("hidden");

  const downloadPackage = async () => {
    const zipUrl = downloadBtn.dataset.zipUrl;
    try {
      const res = await fetch(zipUrl, { method: "HEAD" });
      if (!res.ok) return showToast("Download unavailable: the zip is missing or expired.");
    } catch {
      return showToast("Download failed. Check your connection and try again.");
    }
    location.href = zipUrl;
    showToast(`⬇ ${downloadBtn.dataset.downloadName} download started`);
  };

  const setStickyOffsets = () => {
    const root = document.documentElement.style;
    root.setProperty("--header-h", `${header.offsetHeight}px`);
    root.setProperty("--bar-h", `${packageBar.offsetHeight}px`);
  };
  const stickyObserver = new ResizeObserver(setStickyOffsets);
  stickyObserver.observe(header);
  stickyObserver.observe(packageBar);

  document.querySelectorAll("[data-folder]").forEach((btn) => {
    btn.addEventListener("click", () => toggleFolder(btn));
  });
  treeFiles.forEach((btn) => {
    btn.addEventListener("click", () => selectFile(btn.dataset.path));
  });
  document.querySelector("pre")?.addEventListener("click", (e) => {
    const link = e.target.closest("a[data-path]");
    if (!link) return;
    e.preventDefault();
    selectFile(link.dataset.path);
  });

  copyFileBtn.addEventListener("click", copyCurrent);
  rawBtn.addEventListener("click", showRaw);
  copyLinkBtn.addEventListener("click", copyUrl);
  downloadBtn.addEventListener("click", downloadPackage);
  rawClose.addEventListener("click", closeRaw);
  rawModal.addEventListener("click", (e) => {
    if (e.target === rawModal) closeRaw();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeRaw();
  });

  if (currentPath) selectFile(currentPath);
})();
