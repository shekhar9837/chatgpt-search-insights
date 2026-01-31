if (!chrome?.devtools?.network?.onRequestFinished) {
  console.warn(
    "DevTools API not available. devtools.js must run in a DevTools page."
  );
} else {
  const port = chrome.runtime.connect({ name: "devtools-network" });
  const tabId = chrome.devtools.inspectedWindow.tabId;
  const targetPrefix = "https://chatgpt.com/backend-api/conversation";

  const queriesBody = document.getElementById("queries-body");
  const urlsBody = document.getElementById("urls-body");
  const queriesCount = document.getElementById("queries-count");
  const urlsCount = document.getElementById("urls-count");

  const querySet = new Set();
  const urlSet = new Set();

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

  const updateQueriesUI = (queries) => {
    let changed = false;
    for (const q of queries) {
      if (!querySet.has(q)) {
        querySet.add(q);
        changed = true;
      }
    }
    if (changed) {
      renderTable(
        Array.from(querySet),
        queriesBody,
        queriesCount,
        "No queries captured yet."
      );
    }
  };

  const updateUrlsUI = (urls) => {
    let changed = false;
    for (const url of urls) {
      if (!urlSet.has(url)) {
        urlSet.add(url);
        changed = true;
      }
    }
    if (changed) {
      renderTable(
        Array.from(urlSet),
        urlsBody,
        urlsCount,
        "No URLs captured yet."
      );
    }
  };

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

  const logAndSendQueries = (queries, url) => {
    if (!queries.length) return;
    console.log("🔎 ChatGPT search_model_queries:", queries);
    port.postMessage({
      type: "search_queries",
      tabId,
      queries,
      url
    });
    updateQueriesUI(queries);
  };

  chrome.devtools.network.onRequestFinished.addListener((request) => {
    const url = request.request.url;
    if (!url.startsWith(targetPrefix)) return;

    let queriesSent = false;
    const postDataText = request.request.postData?.text;
    if (postDataText) {
      try {
        const parsed = JSON.parse(postDataText);
        const queries = collectQueries(parsed);
        if (queries.length) {
          logAndSendQueries(queries, url);
          queriesSent = true;
        }
      } catch (error) {
        // ignore non-JSON request body
      }
    }

    request.getContent((body) => {
      if (!body) return;

      let responseParsed = null;
      try {
        responseParsed = JSON.parse(body);
      } catch (error) {
        return;
      }

      if (!queriesSent) {
        const responseQueries = collectQueries(responseParsed);
        if (responseQueries.length) {
          logAndSendQueries(responseQueries, url);
        }
      }

      const urls = collectUrlsFromResponse(responseParsed);
      if (urls.length) {
        console.log("🔗 ChatGPT search URLs:", urls);
        updateUrlsUI(urls);
        port.postMessage({
          type: "search_urls",
          tabId,
          urls,
          url
        });
      }
    });
  });
}
  