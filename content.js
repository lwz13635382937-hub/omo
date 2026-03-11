// content.js
// Runs on ChatGPT pages.
// - Detects current conversation
// - Observes DOM updates
// - Stores structured message cache in chrome.storage.local
// - Tries auto-export when leaving / reloading / switching conversation

(() => {
  const CACHE_PREFIX = 'sessionCache_';
  let currentSessionId = getSessionIdFromUrl(location.href);
  let lastSerializedSnapshot = '';
  let saveTimer = null;

  // Detect route changes in SPA navigation (pushState/replaceState/popstate)
  hookHistory(onPotentialRouteChange);
  window.addEventListener('popstate', onPotentialRouteChange);

  // Best-effort auto export when user leaves this page.
  window.addEventListener('beforeunload', () => {
    triggerExport(currentSessionId, 'beforeunload');
  });
  window.addEventListener('pagehide', () => {
    triggerExport(currentSessionId, 'pagehide');
  });

  // Observe chat message area changes.
  const observer = new MutationObserver(() => scheduleSave());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  // First snapshot after initial load.
  scheduleSave();

  function onPotentialRouteChange() {
    const nextSessionId = getSessionIdFromUrl(location.href);
    if (nextSessionId !== currentSessionId) {
      // Conversation changed: export old cache, then move to new session.
      triggerExport(currentSessionId, 'session-switch');
      currentSessionId = nextSessionId;
      lastSerializedSnapshot = '';
      scheduleSave();
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSnapshot, 400);
  }

  async function saveSnapshot() {
    const messages = parseMessagesFromDom();
    if (messages.length === 0) return;

    const snapshot = {
      sessionId: currentSessionId,
      pageUrl: location.href,
      capturedAt: new Date().toISOString(),
      messages
    };

    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSerializedSnapshot) return;

    lastSerializedSnapshot = serialized;
    const key = `${CACHE_PREFIX}${currentSessionId}`;
    await chrome.storage.local.set({
      [key]: {
        ...snapshot,
        updatedAt: new Date().toISOString()
      }
    });
  }

  function parseMessagesFromDom() {
    const items = [];

    // ChatGPT usually marks each message with this attribute.
    const messageNodes = document.querySelectorAll('[data-message-author-role]');

    messageNodes.forEach((node, index) => {
      const role = node.getAttribute('data-message-author-role');
      if (role !== 'user' && role !== 'assistant') return;

      const blocks = extractBlocks(node);
      const fullText = blocks.map((b) => b.text).join('\n\n').trim();
      if (!fullText) return;

      items.push({
        id: `msg_${index}_${Date.now()}`,
        role,
        timestamp: new Date().toISOString(),
        content: fullText,
        // Keep flexible block structure for future extensions.
        blocks
      });
    });

    return items;
  }

  function extractBlocks(root) {
    const blocks = [];

    // 1) Code blocks first (pre > code)
    root.querySelectorAll('pre code').forEach((codeNode) => {
      const text = codeNode.textContent?.trim() || '';
      if (!text) return;
      const lang = codeNode.className?.replace('language-', '') || '';
      blocks.push({
        type: 'code',
        language: lang,
        text
      });
    });

    // 2) Paragraph-ish text (formula/table can degrade into plain text here)
    root.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th').forEach((el) => {
      const text = el.textContent?.trim() || '';
      if (!text) return;
      blocks.push({
        type: 'text',
        text
      });
    });

    // 3) Fallback when selectors above miss content.
    if (blocks.length === 0) {
      const fallbackText = root.textContent?.trim() || '';
      if (fallbackText) {
        blocks.push({
          type: 'text',
          text: fallbackText
        });
      }
    }

    return blocks;
  }

  function getSessionIdFromUrl(urlString) {
    try {
      const url = new URL(urlString);
      const parts = url.pathname.split('/').filter(Boolean);
      // Typical ChatGPT chat URL: /c/<conversation_id>
      const cIndex = parts.indexOf('c');
      if (cIndex >= 0 && parts[cIndex + 1]) {
        return parts[cIndex + 1];
      }
      // Fallback: keep pages like / (new chat) identifiable.
      return `path_${parts.join('_') || 'root'}`;
    } catch {
      return 'unknown_session';
    }
  }

  function triggerExport(sessionId, reason) {
    if (!sessionId) return;
    chrome.runtime.sendMessage({
      type: 'EXPORT_SESSION',
      sessionId,
      reason
    });
  }

  function hookHistory(onChange) {
    const rawPushState = history.pushState;
    const rawReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const ret = rawPushState.apply(this, args);
      onChange();
      return ret;
    };

    history.replaceState = function (...args) {
      const ret = rawReplaceState.apply(this, args);
      onChange();
      return ret;
    };
  }
})();
