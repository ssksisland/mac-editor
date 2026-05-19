/**
 * 跳转到指定行号面板。
 *
 * 居中弹出输入框，输入行号后通过 CodeMirror API
 * 定位到对应行首并滚动到视口中央。
 */
import { useState, useEffect, useRef } from 'react';
import { useEditorStore } from '../stores/editorStore';
import { panelStyle, colors } from '../styles';

interface GotoLinePanelProps {
  onClose: () => void;
}

export default function GotoLinePanel({ onClose }: GotoLinePanelProps) {
  const [lineStr, setLineStr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const activeTab = useEditorStore((s) => s.tabs.find((t) => t.id === s.activeTabId));

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleGoto = () => {
    const view = activeTab?.editorView;
    if (!view) return;

    const lineNum = parseInt(lineStr, 10);
    if (isNaN(lineNum)) return;

    const totalLines = view.state.doc.lines;
    const target = Math.max(1, Math.min(lineNum, totalLines));
    const line = view.state.doc.line(target);

    view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
    onClose();
  };

  const totalLines = activeTab?.editorView?.state.doc.lines || 0;

  return (
    <div
      style={{
        ...panelStyle(),
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        width: 320,
        zIndex: 2000,
      }}
    >
      <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600 }}>跳转到指定行</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          ref={inputRef}
          type="number"
          min={1}
          max={totalLines}
          placeholder={`行号 (1-${totalLines})`}
          value={lineStr}
          onChange={(e) => setLineStr(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleGoto(); } }}
          style={{
            flex: 1,
            padding: '8px 10px',
            border: `1px solid ${colors.border}`,
            borderRadius: 6,
            fontSize: 13,
            outline: 'none',
          }}
        />
        <button
          onClick={handleGoto}
          style={{
            padding: '8px 16px',
            border: 'none',
            borderRadius: 6,
            background: colors.accent,
            color: '#fff',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          跳转
        </button>
      </div>
    </div>
  );
}
