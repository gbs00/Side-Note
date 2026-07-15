/**
 * SideNote 编辑器模块
 *
 * 架构概述：
 * - 使用 CodeMirror 6 作为底层编辑器
 * - 通过多个 ViewPlugin 实现 Markdown 实时渲染：
 *   1. markdownMarkPlugin - 隐藏/折叠 Markdown 标记符号
 *   2. markdownStylePlugin - 为内容节点应用样式类
 *   3. headingLinePlugin - 为标题行应用行级样式
 *   4. blockquoteLinePlugin - 为引用块行应用竖线样式
 * - 光标所在行显示原始 Markdown 语法，便于编辑
 */

import { EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  rectangularSelection
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput, syntaxTree } from "@codemirror/language";
import { markdown, markdownKeymap } from "@codemirror/lang-markdown";

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

// ============================================================================
// 常量定义
// ============================================================================

const I18N_TEXT = {
  appName: getI18nMessage("app_name", "Side Note"),
  themeToggle: getI18nMessage("ui_theme_toggle", "切换主题"),
  copy: getI18nMessage("ui_copy", "复制"),
  copyAllContent: getI18nMessage("ui_copy_all_content", "复制全部内容"),
  close: getI18nMessage("ui_close", "关闭"),
  closePanel: getI18nMessage("ui_close_panel", "关闭面板"),
  metaUrl: getI18nMessage("ui_meta_url", "网页链接"),
  metaTitle: getI18nMessage("ui_meta_title", "网页标题"),
  metaCreated: getI18nMessage("ui_meta_created", "创建时间"),
  editorContent: getI18nMessage("ui_editor_content", "笔记内容"),
  emptyTitle: getI18nMessage("ui_empty_title", "还没有内容"),
  emptyDesc: getI18nMessage("ui_empty_desc", "在右侧开始记录你的灵感"),
  emptyFallback: getI18nMessage("msg_empty_fallback", "未获取到哦，可手动输入"),
  copySuccess: getI18nMessage("toast_copy_success", "复制完成啦"),
  copyError: getI18nMessage("toast_copy_error", "复制失败咯，请重试"),
  saveError: getI18nMessage("toast_save_error", "保存失败，请重试后再关闭")
};

const NOTE_PREFIX = "note:";
const EMPTY_TEXT = I18N_TEXT.emptyFallback;


const elements = {
  appName: document.getElementById("appName"),
  themeToggle: document.getElementById("themeToggle"),
  copyBtn: document.getElementById("copyBtn"),
  closeBtn: document.getElementById("closeBtn"),
  metaUrl: document.getElementById("metaUrl"),
  metaTitle: document.getElementById("metaTitle"),
  metaCreated: document.getElementById("metaCreated"),
  emptyState: document.getElementById("emptyState"),
  emptyTitle: document.getElementById("emptyTitle"),
  emptyDesc: document.getElementById("emptyDesc"),
  toast: document.getElementById("toast"),
  sunIcon: document.querySelector(".sun-icon"),
  moonIcon: document.querySelector(".moon-icon"),
  editorRoot: document.getElementById("editor")
};

const state = {
  tabId: null,
  note: null,
  themePreference: "auto",
  localRevision: 0,
  persistedRevision: 0
};

let editorView = null;
let toastTimer = null;
let isApplyingExternalNote = false;
let storageListenerBound = false;

const editorSetup = [
  EditorView.theme({
    ".cm-selectionBackground": {
      backgroundColor: "var(--selection-bg) !important"
    },
    ".cm-content ::selection": {
      backgroundColor: "var(--selection-bg) !important"
    }
  }),
  highlightSpecialChars(),
  history(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  bracketMatching(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  keymap.of([indentWithTab, ...markdownKeymap, ...defaultKeymap, ...historyKeymap])
];

const NODE_MARK_CLASSES = new Map([
  ["Emphasis", "cm-em"],
  ["StrongEmphasis", "cm-strong"],
  ["InlineCode", "cm-code"],
  ["CodeText", "cm-code"],
  ["Link", "cm-link"],
  ["URL", "cm-link"],
  ["Autolink", "cm-link"],
  ["Blockquote", "cm-quote"],
  ["BlockQuote", "cm-quote"]
]);

const HEADING_LINE_CLASSES = new Map([
  ["ATXHeading1", "cm-h1"],
  ["SetextHeading1", "cm-h1"],
  ["ATXHeading2", "cm-h2"],
  ["SetextHeading2", "cm-h2"],
  ["ATXHeading3", "cm-h3"],
  ["ATXHeading4", "cm-h4"],
  ["ATXHeading5", "cm-h5"],
  ["ATXHeading6", "cm-h6"]
]);

const MARK_NODE_NAMES = new Set([
  "HeaderMark",
  "QuoteMark",
  "ListMark",
  "LinkMark",
  "EmphasisMark",
  "CodeMark"
]);

const INLINE_MARK_NAMES = new Set([
  "EmphasisMark",
  "StrongEmphasisMark",
  "LinkMark",
  "CodeMark"
]);

/**
 * 需要完全折叠（宽度为0）的行内标记
 * 
 * 这些标记在渲染时应完全移除，不保留占位空间：
 * - EmphasisMark: 斜体标记 (*text* 或 _text_)
 * - StrongEmphasisMark: 加粗标记 (**text** 或 __text__)
 * - CodeMark: 行内代码标记 (`code`)
 * 
 * LinkMark 不在此列，因为链接使用透明隐藏（保留占位）可避免布局跳动
 */
const INLINE_COLLAPSE_MARK_NAMES = new Set([
  "EmphasisMark",
  "StrongEmphasisMark",
  "CodeMark"
]);

class ListMarkerWidget extends WidgetType {
  constructor(text, width) {
    super();
    this.text = text;
    this.width = width;
  }

  eq(other) {
    return other.text === this.text && other.width === this.width;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-list-marker";
    span.textContent = `${this.text}\u00A0`;
    span.style.width = `${this.width}ch`;
    return span;
  }

  ignoreEvent() {
    return true;
  }
}

/**
 * 将数字转换为小写字母（1->a, 2->b, ..., 26->z, 27->aa, ...）
 * 用于有序列表二级嵌套
 * @param {number} num - 数字
 * @returns {string} 字母表示
 */
function numberToLetter(num) {
  let result = "";
  while (num > 0) {
    num -= 1;
    result = String.fromCharCode(97 + (num % 26)) + result;
    num = Math.floor(num / 26);
  }
  return result || "a";
}

/**
 * 将数字转换为小写罗马数字
 * 用于有序列表三级嵌套
 * @param {number} num - 数字
 * @returns {string} 罗马数字表示
 */
function numberToRoman(num) {
  const romanNumerals = [
    { value: 10, numeral: "x" },
    { value: 9, numeral: "ix" },
    { value: 5, numeral: "v" },
    { value: 4, numeral: "iv" },
    { value: 1, numeral: "i" }
  ];
  let result = "";
  for (const { value, numeral } of romanNumerals) {
    while (num >= value) {
      result += numeral;
      num -= value;
    }
  }
  return result || "i";
}

/**
 * 计算列表嵌套深度
 * 
 * 通过检测行首缩进来判断嵌套层级：
 * - 每 2 个空格或 1 个 tab 为一级嵌套
 * 
 * @param {EditorState} state - 编辑器状态
 * @param {SyntaxNode} node - ListMark 节点
 * @returns {number} 嵌套深度（0=顶级, 1=二级, 2=三级...）
 */
function getListNestingLevel(state, node) {
  const line = state.doc.lineAt(node.from);
  const lineText = line.text;

  // 计算行首缩进字符数
  let indent = 0;
  for (const char of lineText) {
    if (char === " ") {
      indent += 1;
    } else if (char === "\t") {
      indent += 2; // tab 视为 2 空格
    } else {
      break;
    }
  }

  // 每 2 个空格为一级嵌套
  return Math.floor(indent / 2);
}

/**
 * 标准化列表标记显示文本（Obsidian 风格）
 * 
 * 有序列表：根据在该嵌套级别内的位置编号（忽略原始 Markdown 数字）
 * - 一级：数字（1. 2. 3.）
 * - 二级：字母（a. b. c.）
 * - 三级及以上：罗马数字（i. ii. iii.）
 * 
 * 无序列表：
 * - 所有层级：圆点（•）
 * 
 * @param {string} raw - 原始标记文本（用于判断有序/无序）
 * @param {number} nestingLevel - 嵌套深度（0=顶级）
 * @param {number} position - 在该嵌套级别内的位置（从1开始）
 * @returns {string} 渲染后的标记文本
 */
function normalizeListMarker(raw, nestingLevel = 0, position = 1) {
  const trimmed = raw.trim();
  // 检查是否为有序列表（数字开头）
  const isOrdered = /^\d+[.)]?$/.test(trimmed);

  if (isOrdered) {
    // 使用 position（实际位置）而非原始数字
    if (nestingLevel === 0) {
      // 顶级：数字 (1. 2. 3.)
      return `${position}.`;
    } else if (nestingLevel === 1) {
      // 二级：字母 (a. b. c.)
      return `${numberToLetter(position)}.`;
    } else {
      // 三级及以上：罗马数字 (i. ii. iii.)
      return `${numberToRoman(position)}.`;
    }
  }

  // 无序列表：统一使用圆点
  return "•";
}

function getActiveLineNumbers(state) {
  const lines = new Set();
  for (const range of state.selection.ranges) {
    let line = state.doc.lineAt(range.from);
    const endLine = state.doc.lineAt(range.to).number;
    while (line.number <= endLine) {
      lines.add(line.number);
      if (line.number === endLine) {
        break;
      }
      line = state.doc.line(line.number + 1);
    }
  }
  return lines;
}

const setPendingLineEffect = StateEffect.define();

/**
 * 追踪"即将激活的行"状态
 * 
 * 目的：解决鼠标点击时装饰闪烁问题
 * - mousedown 时立即预测目标行
 * - 选区变化时自动同步
 * - 确保装饰在光标移动前就已更新
 */
const pendingLineField = StateField.define({
  create(state) {
    // 初始化为当前光标行
    return state.selection?.main ? state.doc.lineAt(state.selection.main.head).number : null;
  },
  update(value, transaction) {
    // 优先处理显式设置的 Effect（来自 mousedown）
    for (const effect of transaction.effects) {
      if (effect.is(setPendingLineEffect)) {
        return effect.value;
      }
    }
    // 选区变化时自动更新
    if (transaction.selectionSet || transaction.docChanged) {
      return transaction.state.doc.lineAt(transaction.state.selection.main.head).number;
    }
    return value;
  }
});

/**
 * 鼠标按下事件处理
 * 在 mousedown 时提前预测目标行，避免装饰更新延迟导致的闪烁
 */
const pendingLineEvents = EditorView.domEventHandlers({
  mousedown(event, view) {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos == null) {
      return false;
    }
    const lineNumber = view.state.doc.lineAt(pos).number;
    const current = view.state.field(pendingLineField);
    if (current !== lineNumber) {
      view.dispatch({ effects: setPendingLineEffect.of(lineNumber) });
    }
    return false;
  }
});


function isRangeInActiveLines(activeLines, state, from, to) {
  if (!activeLines || activeLines.size === 0) {
    return false;
  }
  const startLine = state.doc.lineAt(from).number;
  const endLine = state.doc.lineAt(to).number;
  for (let line = startLine; line <= endLine; line += 1) {
    if (activeLines.has(line)) {
      return true;
    }
  }
  return false;
}



function getSpacedMarkerEnd(state, node) {
  const line = state.doc.lineAt(node.from);
  const nodeText = state.doc.sliceString(node.from, node.to);
  if (nodeText.endsWith(" ") || nodeText.endsWith("\t")) {
    return node.to;
  }
  if (node.to >= line.to) {
    return null;
  }
  const nextChar = state.doc.sliceString(node.to, node.to + 1);
  if (nextChar !== " " && nextChar !== "\t") {
    return null;
  }
  return node.to + 1;
}

function getQuoteMarkerEnd(state, node) {
  const line = state.doc.lineAt(node.from);
  const spacedEnd = getSpacedMarkerEnd(state, node);
  if (spacedEnd != null) {
    return spacedEnd;
  }
  if (node.to >= line.to) {
    return node.to;
  }
  return null;
}

/**
 * 构建 Markdown 装饰集合
 * 
 * 核心逻辑：
 * 1. 遍历语法树，收集代码块范围
 * 2. 处理块级标记（标题、引用、列表）
 * 3. 处理行内标记（加粗、斜体、代码、链接）
 * 4. 光标行跳过装饰，显示原始 Markdown
 * 
 * @param {EditorView} view - CodeMirror 编辑器视图
 * @returns {DecorationSet} 装饰集合
 */
function buildMarkdownDecorations(view) {
  const { state } = view;
  const activeLines = view.hasFocus ? getActiveLineNumbers(state) : null;
  const pendingLine = state.field(pendingLineField);

  // 合并需要跳过装饰的行（光标行 + 即将激活的行）
  const skipLines = activeLines ? new Set(activeLines) : new Set();
  if (Number.isInteger(pendingLine)) {
    skipLines.add(pendingLine);
  }

  const decorations = [];
  const codeBlockRanges = [];
  // 记录已装饰的范围，避免嵌套语法重复装饰
  const decoratedRanges = [];

  // 以实际列表容器为边界计数，避免多个独立列表串号。
  const listCounters = new Map();

  /**
   * 获取并递增列表位置
   * @param {SyntaxNodeRef} node - 当前 ListMark 节点
   * @param {boolean} isOrdered - 是否为有序列表
   * @param {number} level - 嵌套级别（仅用于无父节点时的降级键）
   * @returns {number} 当前位置（从1开始）
   */
  const getListPosition = (node, isOrdered, level) => {
    let container = node.node?.parent || null;
    while (container && container.name !== "OrderedList" && container.name !== "BulletList") {
      container = container.parent;
    }
    const key = container
      ? `${container.name}:${container.from}:${container.to}`
      : `${isOrdered ? "ordered" : "bullet"}:${level}`;
    const nextPosition = (listCounters.get(key) || 0) + 1;
    listCounters.set(key, nextPosition);
    return nextPosition;
  };

  /**
   * 检查位置是否在代码块内
   * @param {number} pos - 文档位置
   * @returns {boolean}
   */
  const isInCodeBlock = (pos) => {
    return codeBlockRanges.some((range) => pos >= range.from && pos <= range.to);
  };

  /**
   * 检查范围是否与已装饰范围重叠
   * @param {number} from - 起始位置
   * @param {number} to - 结束位置
   * @returns {boolean}
   */
  const isOverlapping = (from, to) => {
    return decoratedRanges.some((range) =>
      (from >= range.from && from < range.to) || (to > range.from && to <= range.to)
    );
  };

  try {
    // 第一遍遍历：收集代码块范围和处理所有标记
    syntaxTree(state).iterate({
      enter(node) {
        // 收集代码块范围
        if (node.name === "CodeBlock" || node.name === "FencedCode") {
          codeBlockRanges.push({ from: node.from, to: node.to });
          return;
        }

        // 只处理标记节点
        if (!MARK_NODE_NAMES.has(node.name)) {
          return;
        }

        // 代码块内不处理
        if (isInCodeBlock(node.from)) {
          return;
        }

        // 处理列表标记（始终渲染为美化符号，不跳过光标行）
        if (node.name === "ListMark") {
          const replaceTo = getSpacedMarkerEnd(state, node);
          if (!replaceTo) {
            return;
          }
          const markerText = state.doc.sliceString(node.from, node.to);
          const width = replaceTo - node.from;

          // 计算嵌套深度和列表类型
          const nestingLevel = getListNestingLevel(state, node);
          const isOrdered = /^\d+[.)]?$/.test(markerText.trim());

          // 获取该列表项在其嵌套级别内的位置（Obsidian 风格）
          const position = getListPosition(node, isOrdered, nestingLevel);

          const widget = new ListMarkerWidget(normalizeListMarker(markerText, nestingLevel, position), width);
          decorations.push(Decoration.replace({ widget }).range(node.from, replaceTo));
          decoratedRanges.push({ from: node.from, to: replaceTo });
          return;
        }

        // 处理块级标记（标题、引用）
        if (node.name === "HeaderMark" || node.name === "QuoteMark") {
          // 光标行跳过，显示原始 Markdown
          if (isRangeInActiveLines(skipLines, state, node.from, node.to)) {
            return;
          }
          const replaceTo = node.name === "QuoteMark"
            ? getQuoteMarkerEnd(state, node)
            : getSpacedMarkerEnd(state, node);
          if (!replaceTo) {
            return;
          }
          decorations.push(Decoration.replace({}).range(node.from, replaceTo));
          decoratedRanges.push({ from: node.from, to: replaceTo });
          return;
        }

        // 处理行内标记（加粗、斜体、代码、链接）
        if (INLINE_MARK_NAMES.has(node.name)) {
          // 光标行跳过，显示原始 Markdown 语法
          if (isRangeInActiveLines(skipLines, state, node.from, node.to)) {
            return;
          }
          // 检查是否与已装饰范围重叠（处理嵌套语法）
          if (isOverlapping(node.from, node.to)) {
            return;
          }
          // 加粗/斜体/代码标记：完全折叠（宽度为0），避免出现可见空隙
          // 链接标记：透明隐藏（保留宽度），避免复杂链接语法的布局跳动
          if (INLINE_COLLAPSE_MARK_NAMES.has(node.name)) {
            decorations.push(Decoration.replace({}).range(node.from, node.to));
          } else {
            decorations.push(Decoration.mark({ class: "cm-hide-mark" }).range(node.from, node.to));
          }
          decoratedRanges.push({ from: node.from, to: node.to });
        }
      }
    });

    // 显式排序装饰，避免 RangeError: Ranges are not sorted
    decorations.sort((a, b) => {
      const fromDiff = a.from - b.from;
      if (fromDiff !== 0) {
        return fromDiff;
      }
      // 相同起始位置时，按 startSide 排序
      return (a.value?.startSide || 0) - (b.value?.startSide || 0);
    });

    return Decoration.set(decorations, true);
  } catch (error) {
    // 语法树解析异常时返回空装饰，确保编辑器正常运行
    console.warn("Markdown decoration error:", error);
    return Decoration.none;
  }
}

const markdownMarkPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildMarkdownDecorations(view);
      this.pendingLine = view.state.field(pendingLineField);
    }

    update(update) {
      const nextPendingLine = update.state.field(pendingLineField);
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        update.focusChanged ||
        nextPendingLine !== this.pendingLine
      ) {
        this.decorations = buildMarkdownDecorations(update.view);
        this.pendingLine = nextPendingLine;
      }
    }
  },
  {
    decorations: (value) => value.decorations
  }
);

function buildMarkdownStyleDecorations(view) {
  const { state } = view;
  const decorations = [];

  syntaxTree(state).iterate({
    enter(node) {
      const className = NODE_MARK_CLASSES.get(node.name);
      if (!className || node.from === node.to) {
        return;
      }
      decorations.push(Decoration.mark({ class: className }).range(node.from, node.to));
    }
  });

  return Decoration.set(decorations, true);
}

const markdownStylePlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildMarkdownStyleDecorations(view);
    }

    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildMarkdownStyleDecorations(update.view);
      }
    }
  },
  {
    decorations: (value) => value.decorations
  }
);

function buildHeadingDecorations(view) {
  const { state } = view;
  const decorations = [];
  const seenLines = new Set();

  syntaxTree(state).iterate({
    enter(node) {
      const lineClass = HEADING_LINE_CLASSES.get(node.name);
      if (!lineClass) {
        return;
      }
      const line = state.doc.lineAt(node.from);
      if (seenLines.has(line.number)) {
        return;
      }
      seenLines.add(line.number);
      decorations.push(Decoration.line({ class: lineClass }).range(line.from));
    }
  });

  return Decoration.set(decorations, true);
}

const headingLinePlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildHeadingDecorations(view);
    }

    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildHeadingDecorations(update.view);
      }
    }
  },
  {
    decorations: (value) => value.decorations
  }
);

const BLOCKQUOTE_LINE_NODE_NAMES = new Set(["Blockquote", "BlockQuote"]);

function buildBlockquoteLineDecorations(view) {
  const { state } = view;
  const decorations = [];
  const seenLines = new Set();

  syntaxTree(state).iterate({
    enter(node) {
      if (!BLOCKQUOTE_LINE_NODE_NAMES.has(node.name)) {
        return;
      }
      const startLine = state.doc.lineAt(node.from).number;
      const endPos = Math.max(node.from, node.to - 1);
      const endLine = state.doc.lineAt(endPos).number;
      for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
        const line = state.doc.line(lineNumber);
        if (seenLines.has(line.number)) {
          continue;
        }
        seenLines.add(line.number);
        decorations.push(Decoration.line({ class: "cm-quote-line" }).range(line.from));
      }
    }
  });

  return Decoration.set(decorations, true);
}

const blockquoteLinePlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildBlockquoteLineDecorations(view);
    }

    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildBlockquoteLineDecorations(update.view);
      }
    }
  },
  {
    decorations: (value) => value.decorations
  }
);

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

function debounce(fn, delay) {
  let timer = null;
  let latestArgs = [];
  let inFlight = Promise.resolve();

  const invoke = () => {
    timer = null;
    const args = latestArgs;
    latestArgs = [];
    // 上一次写入失败不应永久阻断后续保存；本次 Promise 仍保留拒绝状态供 flush 传播。
    inFlight = inFlight.catch(() => undefined).then(() => fn(...args));
    return inFlight;
  };

  const debounced = (...args) => {
    latestArgs = args;
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      // 自动保存没有直接调用方，先记录失败；关闭时 flush 会向用户显示错误。
      void invoke().catch((error) => {
        console.warn("Failed to persist note automatically:", error);
      });
    }, delay);
  };

  debounced.flush = () => {
    if (!timer) {
      return inFlight;
    }
    clearTimeout(timer);
    return Promise.resolve(invoke());
  };

  return debounced;
}

function applyI18n() {
  try {
    if (chrome?.i18n?.getUILanguage) {
      const uiLanguage = chrome.i18n.getUILanguage();
      if (uiLanguage) {
        document.documentElement.lang = uiLanguage;
      }
    }
  } catch (error) {
    // Ignore and keep fallback lang attribute.
  }
  document.title = I18N_TEXT.appName;
  if (elements.appName) {
    elements.appName.textContent = I18N_TEXT.appName;
  }
  if (elements.themeToggle) {
    elements.themeToggle.title = I18N_TEXT.themeToggle;
    elements.themeToggle.setAttribute("aria-label", I18N_TEXT.themeToggle);
  }
  if (elements.copyBtn) {
    elements.copyBtn.title = I18N_TEXT.copy;
    elements.copyBtn.setAttribute("aria-label", I18N_TEXT.copyAllContent);
  }
  if (elements.closeBtn) {
    elements.closeBtn.title = I18N_TEXT.close;
    elements.closeBtn.setAttribute("aria-label", I18N_TEXT.closePanel);
  }
  if (elements.metaUrl) {
    elements.metaUrl.setAttribute("aria-label", I18N_TEXT.metaUrl);
  }
  if (elements.metaTitle) {
    elements.metaTitle.setAttribute("aria-label", I18N_TEXT.metaTitle);
  }
  if (elements.metaCreated) {
    elements.metaCreated.setAttribute("aria-label", I18N_TEXT.metaCreated);
  }
  if (elements.editorRoot) {
    elements.editorRoot.setAttribute("aria-label", I18N_TEXT.editorContent);
  }
  if (elements.emptyTitle) {
    elements.emptyTitle.textContent = I18N_TEXT.emptyTitle;
  }
  if (elements.emptyDesc) {
    elements.emptyDesc.textContent = I18N_TEXT.emptyDesc;
  }
  if (elements.toast) {
    elements.toast.textContent = I18N_TEXT.copySuccess;
  }
}

function resolveTheme(preference) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (preference === "auto") {
    return prefersDark ? "dark" : "light";
  }
  return preference;
}

function applyTheme(preference) {
  const resolved = resolveTheme(preference);
  document.documentElement.setAttribute("data-theme", resolved);
  if (resolved === "dark") {
    // 设计稿：深色模式显示“太阳”图标（表示可切换到亮色）
    elements.sunIcon.style.display = "block";
    elements.moonIcon.style.display = "none";
  } else {
    // 设计稿：浅色模式显示“月亮”图标（表示可切换到深色）
    elements.sunIcon.style.display = "none";
    elements.moonIcon.style.display = "block";
  }
}

async function loadTheme() {
  try {
    const stored = await chrome.storage.local.get("theme");
    state.themePreference = stored.theme || "auto";
  } catch (error) {
    state.themePreference = "auto";
    console.warn("Failed to load theme:", error);
  }
  applyTheme(state.themePreference);
}

async function saveTheme() {
  try {
    await chrome.storage.local.set({ theme: state.themePreference });
  } catch (error) {
    console.warn("Failed to save theme:", error);
  }
}

function cycleThemePreference() {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (state.themePreference === "auto") {
    state.themePreference = prefersDark ? "light" : "dark";
  } else if (state.themePreference === "light") {
    state.themePreference = "dark";
  } else {
    state.themePreference = "light";
  }
  applyTheme(state.themePreference);
  saveTheme();
}

async function loadNote() {
  const key = getNoteKey(state.tabId);

  // 使用重试机制替代硬编码延迟，更稳健地处理 background.js 初始化时序
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 50;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const stored = await chrome.storage.session.get(key);
      if (stored[key]) {
        state.note = stored[key];
        return;
      }
    } catch (error) {
      console.warn("Failed to load note:", error);
      break;
    }
    // 仅在非最后一次尝试时等待
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
    }
  }

  // 读取期间如果预先注册的 storage 监听器已经收到真实数据，不得再用占位符覆盖。
  if (state.note) {
    return;
  }

  // 重试后仍未获取到，创建本地占位符
  // 不写入 storage，让 background.js 作为 url/title/createdAt 的数据源
  // 当 background.js 写入后，storage.onChanged 会自动更新 UI
  const now = formatDateTime(new Date());
  state.note = {
    tabId: state.tabId,
    url: EMPTY_TEXT,
    title: EMPTY_TEXT,
    createdAt: now,
    contentMd: "",
    updatedAt: now
  };
}

function renderMeta() {
  if (!state.note) {
    return;
  }
  elements.metaUrl.value = state.note.url || EMPTY_TEXT;
  elements.metaTitle.value = state.note.title || EMPTY_TEXT;
  elements.metaCreated.value = state.note.createdAt || EMPTY_TEXT;
  elements.metaUrl.title = elements.metaUrl.value;
  elements.metaTitle.title = elements.metaTitle.value;
  elements.metaCreated.title = elements.metaCreated.value;
  syncMetaRowStates();
}

function setMetaRowEmpty(input, isEmpty) {
  if (!input) {
    return;
  }
  const row = input.closest(".meta-row");
  if (!row) {
    return;
  }
  if (isEmpty) {
    row.setAttribute("data-empty", "true");
  } else {
    row.removeAttribute("data-empty");
  }
}

function syncMetaRowStates() {
  setMetaRowEmpty(elements.metaUrl, elements.metaUrl.value === EMPTY_TEXT);
  setMetaRowEmpty(elements.metaTitle, elements.metaTitle.value === EMPTY_TEXT);
  setMetaRowEmpty(elements.metaCreated, elements.metaCreated.value === EMPTY_TEXT);
}

function updateEmptyStateVisibility() {
  if (!elements.emptyState) {
    return;
  }
  const content = state.note?.contentMd || "";
  elements.emptyState.classList.toggle("visible", content.trim().length === 0);
}

const persistNote = debounce(async () => {
  if (!state.note || !Number.isInteger(state.tabId)) {
    return;
  }
  const revision = state.localRevision;
  const updatedAt = formatDateTime(new Date());
  state.note.updatedAt = updatedAt;
  const noteToPersist = { ...state.note, updatedAt };
  const key = getNoteKey(state.tabId);
  await chrome.storage.session.set({ [key]: noteToPersist });
  if (state.localRevision === revision) {
    state.persistedRevision = revision;
  }
}, 300);

function markNoteChanged() {
  state.localRevision += 1;
  persistNote();
}

function buildExportText() {
  const url = state.note?.url || EMPTY_TEXT;
  const title = state.note?.title || EMPTY_TEXT;
  const createdAt = state.note?.createdAt || EMPTY_TEXT;
  const content = state.note?.contentMd || "";
  // 按 PRD 规定格式，使用 -- 分隔符包裹头部元信息
  return `--\nurl: ${url}\ntitle: ${title}\ncreated_at: ${createdAt}\n--\n${content}`.trimEnd();
}

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      return success;
    } catch (fallbackError) {
      return false;
    }
  }
}

function showToast(message, type) {
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  elements.toast.textContent = message;
  elements.toast.classList.remove("success", "error", "visible");
  elements.toast.classList.add(type);
  requestAnimationFrame(() => {
    elements.toast.classList.add("visible");
  });
  toastTimer = setTimeout(() => {
    elements.toast.classList.remove("visible");
  }, 2000);
}

function replaceEditorContent(content) {
  if (!editorView) {
    return;
  }
  const nextContent = content || "";
  if (editorView.state.doc.toString() === nextContent) {
    return;
  }
  isApplyingExternalNote = true;
  try {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: nextContent }
    });
  } finally {
    isApplyingExternalNote = false;
  }
}

function initEditor() {
  if (!elements.editorRoot) {
    return;
  }

  // 文档变更监听器，用于持久化笔记内容
  const updateListener = EditorView.updateListener.of((update) => {
    // pendingLine 同步已在 StateField.update 中自动处理，无需重复
    if (!update.docChanged || !state.note) {
      return;
    }
    state.note.contentMd = update.state.doc.toString();
    updateEmptyStateVisibility();
    if (!isApplyingExternalNote) {
      markNoteChanged();
    }
  });

  const doc = state.note?.contentMd || "";

  editorView = new EditorView({
    parent: elements.editorRoot,
    state: EditorState.create({
      doc,
      extensions: [
        editorSetup,
        EditorView.lineWrapping,
        markdown(),
        pendingLineField,
        pendingLineEvents,
        headingLinePlugin,
        blockquoteLinePlugin,
        markdownStylePlugin,
        markdownMarkPlugin,
        updateListener
      ]
    })
  });

  updateEmptyStateVisibility();
}

function setPanelClosing(isClosing) {
  const panel = document.querySelector(".panel");
  if (!panel) {
    return;
  }
  panel.inert = isClosing;
  panel.toggleAttribute("aria-busy", isClosing);
  if (isClosing && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

function bindEvents() {
  elements.themeToggle.addEventListener("click", cycleThemePreference);
  elements.copyBtn.addEventListener("click", async () => {
    const exportText = buildExportText();
    const success = await writeClipboard(exportText);
    if (success) {
      showToast(I18N_TEXT.copySuccess, "success");
    } else {
      showToast(I18N_TEXT.copyError, "error");
    }
  });

  elements.closeBtn.addEventListener("click", async () => {
    if (!Number.isInteger(state.tabId)) {
      return;
    }
    // 口径：关闭面板（X）不清空，数据随 tab/窗口/浏览器关闭统一清理。
    // 先冻结交互，防止慢存储等待期间再产生新输入；仍通过循环覆盖已排队的变更。
    setPanelClosing(true);
    try {
      while (state.localRevision !== state.persistedRevision) {
        persistNote();
        await persistNote.flush();
      }
    } catch (error) {
      console.warn("Failed to persist note before closing:", error);
      setPanelClosing(false);
      showToast(I18N_TEXT.saveError, "error");
      return;
    }

    try {
      if (chrome?.sidePanel?.close) {
        await chrome.sidePanel.close({ tabId: state.tabId });
      } else {
        // Chrome 141 以前没有 sidePanel.close，保留旧版降级行为。
        window.close();
        // 若降级关闭未生效，不应让面板永久不可交互。
        setTimeout(() => setPanelClosing(false), 0);
      }
    } catch (error) {
      console.warn("Failed to close side panel:", error);
      setPanelClosing(false);
    }
  });

  elements.metaUrl.addEventListener("input", () => {
    if (!state.note) {
      return;
    }
    state.note.url = elements.metaUrl.value;
    elements.metaUrl.title = elements.metaUrl.value;
    syncMetaRowStates();
    markNoteChanged();
  });

  elements.metaTitle.addEventListener("input", () => {
    if (!state.note) {
      return;
    }
    state.note.title = elements.metaTitle.value;
    elements.metaTitle.title = elements.metaTitle.value;
    syncMetaRowStates();
    markNoteChanged();
  });

  elements.metaCreated.addEventListener("input", () => {
    if (!state.note) {
      return;
    }
    state.note.createdAt = elements.metaCreated.value;
    elements.metaCreated.title = elements.metaCreated.value;
    syncMetaRowStates();
    markNoteChanged();
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (state.themePreference === "auto") {
      applyTheme("auto");
    }
  });

  const flushPendingNote = () => {
    void persistNote.flush().catch((error) => {
      console.warn("Failed to flush note while hiding the panel:", error);
    });
  };
  window.addEventListener("pagehide", flushPendingNote);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushPendingNote();
    }
  });
}

function handleStorageChanged(changes, areaName) {
  if (areaName !== "session") {
    return;
  }
  const key = getNoteKey(state.tabId);
  const newNote = changes[key]?.newValue;
  if (!newNote) {
    return;
  }

  const hasPendingLocalChanges = state.localRevision !== state.persistedRevision;
  if (!state.note || !hasPendingLocalChanges) {
    state.note = { ...newNote };
    state.localRevision = 0;
    state.persistedRevision = 0;
    renderMeta();
    replaceEditorContent(newNote.contentMd || "");
    updateEmptyStateVisibility();
    return;
  }

  // 本地仍有未落盘内容时，仅补全初始化阶段的占位元信息，避免覆盖用户输入。
  let didUpdateMeta = false;
  if (state.note.url === EMPTY_TEXT && newNote.url && newNote.url !== EMPTY_TEXT) {
    state.note.url = newNote.url;
    elements.metaUrl.value = newNote.url;
    elements.metaUrl.title = newNote.url;
    didUpdateMeta = true;
  }
  if (state.note.title === EMPTY_TEXT && newNote.title && newNote.title !== EMPTY_TEXT) {
    state.note.title = newNote.title;
    elements.metaTitle.value = newNote.title;
    elements.metaTitle.title = newNote.title;
    didUpdateMeta = true;
  }
  if (didUpdateMeta) {
    syncMetaRowStates();
  }
}

function bindStorageSync() {
  if (
    storageListenerBound ||
    !Number.isInteger(state.tabId) ||
    !chrome?.storage?.onChanged?.addListener
  ) {
    return;
  }
  chrome.storage.onChanged.addListener(handleStorageChanged);
  storageListenerBound = true;
}

function parseTabId() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("tabId")) {
    return null;
  }
  const rawTabId = params.get("tabId");
  if (!/^\d+$/.test(rawTabId || "")) {
    return null;
  }
  const tabId = Number(rawTabId);
  if (Number.isSafeInteger(tabId) && tabId >= 0) {
    return tabId;
  }
  return null;
}

async function init() {
  state.tabId = parseTabId();
  applyI18n();
  // 必须在任何异步读取之前监听 background 写入，避免最后一次 get 与监听注册之间的空窗。
  bindStorageSync();
  await loadTheme();
  await loadNote();
  renderMeta();
  initEditor();
  bindEvents();
}

init();
