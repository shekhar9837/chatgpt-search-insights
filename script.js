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
const fetchBtn = document.getElementById("fetch-btn");
const loadingSpinner = document.getElementById("loading-spinner");
const btnText = document.getElementById("btn-text");

// Loading state helpers
const setLoading = (isLoading) => {
  fetchBtn.disabled = isLoading;
  loadingSpinner.classList.toggle("hidden", !isLoading);
  btnText.textContent = isLoading ? "Fetching..." : "Refresh & Fetch Data";
};

const extractConversationIdFromUrl = (url) => {
  if (!url) return null;
  const match = url.match(/\/c\/([a-z0-9-]+)/i) || url.match(/\/chat\/([a-z0-9-]+)/i);
  return match ? match[1] : null;
};

const extractPerplexityThreadIdFromUrl = (url) => {
  if (!url || !url.includes("perplexity.ai")) return null;
  const match = url.match(/\/search\/([^/?]+)/);
  return match ? match[1] : null;
};

// 1. Handle Click - ask the page to fetch data (no reload)
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === "REFRESH_DONE") {
    setLoading(false);
    updateUI();
  }
});

fetchBtn.addEventListener("click", () => {
  setLoading(true);
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]) {
      setLoading(false);
      return;
    }
    var tab = tabs[0];
    var url = tab.url || "";
    if (url.indexOf("chatgpt.com") === -1 && url.indexOf("perplexity.ai") === -1) {
      setLoading(false);
      updateUI();
      return;
    }
    chrome.tabs.sendMessage(tab.id, { action: "TRIGGER_REFRESH" }, (response) => {
      if (chrome.runtime.lastError) {
        setLoading(false);
        updateUI();
        return;
      }
      if (response && (response.done || response.error)) {
        setLoading(false);
        updateUI();
      }
    });
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
    const isPerplexityTab = tabUrl.includes("perplexity.ai");

    chrome.storage.local.get(
      ["conversationData", "lastSeenConversationId", "latestInsights"],
      (data) => {
        const conversationData = data.conversationData || {};
        const perplexityByThread = data.latestInsights?.perplexity || {};
        const perplexityThreadId = extractPerplexityThreadIdFromUrl(tabUrl);
        const perplexityInsights = perplexityThreadId ? perplexityByThread[perplexityThreadId] : null;
        let latestQueries, latestUrls, showData;

        if (isPerplexityTab) {
          latestQueries = Array.from(
            new Set([
              ...(perplexityInsights?.rewrittenQueries || []),
              ...(perplexityInsights?.relatedQueries || [])
            ])
          );
          latestUrls = perplexityInsights?.sourceUrls || [];
          showData = latestQueries.length > 0 || latestUrls.length > 0;
        } else {
          const hasConversation = Boolean(conversationId);
          const isSwitch =
            hasConversation && data.lastSeenConversationId !== conversationId;
          const entry = hasConversation ? conversationData[conversationId] : null;
          latestQueries = isSwitch ? [] : entry?.queries || [];
          latestUrls = isSwitch ? [] : entry?.urls || [];
          showData = latestQueries.length > 0 || latestUrls.length > 0;

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

        if (dataSection) {
          dataSection.classList.toggle("hidden", !showData);
        }
        renderTable(latestQueries, qBody, qCount, "No queries captured.");
        renderTable(latestUrls, uBody, uCount, "No URLs captured.");
      }
    );
  });
};

updateUI();