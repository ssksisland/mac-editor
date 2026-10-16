/**
 * 共享样式常量和工具函数。
 *
 * 集中定义颜色、尺寸、通用布局样式，
 * 避免各组件中重复硬编码魔法值。
 */
export const colors = {
  background: '#fff',
  surface: '#f8f9fb',
  surfaceAlt: '#eef1f5',
  border: '#d9dde5',
  borderLight: '#e3e6eb',
  text: '#1f2328',
  textSecondary: '#7b8492',
  textTertiary: '#5c6470',
  accent: '#2878f0',
  accentLight: '#34c759',
  accentWarning: '#ff9500',
  accentSelected: '#ffd60a',
};

export const sizes = {
  menuBarHeight: 42,
  tabBarHeight: 40,
  statusBarHeight: 24,
  borderRadius: 6,
  padding: 12,
};

export const flexCenter: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export const menuButton: React.CSSProperties = {
  padding: '6px 9px',
  cursor: 'pointer',
  fontSize: '13px',
  color: colors.text,
};

export const select: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: sizes.borderRadius,
  padding: '2px 6px',
  fontSize: '12px',
};

export function panelStyle(
  position: React.CSSProperties = {}
): React.CSSProperties {
  return {
    position: 'absolute',
    background: colors.background,
    border: `1px solid ${colors.border}`,
    borderRadius: sizes.borderRadius,
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    padding: sizes.padding,
    zIndex: 1000,
    ...position,
  };
}
