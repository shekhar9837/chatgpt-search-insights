// Function to render your tables (Your original logic)
const renderTable = (items, tbody, countEl, emptyText) => {
  countEl.textContent = String(items.length);
  tbody.innerHTML = "";
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="2" class="empty">${emptyText}</td></tr>`;
    return;
  }
  items.forEach((item, index) => {
    const row = `<tr><td>${index + 1}</td><td>${item}</td></tr>`;
    tbody.insertAdjacentHTML('beforeend', row);
  });
};

// UI Elements
const qBody = document.getElementById("queries-body");
const uBody = document.getElementById("urls-body");
const qCount = document.getElementById("queries-count");
const uCount = document.getElementById("urls-count");
const dataSection = document.getElementById("data-section");

const extractConversationIdFromUrl = (url) => {
  if (!url) return null;
  const match = url.match(/\/c\/([a-z0-9-]+)/i) || url.match(/\/chat\/([a-z0-9-]+)/i);
  return match ? match[1] : null;
};

// 1. Handle Click
document.getElementById("fetch-btn").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) return;
    
    // We DON'T clear storage here anymore. 
    // This stops the "vanishing" while the page is reloading.
    chrome.tabs.reload(tabs[0].id);
  });
});



// 2. Listen for Data updates from the content script
chrome.storage.onChanged.addListener(() => {
  updateUI();
});

// 3. Initial Load
const updateUI = () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabUrl = tabs?.[0]?.url || "";
    const conversationId = extractConversationIdFromUrl(tabUrl);

    chrome.storage.local.get(
      ["conversationData", "lastSeenConversationId"],
      (data) => {
        const conversationData = data.conversationData || {};
        const hasConversation = Boolean(conversationId);
        const isSwitch =
          hasConversation && data.lastSeenConversationId !== conversationId;
        const entry = hasConversation ? conversationData[conversationId] : null;
        const latestQueries = isSwitch ? [] : entry?.queries || [];
        const latestUrls = isSwitch ? [] : entry?.urls || [];
        const hasData = latestQueries.length > 0 && latestUrls.length > 0;

        if (dataSection) {
          dataSection.classList.toggle("hidden", !hasData);
        }

        renderTable(latestQueries, qBody, qCount, "No queries captured.");
        renderTable(latestUrls, uBody, uCount, "No URLs captured.");

        if (isSwitch) {
          chrome.storage.local.set({
            conversationData: {
              ...conversationData,
              [conversationId]: { queries: [], urls: [] }
            },
            lastSeenConversationId: conversationId
          });
        }
      }
    );
  });
};

updateUI();