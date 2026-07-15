const NOTE_PREFIX = "note:";
const noteOperationChains = new Map();

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

function runAsyncOperation(operation, errorMessage) {
  try {
    // 调用必须保持同步发生，以便 sidePanel.open 仍处于用户点击手势中。
    const result = operation();
    if (result && typeof result.catch === "function") {
      void result.catch((error) => {
        console.warn(errorMessage, error);
      });
    }
  } catch (error) {
    console.warn(errorMessage, error);
  }
}

function enqueueNoteOperation(tabId, operation) {
  const previous = noteOperationChains.get(tabId) || Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  noteOperationChains.set(tabId, current);
  void current.then(
    () => {
      if (noteOperationChains.get(tabId) === current) {
        noteOperationChains.delete(tabId);
      }
    },
    () => {
      if (noteOperationChains.get(tabId) === current) {
        noteOperationChains.delete(tabId);
      }
    }
  );
  return current;
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
  let note;

  // tabs.get 期间面板可能已经产生本地编辑。写入前再读一次，
  // 只补全占位元信息，避免用空正文覆盖用户刚刚输入的内容。
  try {
    const latestStored = await chrome.storage.session.get(key);
    const latestNote = latestStored[key];
    if (latestNote) {
      note = {
        ...latestNote,
        tabId,
        url: !latestNote.url || latestNote.url === EMPTY_TEXT ? url : latestNote.url,
        title: !latestNote.title || latestNote.title === EMPTY_TEXT ? title : latestNote.title,
        createdAt: latestNote.createdAt || now,
        updatedAt: latestNote.updatedAt || now
      };
    }
  } catch (error) {
    console.warn("Failed to re-read note from session:", error);
  }

  if (!note) {
    note = {
      tabId,
      url,
      title,
      createdAt: now,
      contentMd: "",
      updatedAt: now
    };
  }

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
  if (typeof chrome.sidePanel?.setOptions === "function") {
    try {
      await chrome.sidePanel.setOptions({ tabId, enabled: false });
    } catch (error) {
      // 标签页已关闭时禁用面板可能失败，不影响会话笔记已清理。
    }
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (!Number.isInteger(tab?.id)) {
    return;
  }

  const tabId = tab.id;
  if (
    typeof chrome.sidePanel?.setOptions !== "function" ||
    typeof chrome.sidePanel?.open !== "function"
  ) {
    console.warn("Side panel open API is unavailable; Chrome 116 or newer is required.");
    return;
  }

  runAsyncOperation(
    () => enqueueNoteOperation(tabId, () => initNoteForTab(tabId, tab)),
    "Failed to init note:"
  );

  runAsyncOperation(
    () => chrome.sidePanel.setOptions({
      tabId,
      enabled: true,
      path: `sidepanel.html?tabId=${tabId}`
    }),
    "Failed to set side panel options:"
  );

  runAsyncOperation(
    () => chrome.sidePanel.open({ tabId }),
    "Failed to open side panel:"
  );
});

// 统一清理口径：关闭标签页/关闭窗口 -> tabs.onRemoved -> 清空该 tab 的 note
chrome.tabs.onRemoved.addListener((tabId) => {
  // 与该 tab 未完成的初始化串行：即使用户点击图标后立即关 tab，最后一步也必然是清理。
  runAsyncOperation(
    () => enqueueNoteOperation(tabId, () => clearNote(tabId)),
    "Failed to clear note:"
  );
});

function disableSidePanelByDefault(errorMessage) {
  if (typeof chrome.sidePanel?.setOptions !== "function") {
    return;
  }
  runAsyncOperation(
    () => chrome.sidePanel.setOptions({ enabled: false }),
    errorMessage
  );
}

// 全局默认禁用，只在用户主动点击扩展图标后为当前标签页开启。
chrome.runtime.onInstalled.addListener(() => {
  disableSidePanelByDefault("Failed to disable side panel after installation:");
});

disableSidePanelByDefault("Failed to disable side panel on startup:");
