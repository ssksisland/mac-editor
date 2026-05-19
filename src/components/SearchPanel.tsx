/**
 * 搜索和替换面板组件。
 *
 * 功能：
 * - 搜索（支持正则、区分大小写、转义序列 \n\t\r 等）
 * - 上一个/下一个匹配导航（Enter / Shift+Enter）
 * - 替换当前匹配 / 全部替换
 * - 标记所有匹配项（高亮显示）
 *
 * 通过 buildRegex 安全构建正则，通过 findAllMatches 遍历所有匹配位置，
 * 通过 highlightEffect 将匹配区域传递给 CodeMirror 高亮插件。
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { highlightEffect } from '../searchHighlight';
import { panelStyle, colors } from '../styles';

interface SearchPanelProps {
  onClose: () => void;
}

/**
 * 将用户输入中的转义序列转换为实际字符。
 * 支持：\n \t \r \b \f \v \\
 */
function parseEscapeSequences(s: string): string {
  return s
    .replace(/\\r\\n/g, '\r\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\v/g, '\v')
    .replace(/\\\\/g, '\\');
}

export default function SearchPanel({ onClose }: SearchPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [isMarked, setIsMarked] = useState(false);

  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, []);

  /* Build regex safely. */
  const buildRegex = useCallback((): RegExp | null => {
    if (!searchTerm) return null;
    try {
      let pattern: string;
      if (useRegex) {
        pattern = searchTerm;
      } else {
        // Parse escape sequences first, then escape regex special chars
        const parsed = parseEscapeSequences(searchTerm);
        pattern = parsed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      return new RegExp(pattern, caseSensitive ? 'g' : 'gi');
    } catch {
      return null;
    }
  }, [searchTerm, caseSensitive, useRegex]);

  /* Find all matches and optionally highlight. */
  const findAllMatches = useCallback((): Array<{ from: number; to: number }> => {
    const view = activeTab?.editorView;
    if (!view || !searchTerm) {
      setMatchCount(0);
      return [];
    }
    const regex = buildRegex();
    if (!regex) { setMatchCount(0); return []; }

    const content = view.state.doc.toString();
    const matches: Array<{ from: number; to: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      matches.push({ from: m.index, to: m.index + m[0].length });
    }
    setMatchCount(matches.length);
    return matches;
  }, [activeTab, searchTerm, buildRegex]);

  /* Re-highlight when search params change. */
  useEffect(() => {
    const matches = findAllMatches();
    const view = activeTab?.editorView;
    if (!view) return;
    view.dispatch({
      effects: highlightEffect.of(isMarked && matches.length > 0 ? { matches } : null),
    });
  }, [searchTerm, caseSensitive, useRegex, isMarked, findAllMatches, activeTab]);

  /* Find next / previous match. */
  const findNext = useCallback(() => {
    const view = activeTab?.editorView;
    if (!view || !searchTerm) return;
    const regex = buildRegex();
    if (!regex) return;

    const content = view.state.doc.toString();
    const currentPos = view.state.selection.main.head;

    // Search forward from current position
    regex.lastIndex = currentPos;
    let m = regex.exec(content);

    // Wrap around if not found
    if (!m) {
      regex.lastIndex = 0;
      m = regex.exec(content);
    }
    if (m) {
      view.dispatch({
        selection: { anchor: m.index, head: m.index + m[0].length },
        scrollIntoView: true,
      });
    }
  }, [activeTab, searchTerm, buildRegex]);

  const findPrev = useCallback(() => {
    const view = activeTab?.editorView;
    if (!view || !searchTerm) return;
    const regex = buildRegex();
    if (!regex) return;

    const content = view.state.doc.toString();
    const currentPos = view.state.selection.main.from;

    // Find last match before current position
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    let last: RegExpExecArray | null = null;
    while ((m = regex.exec(content)) !== null) {
      if (m.index < currentPos) last = m;
      else break;
    }

    // Wrap to last match if none found
    if (!last) {
      regex.lastIndex = 0;
      while ((m = regex.exec(content)) !== null) last = m;
    }
    if (last) {
      view.dispatch({
        selection: { anchor: last.index, head: last.index + last[0].length },
        scrollIntoView: true,
      });
    }
  }, [activeTab, searchTerm, buildRegex]);

  /* Replace current selection if it matches. */
  const handleReplace = useCallback(() => {
    const view = activeTab?.editorView;
    if (!view || !searchTerm) return;
    const regex = buildRegex();
    if (!regex) return;

    const state = view.state;
    const selected = state.sliceDoc(state.selection.main.from, state.selection.main.to);
    if (regex.test(selected)) {
      view.dispatch({
        changes: { from: state.selection.main.from, to: state.selection.main.to, insert: parseEscapeSequences(replaceTerm) },
      });
    }
    // Move to next match
    setTimeout(findNext, 50);
  }, [activeTab, searchTerm, replaceTerm, buildRegex, findNext]);

  /* Replace all occurrences. */
  const handleReplaceAll = useCallback(() => {
    const view = activeTab?.editorView;
    if (!view || !searchTerm) return;
    const regex = buildRegex();
    if (!regex) return;

    const content = view.state.doc.toString();
    const newContent = content.replace(regex, parseEscapeSequences(replaceTerm));
    view.dispatch({ changes: { from: 0, to: content.length, insert: newContent } });
    findAllMatches();
  }, [activeTab, searchTerm, replaceTerm, buildRegex, findAllMatches]);

  /* Toggle marking (highlighting) all matches. */
  const handleMark = useCallback(() => {
    const view = activeTab?.editorView;
    if (!view) return;

    if (isMarked) {
      view.dispatch({ effects: highlightEffect.of(null) });
      setIsMarked(false);
    } else {
      const matches = findAllMatches();
      if (matches.length > 0) {
        view.dispatch({ effects: highlightEffect.of({ matches }) });
        setIsMarked(true);
      }
    }
  }, [activeTab, isMarked, findAllMatches]);

  /* Keyboard: Enter = next, Shift+Enter = prev. */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.shiftKey ? findPrev() : findNext();
    }
  };

  /* Cleanup highlights on unmount. */
  useEffect(() => {
    return () => {
      activeTab?.editorView?.dispatch({ effects: highlightEffect.of(null) });
    };
  }, [activeTab]);

  return (
    <div style={panelStyle({ top: 70, right: 20, width: 340 })}>
      <div style={styles.header}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>搜索和替换</h3>
        <button onClick={onClose} style={styles.closeBtn}>×</button>
      </div>

      {/* Search row */}
      <div style={styles.row}>
        <input
          ref={searchInputRef}
          type="text"
          placeholder="搜索... (支持 \\n \\t \\r \\r\\n)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          style={styles.input}
        />
        <button onClick={findPrev} style={styles.navBtn} title="上一个 (Shift+Enter)">↑</button>
        <button onClick={findNext} style={styles.navBtn} title="下一个 (Enter)">↓</button>
      </div>

      {/* Replace row */}
      <div style={styles.row}>
        <input
          type="text"
          placeholder="替换为... (支持 \\n \\t \\r \\r\\n)"
          value={replaceTerm}
          onChange={(e) => setReplaceTerm(e.target.value)}
          style={styles.input}
        />
        <button onClick={handleReplace} style={styles.primaryBtn}>替换</button>
      </div>

      {/* Match count */}
      {searchTerm && (
        <div style={styles.matchCount}>
          {matchCount > 0 ? `找到 ${matchCount} 个匹配项` : '无匹配项'}
        </div>
      )}

      {/* Options */}
      <div style={styles.options}>
        <label style={styles.checkbox}>
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
          区分大小写
        </label>
        <label style={styles.checkbox}>
          <input type="checkbox" checked={useRegex} onChange={(e) => setUseRegex(e.target.checked)} />
          正则表达式
        </label>
      </div>

      {/* Actions */}
      <div style={styles.row}>
        <button
          onClick={handleMark}
          style={{
            ...styles.actionBtn,
            borderColor: isMarked ? colors.accentLight : colors.accentWarning,
            background: isMarked ? colors.accentLight : colors.accentWarning,
          }}
        >
          {isMarked ? '清除标记' : '标记所有'}
        </button>
        <button onClick={handleReplaceAll} style={{ ...styles.actionBtn, flex: 1, background: colors.accent, borderColor: colors.accent }}>
          全部替换
        </button>
      </div>
    </div>
  );
}

/* --- Styles --- */

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#999', padding: '0 4px' },
  row: { display: 'flex', gap: 6, marginBottom: 8 },
  input: { flex: 1, padding: '8px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, outline: 'none' },
  navBtn: { padding: '6px 12px', border: '1px solid #ddd', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 14 },
  primaryBtn: { padding: '6px 12px', border: `1px solid ${colors.accent}`, borderRadius: 6, background: colors.accent, color: '#fff', cursor: 'pointer', fontSize: 12 },
  matchCount: { marginBottom: 10, fontSize: 12, color: '#666' },
  options: { display: 'flex', gap: 16, marginBottom: 10 },
  checkbox: { fontSize: 12, cursor: 'pointer' },
  actionBtn: { padding: '8px 16px', border: `1px solid ${colors.accent}`, borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 12 },
};
