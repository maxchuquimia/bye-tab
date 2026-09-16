const api = globalThis.browser ?? chrome;

const keptKey = (tabId) => `kept:${tabId}`;

async function isKept(tabId) {
  const key = keptKey(tabId);
  const kept = await api.storage.session.get(key);
  return Boolean(kept[key]);
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (tabId == null) return;

  if (message.type === 'kept') {
    isKept(tabId).then(sendResponse);
    return true;
  }

  if (message.type === 'keep') {
    api.storage.session.set({ [keptKey(tabId)]: true });
  }

  if (message.type === 'close') {
    api.tabs.remove(tabId);
  }
});

api.tabs.onRemoved.addListener((tabId) => api.storage.session.remove(keptKey(tabId)));

api.action.onClicked.addListener(() => api.runtime.openOptionsPage());

// Single page apps change the URL without reloading, so ask the page to check again.
api.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;
  const settings = await api.storage.sync.get(DEFAULTS);
  if (!settings.enabled || settings.patterns.length === 0) return;
  api.tabs.sendMessage(tabId, { type: 'recheck' }).catch(() => {});
});
