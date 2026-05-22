/**
 * 文件拖拽处理 hook。
 *
 * 支持两种拖拽方式：
 * 1. Tauri 原生文件拖放（通过 window.__handleFileDrop 回调）
 * 2. HTML5 标准拖放事件（dragover / dragenter / dragleave / drop）
 *
 * 拖入的文件会被读取文本内容并创建新的 tab。
 */
import { useEffect, useState, useCallback } from 'react';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { useEditorStore } from '../stores/editorStore';
import { detectLanguage } from '../utils/detectLanguage';

/** Handle native file drop from Tauri and HTML5 drag-and-drop. */
export function useDragAndDrop() {
  const addTab = useEditorStore((s) => s.addTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const [isDragOver, setIsDragOver] = useState(false);

  // Tauri native file drop bridge (set by Rust side)
  useEffect(() => {
    (window as any).__handleFileDrop = async (paths: string[]) => {
      if (!paths || paths.length === 0) return; // 内部拖拽（tab 排序）无路径，放行 HTML5 事件
      setIsDragOver(false);
      for (const filePath of paths) {
        try {
          const existing = useEditorStore.getState().tabs.find((t) => t.filePath === filePath);
          if (existing) {
            useEditorStore.getState().setActiveTab(existing.id);
            continue;
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
          useEditorStore.getState().addRecentFile(filePath, fileName);
        } catch (error) {
          console.error('[drop] Failed to read dropped file:', error);
        }
      }
    };

    (window as any).__handleFileHover = (paths: string[]) => {
      if (!paths || paths.length === 0) return; // 内部拖拽无文件路径，不显示覆盖层
      setIsDragOver(true);
    };

    return () => {
      delete (window as any).__handleFileDrop;
      delete (window as any).__handleFileHover;
    };
  }, [addTab]);

  /** 判断拖拽操作是否包含实际文件（排除 tab 拖拽等内部操作） */
  const isFileDrag = (e: DragEvent) =>
    e.dataTransfer?.types.includes('Files') ?? false;

  // HTML5 drag-and-drop
  const handleDragOver = useCallback((e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragEnter = useCallback((e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    if (
      e.clientX <= 0 ||
      e.clientY <= 0 ||
      e.clientX >= window.innerWidth ||
      e.clientY >= window.innerHeight
    ) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const filePath = (file as any).path || null; // Tauri may provide path
          const existing = filePath ? useEditorStore.getState().tabs.find((t) => t.filePath === filePath) : null;
          if (existing) {
            setActiveTab(existing.id);
            continue;
          }

          const text = await file.text();
          const language = detectLanguage(file.name);
          addTab({
            filePath,
            fileName: file.name,
            content: text,
            isModified: false,
            encoding: 'utf-8',
            language,
            editorView: null,
          });
        } catch (error) {
          console.error('[drop] Failed to read dropped file:', error);
        }
      }
    },
    [addTab, setActiveTab]
  );

  useEffect(() => {
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);
    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDrop);
    };
  }, [handleDragOver, handleDragEnter, handleDragLeave, handleDrop]);

  return { isDragOver, setIsDragOver };
}
