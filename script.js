const queriesBody = document.getElementById("queries-body");
const urlsBody = document.getElementById("urls-body");
const queriesCount = document.getElementById("queries-count");
const urlsCount = document.getElementById("urls-count");
const fetchButton = document.getElementById("fetch-queries");
const statusEl = document.getElementById("status");

const renderTable = (items, tbody, countEl, emptyText) => {
  if (!tbody || !countEl) return;
  countEl.textContent = String(items.length);
  tbody.innerHTML = "";

  if (!items.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 2;
    cell.className = "empty";
    cell.textContent = emptyText;
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach((item, index) => {
    const row = document.createElement("tr");
    const idxCell = document.createElement("td");
    const valueCell = document.createElement("td");
    idxCell.textContent = String(index + 1);
    valueCell.textContent = item;
    row.appendChild(idxCell);
    row.appendChild(valueCell);
    fragment.appendChild(row);
  });
  tbody.appendChild(fragment);
};

const loadLatest = async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: "get_latest" });
    const queries = Array.isArray(response?.queries) ? response.queries : [];
    const urls = Array.isArray(response?.urls) ? response.urls : [];

    renderTable(queries, queriesBody, queriesCount, "No queries captured yet.");
    renderTable(urls, urlsBody, urlsCount, "No URLs captured yet.");
  } catch (error) {
    renderTable([], queriesBody, queriesCount, "No queries captured yet.");
    renderTable([], urlsBody, urlsCount, "No URLs captured yet.");
  }
};

const setStatus = (text) => {
  if (!statusEl) return;
  statusEl.textContent = text;
};

const startCapture = async () => {
  if (!fetchButton) return;
  fetchButton.disabled = true;
  setStatus("Capturing...");

  try {
    const response = await chrome.runtime.sendMessage({ type: "start_capture" });
    if (!response?.ok) {
      setStatus("Failed to attach debugger.");
      fetchButton.disabled = false;
      return;
    }
  } catch (error) {
    setStatus("Failed to attach debugger.");
    fetchButton.disabled = false;
    return;
  }

  const startedAt = Date.now();
  const poll = async () => {
    await loadLatest();
    const queries = Number(queriesCount?.textContent || 0);
    const urls = Number(urlsCount?.textContent || 0);
    if (queries > 0 || urls > 0 || Date.now() - startedAt > 8000) {
      setStatus(queries || urls ? "Captured." : "No data yet.");
      fetchButton.disabled = false;
      return;
    }
    setTimeout(poll, 500);
  };
  poll();
};

document.addEventListener("DOMContentLoaded", () => {
  loadLatest();
  if (fetchButton) {
    fetchButton.addEventListener("click", startCapture);
  }
});