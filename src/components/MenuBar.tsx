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
  { value: 'txt', label: '纯文本' },
  { value: 'javascript', label: 'JavaScript / JSX' },
  { value: 'typescript', label: 'TypeScript / TSX' },
  { value: 'python', label: 'Python' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS / SCSS / SASS' },
  { value: 'json', label: 'JSON' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'shell', label: 'Shell / Bash / Zsh' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
  { value: 'php', label: 'PHP' },
  { value: 'rust', label: 'Rust' },
  { value: 'go', label: 'Go' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'perl', label: 'Perl' },
  { value: 'sql', label: 'SQL' },
  { value: 'xml', label: 'XML / SVG' },
  { value: 'yaml', label: 'YAML' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'csharp', label: 'C#' },
  { value: 'dart', label: 'Dart' },
  { value: 'r', label: 'R' },
  { value: 'lua', label: 'Lua' },
  { value: 'toml', label: 'TOML / INI / Conf' },
  { value: 'nginx', label: 'Nginx' },
];

const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 22, 24];

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
  // 当前编辑器设置
  const settings = useEditorStore((s) => s.settings);
  // 更新设置的 action
  const updateSettings = useEditorStore((s) => s.updateSettings);
  // 修改当前 tab 语言的 action
  const setTabLanguage = useEditorStore((s) => s.setTabLanguage);

  // 控制最近文件菜单的展开/收起
  const [showRecent, setShowRecent] = useState(false);

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
    <div style={styles.root}>
      {/* 新建文件按钮 (⌘N) */}
      <button style={menuButton} onClick={newFile} title="新建 (⌘N)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ verticalAlign: 'middle' }}>
          <rect x="3" y="1.5" width="10" height="13" rx="1" />
          <line x1="8" y1="5" x2="8" y2="11" />
          <line x1="5" y1="8" x2="11" y2="8" />
        </svg>
      </button>

      {/* 打开文件 + 最近文件子菜单 */}
      <div style={{ position: 'relative' }}>
        <button style={menuButton} onClick={(e) => { e.stopPropagation(); toggleRecent(); }} title="打开 (⌘O)">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
            <path d="M1.5 4.5 L6 4.5 L7.5 2.5 L14.5 2.5 C14.78 2.5 15 2.72 15 3 L15 13.5 C15 13.78 14.78 14 14.5 14 L1.5 14 C1.22 14 1 13.78 1 13.5 L1 5 C1 4.72 1.22 4.5 1.5 4.5 Z" />
          </svg>
        </button>
        {showRecent && (
          <div style={styles.recentMenu} onClick={(e) => e.stopPropagation()}>
            <button
              style={{ ...styles.recentItem, color: colors.accent, fontWeight: 500 }}
              onClick={(e) => { e.stopPropagation(); openFile(); }}
            >
              浏览文件...
            </button>
            {recentFiles.length > 0 && (
              <>
                <div style={styles.recentDivider} />
                {recentFiles.slice(0, 10).map((f) => (
                  <button
                    key={f.filePath}
                    style={styles.recentItem}
                    onClick={(e) => { e.stopPropagation(); openFileAtPath(f.filePath); setShowRecent(false); }}
                    title={f.filePath}
                  >
                    {f.fileName}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* 保存文件按钮 (⌘S) */}
      <button style={menuButton} onClick={saveFile} title="保存 (⌘S)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
          <path d="M13.5 14.5 L13.5 3.5 C13.5 2.95 13.05 2.5 12.5 2.5 L3.5 2.5 C2.95 2.5 2.5 2.95 2.5 3.5 L2.5 12.5 C2.5 13.05 2.95 13.5 3.5 13.5 L12.5 13.5 C13.05 13.5 13.5 13.05 13.5 12.5 Z" />
          <rect x="5.5" y="2.5" width="5" height="4" />
          <rect x="4.5" y="9.5" width="7" height="5" />
        </svg>
      </button>

      <div style={styles.separator} />

      {/* 自动换行切换按钮 — 点击切换 wordWrap 设置 */}
      <button
        style={{
          ...menuButton,
          color: settings.wordWrap ? colors.accent : colors.text,
          fontWeight: settings.wordWrap ? 700 : 400,
        }}
        onClick={() => updateSettings({ wordWrap: !settings.wordWrap })}
        title="自动换行"
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
        style={{
          ...menuButton,
          color: settings.showInvisibleChars ? colors.accent : colors.text,
          fontWeight: settings.showInvisibleChars ? 700 : 400,
        }}
        onClick={() => updateSettings({ showInvisibleChars: !settings.showInvisibleChars })}
        title="显示不可见字符"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
          <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="8" cy="12" r="1" fill="currentColor" stroke="none" />
          <path d="M8 3v9M8 3c1.5 0 3 1 3 2.5S9.5 8 8 8" />
        </svg>
      </button>

      {/* 列编辑按钮 — 调用 window.__macEditor.selectColumn() 在所有行同一列添加光标 */}
      <button
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
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ verticalAlign: 'middle' }}>
          <line x1="4" y1="2" x2="4" y2="14" />
          <line x1="8" y1="2" x2="8" y2="14" />
          <line x1="12" y1="2" x2="12" y2="14" />
        </svg>
      </button>

      {/* Spacer pushes language + font to the right */}
      <div style={{ flex: 1 }} />

      {/* 字体大小下拉选择 — 直接更新 store 中的 fontSize */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" style={{ verticalAlign: 'middle', color: colors.textSecondary }}>
          <text x="1" y="12" fontSize="11" fill="currentColor" stroke="none" fontFamily="system-ui">T</text>
        </svg>
        <select
          value={settings.fontSize}
          onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
          style={select}
          title="字体大小"
        >
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>{s}px</option>
          ))}
        </select>
      </div>

      {/* 语言选择下拉 — 切换当前 tab 的语法高亮 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" style={{ verticalAlign: 'middle', color: colors.textSecondary }}>
          <text x="0" y="12" fontSize="11" fill="currentColor" stroke="none" fontFamily="system-ui">文</text>
        </svg>
        <select
          value={activeTab?.language || 'txt'}
          onChange={handleLanguageChange}
          style={select}
          title="语言"
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
    height: 32,
    background: colors.surface,
    borderBottom: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    padding: '0 8px',
    gap: 4,
    fontSize: 13,
  },
  separator: { width: 1, height: 20, background: colors.border, margin: '0 4px' },
  recentMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    background: colors.background,
    border: `1px solid ${colors.border}`,
    borderRadius: 6,
    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
    padding: '4px 0',
    zIndex: 1000,
    minWidth: 260,
  },
  recentHeader: {
    padding: '4px 12px',
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: 600,
  },
  recentDivider: {
    height: 1,
    background: colors.border,
    margin: '4px 0',
  },
  recentItem: {
    display: 'block',
    width: '100%',
    padding: '6px 12px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    color: colors.text,
    textAlign: 'left',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};
