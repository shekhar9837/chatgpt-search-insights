const targetPrefix = "https://chatgpt.com/backend-api/conversation";

// Store captured access token from intercepted requests
let cachedAccessToken = null;

// --- YOUR EXISTING EXTRACTION LOGIC ---
const extractConversationId = (url) => {
  if (!url) return null;
  const match = url.match(/\/backend-api\/conversation\/([a-z0-9-]+)/i);
  return match ? match[1] : null;
};

// Try to get access token from various sources
const getAccessToken = async () => {
  // 1. Use cached token if available
  if (cachedAccessToken) {
    return cachedAccessToken; 
  }

  // 2. Try to get from session API
  try {
    const sessionResponse = await fetch('https://chatgpt.com/api/auth/session', {
      credentials: 'include'
    });
    if (sessionResponse.ok) {
      const sessionData = await sessionResponse.json();
      if (sessionData.accessToken) {
        cachedAccessToken = sessionData.accessToken;
        return cachedAccessToken;
      }
    }
  } catch (e) {
    console.error('[Search Insights] Failed to get session token:', e);
  }

  return null;
};

// Get device ID from cookie
const getDeviceId = () => {
  const match = document.cookie.match(/oai-did=([^;]+)/);
  return match ? match[1] : null;
};

// Listen for Perplexity Refresh (inject-ui asks main world to fetch thread API)
window.addEventListener('message', async (event) => {
  if (event.source !== window || event.data?.type !== 'CSI_PERPLEXITY_REFRESH') return;
  const pathname = window.location.pathname || '';
  const threadMatch = pathname.match(/\/search\/([^/?]+)/);
  const threadId = threadMatch ? threadMatch[1] : null;
  if (!threadId) {
    window.postMessage({ type: 'CSI_PERPLEXITY_REFRESH_DONE', error: 'No thread ID in URL' }, '*');
    return;
  }
  const supportedBlockUseCases = [
    'answer_modes', 'media_items', 'knowledge_cards', 'inline_entity_cards',
    'place_widgets', 'finance_widgets', 'prediction_market_widgets', 'sports_widgets',
    'flight_status_widgets', 'news_widgets', 'shopping_widgets', 'jobs_widgets',
    'search_result_widgets', 'inline_images', 'inline_assets', 'placeholder_cards',
    'diff_blocks', 'inline_knowledge_cards', 'entity_group_v2', 'refinement_filters',
    'canvas_mode', 'maps_preview', 'answer_tabs', 'price_comparison_widgets',
    'preserve_latex', 'generic_onboarding_widgets', 'in_context_suggestions'
  ];
  const blockParams = supportedBlockUseCases.map(c => `supported_block_use_cases=${encodeURIComponent(c)}`).join('&');
  const threadUrl = `https://www.perplexity.ai/rest/thread/${threadId}?with_parent_info=true&with_schematized_response=true&version=2.18&source=default&limit=10&offset=0&from_first=true&${blockParams}`;
  try {
    const response = await fetch(threadUrl, { credentials: 'include' });
    const text = await response.text();
    const parsed = JSON.parse(text);
    const insights = collectPerplexityInsights(parsed);
    window.postMessage({ type: 'EXTRACTED_DATA', source: 'perplexity', threadId, insights }, '*');
  } catch (e) {
    console.error('[Search Insights] Perplexity thread fetch error:', e);
    window.postMessage({ type: 'CSI_PERPLEXITY_REFRESH_DONE', error: String(e.message || e) }, '*');
    return;
  }
  window.postMessage({ type: 'CSI_PERPLEXITY_REFRESH_DONE' }, '*');
});

// Listen for fetch requests from inject-ui.js
window.addEventListener('message', async (event) => {
  if (event.source !== window || event.data?.type !== 'CSI_FETCH_REQUEST') return;
  
  const { conversationId } = event.data;
  if (!conversationId) {
    window.postMessage({ type: 'CSI_FETCH_RESPONSE', error: 'No conversation ID' }, '*');
    return;
  }

  try {
    // Get access token
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error('Could not get access token');
    }

    // Build headers similar to ChatGPT frontend
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'oai-language': 'en-US',
    };

    const deviceId = getDeviceId();
    if (deviceId) {
      headers['oai-device-id'] = deviceId;
    }

    const response = await fetch(`https://chatgpt.com/backend-api/conversation/${conversationId}`, {
      credentials: 'include',
      headers: headers
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const queries = collectQueries(data);
    const urls = collectUrlsFromResponse(data);

    window.postMessage({ 
      type: 'CSI_FETCH_RESPONSE', 
      conversationId,
      queries, 
      urls 
    }, '*');
  } catch (error) {
    console.error('[Search Insights] Fetch error:', error);
    window.postMessage({ type: 'CSI_FETCH_RESPONSE', error: error.message }, '*');
  }
});

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
  
  // Helper to check if URL should be excluded
  const shouldExclude = (url) => {
    return url.includes('openai.com') || url.includes('chatgpt.com');
  };

  // Add URLs - handles both strings and objects with .url property
  const addUrls = (urls) => {
    if (!Array.isArray(urls)) return;
    for (const item of urls) {
      let url = null;
      if (typeof item === 'string') {
        url = item;
      } else if (item && typeof item.url === 'string') {
        url = item.url;
      }
      if (url && url.startsWith('http') && !shouldExclude(url)) {
        results.add(url);
      }
    }
  };

  // Collect from safe_urls
  // addUrls(payload?.safe_urls);
  
  // Check in mapping for content references and search results
  const mapping = payload?.mapping;
  if (mapping && typeof mapping === 'object') {
    for (const node of Object.values(mapping)) {
      const content = node?.message?.content;
      if (content?.content_type === 'tether_browsing_display' && content?.result) {
        addUrls(content.result);
      }
      const metadata = node?.message?.metadata;
      if (metadata?.content_references) {
        addUrls(metadata.content_references);
      }
      if (metadata?.search_result_groups) {
        for (const group of metadata.search_result_groups) {
          if (group?.entries) {
            addUrls(group.entries);
          }
        }
      }
    }
  }

  return Array.from(results);
};

// --- Perplexity extraction (Pro Search + normal search) ---
const PERPLEXITY_URL_MARKER = "perplexity.ai";
const PERPLEXITY_THREAD_API = "/rest/thread/";

const getEntriesFromPayload = (payload) => {
  return payload?.entries ?? payload?.thread?.entries ?? payload?.data?.entries;
};

function collectUrlsFromObject(obj, out, depth) {
  if (!obj || typeof obj !== "object" || (depth && depth > 8)) return;
  const d = (depth || 0) + 1;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const u = item?.url ?? item;
      if (typeof u === "string" && u.startsWith("http") && !u.includes("perplexity.ai")) out.add(u);
      else collectUrlsFromObject(item, out, d);
    }
    return;
  }
  if (typeof obj.url === "string" && obj.url.startsWith("http") && !obj.url.includes("perplexity.ai")) out.add(obj.url);
  if (obj.web_results && Array.isArray(obj.web_results)) {
    for (const r of obj.web_results) {
      const u = r?.url;
      if (typeof u === "string" && u.startsWith("http")) out.add(u);
    }
  }
  for (const key of ["citations", "references", "sources", "content", "steps", "blocks"]) {
    if (obj[key]) collectUrlsFromObject(obj[key], out, d);
  }
}

const collectPerplexityInsights = (payload) => {
  const rewrittenQueries = [];
  const sourceUrls = new Set();
  const relatedQueriesSet = new Set();
  const grouped = [];
  const entries = getEntriesFromPayload(payload);

  if (Array.isArray(entries)) {
    for (const entry of entries) {
      const related = entry?.related_queries;
      if (Array.isArray(related)) {
        for (const q of related) {
          if (typeof q === "string" && q.trim()) relatedQueriesSet.add(q);
        }
      }

      const blocks = entry?.blocks;
      if (!Array.isArray(blocks)) continue;

      for (const block of blocks) {
        if (block?.intended_usage === "pro_search_steps") {
          const steps = block?.plan_block?.steps;
          if (!Array.isArray(steps)) continue;
          const stepQueries = [];
          let stepUrls = [];
          for (const step of steps) {
            if (step?.step_type === "SEARCH_WEB") {
              const queries = step?.search_web_content?.queries;
              if (Array.isArray(queries)) {
                for (const q of queries) {
                  const queryStr = typeof q === "string" ? q : q?.query;
                  if (typeof queryStr === "string" && queryStr.trim()) {
                    stepQueries.push(queryStr);
                    rewrittenQueries.push(queryStr);
                  }
                }
              }
            } else if (step?.step_type === "SEARCH_RESULTS") {
              const webResults = step?.web_results_content?.web_results;
              stepUrls = [];
              if (Array.isArray(webResults)) {
                for (const r of webResults) {
                  const url = r?.url;
                  if (typeof url === "string" && url.startsWith("http")) {
                    stepUrls.push(url);
                    sourceUrls.add(url);
                  }
                }
              }
              for (const q of stepQueries) {
                grouped.push({ query: q, urls: [...stepUrls] });
              }
              stepQueries.length = 0;
            }
          }
          for (const q of stepQueries) {
            grouped.push({ query: q, urls: [] });
          }
        } else {
          collectUrlsFromObject(block, sourceUrls);
        }
      }
    }
  }

  collectUrlsFromObject(payload, sourceUrls);

  return {
    source: "perplexity",
    rewrittenQueries: [...new Set(rewrittenQueries)],
    sourceUrls: Array.from(sourceUrls),
    relatedQueries: Array.from(relatedQueriesSet),
    grouped
  };
};

const isPerplexitySearchPayload = (obj) => {
  if (!obj || typeof obj !== "object") return false;
  if (Array.isArray(getEntriesFromPayload(obj))) return true;
  const str = JSON.stringify(obj);
  return str.includes("search_web_content") || str.includes("web_results");
};

const { fetch: originalFetch } = window;
window.fetch = async (...args) => {
  // Try to capture access token from request headers
  const request = args[0];
  const options = args[1] || {};
  if (options.headers) {
    const authHeader = options.headers['Authorization'] || options.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      cachedAccessToken = authHeader.substring(7);
    }
  }
  // Also check if Request object has headers
  if (request instanceof Request) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      cachedAccessToken = authHeader.substring(7);
    }
  }

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

  if (url && url.includes(PERPLEXITY_URL_MARKER) && url.includes(PERPLEXITY_THREAD_API)) {
    const threadMatch = url.match(/\/rest\/thread\/([^/?]+)/);
    const threadId = threadMatch ? threadMatch[1] : null;
    const clone = response.clone();
    clone.text().then(text => {
      try {
        const parsed = JSON.parse(text);
        if (!isPerplexitySearchPayload(parsed)) return;
        const insights = collectPerplexityInsights(parsed);
        if (threadId) {
          window.postMessage(
            { type: "EXTRACTED_DATA", source: "perplexity", threadId, insights },
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

// Perplexity WebSocket interceptor (streaming)
const OriginalWebSocket = window.WebSocket;
window.WebSocket = function (...args) {
  const ws = new OriginalWebSocket(...args);
  const wsUrl = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url);
  if (wsUrl && wsUrl.includes(PERPLEXITY_URL_MARKER)) {
    ws.addEventListener("message", (event) => {
      try {
        const data = event.data;
        if (typeof data !== "string") return;
        const parsed = JSON.parse(data);
        if (!isPerplexitySearchPayload(parsed)) return;
        const insights = collectPerplexityInsights(parsed);
        if (insights.rewrittenQueries.length > 0 || insights.sourceUrls.length > 0 || insights.relatedQueries.length > 0 || insights.grouped.length > 0) {
          window.postMessage(
            { type: "EXTRACTED_DATA", source: "perplexity", insights },
            "*"
          );
        }
      } catch (e) {
        // Not JSON or no Perplexity structure
      }
    });
  }
  return ws;
};
window.WebSocket.prototype = OriginalWebSocket.prototype;