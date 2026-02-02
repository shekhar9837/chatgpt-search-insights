// ChatGPT Search Insights - UI Templates

const CSI_TEMPLATES = {
  floatingButton: `
    <img src="{{ICON_URL}}" alt="Search Insights" class="csi-btn-icon" />
    Search Insights
  `,

  panel: `
    <div class="csi-panel-header">
      <div class="csi-panel-title">
        <h3>Search Insights</h3>
        <span>for ChatGPT conversations</span>
      </div>
      <button class="csi-close-btn" id="csi-close-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
    <div class="csi-panel-body">
      <button class="csi-fetch-btn" id="csi-fetch-btn">
        <span class="csi-spinner csi-hidden" id="csi-spinner"></span>
        <span id="csi-btn-text">Refresh & Fetch Data</span>
      </button>

      <div class="csi-section">
        <div class="csi-section-header">
          <h4>Queries</h4>
          <span class="csi-count-badge" id="csi-queries-count">0</span>
        </div>
        <table class="csi-table">
          <thead>
            <tr><th>#</th><th>Query</th></tr>
          </thead>
          <tbody id="csi-queries-body">
            <tr><td colspan="2" class="csi-empty">No queries captured yet</td></tr>
          </tbody>
        </table>
      </div>

      <div class="csi-section">
        <div class="csi-section-header">
          <h4>URLs</h4>
          <span class="csi-count-badge" id="csi-urls-count">0</span>
        </div>
        <table class="csi-table">
          <thead>
            <tr><th>#</th><th>URL</th></tr>
          </thead>
          <tbody id="csi-urls-body">
            <tr><td colspan="2" class="csi-empty">No URLs captured yet</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="csi-branding">
      by <a href="https://listablelabs.com" target="_blank">Listable Labs</a>
    </div>
  `
};
