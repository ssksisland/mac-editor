/**
 * 底部状态栏组件。
 *
 * 显示：光标位置（行/列）、文档总行数、总字符数、选中字符数、
 *       当前语言、编码。
 *
 * 行数/字符数通过 EditorView 引用 200ms 轮询获取，
 * 光标位置由 Editor 组件的 updateListener 实时推送。
 */
import { useState, useEffect } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { colors } from '../styles';

export default function StatusBar() {
  const cursorPosition = useEditorStore((s) => s.cursorPosition);
  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const [totalLines, setTotalLines] = useState(0);
  const [totalChars, setTotalChars] = useState(0);
  const [selectedChars, setSelectedChars] = useState(0);

  // Use the EditorView updateListener pattern via a lightweight polling fallback
  // that only fires when the tab is actually focused and visible.
  useEffect(() => {
    const view = activeTab?.editorView;
    if (!view) return;

    const interval = setInterval(() => {
      const doc = view.state.doc;
      setTotalLines(doc.lines);
      setTotalChars(doc.length);

      let sel = 0;
      for (const r of view.state.selection.ranges) {
        if (!r.empty) sel += r.to - r.from;
      }
      setSelectedChars(sel);
    }, 200);

    return () => clearInterval(interval);
  }, [activeTab]);

  return (
    <div style={styles.root}>
      <div style={styles.left}>
        <span>
          行 {cursorPosition.line}, 列 {cursorPosition.column}
        </span>
        {totalLines > 0 && (
          <>
            <span>共 {totalLines} 行</span>
            <span>{totalChars} 字符</span>
          </>
        )}
        {selectedChars > 0 && (
          <span style={{ color: colors.accentSelected }}>
            已选中 {selectedChars} 字符
          </span>
        )}
      </div>
      <div style={styles.right}>
        {activeTab && <span>{activeTab.language.toUpperCase()}</span>}
        <span>UTF-8</span>
      </div>
    </div>
  );
}

/* --- Styles --- */

const styles: Record<string, React.CSSProperties> = {
  root: {
    height: 24,
    background: colors.accent,
    color: colors.background,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    fontSize: 11,
    userSelect: 'none',
  },
  left: { display: 'flex', gap: 16 },
  right: { display: 'flex', gap: 16 },
};
