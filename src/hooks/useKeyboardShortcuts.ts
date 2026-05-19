/**
 * 全局键盘快捷键 hook。
 *
 * 监听 window 级别键盘事件，处理以下快捷键：
 * ⌘/Ctrl+N  新建文件
 * ⌘/Ctrl+O  打开文件
 * ⌘/Ctrl+S  保存
 * ⌘/Ctrl+W  关闭当前 tab
 * ⌘/Ctrl+=  放大字体
 * ⌘/Ctrl+-  缩小字体
 * ⌘/Ctrl+0  重置字体
 * ⌘/Ctrl+Tab  切换 tab
 */
import { useEffect, useCallback } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useFileOperations } from '../hooks/useFileOperations';

/** Global keyboard shortcuts. */
export function useKeyboardShortcuts() {
  const tabs = useEditorStore((state) => state.tabs);
  const activeTabId = useEditorStore((state) => state.activeTabId);
  const removeTab = useEditorStore((state) => state.removeTab);
  const setActiveTab = useEditorStore((state) => state.setActiveTab);
  const addTab = useEditorStore((state) => state.addTab);
  const updateSettings = useEditorStore((state) => state.updateSettings);
  const settings = useEditorStore((state) => state.settings);
  const { newFile, openFile, saveFile } = useFileOperations();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + N: New file
      if (mod && e.key === 'n' && !e.shiftKey) {
        e.preventDefault();
        newFile();
        return;
      }

      // Cmd/Ctrl + O: Open file
      if (mod && e.key === 'o') {
        e.preventDefault();
        openFile();
        return;
      }

      // Cmd/Ctrl + S: Save
      if (mod && e.key === 's') {
        e.preventDefault();
        saveFile();
        return;
      }

      // Cmd/Ctrl + W: Close tab
      if (mod && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) removeTab(activeTabId);
        return;
      }

      // Cmd/Ctrl + = / +: Increase font size
      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        updateSettings({ fontSize: Math.min(32, settings.fontSize + 1) });
        return;
      }

      // Cmd/Ctrl + -: Decrease font size
      if (mod && e.key === '-') {
        e.preventDefault();
        updateSettings({ fontSize: Math.max(10, settings.fontSize - 1) });
        return;
      }

      // Cmd/Ctrl + 0: Reset font size
      if (mod && e.key === '0') {
        e.preventDefault();
        updateSettings({ fontSize: 14 });
        return;
      }

      // Cmd/Ctrl + F: Search / Find
      if (mod && e.key === 'f') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('mac-editor:open-search'));
        return;
      }

      // Cmd/Ctrl + Tab  switching: Ctrl+Tab / Ctrl+Shift+Tab
      if (mod && e.key === 'Tab') {
        e.preventDefault();
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        const newIdx = e.shiftKey
          ? idx <= 0
            ? tabs.length - 1
            : idx - 1
          : idx >= tabs.length - 1
            ? 0
            : idx + 1;
        setActiveTab(tabs[newIdx].id);
        return;
      }
    },
    [
      activeTabId,
      tabs,
      settings.fontSize,
      newFile,
      openFile,
      saveFile,
      removeTab,
      setActiveTab,
      addTab,
      updateSettings,
    ]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
