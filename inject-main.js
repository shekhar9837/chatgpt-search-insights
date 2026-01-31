const targetPrefix = "https://chatgpt.com/backend-api/conversation";

// --- YOUR EXISTING EXTRACTION LOGIC ---
const extractConversationId = (url) => {
  if (!url) return null;
  const match = url.match(/\/backend-api\/conversation\/([a-z0-9-]+)/i);
  return match ? match[1] : null;
};

const collectQueries = (payload) => {
  const results = new Set();
  const addQueries = (queries) => {
    if (!Array.isArray(queries)) return;
    for (const q of queries) if (typeof q === "string" && q.trim()) results.add(q);
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
    for (const url of urls) if (typeof url === "string" && url.startsWith("http")) results.add(url);
  };
  addUrls(payload?.safe_urls);
  // ... rest of your collectUrlsFromResponse logic ...
  return Array.from(results);
};

const { fetch: originalFetch } = window;
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  const url = typeof args[0] === 'string' ? args[0] : args[0].url;

  if (url && url.startsWith(targetPrefix)) {
    const conversationId = extractConversationId(url);
    const clone = response.clone();
    clone.text().then(text => {
      try {
        const parsed = JSON.parse(text);
        const queries = collectQueries(parsed);
        const urls = collectUrlsFromResponse(parsed);

        // FIX: Only send if we actually found data
        if (queries.length > 0 || urls.length > 0) {
          window.postMessage(
            { type: "EXTRACTED_DATA", conversationId, queries, urls },
            "*"
          );
        }
      } catch (e) {
        // Ignore streams or non-JSON
      }
    });
  }
  return response;
};