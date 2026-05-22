/**
 * 关闭前保存确认对话框 — 仿 Excel 的三按钮样式。
 * 保存 / 不保存 / 取消
 */
import { useEffect, useRef } from 'react';
import { colors } from '../styles';

interface Props {
  fileName: string;
  onSave: () => void;
  onSkip: () => void;
  onCancel: () => void;
}

export default function CloseSaveDialog({ fileName, onSave, onSkip, onCancel }: Props) {
  const saveBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // 自动聚焦保存按钮
    setTimeout(() => saveBtnRef.current?.focus(), 50);
  }, []);

  return (
    <div style={styles.overlay}>
      <div style={styles.box}>
        <div style={styles.message}>
          是否保存对 "{fileName}" 的更改？
        </div>
        <div style={styles.hint}>
          如果不保存，将丢失对此文件的所有更改。
        </div>
        <div style={styles.buttons}>
          <button ref={saveBtnRef} onClick={onSave} style={styles.btnSave}>
            保存
          </button>
          <button onClick={onSkip} style={styles.btnSkip}>
            不保存
          </button>
          <button onClick={onCancel} style={styles.btnCancel}>
            取消
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
    background: 'rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5000,
  },
  box: {
    background: '#fff',
    borderRadius: 8,
    padding: '24px 28px 20px',
    minWidth: 420,
    maxWidth: 480,
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  },
  message: {
    fontSize: 14,
    fontWeight: 600,
    color: colors.text,
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  buttons: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
  },
  btnSave: {
    padding: '6px 18px',
    border: 'none',
    borderRadius: 5,
    background: colors.accent,
    color: '#fff',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 500,
  },
  btnSkip: {
    padding: '6px 18px',
    border: `1px solid ${colors.border}`,
    borderRadius: 5,
    background: '#fff',
    color: colors.text,
    fontSize: 13,
    cursor: 'pointer',
  },
  btnCancel: {
    padding: '6px 18px',
    border: `1px solid ${colors.border}`,
    borderRadius: 5,
    background: '#fff',
    color: colors.text,
    fontSize: 13,
    cursor: 'pointer',
  },
};
