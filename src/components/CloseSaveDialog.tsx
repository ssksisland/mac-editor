/**
 * 关闭前保存确认对话框 — 仿 Excel 的三按钮样式。
 * 保存 / 不保存 / 取消
 */
import { useEffect, useRef, useState } from 'react';
import { colors } from '../styles';

interface Props {
  fileName: string;
  onSave: () => void | Promise<void>;
  onSkip: () => void;
  onCancel: () => void;
}

export default function CloseSaveDialog({ fileName, onSave, onSkip, onCancel }: Props) {
  const saveBtnRef = useRef<HTMLButtonElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const normalizedPath = fileName.replace(/\\/g, '/');
  const displayName = normalizedPath.split('/').pop() || fileName;
  const hasPath = normalizedPath !== displayName;

  useEffect(() => {
    // 自动聚焦保存按钮
    const t = setTimeout(() => saveBtnRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) onCancel();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isSaving, onCancel]);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSave();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="close-save-overlay" style={styles.overlay}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="close-save-message" style={styles.box}>
        <div style={styles.content}>
          <div style={styles.icon} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" style={{ width: 24, height: 24 }}>
              <path d="M6 3.5h8l4 4V20.5H6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M14 3.5v4h4M9 12h6M9 15.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <div style={styles.copy}>
            <div id="close-save-message" style={styles.message}>
              是否保存对“{displayName}”的更改？
            </div>
            {hasPath && <div style={styles.path} title={fileName}>{fileName}</div>}
            <div style={styles.hint}>
              如果不保存，将丢失对此文件的所有更改。
            </div>
          </div>
        </div>
        <div style={styles.buttons}>
          <button onClick={onCancel} style={styles.btnCancel} disabled={isSaving}>
            取消
          </button>
          <button onClick={onSkip} style={styles.btnSkip} disabled={isSaving}>
            不保存
          </button>
          <button ref={saveBtnRef} onClick={() => void handleSave()} style={styles.btnSave} disabled={isSaving}>
            {isSaving ? '正在保存…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(24,32,48,0.28)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5000,
  },
  box: {
    background: '#fff',
    border: `1px solid ${colors.border}`,
    borderRadius: 13,
    padding: '22px 24px 18px',
    width: 'min(460px, calc(100vw - 40px))',
    boxShadow: '0 20px 54px rgba(24,32,48,0.22)',
  },
  content: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 14,
  },
  icon: {
    flex: '0 0 auto',
    width: 42,
    height: 42,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 11,
    background: '#eaf2ff',
    color: colors.accent,
  },
  copy: {
    minWidth: 0,
    flex: 1,
  },
  path: {
    marginTop: 3,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: colors.textSecondary,
    fontSize: 10,
  },
  message: {
    fontSize: 14,
    fontWeight: 600,
    color: colors.text,
    lineHeight: 1.45,
  },
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
  },
  buttons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 20,
  },
  btnSave: {
    minWidth: 80,
    padding: '7px 16px',
    border: 'none',
    borderRadius: 7,
    background: colors.accent,
    color: '#fff',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 600,
  },
  btnSkip: {
    minWidth: 80,
    padding: '7px 16px',
    border: `1px solid ${colors.border}`,
    borderRadius: 7,
    background: '#fff',
    color: colors.text,
    fontSize: 13,
    cursor: 'pointer',
  },
  btnCancel: {
    minWidth: 80,
    padding: '7px 16px',
    border: `1px solid ${colors.border}`,
    borderRadius: 7,
    background: '#fff',
    color: colors.text,
    fontSize: 13,
    cursor: 'pointer',
  },
};
