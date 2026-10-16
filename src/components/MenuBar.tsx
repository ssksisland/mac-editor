/**
 * 顶部工具栏组件。
 * 提供文件操作（新建/打开/保存）、最近文件列表、
 * 自动换行/不可见字符/列编辑切换、字体大小和语言选择。
 */
import { useState, useEffect, useCallback } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { useFileOperations } from '../hooks/useFileOperations';
import { colors, menuButton, select } from '../styles';

/** 支持的语言列表 */
const LANGUAGES = [
  { value: 'txt', label: 'Plain Text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'shell', label: 'Shell' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
  { value: 'php', label: 'PHP' },
  { value: 'rust', label: 'Rust' },
  { value: 'go', label: 'Go' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'perl', label: 'Perl' },
  { value: 'sql', label: 'SQL' },
  { value: 'xml', label: 'XML' },
  { value: 'yaml', label: 'YAML' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'csharp', label: 'C#' },
  { value: 'dart', label: 'Dart' },
  { value: 'r', label: 'R' },
  { value: 'lua', label: 'Lua' },
  { value: 'toml', label: 'TOML' },
  { value: 'nginx', label: 'Nginx' },
];

/**
 * MenuBar 组件
 *
 * 左侧：新建文件、打开文件（含最近文件子菜单）、保存文件
 * 中间：自动换行切换、不可见字符切换、列编辑按钮
 * 右侧：字体大小下拉、语言选择下拉
 */
export default function MenuBar() {
  // 解构文件操作 hook
  const { newFile, openFile, openFileAtPath, saveFile, activeTab } = useFileOperations();
  // 最近打开的文件列表
  const recentFiles = useEditorStore((s) => s.recentFiles);
  const clearRecentFiles = useEditorStore((s) => s.clearRecentFiles);
  // 当前编辑器设置
  const settings = useEditorStore((s) => s.settings);
  const activePage = useEditorStore((s) => s.activePage);
  // 更新设置的 action
  const updateSettings = useEditorStore((s) => s.updateSettings);
  // 修改当前 tab 语言的 action
  const setTabLanguage = useEditorStore((s) => s.setTabLanguage);

  // 控制最近文件菜单的展开/收起
  const [showRecent, setShowRecent] = useState(false);
  const editorEnabled = activePage === 'editor' && Boolean(activeTab);

  const toggleRecent = useCallback(() => {
    setShowRecent((prev) => !prev);
  }, []);

  // 点击外部区域时关闭最近文件菜单
  useEffect(() => {
    if (!showRecent) return;
    const handler = () => setShowRecent(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showRecent]);

  // 语言选择变更时，更新当前活跃 tab 的语言设置
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (activeTab) setTabLanguage(activeTab.id, e.target.value);
  };

  return (
    <div className="menu-bar" style={styles.root}>
      {/* 新建文件按钮 (⌘N) */}
      <button className="toolbar-button" style={menuButton} onClick={newFile} title="新建 (⌘N)" aria-label="新建文件">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ verticalAlign: 'middle' }}>
          <rect x="3" y="1.5" width="10" height="13" rx="1" />
          <line x1="8" y1="5" x2="8" y2="11" />
          <line x1="5" y1="8" x2="11" y2="8" />
        </svg>
      </button>

      {/* 打开文件 + 最近文件子菜单 */}
      <div style={{ position: 'relative' }}>
        <button className="toolbar-button" style={menuButton} onClick={(e) => { e.stopPropagation(); toggleRecent(); }} title="打开 (⌘O)" aria-label="打开文件">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
            <path d="M1.5 4.5 L6 4.5 L7.5 2.5 L14.5 2.5 C14.78 2.5 15 2.72 15 3 L15 13.5 C15 13.78 14.78 14 14.5 14 L1.5 14 C1.22 14 1 13.78 1 13.5 L1 5 C1 4.72 1.22 4.5 1.5 4.5 Z" />
          </svg>
        </button>
        {showRecent && (
          <div className="recent-menu" style={styles.recentMenu} onClick={(e) => e.stopPropagation()}>
            <button
              className="recent-menu-item"
              style={{ ...styles.recentItem, color: colors.accent, fontWeight: 600 }}
              onClick={(e) => {
                e.stopPropagation();
                setShowRecent(false);
                void openFile();
              }}
            >
              浏览文件...
            </button>
            {recentFiles.length > 0 ? (
              <>
                <div style={styles.recentDivider} />
                <div style={styles.recentHeader}>
                  <span>最近打开</span>
                  <button
                    className="recent-clear-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearRecentFiles();
                    }}
                  >
                    清除
                  </button>
                </div>
                {recentFiles.slice(0, 10).map((f) => (
                  <button
                    key={f.filePath}
                    className="recent-menu-item"
                    style={styles.recentItem}
                    onClick={(e) => { e.stopPropagation(); openFileAtPath(f.filePath); setShowRecent(false); }}
                    title={f.filePath}
                  >
                    <span style={styles.recentFileName}>{f.fileName}</span>
                    <span style={styles.recentFilePath}>{f.filePath}</span>
                  </button>
                ))}
              </>
            ) : (
              <div className="recent-menu-empty">暂无最近文件</div>
            )}
          </div>
        )}
      </div>

      {/* 保存文件按钮 (⌘S) */}
      <button className="toolbar-button" style={menuButton} onClick={saveFile} title="保存 (⌘S)" aria-label="保存文件" disabled={!editorEnabled}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
          <path d="M13.5 14.5 L13.5 3.5 C13.5 2.95 13.05 2.5 12.5 2.5 L3.5 2.5 C2.95 2.5 2.5 2.95 2.5 3.5 L2.5 12.5 C2.5 13.05 2.95 13.5 3.5 13.5 L12.5 13.5 C13.05 13.5 13.5 13.05 13.5 12.5 Z" />
          <rect x="5.5" y="2.5" width="5" height="4" />
          <rect x="4.5" y="9.5" width="7" height="5" />
        </svg>
      </button>

      <div style={styles.separator} />

      {/* 自动换行切换按钮 — 点击切换 wordWrap 设置 */}
      <button
        className="toolbar-button"
        style={{
          ...menuButton,
          color: settings.wordWrap ? colors.accent : colors.text,
          fontWeight: settings.wordWrap ? 700 : 400,
        }}
        onClick={() => updateSettings({ wordWrap: !settings.wordWrap })}
        title="自动换行"
        aria-pressed={settings.wordWrap}
        disabled={!editorEnabled}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ verticalAlign: 'middle' }}>
          <line x1="2" y1="4" x2="14" y2="4" />
          <line x1="2" y1="7" x2="10" y2="7" />
          <line x1="2" y1="10" x2="12" y2="10" />
          <line x1="2" y1="13" x2="8" y2="13" />
          {settings.wordWrap && (
            <>
              <path d="M10 7 L12 7 L12 10" />
              <polyline points="10.5,9 12,10 13.5,9" strokeWidth="1" />
            </>
          )}
        </svg>
      </button>

      {/* 显示/隐藏不可见字符（空格、Tab、换行符） */}
      <button
        className="toolbar-button"
        style={{
          ...menuButton,
          color: settings.showInvisibleChars ? colors.accent : colors.text,
          fontWeight: settings.showInvisibleChars ? 700 : 400,
        }}
        onClick={() => updateSettings({ showInvisibleChars: !settings.showInvisibleChars })}
        title="显示不可见字符"
        aria-pressed={settings.showInvisibleChars}
        disabled={!editorEnabled}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
          <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="8" cy="12" r="1" fill="currentColor" stroke="none" />
          <path d="M8 3v9M8 3c1.5 0 3 1 3 2.5S9.5 8 8 8" />
        </svg>
      </button>

      {/* 列编辑按钮 — 调用 window.__macEditor.selectColumn() 在所有行同一列添加光标 */}
      <button
        className="toolbar-button"
        tabIndex={-1}
        style={menuButton}
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => {
          const editor = (window as any).__macEditor;
          if (editor) {
            editor.selectColumn();
          }
        }}
        title="列编辑 — 在所有行同一列添加光标 (⌘⇧I)"
        disabled={!editorEnabled}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ verticalAlign: 'middle' }}>
          <line x1="4" y1="2" x2="4" y2="14" />
          <line x1="8" y1="2" x2="8" y2="14" />
          <line x1="12" y1="2" x2="12" y2="14" />
        </svg>
      </button>

      {/* 按行去重按钮 — 调用 window.__macEditor.deduplicateLines() */}
      <button
        className="toolbar-button"
        tabIndex={-1}
        style={menuButton}
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => {
          const editor = (window as any).__macEditor;
          if (editor) {
            editor.deduplicateLines();
          }
        }}
        title="按行去重 — 选中行内去重，无选区则全文去重 (⌘⇧D)"
        disabled={!editorEnabled}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
          <line x1="2" y1="3" x2="14" y2="3" />
          <line x1="2" y1="7" x2="10" y2="7" />
          <line x1="2" y1="11" x2="12" y2="11" />
          <path d="M12 7l2 0l0 4" />
          <polyline points="11,9.5 12,11 13.5,9.5" strokeWidth="1" />
        </svg>
      </button>

      <div style={styles.separator} />

      <button
        className="toolbar-button"
        style={menuButton}
        onClick={() => window.dispatchEvent(new CustomEvent('mac-editor:open-search'))}
        title="查找与替换 (⌘F)"
        aria-label="查找与替换"
        disabled={!editorEnabled}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3 3" />
        </svg>
      </button>

      <button
        className="toolbar-button"
        style={menuButton}
        onClick={() => window.dispatchEvent(new CustomEvent('mac-editor:open-goto-line'))}
        title="跳转到行 (⌘G)"
        aria-label="跳转到行"
        disabled={!editorEnabled}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 4h7M2.5 8h5M2.5 12h7" />
          <path d="m10 8 3 2.5-3 2.5" />
        </svg>
      </button>

      {/* Markdown 预览按钮 — 仅在当前 tab 为 Markdown 时显示。
          单按钮循环三态，用图标左右半颜色表达：
          code=全默认色 / split=右半蓝 / full=全蓝 */}
      {editorEnabled && activeTab?.language === 'markdown' && (
        <>
          <div style={styles.separator} />
          {(() => {
            const mode = settings.previewMode;
            const next =
              mode === 'code' ? 'split' : mode === 'split' ? 'full' : 'code';
            // 左半：仅 full 时蓝；右半：split 或 full 时蓝
            const leftColor = mode === 'full' ? colors.accent : colors.text;
            const rightColor = mode === 'split' || mode === 'full' ? colors.accent : colors.text;
            const title =
              mode === 'code'
                ? 'Markdown 预览：纯代码（点击切换分屏）'
                : mode === 'split'
                  ? 'Markdown 预览：分屏（点击切换全屏预览）'
                  : 'Markdown 预览：全屏预览（点击切回纯代码）';
            return (
              <button
                className="toolbar-button"
                style={menuButton}
                onClick={() => updateSettings({ previewMode: next })}
                title={title}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
                  <defs>
                    <clipPath id="eye-left"><rect x="0" y="0" width="8" height="16" /></clipPath>
                    <clipPath id="eye-right"><rect x="8" y="0" width="8" height="16" /></clipPath>
                  </defs>
                  {/* 左半图标 */}
                  <g clipPath="url(#eye-left)" stroke={leftColor}>
                    <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
                    <circle cx="8" cy="8" r="2.5" />
                  </g>
                  {/* 右半图标 */}
                  <g clipPath="url(#eye-right)" stroke={rightColor}>
                    <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
                    <circle cx="8" cy="8" r="2.5" />
                  </g>
                </svg>
              </button>
            );
          })()}
        </>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* 语言选择下拉 */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <select
          value={activeTab?.language || 'txt'}
          onChange={handleLanguageChange}
          style={select}
          title="语言"
          aria-label="语法语言"
          disabled={!editorEnabled}
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

/* --- Styles --- */

const styles: Record<string, React.CSSProperties> = {
  root: {
    height: 42,
    background: colors.surface,
    borderBottom: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    padding: '0 10px',
    gap: 3,
    fontSize: 13,
  },
  separator: { width: 1, height: 20, background: colors.border, margin: '0 5px' },
  recentMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    background: colors.background,
    border: `1px solid ${colors.border}`,
    borderRadius: 9,
    boxShadow: '0 12px 32px rgba(31,35,40,0.16)',
    padding: '6px',
    zIndex: 1000,
    minWidth: 280,
  },
  recentHeader: {
    padding: '3px 7px 5px',
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: 700,
    letterSpacing: 0.4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentDivider: {
    height: 1,
    background: colors.border,
    margin: '4px 0',
  },
  recentItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    width: '100%',
    padding: '8px 10px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 12.5,
    color: colors.text,
    textAlign: 'left',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  recentFileName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    color: colors.text,
    fontWeight: 550,
  },
  recentFilePath: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    color: colors.textSecondary,
    fontSize: 10,
  },
};
