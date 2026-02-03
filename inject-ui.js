// ChatGPT Analyse Search - Floating UI Button
// Injects a floating button and panel into the ChatGPT UI

(function() {
  'use strict';

  function initSearchInsights() {
    // Prevent multiple injections
    if (document.getElementById('csi-floating-btn')) {
      console.log('[Search Insights] Button already exists');
      return;
    }

    // Make sure body exists
    if (!document.body) {
      console.log('[Search Insights] Body not ready, retrying...');
      setTimeout(initSearchInsights, 100);
      return;
    }

    console.log('[Search Insights] Injecting floating button...');

    // CSS is loaded via manifest.json (inject-ui.css)
    // HTML templates are loaded via inject-ui-template.js (CSI_TEMPLATES)

    // Create floating button
    const floatingBtn = document.createElement('button');
    floatingBtn.id = 'csi-floating-btn';
    const iconUrl = chrome.runtime.getURL('icon.png');
    floatingBtn.innerHTML = CSI_TEMPLATES.floatingButton.replace('{{ICON_URL}}', iconUrl);
    document.body.appendChild(floatingBtn);
    console.log('[Search Insights] Floating button injected:', floatingBtn);

    // Create panel
    const panel = document.createElement('div');
    panel.id = 'csi-panel';
    panel.innerHTML = CSI_TEMPLATES.panel;
    document.body.appendChild(panel);
    console.log('[Search Insights] Panel injected, setup complete');

    // Get UI elements
    const closeBtn = document.getElementById('csi-close-btn');
    const fetchBtn = document.getElementById('csi-fetch-btn');
    const spinner = document.getElementById('csi-spinner');
    const btnText = document.getElementById('csi-btn-text');
    const btnArrow = document.getElementById('csi-btn-arrow');
    const queriesBody = document.getElementById('csi-queries-body');
    const urlsBody = document.getElementById('csi-urls-body');
    const queriesCount = document.getElementById('csi-queries-count');
    const urlsCount = document.getElementById('csi-urls-count');

    const isPerplexity = window.location.href.includes('perplexity.ai');

    // Toggle panel
    floatingBtn.addEventListener('click', () => {
      panel.classList.toggle('csi-open');
      floatingBtn.classList.toggle('csi-active');
      if (panel.classList.contains('csi-open')) {
        updateUI();
      }
    });

    // Close panel
    closeBtn.addEventListener('click', () => {
      panel.classList.remove('csi-open');
      floatingBtn.classList.remove('csi-active');
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target) && e.target !== floatingBtn && !floatingBtn.contains(e.target)) {
        panel.classList.remove('csi-open');
        floatingBtn.classList.remove('csi-active');
      }
    });

    const DEFAULT_BTN_LABEL = 'Fetch Queries';
    const SUCCESS_BTN_LABEL = 'Rank your brand #1 in LLM search';

    // Loading state
    const setLoading = (isLoading) => {
      fetchBtn.disabled = isLoading;
      spinner.classList.toggle('csi-hidden', !isLoading);
      btnText.textContent = isLoading ? 'Fetching...' : DEFAULT_BTN_LABEL;
      if (btnArrow) btnArrow.classList.add('csi-hidden');
    };

    const setIdleLabel = (hasData) => {
      const showSuccess = Boolean(hasData);
      btnText.textContent = showSuccess ? SUCCESS_BTN_LABEL : DEFAULT_BTN_LABEL;
      if (btnArrow) {
        btnArrow.classList.toggle('csi-hidden', !showSuccess);
      }
    };

    // Render table helper
    const renderTable = (items, tbody, countEl, emptyText) => {
      countEl.textContent = String(items.length);
      tbody.innerHTML = '';
      if (!items.length) {
        tbody.innerHTML = `<tr><td colspan="2" class="csi-empty">${emptyText}</td></tr>`;
        return;
      }
      items.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${index + 1}</td><td>${escapeHtml(item)}</td>`;
        tbody.appendChild(row);
      });
    };

    // Escape HTML to prevent XSS
    const escapeHtml = (str) => {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    };

    // Extract conversation ID from URL
    // Supports: /c/{id}, /chat/{id}, /g/{gizmo}/c/{id}
    const extractConversationIdFromUrl = (url) => {
      if (!url) return null;
      // Try different URL patterns
      const patterns = [
        /\/c\/([a-f0-9-]{36})/i,           // /c/{uuid}
        /\/chat\/([a-f0-9-]{36})/i,        // /chat/{uuid}  
        /\/g\/[^/]+\/c\/([a-f0-9-]{36})/i  // /g/{gizmo}/c/{uuid}
      ];
      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
      }
      return null;
    };

    // Update UI from storage (same Queries/URLs tables for both ChatGPT and Perplexity)
    const updateUI = () => {
      if (isPerplexity) {
        const pathname = window.location.pathname || '';
        const threadMatch = pathname.match(/\/search\/([^/?]+)/);
        const currentThreadId = threadMatch ? threadMatch[1] : null;
        chrome.storage.local.get(['latestInsights'], (data) => {
          const perplexityByThread = data.latestInsights?.perplexity || {};
          const insights = currentThreadId ? perplexityByThread[currentThreadId] : null;
          const queries = Array.from(new Set([
            ...(insights?.rewrittenQueries || []),
            ...(insights?.relatedQueries || [])
          ]));
          const urls = insights?.sourceUrls || [];
          renderTable(queries, queriesBody, queriesCount, 'No queries captured yet');
          renderTable(urls, urlsBody, urlsCount, 'No URLs captured yet');
          setIdleLabel(queries.length > 0 || urls.length > 0);
        });
        return;
      }

      const conversationId = extractConversationIdFromUrl(window.location.href);
      chrome.storage.local.get(['conversationData', 'lastSeenConversationId'], (data) => {
        const conversationData = data.conversationData || {};
        const hasConversation = Boolean(conversationId);
        const isSwitch = hasConversation && data.lastSeenConversationId !== conversationId;
        const entry = hasConversation ? conversationData[conversationId] : null;
        const latestQueries = isSwitch ? [] : entry?.queries || [];
        const latestUrls = isSwitch ? [] : entry?.urls || [];

        renderTable(latestQueries, queriesBody, queriesCount, 'No queries captured yet');
        renderTable(latestUrls, urlsBody, urlsCount, 'No URLs captured yet');
        setIdleLabel(latestQueries.length > 0 || latestUrls.length > 0);

        if (isSwitch) {
          chrome.storage.local.set({
            conversationData: {
              ...conversationData,
              [conversationId]: { queries: [], urls: [] }
            },
            lastSeenConversationId: conversationId
          });
        }
      });
    };

    // Listen for fetch response from inject-main.js (which runs in main world with session access)
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.data?.type !== 'CSI_FETCH_RESPONSE') return;

      const { conversationId, queries, urls, error } = event.data;

      // If API failed, show error
      if (error) {
        console.error('[Search Insights] Fetch error:', error);
        setLoading(false);
        btnText.textContent = 'Error! Try again';
        fetchBtn.style.background = '#dc3545';
        if (btnArrow) btnArrow.classList.add('csi-hidden');
        setTimeout(() => {
          btnText.textContent = DEFAULT_BTN_LABEL;
          fetchBtn.style.background = '';
        }, 2500);
        chrome.runtime.sendMessage({ type: 'REFRESH_DONE' }).catch(function() {});
        return;
      }

      // Get existing data and merge
      chrome.storage.local.get(['conversationData'], (result) => {
        const conversationData = result.conversationData || {};
        const current = conversationData[conversationId] || { queries: [], urls: [] };
        
        const updatedQueries = Array.from(new Set([...current.queries, ...(queries || [])]));
        const updatedUrls = Array.from(new Set([...current.urls, ...(urls || [])]));

        chrome.storage.local.set({
          conversationData: {
            ...conversationData,
            [conversationId]: {
              queries: updatedQueries,
              urls: updatedUrls
            }
          },
          lastSeenConversationId: conversationId
        }, () => {
          setLoading(false);
          setIdleLabel(updatedQueries.length > 0 || updatedUrls.length > 0);
          updateUI();
          chrome.runtime.sendMessage({ type: 'REFRESH_DONE' }).catch(function() {});
        });
      });
    });

    // Listen for Perplexity refresh done (main world fetches thread API and signals done)
    window.addEventListener('message', (event) => {
      if (event.source !== window || event.data?.type !== 'CSI_PERPLEXITY_REFRESH_DONE') return;
      setLoading(false);
      updateUI();
      if (event.data?.error) {
        btnText.textContent = 'Refresh failed';
        if (btnArrow) btnArrow.classList.add('csi-hidden');
        setTimeout(() => { btnText.textContent = DEFAULT_BTN_LABEL; }, 2000);
      }
    });

    // Once the button shows the success label, clicking it redirects to Listable Labs.
    fetchBtn.addEventListener('click', () => {
      if (btnText.textContent === SUCCESS_BTN_LABEL) {
        window.open('https://listablelabs.com', '_blank');
        return;
      }

      if (isPerplexity) {
        setLoading(true);
        window.postMessage({ type: 'CSI_PERPLEXITY_REFRESH' }, '*');
        return;
      }

      const conversationId = extractConversationIdFromUrl(window.location.href);
      if (!conversationId) {
        btnText.textContent = 'No conversation found';
        if (btnArrow) btnArrow.classList.add('csi-hidden');
        setTimeout(() => {
          btnText.textContent = DEFAULT_BTN_LABEL;
        }, 2000);
        return;
      }

      setLoading(true);
      window.postMessage({ type: 'CSI_FETCH_REQUEST', conversationId }, '*');
    });

    // Listen for storage changes
    chrome.storage.onChanged.addListener(() => {
      if (panel.classList.contains('csi-open')) {
        updateUI();
      }
    });

    // Also update when URL changes (SPA navigation)
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        if (panel.classList.contains('csi-open')) {
          updateUI();
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Start initialization
  console.log('[Search Insights] Script loaded, readyState:', document.readyState);
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearchInsights);
  } else {
    initSearchInsights();
  }

  // Also try again after a delay in case ChatGPT loads dynamically
  setTimeout(initSearchInsights, 1000);
  setTimeout(initSearchInsights, 3000);
  setTimeout(initSearchInsights, 5000);

})();
