/**
 * 底部状态栏组件。
 *
 * 显示：光标位置（行/列）、文档总行数、总字符数、选中字符数、
 *       当前语言、编码。
 *
 * 直接读取活跃 EditorView 的文档和选区状态；文档或光标变化会通过
 * Zustand 订阅触发渲染，不需要常驻轮询。
 */
import { useEditorStore } from '../stores/editorStore';
import { colors } from '../styles';

export default function StatusBar() {
  const cursorPosition = useEditorStore((s) => s.cursorPosition);
  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const view = activeTab?.editorView;
  const totalLines = view?.state.doc.lines ?? (activeTab ? 1 : 0);
  const totalChars = view?.state.doc.length ?? activeTab?.content.length ?? 0;
  const selectedChars = view
    ? view.state.selection.ranges.reduce(
        (total, range) => total + (range.empty ? 0 : range.to - range.from),
        0,
      )
    : 0;

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
        <span>{(activeTab?.encoding ?? 'UTF-8').toUpperCase()}</span>
      </div>
    </div>
  );
}

/* --- Styles --- */

const styles: Record<string, React.CSSProperties> = {
  root: {
    height: 24,
    background: '#1f2937',
    color: colors.background,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 14px',
    fontSize: 11,
    userSelect: 'none',
  },
  left: { display: 'flex', gap: 14, opacity: 0.9 },
  right: { display: 'flex', gap: 14, opacity: 0.9 },
};
