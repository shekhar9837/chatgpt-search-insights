var pendingPopupResponse = null;

function notifyPopupDone() {
  if (pendingPopupResponse) {
    try {
      pendingPopupResponse({ done: true });
    } catch (e) {}
    pendingPopupResponse = null;
  }
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.type !== "EXTRACTED_DATA") return;

  const { source, insights, threadId, conversationId, queries, urls } = event.data;

  if (source === "perplexity" && insights != null && threadId) {
    chrome.storage.local.get(["latestInsights"], (result) => {
      const latestInsights = result.latestInsights || {};
      const perplexityByThread = { ...(latestInsights.perplexity || {}) };
      perplexityByThread[threadId] = insights;
      chrome.storage.local.set({
        latestInsights: {
          ...latestInsights,
          perplexity: perplexityByThread
        }
      }, notifyPopupDone);
    });
    return;
  }

  if (!conversationId) return;

  chrome.storage.local.get(["conversationData"], (result) => {
    const conversationData = result.conversationData || {};
    const current = conversationData[conversationId] || { queries: [], urls: [] };
    const updatedQueries = Array.from(
      new Set([...(current.queries || []), ...(queries || [])])
    );
    const updatedUrls = Array.from(
      new Set([...(current.urls || []), ...(urls || [])])
    );

    chrome.storage.local.set({
      conversationData: {
        ...conversationData,
        [conversationId]: {
          queries: updatedQueries,
          urls: updatedUrls
        }
      },
      latestConversationId: conversationId
    }, notifyPopupDone);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== "TRIGGER_REFRESH") return false;
  var url = window.location.href || "";
  var isPerplexity = url.indexOf("perplexity.ai") !== -1;
  if (isPerplexity) {
    pendingPopupResponse = sendResponse;
    window.postMessage({ type: "CSI_PERPLEXITY_REFRESH" }, "*");
  } else if (url.indexOf("chatgpt.com") !== -1) {
    var match = url.match(/\/c\/([a-z0-9-]+)/i) || url.match(/\/chat\/([a-z0-9-]+)/i);
    var conversationId = match ? match[1] : null;
    if (!conversationId) {
      sendResponse({ done: false, error: "No conversation ID" });
      return false;
    }
    window.postMessage({ type: "CSI_FETCH_REQUEST", conversationId }, "*");
  } else {
    sendResponse({ done: false, error: "Not a supported page" });
    return false;
  }
  return true;
});