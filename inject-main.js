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
  return response;
};