/**
 * 标签栏组件。
 *
 * 功能：
 * - 渲染所有 tab 标签页，高亮当前活跃 tab
 * - 双击 tab 可重命名文件名（同时自动检测新语言）
 * - 双击空白区域新建空白 tab
 * - 每个 tab 有关闭按钮，修改过的 tab 名称前显示 ● 标记
 */
import { useState, useCallback, useRef } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { detectLanguage } from '../utils/detectLanguage';
import { getNextUntitledName } from '../hooks/useFileOperations';
import { colors } from '../styles';

export default function TabBar() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const removeTab = useEditorStore((s) => s.removeTab);
  const addTab = useEditorStore((s) => s.addTab);
  const moveTab = useEditorStore((s) => s.moveTab);
  const setTabFilePath = useEditorStore((s) => s.setTabFilePath);
  const setTabLanguage = useEditorStore((s) => s.setTabLanguage);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const dropIndexRef = useRef<number | null>(null);

  const handleDoubleClickBar = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-tab]')) return;
    addTab(blankTab(tabs));
  };

  const startEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const finishEdit = () => {
    if (editingId && editName.trim()) {
      const name = editName.trim();
      const lang = detectLanguage(name);
      setTabFilePath(editingId, '', name);
      setTabLanguage(editingId, lang);
    }
    setEditingId(null);
    setEditName('');
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

  if (tabs.length === 0) {
    return (
      <div onDoubleClick={handleDoubleClickBar} style={styles.empty}>
        没有打开的文件
      </div>
    );
  }

  return (
    <div
      onDoubleClick={handleDoubleClickBar}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={handleDrop}
      onDragEnd={resetDrag}
      style={styles.root}
    >
      {tabs.map((tab, idx) => {
        // 蓝色插入指示线：dropIndex 是插入位置 (0 ~ tabs.length)
        const showBarLeft = dropIndex !== null && dropIndex === idx
          && dragIndex !== idx && dragIndex !== idx - 1;
        const showBarRight = dropIndex !== null && dropIndex === tabs.length
          && idx === tabs.length - 1
          && dragIndex !== tabs.length - 1 && dragIndex !== tabs.length;

        const isActive = tab.id === activeTabId;
        const nextIsActive = tabs[idx + 1]?.id === activeTabId;
        const separator = !isActive && !nextIsActive && idx < tabs.length - 1;

        return (
        <div
          key={tab.id}
          data-tab
          draggable
          onClick={() => setActiveTab(tab.id)}
          onDoubleClick={(e) => { e.stopPropagation(); startEdit(tab.id, tab.fileName); }}
          onDragStart={(e) => handleDragStart(e, idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          style={{
            ...styles.tab,
            background: isActive ? colors.background : 'transparent',
            color: isActive ? colors.text : colors.textSecondary,
            borderRadius: isActive ? '7px 7px 0 0' : 0,
            boxShadow: isActive
              ? '0 -1px 2px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)'
              : 'none',
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
            />
          ) : (
            <span style={styles.tabName} title={tab.fileName}>
              {tab.isModified ? <span style={{ fontSize: 7, verticalAlign: 'middle', marginRight: 5, position: 'relative', top: -1 }}>●</span> : ''}
              {tab.fileName}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (tab.isModified) {
                window.dispatchEvent(new CustomEvent('mac-editor:close-tab', { detail: tab }));
              } else {
                removeTab(tab.id);
              }
            }}
            style={styles.closeBtn}
          >
            ×
          </button>
        </div>
      );})}
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

const styles: Record<string, React.CSSProperties> = {
  root: {
    height: 38,
    background: '#e8e8ea',
    borderBottom: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'stretch',
    overflowX: 'auto',
    cursor: 'pointer',
  },
  empty: {
    height: 38,
    background: colors.surfaceAlt,
    borderBottom: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: colors.textSecondary,
    fontSize: 13,
    cursor: 'pointer',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    cursor: 'pointer',
    fontSize: 13,
    minWidth: 100,
    maxWidth: 200,
    // Chrome inactive tab: flat, blends into the strip
    border: 'none',
    borderRadius: 0,
    position: 'relative',
  },
  // 非活跃 tab 之间的竖分隔线（用 ::after 伪元素不好做 inline style，
  // 这里用 borderRight 模拟 — 最后一个非活跃 tab 不显示 ）
  tabName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: colors.text,
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
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 16,
    color: colors.textSecondary,
    padding: '0 4px',
    lineHeight: 1,
  },
};
