/**
 * 文件操作 hook — 封装新建、打开、保存文件的完整流程。
 *
 * 通过 Tauri 的 dialog 和 fs 插件与系统交互，
 * 打开文件时自动检测语言、避免重复 tab、更新最近文件列表。
 */
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { useEditorStore } from '../stores/editorStore';
import { detectLanguage } from '../utils/detectLanguage';

/** 根据已有 tab 列表生成下一个未命名 tab 的名称 */
export function getNextUntitledName(tabs: Array<{ fileName: string }>): string {
  let maxNum = 0;
  for (const t of tabs) {
    const m = t.fileName.match(/^未命名(?:(\d+))?$/);
    if (m) {
      maxNum = Math.max(maxNum, m[1] ? parseInt(m[1], 10) : 0);
    }
  }
  if (maxNum === 0) {
    return tabs.some((t) => t.fileName === '未命名') ? '未命名1' : '未命名';
  }
  return `未命名${maxNum + 1}`;
}

/** Unified file operations. */
export function useFileOperations() {
  const tabs = useEditorStore((state) => state.tabs);
  const addTab = useEditorStore((state) => state.addTab);
  const setActiveTab = useEditorStore((state) => state.setActiveTab);
  const setTabModified = useEditorStore((state) => state.setTabModified);
  const setTabFilePath = useEditorStore((state) => state.setTabFilePath);
  const setTabLanguage = useEditorStore((state) => state.setTabLanguage);
  const addRecentFile = useEditorStore((state) => state.addRecentFile);
  const removeRecentFile = useEditorStore((state) => state.removeRecentFile);
  const activeTab = useEditorStore((state) =>
    state.tabs.find((t) => t.id === state.activeTabId)
  );

  /** 创建一个空白的新 tab */
  const newFile = () => {
    addTab({
      filePath: null,
      fileName: getNextUntitledName(tabs),
      content: '',
      isModified: false,
      encoding: 'utf-8',
      language: 'txt',
      editorView: null,
    });
  };

  /**
   * 通过 Tauri 文件选择对话框打开文件。
   * 若文件已在某个 tab 中打开则直接切换到该 tab。
   */
  const openFile = async () => {
    try {
      const selected = await open({ multiple: false });
      if (!selected || Array.isArray(selected)) return;

      // Check if already open
      const existing = tabs.find((t) => t.filePath === selected);
      if (existing) {
        setActiveTab(existing.id);
        return;
      }

      const fileName =
        selected.split('/').pop() || selected.split('\\').pop() || 'unknown';
      const text = await readTextFile(selected);
      const language = detectLanguage(fileName);

      addTab({
        filePath: selected,
        fileName,
        content: text,
        isModified: false,
        encoding: 'utf-8',
        language,
        editorView: null,
      });
      addRecentFile(selected, fileName);
    } catch (error) {
      console.error('[file] Failed to open:', error);
    }
  };

  /**
   * 通过路径打开文件（用于最近文件列表、拖拽等场景）。
   * 同样检查是否已在 tab 中以避免重复打开。
   */
  const openFileAtPath = async (filePath: string) => {
    try {
      // Check if already open
      const existing = tabs.find((t) => t.filePath === filePath);
      if (existing) {
        setActiveTab(existing.id);
        return;
      }

      const fileName =
        filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';
      const text = await readTextFile(filePath);
      const language = detectLanguage(fileName);

      addTab({
        filePath,
        fileName,
        content: text,
        isModified: false,
        encoding: 'utf-8',
        language,
        editorView: null,
      });
      addRecentFile(filePath, fileName);
    } catch {
      // File no longer exists — remove from recent list silently
      removeRecentFile(filePath);
    }
  };

  /**
   * 保存当前活跃的 tab。
   * 已有路径  → 直接覆盖写入；
   * 无路径（新文件） → 弹出另存为对话框，写入后绑定路径和语言。
   */
  const saveFile = async () => {
    if (!activeTab) return;

    try {
      if (activeTab.filePath) {
        await writeTextFile(activeTab.filePath, activeTab.content);
        setTabModified(activeTab.id, false);
      } else {
        const filePath = await save({ defaultPath: activeTab.fileName });
        if (!filePath) return;

        await writeTextFile(filePath, activeTab.content);
        const fileName =
          filePath.split('/').pop() || filePath.split('\\').pop() || 'unknown';
        const language = detectLanguage(fileName);

        setTabFilePath(activeTab.id, filePath, fileName);
        setTabLanguage(activeTab.id, language);
        addRecentFile(filePath, fileName);
        setTabModified(activeTab.id, false);
      }
    } catch (error) {
      console.error('[file] Failed to save:', error);
    }
  };

  return { newFile, openFile, openFileAtPath, saveFile, activeTab };
}
