/**
 * 根组件 — 整个编辑器的布局骨架。
 *
 * 从上到下：MenuBar → TabBar → 编辑器区域 → StatusBar
 * 额外覆盖层：拖拽提示、搜索面板、跳转行面板
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useEditorStore } from './stores/editorStore';
import type { Tab } from './stores/editorStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import MenuBar from './components/MenuBar';
import TabBar from './components/TabBar';
import Editor from './components/Editor';
import StatusBar from './components/StatusBar';
import SearchPanel from './components/SearchPanel';
import GotoLinePanel from './components/GotoLinePanel';
import CloseSaveDialog from './components/CloseSaveDialog';
import { colors, flexCenter } from './styles';

function App() {
  const tabs = useEditorStore((state) => state.tabs);
  const activeTabId = useEditorStore((state) => state.activeTabId);
  const [showSearch, setShowSearch] = useState(false);
  const [showGotoLine, setShowGotoLine] = useState(false);

  // 关闭确认流程状态
  const [closeQueue, setCloseQueue] = useState<Tab[] | null>(null);
  const [closeIndex, setCloseIndex] = useState(0);
  const closingRef = useRef(false);
  const closeQueueRef = useRef<Tab[] | null>(null); // 供事件回调中读取最新值

  // 单个 tab 关闭确认
  const [pendingCloseTab, setPendingCloseTab] = useState<Tab | null>(null);

  useKeyboardShortcuts();
  const { isDragOver } = useDragAndDrop();

  // 关闭窗口前检查未保存的 tab
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    getCurrentWindow().onCloseRequested((event) => {
      if (closingRef.current) return; // 自身触发的 close，放行

      const unsaved = useEditorStore.getState().tabs.filter(
        (t) => t.isModified && (t.filePath || t.content.trim().length > 0)
      );
      if (unsaved.length === 0) {
        closingRef.current = true;
        getCurrentWindow().close();
        return;
      }

      event.preventDefault();
      setCloseQueue(unsaved);
      setCloseIndex(0);
    }).then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, []);

  // 同步 closeQueue 到 ref，供事件回调读取最新值
  useEffect(() => { closeQueueRef.current = closeQueue; }, [closeQueue]);

  // 监听单个 tab 关闭请求（来自 TabBar 的 × 按钮或 Cmd+W）
  useEffect(() => {
    const handler = (e: Event) => {
      // 批量关闭流程进行中时不响应单个关闭请求，避免两个对话框叠加
      if (closeQueueRef.current) return;
      setPendingCloseTab((e as CustomEvent).detail);
    };
    window.addEventListener('mac-editor:close-tab', handler);
    return () => window.removeEventListener('mac-editor:close-tab', handler);
  }, []);

  // 保存当前正在询问的单个 tab 并关闭
  const handleSaveSingle = useCallback(async () => {
    if (!pendingCloseTab) return;
    if (pendingCloseTab.filePath) {
      try { await writeTextFile(pendingCloseTab.filePath, pendingCloseTab.content); } catch { /* skip */ }
    } else {
      const filePath = await save({ defaultPath: pendingCloseTab.fileName });
      if (filePath) {
        try { await writeTextFile(filePath, pendingCloseTab.content); } catch { /* skip */ }
      } else {
        return; // 用户取消了另存为对话框，不关闭 tab
      }
    }
    useEditorStore.getState().removeTab(pendingCloseTab.id);
    setPendingCloseTab(null);
  }, [pendingCloseTab]);

  // 不保存单个 tab，直接关闭
  const handleSkipSingle = useCallback(() => {
    if (!pendingCloseTab) return;
    useEditorStore.getState().removeTab(pendingCloseTab.id);
    setPendingCloseTab(null);
  }, [pendingCloseTab]);

  // 取消单个 tab 关闭
  const handleCancelSingle = useCallback(() => {
    setPendingCloseTab(null);
  }, []);
  const handleSaveCurrent = useCallback(async () => {
    if (!closeQueue) return;
    const tab = closeQueue[closeIndex];
    if (tab.filePath) {
      try { await writeTextFile(tab.filePath, tab.content); } catch { /* skip */ }
    } else {
      const filePath = await save({ defaultPath: tab.fileName });
      if (filePath) {
        try { await writeTextFile(filePath, tab.content); } catch { /* skip */ }
      } else {
        return; // 用户取消了另存为对话框，不关闭 tab，不继续
      }
    }
    useEditorStore.getState().removeTab(tab.id);
    advanceOrClose();
  }, [closeQueue, closeIndex]);

  // 不保存当前文件，关闭该 tab 后继续下一个
  const handleSkipCurrent = useCallback(() => {
    if (!closeQueue) return;
    useEditorStore.getState().removeTab(closeQueue[closeIndex].id);
    advanceOrClose();
  }, [closeQueue, closeIndex]);

  // 取消：放弃关闭
  const handleCancelClose = useCallback(() => {
    setCloseQueue(null);
    setCloseIndex(0);
  }, []);

  const advanceOrClose = useCallback(() => {
    if (!closeQueue) return;
    const next = closeIndex + 1;
    if (next >= closeQueue.length) {
      setCloseQueue(null);
      setCloseIndex(0);
      closingRef.current = true;
      getCurrentWindow().close();
    } else {
      setCloseIndex(next);
    }
  }, [closeQueue, closeIndex]);

  // 监听打开搜索面板的事件
  useEffect(() => {
    const handler = () => setShowSearch(true);
    window.addEventListener('mac-editor:open-search', handler);
    return () => window.removeEventListener('mac-editor:open-search', handler);
  }, []);

  const currentCloseTab = closeQueue ? closeQueue[closeIndex] : null;

  return (
    <div style={styles.root}>
      {isDragOver && <DropOverlay />}
      {currentCloseTab && (
        <CloseSaveDialog
          fileName={currentCloseTab.filePath || currentCloseTab.fileName}
          onSave={handleSaveCurrent}
          onSkip={handleSkipCurrent}
          onCancel={handleCancelClose}
        />
      )}
      {pendingCloseTab && (
        <CloseSaveDialog
          fileName={pendingCloseTab.filePath || pendingCloseTab.fileName}
          onSave={handleSaveSingle}
          onSkip={handleSkipSingle}
          onCancel={handleCancelSingle}
        />
      )}
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
