let latestQueries = [];
let latestUrls = [];
let attachedTabId = null;
const responseForRequestId = new Map();
const targetPrefix = "https://chatgpt.com/backend-api/conversation";

const dedupeAppend = (list, items) =>
  Array.from(new Set([...list, ...items]));

const collectQueries = (payload) => {
  const results = new Set();

  const addQueries = (queries) => {
    if (!Array.isArray(queries)) return;
    for (const q of queries) {
      if (typeof q === "string" && q.trim()) {
        results.add(q);
      }
    }
  };

  addQueries(payload?.metadata?.search_model_queries?.queries);

  const mapping = payload?.mapping;
  if (mapping && typeof mapping === "object") {
    for (const node of Object.values(mapping)) {
      addQueries(node?.metadata?.search_model_queries?.queries);
      addQueries(node?.message?.metadata?.search_model_queries?.queries);
    }
  }

  return Array.from(results);
};

const collectUrlsFromResponse = (payload) => {
  const results = new Set();

  const addUrls = (urls) => {
    if (!Array.isArray(urls)) return;
    for (const url of urls) {
      if (typeof url === "string" && url.startsWith("http")) {
        results.add(url);
      }
    }
  };

  addUrls(payload?.safe_urls);

  const contentRefs = payload?.content_references;
  if (Array.isArray(contentRefs)) {
    for (const ref of contentRefs) {
      addUrls(ref?.safe_urls);
      if (Array.isArray(ref?.items)) {
        for (const item of ref.items) {
          if (item?.url) results.add(item.url);
          addUrls(item?.supporting_websites?.map((site) => site.url));
        }
      }
      addUrls(ref?.sources?.map((source) => source.url));
    }
  }

  const searchGroups = payload?.search_result_groups;
  if (Array.isArray(searchGroups)) {
    for (const group of searchGroups) {
      if (Array.isArray(group?.entries)) {
        for (const entry of group.entries) {
          if (entry?.url) results.add(entry.url);
        }
      }
    }
  }

  return Array.from(results);
};

const handleResponseBody = (body) => {
  if (!body) return;
  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    return;
  }

  const queries = collectQueries(parsed);
  if (queries.length) {
    latestQueries = dedupeAppend(latestQueries, queries);
  }

  const urls = collectUrlsFromResponse(parsed);
  if (urls.length) {
    latestUrls = dedupeAppend(latestUrls, urls);
  }
};

const attachDebugger = async (tabId) => {
  if (attachedTabId === tabId) return;
  await chrome.debugger.attach({ tabId }, "1.3");
  await chrome.debugger.sendCommand({ tabId }, "Network.enable");
  attachedTabId = tabId;
};

const detachDebugger = async () => {
  if (attachedTabId == null) return;
  try {
    await chrome.debugger.detach({ tabId: attachedTabId });
  } catch (error) {
    // ignore
  }
  attachedTabId = null;
  responseForRequestId.clear();
};

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (source.tabId !== attachedTabId) return;

  if (method === "Network.responseReceived") {
    const responseUrl = params?.response?.url;
    if (responseUrl && responseUrl.startsWith(targetPrefix)) {
      responseForRequestId.set(params.requestId, responseUrl);
    }
    return;
  }

  if (method === "Network.loadingFinished") {
    if (!responseForRequestId.has(params.requestId)) return;
    chrome.debugger
      .sendCommand(
        { tabId: attachedTabId },
        "Network.getResponseBody",
        { requestId: params.requestId }
      )
      .then((result) => {
        handleResponseBody(result?.body);
        responseForRequestId.delete(params.requestId);
      })
      .catch(() => {
        responseForRequestId.delete(params.requestId);
      });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "start_capture") {
    latestQueries = [];
    latestUrls = [];
    responseForRequestId.clear();

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        sendResponse({ ok: false, error: "No active tab." });
        return;
      }

      try {
        await attachDebugger(tab.id);
        await chrome.tabs.reload(tab.id);
        sendResponse({ ok: true });
      } catch (error) {
        await detachDebugger();
        sendResponse({ ok: false, error: String(error) });
      }
    });

    return true;
  }

  if (message?.type === "get_latest") {
    sendResponse({
      queries: latestQueries,
      urls: latestUrls
    });
    return;
  }
});