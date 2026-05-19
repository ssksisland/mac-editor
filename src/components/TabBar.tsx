/**
 * 标签栏组件。
 *
 * 功能：
 * - 渲染所有 tab 标签页，高亮当前活跃 tab
 * - 双击 tab 可重命名文件名（同时自动检测新语言）
 * - 双击空白区域新建空白 tab
 * - 每个 tab 有关闭按钮，修改过的 tab 名称前显示 ● 标记
 */
import { useState } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { detectLanguage } from '../utils/detectLanguage';
import { colors } from '../styles';

export default function TabBar() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const removeTab = useEditorStore((s) => s.removeTab);
  const addTab = useEditorStore((s) => s.addTab);
  const setTabFilePath = useEditorStore((s) => s.setTabFilePath);
  const setTabLanguage = useEditorStore((s) => s.setTabLanguage);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleDoubleClickBar = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-tab]')) return;
    addTab(blankTab());
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

  if (tabs.length === 0) {
    return (
      <div onDoubleClick={handleDoubleClickBar} style={styles.empty}>
        没有打开的文件
      </div>
    );
  }

  return (
    <div onDoubleClick={handleDoubleClickBar} style={styles.root}>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          data-tab
          onClick={() => setActiveTab(tab.id)}
          onDoubleClick={(e) => { e.stopPropagation(); startEdit(tab.id, tab.fileName); }}
          style={{
            ...styles.tab,
            background: tab.id === activeTabId ? colors.background : 'transparent',
            borderBottom: tab.id === activeTabId ? `2px solid ${colors.accent}` : '2px solid transparent',
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
              {tab.isModified ? '● ' : ''}
              {tab.fileName}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }}
            style={styles.closeBtn}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function blankTab() {
  return {
    filePath: null,
    fileName: '未命名',
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
    background: colors.surfaceAlt,
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
    minWidth: 120,
    maxWidth: 200,
    borderRight: `1px solid ${colors.borderLight}`,
  },
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
