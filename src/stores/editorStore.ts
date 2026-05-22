/**
 * Zustand 全局状态管理。
 *
 * 职责：
 * 1. 管理所有打开的 tab（内容、路径、修改状态、语言）
 * 2. 光标位置追踪
 * 3. 编辑器设置（字体、字族、换行等）
 * 4. 最近打开的文件列表（持久化到 localStorage）
 */
import { create } from 'zustand';
import type { EditorView } from '@codemirror/view';

/** 最近打开的文件记录 */
export interface RecentFile {
  filePath: string;
  fileName: string;
  openedAt: number;
}

interface StoredState {
  recentFiles: RecentFile[];
}

const STORAGE_KEY = 'mac-editor-state';

const loadStoredState = (): StoredState | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
};

const saveState = (state: Partial<StoredState>) => {
  try {
    const existing = loadStoredState() || {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...state }));
  } catch {}
};

const initialState = loadStoredState();

/** Tab 数据结构 — 每个打开的文件对应一个 tab */
export interface Tab {
  id: string;
  filePath: string | null;
  fileName: string;
  content: string;
  isModified: boolean;
  encoding: string;
  language: string;
  editorView: EditorView | null;
}

/** Store 类型定义 + 所有 actions */
interface EditorState {
  tabs: Tab[];
  activeTabId: string | null;
  cursorPosition: { line: number; column: number };
  recentFiles: RecentFile[];
  settings: {
    fontSize: number;
    fontFamily: string;
    tabSize: number;
    wordWrap: boolean;
    showInvisibleChars: boolean;
  };

  // --- Tab 操作 ---
  /** 创建新 tab 并设为活跃 */
  addTab: (tab: Omit<Tab, 'id'>) => string;
  /** 关闭指定 tab，若为当前活跃 tab 则自动切换到最后一个 */
  removeTab: (id: string) => void;
  /** 拖动重排 tab 顺序，fromIndex → toIndex */
  moveTab: (fromIndex: number, toIndex: number) => void;
  /** 切换活跃 tab */
  setActiveTab: (id: string) => void;
  /** 更新 tab 内容（同时标记为已修改） */
  updateTabContent: (id: string, content: string) => void;
  /** 设置 tab 的修改状态 */
  setTabModified: (id: string, isModified: boolean) => void;
  /** 绑定 tab 到磁盘文件路径 */
  setTabFilePath: (id: string, filePath: string, fileName: string) => void;
  /** 设置 tab 编码 */
  setTabEncoding: (id: string, encoding: string) => void;
  /** 设置 tab 语言 */
  setTabLanguage: (id: string, language: string) => void;
  /** 关联 CodeMirror EditorView 实例 */
  setEditorView: (id: string, view: EditorView) => void;

  // --- 光标 ---
  /** 更新光标位置（行号/列号） */
  setCursorPosition: (position: { line: number; column: number }) => void;

  // --- 最近文件 ---
  /** 添加最近文件到列表头部，去重，最多保留 20 条 */
  addRecentFile: (filePath: string, fileName: string) => void;
  /** 从最近文件列表中移除 */
  removeRecentFile: (filePath: string) => void;
  getRecentFiles: () => RecentFile[];
  clearRecentFiles: () => void;

  // --- 设置 ---
  /** 合并更新编辑器设置 */
  updateSettings: (settings: Partial<EditorState['settings']>) => void;
}

const generateId = () => `tab-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  cursorPosition: { line: 1, column: 1 },
  // 从 localStorage 恢复最近文件列表
  recentFiles: initialState?.recentFiles || [],
  settings: {
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    tabSize: 4,
    wordWrap: false,
    showInvisibleChars: false,
  },

  // 创建新 tab，生成唯一 ID 并激活它
  addTab: (tab) => {
    const id = generateId();
    set((state) => ({
      tabs: [...state.tabs, { ...tab, id }],
      activeTabId: id,
    }));
    return id;
  },

  // 关闭 tab，若关闭的是当前 tab 则自动激活最后一个剩余 tab
  removeTab: (id) => {
    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== id);
      const activeTabId =
        state.activeTabId === id
          ? newTabs.length > 0
            ? newTabs[newTabs.length - 1].id
            : null
          : state.activeTabId;
      return { tabs: newTabs, activeTabId };
    });
  },

  moveTab: (fromIndex, toIndex) => {
    set((state) => {
      const tabs = [...state.tabs];
      const [moved] = tabs.splice(fromIndex, 1);
      tabs.splice(toIndex, 0, moved);
      return { tabs };
    });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  // 更新内容时自动标记为已修改
  updateTabContent: (id, content) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, content, isModified: true } : t
      ),
    }));
  },

  // 设置 tab 的修改状态标记（如保存后清除）
  setTabModified: (id, isModified) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, isModified } : t
      ),
    }));
  },

  // 绑定 tab 到磁盘文件（保存后设置路径）
  setTabFilePath: (id, filePath, fileName) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, filePath, fileName } : t
      ),
    }));
  },

  setTabEncoding: (id, encoding) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, encoding } : t
      ),
    }));
  },

  // 切换语法高亮语言
  setTabLanguage: (id, language) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, language } : t
      ),
    }));
  },

  // 保存 CodeMirror EditorView 引用（用于 StatusBar 等外部组件读取文档信息）
  setEditorView: (id, view) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, editorView: view } : t
      ),
    }));
  },

  // 光标位置更新（由 Editor 组件的 updateListener 触发）
  setCursorPosition: (position) => set({ cursorPosition: position }),

  /**
   * 添加最近文件：先去重（同路径移除旧记录），再插到头部，
   * 保留最多 20 条并同步持久化到 localStorage。
   */
  addRecentFile: (filePath, fileName) => {
    set((state) => {
      // 去重：移除同路径的旧记录
      const filtered = state.recentFiles.filter((f) => f.filePath !== filePath);
      // 插到头部，保留前 20 条
      const newFiles = [
        { filePath, fileName, openedAt: Date.now() },
        ...filtered,
      ].slice(0, 20);
      saveState({ recentFiles: newFiles });
      return { recentFiles: newFiles };
    });
  },

  // 从最近文件列表中移除（同时持久化）
  removeRecentFile: (filePath) => {
    set((state) => {
      const newFiles = state.recentFiles.filter((f) => f.filePath !== filePath);
      saveState({ recentFiles: newFiles });
      return { recentFiles: newFiles };
    });
  },

  getRecentFiles: () => get().recentFiles,

  clearRecentFiles: () => {
    saveState({ recentFiles: [] });
    set({ recentFiles: [] });
  },

  // 合并更新编辑器设置（字体大小、字族、换行等）
  updateSettings: (newSettings) => {
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
    }));
  },
}));
