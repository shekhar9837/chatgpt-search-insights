window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== "EXTRACTED_DATA") return;
  
    const { conversationId, queries, urls } = event.data;
    if (!conversationId) return;
  
    // FIX: Get existing data first, then merge
    chrome.storage.local.get(["conversationData"], (result) => {
      const conversationData = result.conversationData || {};
      const current = conversationData[conversationId] || { queries: [], urls: [] };
      const updatedQueries = Array.from(
        new Set([...(current.queries || []), ...queries])
      );
      const updatedUrls = Array.from(
        new Set([...(current.urls || []), ...urls])
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
      });
    });
  });