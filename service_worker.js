// service_worker.js
// Background logic: receives requests from content/popup, exports JSON via downloads API,
// and clears cache only after successful export.

const CACHE_PREFIX = 'sessionCache_';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'EXPORT_SESSION') {
      const result = await exportSession(message.sessionId, message.reason || 'manual');
      sendResponse(result);
      return;
    }

    if (message?.type === 'GET_CACHE_STATUS') {
      const key = `${CACHE_PREFIX}${message.sessionId}`;
      const data = await chrome.storage.local.get(key);
      const cache = data[key];
      sendResponse({
        ok: true,
        exists: Boolean(cache),
        messageCount: cache?.messages?.length || 0,
        updatedAt: cache?.updatedAt || null
      });
      return;
    }

    sendResponse({ ok: false, error: 'Unknown message type.' });
  })().catch((error) => {
    sendResponse({ ok: false, error: String(error) });
  });

  // Keep message channel open for async response.
  return true;
});

async function exportSession(sessionId, reason) {
  if (!sessionId) {
    return { ok: false, error: 'Missing sessionId.' };
  }

  const key = `${CACHE_PREFIX}${sessionId}`;
  const data = await chrome.storage.local.get(key);
  const cache = data[key];

  if (!cache) {
    return { ok: false, error: 'No cache found for this session.' };
  }

  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    exportReason: reason,
    ...cache
  };

  const prettyJson = JSON.stringify(payload, null, 2);
  const filename = buildFilename(sessionId);

  try {
    await chrome.downloads.download({
      url: `data:application/json;charset=utf-8,${encodeURIComponent(prettyJson)}`,
      filename,
      saveAs: false,
      conflictAction: 'uniquify'
    });

    // Only clear cache after export succeeds.
    await chrome.storage.local.remove(key);
    return { ok: true, filename };
  } catch (error) {
    // Keep cache if export fails.
    return { ok: false, error: `Export failed: ${String(error)}` };
  }
}

function buildFilename(sessionId) {
  const safeSessionId = String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join('') + '_' + [pad(now.getHours()), pad(now.getMinutes()), pad(now.getSeconds())].join('');

  return `ChatGPT-Backups/${stamp}_${safeSessionId}.json`;
}
