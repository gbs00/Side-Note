const NOTE_PREFIX = "note:";

function getI18nMessage(key, fallback) {
  try {
    if (chrome?.i18n?.getMessage) {
      const message = chrome.i18n.getMessage(key);
      if (message) {
        return message;
      }
    }
  } catch (error) {
    // Ignore and use fallback text.
  }
  return fallback;
}

const EMPTY_TEXT = getI18nMessage("msg_empty_fallback", "未获取到哦，可手动输入");

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

async function initNoteForTab(tabId, tabFromClick) {
  const key = getNoteKey(tabId);
  try {
    const stored = await chrome.storage.session.get(key);
    if (stored[key]) {
      return stored[key];
    }
  } catch (error) {
    console.warn("Failed to read note from session:", error);
  }

  let url = tabFromClick?.url || EMPTY_TEXT;
  let title = tabFromClick?.title || EMPTY_TEXT;
  try {
    if (url === EMPTY_TEXT || title === EMPTY_TEXT) {
      const tab = await chrome.tabs.get(tabId);
      if (url === EMPTY_TEXT && tab?.url) {
        url = tab.url;
      }
      if (title === EMPTY_TEXT && tab?.title) {
        title = tab.title;
      }
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

  try {
    await chrome.storage.session.set({ [key]: note });
  } catch (error) {
    console.warn("Failed to write note to session:", error);
  }
  return note;
}

async function clearNote(tabId) {
  const key = getNoteKey(tabId);
  try {
    await chrome.storage.session.remove(key);
  } catch (error) {
    console.warn("Failed to remove note from session:", error);
  }
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

  initNoteForTab(tabId, tab).catch((error) => {
    console.warn("Failed to init note:", error);
  });

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
});

// 统一清理口径：关闭标签页/关闭窗口 -> tabs.onRemoved -> 清空该 tab 的 note
chrome.tabs.onRemoved.addListener((tabId) => {
  clearNote(tabId).catch((error) => {
    console.warn("Failed to clear note:", error);
  });
});

// Optimization 1: Ensure side panel is not automatically enabled for new tabs
// Optimization 1 Refined: Globally disable side panel by default.
// This ensures it never opens automatically on new tabs unless explicitly triggered.
chrome.runtime.onInstalled.addListener(async () => {
  try {
    chrome.sidePanel.setOptions({ enabled: false });
  } catch (error) {
    // Ignore if side panel is not available.
  }
});

// Also ensure it's disabled on startup
try {
  chrome.sidePanel.setOptions({ enabled: false });
} catch (error) {
  // Ignore if side panel is not available.
}
