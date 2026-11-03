(() => {
  const { formatSize, formatMb, isZipName } = window.wpshareFiles;
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content ?? "";
  const maxBytes = Number(document.body.dataset.maxBytes);
  const uploadUrl = document.body.dataset.uploadUrl;

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const statusBox = document.getElementById("status");
  const fileNameEl = document.getElementById("fileName");
  const fileSizeEl = document.getElementById("fileSize");
  const readyEl = document.getElementById("ready");
  const submitBtn = document.getElementById("submitBtn");
  const progressWrap = document.getElementById("progressWrap");
  const progress = document.getElementById("progress");
  const errorEl = document.getElementById("error");
  const expiryHint = document.getElementById("expiryHint");
  const expiryInputs = document.querySelectorAll('input[name="expiry"]');

  let selected = null;
  let uploading = false;

  const showError = (message) => {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
  };

  const clearError = () => errorEl.classList.add("hidden");

  const clearSelection = () => {
    selected = null;
    submitBtn.disabled = true;
    statusBox.classList.add("hidden");
    readyEl.classList.add("hidden");
  };

  const rejectFile = (message) => {
    clearSelection();
    fileInput.value = "";
    showError(message);
  };

  const problemWith = (file) => {
    if (!isZipName(file.name)) return "Choose a .zip file to upload.";
    if (file.size > maxBytes) return `That file is larger than the ${formatMb(maxBytes)} limit.`;
    return null;
  };

  const chooseFile = (file) => {
    if (uploading) return;
    clearError();
    clearSelection();
    if (!file) return;

    const problem = problemWith(file);
    if (problem) return rejectFile(problem);

    fileNameEl.textContent = file.name;
    fileSizeEl.textContent = formatSize(file.size);
    statusBox.classList.remove("hidden");
    readyEl.classList.remove("hidden");
    selected = file;
    submitBtn.disabled = false;
  };

  const upload = () => {
    if (!selected || uploading) return;

    uploading = true;
    submitBtn.disabled = true;
    clearError();
    progress.style.width = "0%";
    progressWrap.classList.remove("hidden");

    const body = new FormData();
    const expiry = document.querySelector('input[name="expiry"]:checked');
    if (expiry) body.append("expiry", expiry.value);
    body.append("file", selected);

    const request = new XMLHttpRequest();
    request.open("POST", uploadUrl);
    request.setRequestHeader("x-csrf-token", csrfToken);
    request.setRequestHeader("Accept", "application/json");

    request.upload.addEventListener("progress", (e) => {
      if (!e.lengthComputable) return;
      progress.style.width = `${Math.round((e.loaded / e.total) * 100)}%`;
    });

    request.addEventListener("load", () => {
      let payload = {};
      try {
        payload = JSON.parse(request.responseText);
      } catch {
        payload = {};
      }

      if (request.status === 201 && payload.url) {
        window.location.href = payload.url;
        return;
      }

      uploading = false;
      progressWrap.classList.add("hidden");
      const message = payload.error || "Upload failed. Please try again.";
      if (request.status === 413 || request.status === 422) {
        rejectFile(message);
        return;
      }
      submitBtn.disabled = false;
      showError(message);
    });

    const FAILURE_MESSAGES = {
      error: "Network error. Please try again.",
      abort: "The upload was cancelled. Please try again.",
      timeout: "The upload timed out. Please try again.",
    };
    for (const [type, message] of Object.entries(FAILURE_MESSAGES)) {
      request.addEventListener(type, () => {
        uploading = false;
        progressWrap.classList.add("hidden");
        submitBtn.disabled = false;
        showError(message);
      });
    }

    request.send(body);
  };

  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("click", (e) => e.stopPropagation());
  fileInput.addEventListener("change", () => chooseFile(fileInput.files[0]));

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("drag-active");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-active"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-active");
    chooseFile(e.dataTransfer.files[0]);
  });

  submitBtn.addEventListener("click", upload);

  const syncExpiryHint = () => {
    const checked = document.querySelector('input[name="expiry"]:checked');
    if (checked) expiryHint.textContent = checked.dataset.hint;
  };
  expiryInputs.forEach((input) => input.addEventListener("change", syncExpiryHint));
  window.addEventListener("pageshow", syncExpiryHint);
  syncExpiryHint();
})();
