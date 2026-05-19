/**
 * 根组件 — 整个编辑器的布局骨架。
 *
 * 从上到下：MenuBar → TabBar → 编辑器区域 → StatusBar
 * 额外覆盖层：拖拽提示、搜索面板、跳转行面板
 */
import { useState, useEffect } from 'react';
import { useEditorStore } from './stores/editorStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import MenuBar from './components/MenuBar';
import TabBar from './components/TabBar';
import Editor from './components/Editor';
import StatusBar from './components/StatusBar';
import SearchPanel from './components/SearchPanel';
import GotoLinePanel from './components/GotoLinePanel';
import { colors, flexCenter } from './styles';

function App() {
  // 从 store 获取 tabs 列表和当前活跃的 tab ID
  const tabs = useEditorStore((state) => state.tabs);
  const activeTabId = useEditorStore((state) => state.activeTabId);
  // 控制搜索面板和跳转行面板的显隐
  const [showSearch, setShowSearch] = useState(false);
  const [showGotoLine, setShowGotoLine] = useState(false);

  // 注册全局键盘快捷键
  useKeyboardShortcuts();
  // 注册文件拖拽处理，isDragOver 用于显示覆盖层
  const { isDragOver } = useDragAndDrop();

  // 监听打开搜索面板的事件
  useEffect(() => {
    const handler = () => setShowSearch(true);
    window.addEventListener('mac-editor:open-search', handler);
    return () => window.removeEventListener('mac-editor:open-search', handler);
  }, []);

  return (
    <div style={styles.root}>
      {/* 拖拽覆盖层 — 用户拖文件进窗口时显示 */}
      {isDragOver && <DropOverlay />}
      <MenuBar />
      <TabBar />
      <div style={styles.content}>
        {/* 没有打开文件时显示欢迎界面 */}
        {tabs.length === 0 ? <WelcomeScreen /> : <EditorTabs tabs={tabs} activeTabId={activeTabId} />}
      </div>
      <StatusBar />
      {/* 按需渲染搜索和跳转面板 */}
      {showSearch && <SearchPanel onClose={() => setShowSearch(false)} />}
      {showGotoLine && <GotoLinePanel onClose={() => setShowGotoLine(false)} />}
    </div>
  );
}

/* --- 内联子组件 --- */

/** 文件拖入窗口时的蓝色虚线覆盖层 */
function DropOverlay() {
  return (
    <div style={styles.dropOverlay}>
      <div style={styles.dropBox}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📂</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: colors.text }}>释放以打开文件</div>
      </div>
    </div>
  );
}

/** 欢迎界面 — 无打开文件时居中显示 */
function WelcomeScreen() {
  return (
    <div style={{ ...flexCenter, flex: 1 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
        <div>欢迎使用 Mac Editor</div>
        <div style={{ fontSize: 12, marginTop: 8, color: colors.textSecondary }}>
          点击「新建」或「打开」开始编辑
        </div>
      </div>
    </div>
  );
}

/**
 * 编辑器 tabs 渲染。
 * 每个 tab 对应一个 Editor 实例，非活跃的通过 visibility:hidden 隐藏（不卸载，保持状态）。
 */
function EditorTabs({
  tabs,
  activeTabId,
}: {
  tabs: Array<{ id: string; content: string; language: string }>;
  activeTabId: string | null;
}) {
  return (
    <>
      {tabs.map((tab) => (
        <Editor
          key={tab.id}
          tabId={tab.id}
          isActive={tab.id === activeTabId}
          initialContent={tab.content}
          language={tab.language}
        />
      ))}
    </>
  );
}

/* --- Styles --- */

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
    position: 'relative',
  },
  content: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  dropOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,122,255,0.08)',
    border: '3px dashed #007aff',
    zIndex: 3000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  dropBox: {
    background: colors.background,
    borderRadius: 12,
    padding: '32px 48px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
    textAlign: 'center',
  },
};

export default App;
