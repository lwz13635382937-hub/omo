const CACHE_PREFIX = 'sessionCache_';

const enabledEl = document.getElementById('enabledState');
const sessionEl = document.getElementById('sessionId');
const cacheEl = document.getElementById('cacheState');
const tipsEl = document.getElementById('tips');

const btnRefresh = document.getElementById('btnRefresh');
const btnExport = document.getElementById('btnExport');
const btnClear = document.getElementById('btnClear');

let currentSessionId = null;

btnRefresh.addEventListener('click', refreshStatus);
btnExport.addEventListener('click', manualExport);
btnClear.addEventListener('click', manualClear);

refreshStatus();

async function refreshStatus() {
  enabledEl.textContent = '已启用';

  const tab = await getActiveTab();
  if (!tab?.url || !isChatGptUrl(tab.url)) {
    sessionEl.textContent = '非 ChatGPT 页面';
    cacheEl.textContent = '不可用';
    currentSessionId = null;
    setTips('请先切换到 ChatGPT 标签页。', true);
    return;
  }

  currentSessionId = getSessionIdFromUrl(tab.url);
  sessionEl.textContent = currentSessionId;

  chrome.runtime.sendMessage(
    { type: 'GET_CACHE_STATUS', sessionId: currentSessionId },
    (resp) => {
      if (!resp?.ok) {
        cacheEl.textContent = '读取失败';
        setTips(resp?.error || '读取缓存状态失败。', true);
        return;
      }

      cacheEl.textContent = resp.exists
        ? `已有缓存（${resp.messageCount} 条消息）`
        : '暂无缓存';

      setTips('状态已更新。');
    }
  );
}

function manualExport() {
  if (!currentSessionId) {
    setTips('当前没有可导出的会话。', true);
    return;
  }

  chrome.runtime.sendMessage(
    { type: 'EXPORT_SESSION', sessionId: currentSessionId, reason: 'manual-popup' },
    (resp) => {
      if (!resp?.ok) {
        setTips(`导出失败：${resp?.error || '未知错误'}`, true);
        return;
      }
      setTips(`导出成功：${resp.filename}`);
      refreshStatus();
    }
  );
}

async function manualClear() {
  if (!currentSessionId) {
    setTips('当前没有可清理的会话。', true);
    return;
  }

  const key = `${CACHE_PREFIX}${currentSessionId}`;
  await chrome.storage.local.remove(key);
  setTips('缓存已清理。');
  refreshStatus();
}

function getActiveTab() {
  return chrome.tabs
    .query({ active: true, currentWindow: true })
    .then((tabs) => tabs[0]);
}

function isChatGptUrl(urlString) {
  try {
    const host = new URL(urlString).hostname;
    return host === 'chatgpt.com' || host === 'chat.openai.com';
  } catch {
    return false;
  }
}

function getSessionIdFromUrl(urlString) {
  try {
    const url = new URL(urlString);
    const parts = url.pathname.split('/').filter(Boolean);
    const cIndex = parts.indexOf('c');
    if (cIndex >= 0 && parts[cIndex + 1]) {
      return parts[cIndex + 1];
    }
    return `path_${parts.join('_') || 'root'}`;
  } catch {
    return 'unknown_session';
  }
}

function setTips(text, isError = false) {
  tipsEl.textContent = text;
  tipsEl.classList.toggle('error', isError);
}
