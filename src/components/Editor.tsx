/**
 * 编辑器核心组件 — CodeMirror 6 的 React 封装。
 *
 * 职责：
 * 1. 为每个 tab 创建独立的 CodeMirror EditorView 实例
 * 2. 根据语言自动加载对应的语法高亮扩展
 * 3. 支持多光标、列选择、Cmd+Click 添加光标
 * 4. 将文档变更和光标位置同步回 Zustand store
 * 5. 字体/字号/换行等样式变更通过直接操作 DOM 实现（避免重建编辑器）
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { EditorState, EditorSelection, SelectionRange, type Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightSpecialChars,
  drawSelection,
  rectangularSelection,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentMore,
} from '@codemirror/commands';
import {
  highlightSelectionMatches,
  search,
} from '@codemirror/search';
import {
  bracketMatching,
  indentOnInput,
  foldGutter,
  foldKeymap,
  indentUnit,
} from '@codemirror/language';
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { StreamLanguage } from '@codemirror/language';
import { xcodeLight } from '@uiw/codemirror-theme-xcode';
import { useEditorStore } from '../stores/editorStore';
import { highlightField } from '../searchHighlight';
import { invisibleChars, toggleInvisible } from './invisibleChars';
import { lineBookmark, toggleBookmarkEffect } from '../lineBookmark';
import { errorMessage, notify } from '../utils/notifications';

/* ==================== 语言扩展注册表 ====================
 *
 * 按当前文件类型动态加载 CodeMirror 语言扩展，避免把全部语言解析器
 * 打进首屏包。较新的语言使用 @codemirror/lang-* 包（解析性能更好），
 * 没有原生 v6 包的使用 StreamLanguage + 旧版 mode 兼容。
 */

const NO_LANGUAGE: Extension = [];

async function loadLanguageExtension(language: string): Promise<Extension> {
  const normalized = language.toLowerCase();

  if (normalized === 'javascript' || normalized === 'typescript') {
    const { javascript } = await import('@codemirror/lang-javascript');
    return javascript({ typescript: normalized === 'typescript', jsx: true });
  }
  if (normalized === 'python') return (await import('@codemirror/lang-python')).python();
  if (normalized === 'html') return (await import('@codemirror/lang-html')).html();
  if (normalized === 'css') return (await import('@codemirror/lang-css')).css();
  if (normalized === 'json') return (await import('@codemirror/lang-json')).json();
  if (normalized === 'markdown') return (await import('@codemirror/lang-markdown')).markdown();
  if (['c', 'cpp', 'h', 'hpp'].includes(normalized)) {
    return (await import('@codemirror/lang-cpp')).cpp();
  }
  if (normalized === 'java') return (await import('@codemirror/lang-java')).java();
  if (normalized === 'php') return (await import('@codemirror/lang-php')).php();
  if (normalized === 'rust') return (await import('@codemirror/lang-rust')).rust();
  if (normalized === 'sql') return (await import('@codemirror/lang-sql')).sql();
  if (normalized === 'xml') return (await import('@codemirror/lang-xml')).xml();

  if (['shell', 'bash', 'sh', 'zsh'].includes(normalized)) {
    const { shell } = await import('@codemirror/legacy-modes/mode/shell');
    return StreamLanguage.define(shell as any);
  }
  if (normalized === 'go') {
    const { go } = await import('@codemirror/legacy-modes/mode/go');
    return StreamLanguage.define(go as any);
  }
  if (['ruby', 'rb'].includes(normalized)) {
    const { ruby } = await import('@codemirror/legacy-modes/mode/ruby');
    return StreamLanguage.define(ruby as any);
  }
  if (['perl', 'pl', 'pm'].includes(normalized)) {
    const { perl } = await import('@codemirror/legacy-modes/mode/perl');
    return StreamLanguage.define(perl as any);
  }
  if (['yaml', 'yml'].includes(normalized)) {
    const { yaml } = await import('@codemirror/legacy-modes/mode/yaml');
    return StreamLanguage.define(yaml as any);
  }
  if (normalized === 'dockerfile') {
    const { dockerFile } = await import('@codemirror/legacy-modes/mode/dockerfile');
    return StreamLanguage.define(dockerFile as any);
  }
  if (normalized === 'swift') {
    const { swift } = await import('@codemirror/legacy-modes/mode/swift');
    return StreamLanguage.define(swift as any);
  }
  if (['kotlin', 'kt', 'csharp', 'cs', 'dart'].includes(normalized)) {
    const { clike } = await import('@codemirror/legacy-modes/mode/clike');
    return StreamLanguage.define(clike as any);
  }
  if (normalized === 'r') {
    const { r } = await import('@codemirror/legacy-modes/mode/r');
    return StreamLanguage.define(r as any);
  }
  if (normalized === 'lua') {
    const { lua } = await import('@codemirror/legacy-modes/mode/lua');
    return StreamLanguage.define(lua as any);
  }
  if (['toml', 'conf', 'ini'].includes(normalized)) {
    const { toml } = await import('@codemirror/legacy-modes/mode/toml');
    return StreamLanguage.define(toml as any);
  }
  if (normalized === 'nginx') {
    const { nginx } = await import('@codemirror/legacy-modes/mode/nginx');
    return StreamLanguage.define(nginx as any);
  }

  return NO_LANGUAGE;
}

/* ==================== 列选择 ====================
 *
 * viewsMap 和 activeView 放在模块级别而非 React ref 中，
 * 这样 Vite HMR（热模块替换）重新渲染组件时不会丢失编辑器实例。
 * 菜单栏的「列编辑」按钮通过 window.__macEditor 调用 selectColumn。
 */

/** tabId → EditorView 实例映射表，支持多 tab */
const viewsMap = new Map<string, EditorView>();
/** 当前聚焦的编辑器实例 */
let activeView: EditorView | null = null;

/**
 * 列选择：在当前光标所在列的每一行插入光标。
 * 例如光标在第 5 行第 10 列，调用后会在所有行的第 10 列各插入一个光标。
 */
function selectColumn(view: EditorView): boolean {
  const pos = view.state.selection.main.from;
  const mainLine = view.state.doc.lineAt(pos);
  const col = pos - mainLine.from;
  const cursors = [];
  for (let i = 1; i <= view.state.doc.lines; i++) {
    const line = view.state.doc.line(i);
    cursors.push(EditorSelection.cursor(line.from + Math.min(col, line.length)));
  }
  view.dispatch(view.state.update({ selection: EditorSelection.create(cursors), scrollIntoView: true }));
  return true;
}

/**
 * 按行去重 — 类似 SQL DISTINCT。
 * 有选区时仅对选中的行去重，无选区时对整个文档去重。
 * 保留首次出现的行，维持原有顺序。
 */
function deduplicateLines(view: EditorView): boolean {
  const state = view.state;
  const sel = state.selection.main;
  const hasSelection = sel.from !== sel.to;

  const fromLine = state.doc.lineAt(sel.from);
  const toLine = state.doc.lineAt(sel.to);
  const from = hasSelection ? fromLine.from : 0;
  const to = hasSelection ? toLine.from + toLine.length : state.doc.length;

  const text = state.sliceDoc(from, to);
  const lines = text.split(/\r?\n/);
  const seen = new Set<string>();
  const unique = lines.filter((line) => {
    if (seen.has(line)) return false;
    seen.add(line);
    return true;
  });

  view.dispatch({
    changes: { from, to, insert: unique.join('\n') },
    scrollIntoView: true,
  });
  return true;
}

/* ==================== 全局 API ====================
 *
 * 通过 window.__macEditor 暴露给菜单栏按钮等外部调用方。
 * 菜单栏不直接引用 React 组件，通过此全局对象找到当前编辑器实例。
 */

(window as any).__macEditor = {
  selectColumn: () => {
    const view = activeView || [...viewsMap.values()].find(Boolean) || null;
    if (!view) return false;
    return selectColumn(view);
  },
  deduplicateLines: () => {
    const view = activeView || [...viewsMap.values()].find(Boolean) || null;
    if (!view) return false;
    return deduplicateLines(view);
  },
  registerView: (tabId: string, view: EditorView) => {
    viewsMap.set(tabId, view);
  },
  unregisterView: (tabId: string) => {
    viewsMap.delete(tabId);
  },
};

function getActiveView(): EditorView | null { return activeView; }
function setActiveView(v: EditorView | null) { activeView = v; }

/**
 * 自定义快捷键映射。
 * 在默认快捷键基础上扩展了：
 * - Tab 键：有选区时缩进，无选区时插入 \t（支持多光标）
 * - Cmd/Ctrl-Alt-ArrowUp/Down：在相邻行相同列位置添加光标
 * - Shift-Alt-ArrowUp/Down：向上/下扩展列选区
 */
const editorKeymap = keymap.of([
  ...defaultKeymap,
  ...historyKeymap,
  ...foldKeymap,
  ...closeBracketsKeymap,
  // Custom Tab: insert \t at cursor, indent selected lines
  {
    key: 'Tab',
    run: (v) => {
      const { state, dispatch } = v;
      if (state.readOnly) return false;
      const hasSelection = state.selection.ranges.some((r) => !r.empty);
      if (hasSelection) return indentMore(v);
      // Multi-cursor: insert \t at each cursor
      const changes: Array<{ from: number; insert: string }> = [];
      for (const r of state.selection.ranges) {
        changes.push({ from: r.from, insert: '\t' });
      }
      changes.sort((a, b) => b.from - a.from);
      const newRanges = state.selection.ranges.map((r) => {
        let offset = 0;
        for (const c of changes) {
          if (c.from <= r.from) offset++;
        }
        return EditorSelection.cursor(r.from + offset);
      });
      dispatch(state.update({
        changes,
        selection: EditorSelection.create(newRanges),
        scrollIntoView: true,
        userEvent: 'input.type',
      }));
      return true;
    },
  },
]);

/* ==================== 组件定义 ==================== */

interface EditorProps {
  /** 当前 tab 的唯一标识 */
  tabId: string;
  /** 是否为当前活跃的 tab */
  isActive: boolean;
  /** 初始文本内容 */
  initialContent: string;
  /** 语法高亮语言 */
  language: string;
}

/**
 * Editor 组件 — 为单个 tab 渲染一个 CodeMirror 编辑器实例。
 *
 * 生命周期：
 * - language 变化 → 销毁旧实例，重建 EditorState（语言扩展不可变）
 * - fontSize/fontFamily/wordWrap 变化 → 直接操作 DOM，不重建实例
 * - isActive 变化 → 切换 focus 状态
 * - showInvisibleChars 变化 → dispatch effect 切换不可见字符显示
 */
export default function Editor({ tabId, isActive, initialContent, language }: EditorProps) {
  // DOM 容器 ref
  const containerRef = useRef<HTMLDivElement>(null);
  // CodeMirror EditorView 实例 ref
  const viewRef = useRef<EditorView | null>(null);
  // 初始内容 ref（避免重建时丢失用户输入）
  const initialContentRef = useRef(initialContent);
  // 活跃状态 ref（在闭包中获取最新值，避免依赖项变化）
  const isActiveRef = useRef(isActive);
  const [languageExtension, setLanguageExtension] = useState<Extension>(NO_LANGUAGE);

  // 从 store 订阅编辑器设置
  const fontSize = useEditorStore((s) => s.settings.fontSize);
  const fontFamily = useEditorStore((s) => s.settings.fontFamily);
  const wordWrap = useEditorStore((s) => s.settings.wordWrap);
  const showInvisibleChars = useEditorStore((s) => s.settings.showInvisibleChars);

  useEffect(() => {
    let cancelled = false;
    void loadLanguageExtension(language).then(
      (extension) => {
        if (!cancelled) setLanguageExtension(extension);
      },
      (error) => {
        console.error(`[language] Failed to load ${language}:`, error);
        if (!cancelled) {
          setLanguageExtension(NO_LANGUAGE);
          notify(`无法加载 ${language} 语法高亮：${errorMessage(error)}`, 'error');
        }
      },
    );
    return () => { cancelled = true; };
  }, [language]);

  /**
   * 构建 CodeMirror 扩展数组。
   * 包含：行号、历史记录、括号匹配、自动补全、缩进、主题、
   *        自定义快捷键、搜索高亮、语言扩展等。
   * 依赖项变化时会触发 EditorState 重建（仅 language 变化时实际发生）。
   */
  const buildExtensions = useCallback(() => {
    return [
      lineNumbers({
        // 点击行号 → 切换该行标记（Notepad++ 行为）
        domEventHandlers: {
          mousedown(view, line) {
            view.dispatch({ effects: toggleBookmarkEffect.of(line.from) });
            return true;
          },
        },
      }),
      lineBookmark(),  // 行标记圆点列（行号右侧、竖线左侧）
      highlightSpecialChars(),
      history(),
      drawSelection({ cursorBlinkRate: 1000 }),
      // Cmd(mac)/Ctrl 拖动生成矩形列选区（多光标）
      rectangularSelection({
        eventFilter: (e) => (e.metaKey || e.ctrlKey) && e.button === 0,
      }),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      indentOnInput(),
      indentUnit.of('\t'),
      foldGutter(),
      editorKeymap,
      highlightSelectionMatches(),
      search(),
      // 启用多光标支持
      EditorState.allowMultipleSelections.of(true),
      // 列选择快捷键：向上/向下添加光标或扩展列选区
      keymap.of([
        {
          key: 'Ctrl-Alt-ArrowUp',
          mac: 'Cmd-Alt-ArrowUp',
          run: (v) => {
            const { state, dispatch } = v;
            const newRanges: SelectionRange[] = [];
            for (const r of state.selection.ranges) {
              const line = state.doc.lineAt(r.from);
              if (line.number > 1) {
                const prev = state.doc.line(line.number - 1);
                const col = Math.min(r.from - line.from, prev.length);
                newRanges.push(EditorSelection.cursor(prev.from + col));
              }
            }
            if (newRanges.length > 0) {
              dispatch(state.update({
                selection: EditorSelection.create([...state.selection.ranges, ...newRanges]),
                scrollIntoView: true,
              }));
              return true;
            }
            return false;
          },
        },
        {
          key: 'Ctrl-Alt-ArrowDown',
          mac: 'Cmd-Alt-ArrowDown',
          run: (v) => {
            const { state, dispatch } = v;
            const newRanges: SelectionRange[] = [];
            for (const r of state.selection.ranges) {
              const line = state.doc.lineAt(r.from);
              if (line.number < state.doc.lines) {
                const next = state.doc.line(line.number + 1);
                const col = Math.min(r.from - line.from, next.length);
                newRanges.push(EditorSelection.cursor(next.from + col));
              }
            }
            if (newRanges.length > 0) {
              dispatch(state.update({
                selection: EditorSelection.create([...state.selection.ranges, ...newRanges]),
                scrollIntoView: true,
              }));
              return true;
            }
            return false;
          },
        },
        {
          key: 'Shift-Alt-ArrowUp',
          run: (v) => {
            const { state, dispatch } = v;
            const main = state.selection.main;
            const mainLine = state.doc.lineAt(main.from);
            if (mainLine.number <= 1) return false;
            const prev = state.doc.line(mainLine.number - 1);
            const col = Math.min(main.from - mainLine.from, prev.length);
            dispatch(state.update({
              selection: EditorSelection.create([
                EditorSelection.range(prev.from + col, main.to),
                EditorSelection.cursor(prev.from + col),
              ]),
              scrollIntoView: true,
            }));
            return true;
          },
        },
        {
          key: 'Shift-Alt-ArrowDown',
          run: (v) => {
            const { state, dispatch } = v;
            const main = state.selection.main;
            const mainLine = state.doc.lineAt(main.from);
            if (mainLine.number >= state.doc.lines) return false;
            const next = state.doc.line(mainLine.number + 1);
            const col = Math.min(main.from - mainLine.from, next.length);
            dispatch(state.update({
              selection: EditorSelection.create([
                EditorSelection.range(main.from, next.from + col),
                EditorSelection.cursor(next.from + col),
              ]),
              scrollIntoView: true,
            }));
            return true;
          },
        },
      ]),
      // 拦截「文件」拖放：阻止 CodeMirror 默认把文件内容插入当前文档，
      // 交由 document 层的 useDragAndDrop 打开新 tab（tab 拖拽等内部拖放放行）
      EditorView.domEventHandlers({
        drop: (event) => {
          if (event.dataTransfer?.types.includes('Files')) {
            event.preventDefault();
            return true;
          }
          return false;
        },
        dragover: (event) => {
          if (event.dataTransfer?.types.includes('Files')) {
            event.preventDefault();
            return true;
          }
          return false;
        },
      }),
      // 监听编辑器变更：文档修改同步回 store、光标位置更新状态栏
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const store = useEditorStore.getState();
          store.updateTabContent(tabId, update.state.doc.toString());
        }
        if (update.selectionSet) {
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos);
          useEditorStore.getState().setCursorPosition({ line: line.number, column: pos - line.from + 1 });
        }
      }),
      // 自定义主题：字体、字号、内边距
      EditorView.theme({
        '&': { fontSize: `${fontSize}px`, fontFamily: fontFamily },
        '.cm-scroller': { overflow: 'auto' },
        // 上下留白用 content padding；左右留白放在 .cm-line 上，
        // 否则多行选区中间行会从 content 左 padding 边缘起画，行首多出一段空白
        '.cm-content': { padding: '8px 0' },
        '.cm-line': { padding: '0 8px' },
        // 把分隔竖线画在圆点标记列右侧，
        // 使布局为：[行号][圆点] | [折叠列] [内容]
        '.cm-gutters': { borderRight: 'none' },
        '.cm-bookmark-gutter': { borderRight: '1px solid #e0e0e0' },
      }),
      xcodeLight,  // Xcode 风格主题
      highlightField,  // 搜索匹配高亮
      wordWrap ? EditorView.lineWrapping : [],  // 自动换行
      languageExtension,  // 按文件类型动态加载的语法高亮扩展
      invisibleChars(),  // 不可见字符显示
    ];
  }, [languageExtension, fontSize, fontFamily, wordWrap, tabId]);

  /**
   * 创建 CodeMirror 编辑器实例。
   * 仅在异步语言扩展加载完成后重建（因为语言扩展不可变）。
   * 字体/字号/换行通过另一个 effect 直接操作 DOM，避免频繁重建。
   */
  useEffect(() => {
    if (!containerRef.current) return;

    // 如果已存在实例，先销毁再重建
    if (viewRef.current) {
      viewRef.current.destroy();
      viewRef.current = null;
      containerRef.current.innerHTML = '';
    }

    const state = EditorState.create({
      doc: initialContentRef.current || '',
      extensions: buildExtensions(),
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    // 保存到 store，供 SearchPanel 等外部组件使用
    useEditorStore.getState().setEditorView(tabId, view);

    // Sync invisible chars state after creation
    if (showInvisibleChars) {
      view.dispatch({ effects: toggleInvisible.of(true) });
    }

    // 通过 window 级 API 注册实例（HMR 安全）
    (window as any).__macEditor?.registerView?.(tabId, view);

    // 如果当前 tab 是活跃的，设为 activeView 并自动聚焦
    if (isActiveRef.current) {
      setActiveView(view);
    }

    if (isActiveRef.current) {
      requestAnimationFrame(() => view.focus());
    }

    /* Cmd+Click 添加光标 — 支持多光标编辑。
       注意：Cmd+拖动用于矩形列选区（rectangularSelection），
       拖动结束也会触发 click，需通过位移判断排除，避免覆盖列选区结果。 */
    let downX = 0, downY = 0;
    const handleMouseDown = (e: MouseEvent) => { downX = e.clientX; downY = e.clientY; };
    const handleClick = (e: MouseEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // 位移超过阈值视为拖动（列选区），不加单光标
      const moved = Math.abs(e.clientX - downX) > 3 || Math.abs(e.clientY - downY) > 3;
      if (moved) return;

      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos === null) return;

      e.preventDefault();
      e.stopPropagation();

      view.dispatch({
        selection: EditorSelection.create([
          ...view.state.selection.ranges,
          EditorSelection.cursor(pos),
        ]),
        scrollIntoView: true,
      });
    };

    containerRef.current.addEventListener('mousedown', handleMouseDown, { capture: true });
    containerRef.current.addEventListener('click', handleClick, { capture: true });

    return () => {
      containerRef.current?.removeEventListener('mousedown', handleMouseDown, { capture: true });
      containerRef.current?.removeEventListener('click', handleClick, { capture: true });
      (window as any).__macEditor?.unregisterView?.(tabId);
      if (getActiveView() === view) {
        setActiveView(null);
      }
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageExtension]);

  // 不可见字符开关 — 通过 effect 切换，不重建编辑器
  useEffect(() => {
    if (viewRef.current) {
      viewRef.current.dispatch({ effects: toggleInvisible.of(showInvisibleChars) });
    }
  }, [showInvisibleChars]);

  // 字体/字号/换行变化 — 直接操作 DOM，避免重建 EditorState
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const dom = view.scrollDOM;
    dom.style.fontSize = `${fontSize}px`;
    dom.style.fontFamily = fontFamily;
    dom.style.whiteSpace = wordWrap ? 'pre-wrap' : '';
    dom.style.wordBreak = wordWrap ? 'break-all' : '';
    // Also update content wrapper
    const content = view.contentDOM;
    content.style.fontSize = `${fontSize}px`;
    content.style.fontFamily = fontFamily;
    if (wordWrap) {
      content.classList.add('cm-lineWrapping');
    } else {
      content.classList.remove('cm-lineWrapping');
    }
  }, [fontSize, fontFamily, wordWrap]);

  // initialContent 变化时更新 ref（注意：不会自动同步到编辑器文档）
  useEffect(() => {
    initialContentRef.current = initialContent;
  }, [initialContent]);

  // isActive 变化时：聚焦当前编辑器或取消活跃状态
  useEffect(() => {
    isActiveRef.current = isActive;
    if (isActive && viewRef.current) {
      const view = viewRef.current;
      requestAnimationFrame(() => {
        // view 可能在这一帧内被卸载/重建（viewRef 置空），用局部引用避免空指针
        if (viewRef.current === view) view.focus();
      });
      setActiveView(viewRef.current);
    } else if (getActiveView() === viewRef.current) {
      setActiveView(null);
    }
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        visibility: isActive ? 'visible' : 'hidden',
        position: isActive ? 'relative' : 'absolute',
        top: 0,
        left: 0,
      }}
    />
  );
}
