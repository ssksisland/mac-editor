/**
 * 共享样式常量和工具函数。
 *
 * 集中定义颜色、尺寸、通用布局样式，
 * 避免各组件中重复硬编码魔法值。
 */
export const colors = {
  background: '#fff',
  surface: '#fafafa',
  surfaceAlt: '#f5f5f5',
  border: '#ddd',
  borderLight: '#e0e0e0',
  text: '#333',
  textSecondary: '#999',
  textTertiary: '#666',
  accent: '#007aff',
  accentLight: '#34c759',
  accentWarning: '#ff9500',
  accentSelected: '#ffd60a',
};

export const sizes = {
  menuBarHeight: 32,
  tabBarHeight: 38,
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
  background: 'transparent',
  border: 'none',
  padding: '6px 12px',
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
