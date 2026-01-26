const NOTE_PREFIX = "note:";

function getNoteKey(tabId) {
  return `${NOTE_PREFIX}${tabId}`;
}

function formatDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

async function initNoteForTab(tabId) {
  const key = getNoteKey(tabId);
  const stored = await chrome.storage.session.get(key);
  if (stored[key]) {
    return stored[key];
  }

  let url = "未获取到哦";
  let title = "未获取到哦";
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab?.url) {
      url = tab.url;
    }
    if (tab?.title) {
      title = tab.title;
    }
  } catch (error) {
    // Ignore and use fallback text.
  }

  const now = formatDateTime(new Date());
  const note = {
    tabId,
    url,
    title,
    createdAt: now,
    contentMd: "",
    updatedAt: now
  };

  await chrome.storage.session.set({ [key]: note });
  return note;
}

async function clearNote(tabId) {
  const key = getNoteKey(tabId);
  await chrome.storage.session.remove(key);
  try {
    await chrome.sidePanel.setOptions({ tabId, enabled: false });
  } catch (error) {
    // Ignore if side panel is not available.
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (!tab?.id) {
    return;
  }

  const tabId = tab.id;
  if (!chrome.sidePanel) {
    console.warn("Side panel API is unavailable in this Chrome version.");
    return;
  }

  chrome.sidePanel
    .setOptions({
      tabId,
      enabled: true,
      path: `sidepanel.html?tabId=${tabId}`
    })
    .catch((error) => {
      console.warn("Failed to set side panel options:", error);
    });

  chrome.sidePanel.open({ tabId }).catch((error) => {
    console.warn("Failed to open side panel:", error);
  });

  initNoteForTab(tabId).catch((error) => {
    console.warn("Failed to init note:", error);
  });
});

// Track active notes by tabId for cleanup
const activeNotes = new Set();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "sidepanel") {
    return;
  }

  port.onMessage.addListener((message) => {
    if (message?.type === "PANEL_OPEN" && Number.isInteger(message.tabId)) {
      activeNotes.add(message.tabId);
    }
  });

  // Note: We intentionally do NOT clear note on disconnect.
  // Notes persist until: tab closed, page navigated, or user clicks X.
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "CLEAR_NOTE" && Number.isInteger(message.tabId)) {
    activeNotes.delete(message.tabId);
    clearNote(message.tabId);
  }
});

// Clear note when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeNotes.has(tabId)) {
    activeNotes.delete(tabId);
    clearNote(tabId);
  }
});

// Clear note when page is navigated or refreshed
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Only trigger on actual navigation (not title changes, favicon, etc.)
  if (changeInfo.status === "loading" && changeInfo.url !== undefined) {
    if (activeNotes.has(tabId)) {
      activeNotes.delete(tabId);
      clearNote(tabId);
    }
  }
});

// Optimization 1: Ensure side panel is not automatically enabled for new tabs
// Optimization 1 Refined: Globally disable side panel by default.
// This ensures it never opens automatically on new tabs unless explicitly triggered.
chrome.runtime.onInstalled.addListener(async () => {
  chrome.sidePanel.setOptions({ enabled: false });
  // 清理 stale 的 activeNotes 条目，与 storage.session 保持同步
  await syncActiveNotesWithStorage();
});

// Also ensure it's disabled on startup
chrome.sidePanel.setOptions({ enabled: false });

// Service Worker 激活时同步 activeNotes 状态
syncActiveNotesWithStorage();

/**
 * 确保 activeNotes Set 与 storage.session 保持同步
 * 清理 storage 中不存在的 tabId，防止内存泄漏
 */
async function syncActiveNotesWithStorage() {
  try {
    const allData = await chrome.storage.session.get(null);
    const storageTabIds = new Set();

    for (const key of Object.keys(allData)) {
      if (key.startsWith(NOTE_PREFIX)) {
        const tabId = parseInt(key.slice(NOTE_PREFIX.length), 10);
        if (Number.isInteger(tabId)) {
          storageTabIds.add(tabId);
        }
      }
    }

    // 清理 activeNotes 中不在 storage 的条目
    for (const tabId of activeNotes) {
      if (!storageTabIds.has(tabId)) {
        activeNotes.delete(tabId);
      }
    }

    // 将 storage 中存在的 tabId 加入 activeNotes
    for (const tabId of storageTabIds) {
      activeNotes.add(tabId);
    }
  } catch (error) {
    // 同步失败时不影响主流程
  }
}
