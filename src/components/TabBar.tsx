/**
 * 标签栏组件。
 *
 * 功能：
 * - 渲染所有 tab 标签页，高亮当前活跃 tab
 * - 双击 tab 可重命名文件名（同时自动检测新语言）
 * - 双击空白区域新建空白 tab
 * - 每个 tab 有关闭按钮，修改过的 tab 名称前显示 ● 标记
 */
import { useState, useCallback, useLayoutEffect, useRef } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { useEditorStore } from '../stores/editorStore';
import { detectLanguage } from '../utils/detectLanguage';
import { getNextUntitledName } from '../hooks/useFileOperations';
import { colors, sizes } from '../styles';
import { errorMessage, notify } from '../utils/notifications';

export default function TabBar() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const activePage = useEditorStore((s) => s.activePage);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const removeTab = useEditorStore((s) => s.removeTab);
  const addTab = useEditorStore((s) => s.addTab);
  const moveTab = useEditorStore((s) => s.moveTab);
  const setTabFilePath = useEditorStore((s) => s.setTabFilePath);
  const setTabFileName = useEditorStore((s) => s.setTabFileName);
  const setTabLanguage = useEditorStore((s) => s.setTabLanguage);
  const showTodoPage = useEditorStore((s) => s.showTodoPage);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const dropIndexRef = useRef<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });

  const updateScrollEdges = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const { scrollLeft, scrollWidth, clientWidth } = viewport;
    const left = scrollLeft > 1;
    const right = scrollWidth - clientWidth - scrollLeft > 1;
    setScrollEdges((edges) => edges.left === left && edges.right === right ? edges : { left, right });
  }, []);

  useLayoutEffect(() => {
    const rail = railRef.current;
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!rail || !viewport || !track) return;

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      // 视口上的横向手势交给系统，箭头上的横向手势也滚动同一排标签。
      if (event.deltaX && viewport.contains(event.target as Node)) return;

      const delta = event.deltaX || event.deltaY;
      if (!delta) return;

      const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? viewport.clientWidth : 1;
      const previousLeft = viewport.scrollLeft;
      viewport.scrollLeft += delta * scale;
      if (viewport.scrollLeft !== previousLeft) event.preventDefault();
    };

    const observer = new ResizeObserver(updateScrollEdges);
    observer.observe(viewport);
    observer.observe(track);
    rail.addEventListener('wheel', handleWheel, { passive: false });
    updateScrollEdges();
    return () => {
      observer.disconnect();
      rail.removeEventListener('wheel', handleWheel);
    };
  }, [updateScrollEdges]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const tab = activeTabRef.current;
    if (!viewport || !tab) return;

    const viewportBounds = viewport.getBoundingClientRect();
    const tabBounds = tab.getBoundingClientRect();
    // 为两侧箭头和渐变留出空间，窗口过窄时尽量显示完整标签。
    const edgeWidth = parseFloat(getComputedStyle(viewport).scrollPaddingLeft) || 0;
    const padding = Math.min(edgeWidth, Math.max(0, (viewportBounds.width - tabBounds.width) / 2));
    const leftGap = tabBounds.left - viewportBounds.left - padding;
    const rightGap = tabBounds.right - viewportBounds.right + padding;
    const offset = leftGap < -1 ? leftGap : Math.max(0, rightGap);
    if (Math.abs(offset) <= 1) return;

    viewport.scrollLeft += offset;
    updateScrollEdges();
  }, [activePage, activeTabId, updateScrollEdges]);

  const scrollTabs = (direction: 'left' | 'right') => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollBy({
      left: viewport.clientWidth * 0.7 * (direction === 'left' ? -1 : 1),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

  const handleDoubleClickBar = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('[data-tab], .tab-scroll-arrow')) return;
    addTab(blankTab(tabs));
  };

  const startEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const finishEdit = async () => {
    const id = editingId;
    const name = editName.trim();
    setEditingId(null);
    setEditName('');
    if (!id || !name) return;

    const tab = useEditorStore.getState().tabs.find((t) => t.id === id);
    if (!tab || name === tab.fileName) return;

    const lang = detectLanguage(name);

    // 已保存文件：同步重命名磁盘上的实际文件
    if (tab.filePath && isTauri()) {
      try {
        const newPath = await invoke<string>('rename_file_cmd', {
          path: tab.filePath,
          newName: name,
        });
        useEditorStore.getState().renameRecentFile(tab.filePath, newPath, name);
        setTabFilePath(id, newPath, name);
        setTabLanguage(id, lang, 'filename');
      } catch (err) {
        // 磁盘重命名失败（目标已存在、权限等）：保持原名，提示用户
        console.error('[rename] Failed:', err);
        notify(`重命名失败：${errorMessage(err)}`, 'error');
      }
      return;
    }

    // 未保存的新建 tab：磁盘上无文件，仅改显示名
    setTabFileName(id, name);
    setTabLanguage(id, lang, 'filename');
  };

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    dragIndexRef.current = index;
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    // 鼠标在 tab 左半边 → 插入到该 tab 前，右半边 → 插入到该 tab 后
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const newDrop = e.clientX > midX ? index + 1 : index;
    dropIndexRef.current = newDrop;
    setDropIndex(newDrop);
  }, []);

  const resetDrag = useCallback(() => {
    dragIndexRef.current = null;
    dropIndexRef.current = null;
    setDragIndex(null);
    setDropIndex(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const fromIndex = dragIndexRef.current;
    let toIndex = dropIndexRef.current;
    if (fromIndex !== null && toIndex !== null) {
      // 源位置在目标之前时，移除源位置后目标位置需要 -1
      if (toIndex > fromIndex) toIndex--;
      if (fromIndex !== toIndex) {
        moveTab(fromIndex, toIndex);
      }
    }
    resetDrag();
  }, [moveTab, resetDrag]);

  return (
    <div
      onDoubleClick={handleDoubleClickBar}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={handleDrop}
      onDragEnd={resetDrag}
      style={styles.root}
    >
      <button
        data-tab
        className={`todo-fixed-tab${activePage === 'todo' ? ' is-active' : ''}`}
        onClick={showTodoPage}
        title="Todo List"
        style={{
          ...styles.todoTab,
          color: activePage === 'todo' ? colors.accent : colors.textTertiary,
        }}
      >
        <span className="todo-fixed-tab-icon" aria-hidden="true">✓</span>
        <span>Todo</span>
      </button>
      <div ref={railRef} className="tab-scroll-rail" data-reordering={dragIndex !== null}>
        <div ref={viewportRef} className="tab-scroll-viewport" onScroll={updateScrollEdges}>
          <div ref={trackRef} className="tab-scroll-track">
            {tabs.length === 0 && activePage !== 'todo' && (
              <span style={styles.emptyLabel}>没有打开的文件</span>
            )}
            {tabs.map((tab, idx) => {
              // 蓝色插入指示线：dropIndex 是插入位置 (0 ~ tabs.length)
              const showBarLeft = dropIndex !== null && dropIndex === idx
                && dragIndex !== idx && dragIndex !== idx - 1;
              const showBarRight = dropIndex !== null && dropIndex === tabs.length
                && idx === tabs.length - 1
                && dragIndex !== tabs.length - 1 && dragIndex !== tabs.length;

              const isActive = activePage === 'editor' && tab.id === activeTabId;
              const nextIsActive = activePage === 'editor' && tabs[idx + 1]?.id === activeTabId;
              const separator = !isActive && !nextIsActive && idx < tabs.length - 1;

              return (
                <div
                  key={tab.id}
                  ref={isActive ? activeTabRef : null}
                  data-tab
                  className={`editor-tab${isActive ? ' is-active' : ''}`}
                  draggable={editingId !== tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  onDoubleClick={(e) => { e.stopPropagation(); startEdit(tab.id, tab.fileName); }}
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  style={{
                    ...styles.tab,
                    borderLeft: showBarLeft ? `2px solid ${colors.accent}` : 'none',
                    borderRight: showBarRight
                      ? `2px solid ${colors.accent}`
                      : separator
                        ? `1px solid ${colors.borderLight}`
                        : 'none',
                    opacity: dragIndex === idx ? 0.5 : 1,
                  }}
                >
                  {editingId === tab.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={finishEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') finishEdit();
                        if (e.key === 'Escape') { setEditingId(null); setEditName(''); }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      style={styles.editInput}
                      aria-label={`重命名 ${tab.fileName}`}
                    />
                  ) : (
                    <span style={styles.tabName} title={tab.fileName}>
                      {tab.isModified ? <span style={{ fontSize: 7, verticalAlign: 'middle', marginRight: 5, position: 'relative', top: -1 }}>●</span> : ''}
                      {tab.fileName}
                    </span>
                  )}
                  <button
                    className="tab-close-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (tab.isModified) {
                        window.dispatchEvent(new CustomEvent('mac-editor:close-tab', { detail: tab }));
                      } else {
                        removeTab(tab.id);
                      }
                    }}
                    style={styles.closeBtn}
                    aria-label={`关闭 ${tab.fileName}`}
                    title="关闭"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        {(['left', 'right'] as const).map((direction) => scrollEdges[direction] && (
          <div key={direction} className={`tab-scroll-edge tab-scroll-edge--${direction}`}>
            <button
              type="button"
              className="tab-scroll-arrow"
              aria-label={direction === 'left' ? '查看左侧标签' : '查看右侧标签'}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => scrollTabs(direction)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={direction === 'left' ? 'M9.5 4.5 6 8l3.5 3.5' : 'M6.5 4.5 10 8l-3.5 3.5'} />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function blankTab(tabs: Array<{ fileName: string }>) {
  return {
    filePath: null,
    fileName: getNextUntitledName(tabs),
    content: '',
    isModified: false,
    encoding: 'utf-8',
    language: 'txt',
    editorView: null,
  };
}

/* --- Styles --- */

const styles: Record<string, React.CSSProperties & { '--tab-bar-surface'?: string }> = {
  root: {
    '--tab-bar-surface': colors.surfaceAlt,
    height: sizes.tabBarHeight,
    flexShrink: 0,
    background: 'var(--tab-bar-surface)',
    borderBottom: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'stretch',
    cursor: 'pointer',
  },
  emptyLabel: {
    display: 'flex',
    alignItems: 'center',
    color: colors.textSecondary,
    fontSize: 13,
    padding: '0 14px',
    cursor: 'default',
  },
  todoTab: {
    flex: '0 0 auto',
    minWidth: 96,
    padding: '0 15px',
    border: 'none',
    borderRight: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  tab: {
    display: 'flex',
    flex: '0 0 auto',
    alignItems: 'center',
    padding: '0 12px',
    cursor: 'pointer',
    fontSize: 13,
    minWidth: 116,
    maxWidth: 220,
    // Chrome inactive tab: flat, blends into the strip
    border: 'none',
    position: 'relative',
  },
  // 非活跃 tab 之间的竖分隔线（用 ::after 伪元素不好做 inline style，
  // 这里用 borderRight 模拟 — 最后一个非活跃 tab 不显示 ）
  tabName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  editInput: {
    flex: 1,
    padding: '2px 4px',
    border: `1px solid ${colors.accent}`,
    borderRadius: 3,
    fontSize: 13,
    outline: 'none',
    background: colors.background,
    color: colors.text,
  },
  closeBtn: {
    marginLeft: 8,
    border: 'none',
    cursor: 'pointer',
    fontSize: 16,
    padding: '0 4px',
    lineHeight: 1,
  },
};
