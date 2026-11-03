(() => {
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content ?? "";
  const ROW_FADE_MS = 200;

  const enterConfirm = (btn) => {
    btn.dataset.confirming = "1";
    btn.textContent = "Confirm?";
    btn.classList.replace("text-red-400", "text-red-300");
    btn.classList.replace("hover:bg-red-500/10", "bg-red-500/10");

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.className =
      "cancel-btn px-3 py-1.5 text-xs font-medium rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer";
    cancel.addEventListener("click", () => resetConfirm(btn));
    btn.closest("td").querySelector("div").appendChild(cancel);
  };

  const resetConfirm = (btn) => {
    btn.dataset.confirming = "";
    btn.textContent = "Delete";
    btn.classList.replace("text-red-300", "text-red-400");
    btn.classList.replace("bg-red-500/10", "hover:bg-red-500/10");
    removeCancel(btn);
  };

  const removeCancel = (btn) => {
    const cancel = btn.closest("td").querySelector(".cancel-btn");
    if (cancel) cancel.remove();
  };

  const FAILURE_LABELS = { 401: "Logged out", 403: "Reload page" };

  const showFailure = (btn, status) => {
    btn.dataset.confirming = "";
    btn.textContent = FAILURE_LABELS[status] ?? "Error";
    btn.classList.replace("text-red-400", "text-red-300");
    btn.disabled = false;
  };

  const readCount = () => {
    const countEl = document.getElementById("packageCount");
    return countEl ? parseInt(countEl.textContent, 10) : NaN;
  };

  const setCount = (count) => {
    document.getElementById("packageCount").textContent = `${count} total`;
    if (count === 0) document.getElementById("trashAllBtn")?.remove();
  };

  const decrementCount = () => {
    const count = readCount();
    if (!isNaN(count)) setCount(count - 1);
  };

  const showEmptyState = () => {
    const table = document.querySelector("[data-package-table]");
    const template = document.getElementById("emptyStateTpl");
    table.replaceWith(template.content.cloneNode(true));
  };

  const removeRow = (row) => {
    row.style.transition = `opacity ${ROW_FADE_MS}ms`;
    row.style.opacity = "0";
    setTimeout(() => {
      const tbody = row.closest("tbody");
      row.remove();
      if (tbody.querySelectorAll("tr").length === 0) showEmptyState();
    }, ROW_FADE_MS);
  };

  const deletePackage = async (btn) => {
    btn.disabled = true;
    btn.textContent = "...";
    removeCancel(btn);

    try {
      const res = await fetch(`/admin/packages/${btn.dataset.id}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken, Accept: "application/json" },
      });
      if (!res.ok) return showFailure(btn, res.status);
      decrementCount();
      removeRow(document.querySelector(`tr[data-row-id="${btn.dataset.id}"]`));
    } catch {
      showFailure(btn);
    }
  };

  const trashBtn = document.getElementById("trashAllBtn");

  const enterTrashConfirm = () => {
    trashBtn.dataset.confirming = "1";
    trashBtn.textContent = `Delete all ${readCount()}?`;
    trashBtn.classList.replace("text-red-400", "text-red-300");
    trashBtn.classList.replace("hover:bg-red-500/10", "bg-red-500/10");

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.id = "trashAllCancel";
    cancel.textContent = "Cancel";
    cancel.className =
      "px-3 py-1.5 text-sm font-medium rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer";
    cancel.addEventListener("click", resetTrashConfirm);
    trashBtn.after(cancel);
  };

  const resetTrashConfirm = () => {
    trashBtn.dataset.confirming = "";
    trashBtn.textContent = "Trash all";
    trashBtn.classList.replace("text-red-300", "text-red-400");
    trashBtn.classList.replace("bg-red-500/10", "hover:bg-red-500/10");
    document.getElementById("trashAllCancel")?.remove();
  };

  const showAllTrashed = () => {
    document.querySelector("[data-pagination]")?.remove();
    if (document.querySelector("[data-package-table]")) showEmptyState();
    setCount(0);
    history.replaceState(null, "", "/admin");
  };

  const trashAll = async () => {
    trashBtn.disabled = true;
    trashBtn.textContent = "...";
    document.getElementById("trashAllCancel")?.remove();

    try {
      const res = await fetch("/admin/packages", {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken, Accept: "application/json" },
      });
      if (!res.ok) return showFailure(trashBtn, res.status);
      showAllTrashed();
    } catch {
      showFailure(trashBtn);
    }
  };

  trashBtn?.addEventListener("click", () => {
    if (trashBtn.dataset.confirming) trashAll();
    else enterTrashConfirm();
  });

  document.querySelectorAll(".delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.confirming) deletePackage(btn);
      else enterConfirm(btn);
    });
  });
})();
