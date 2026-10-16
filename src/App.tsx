/**
 * 根组件 — 整个编辑器的布局骨架。
 *
 * 从上到下：MenuBar → TabBar → 编辑器区域 → StatusBar
 * 额外覆盖层：拖拽提示、搜索面板、跳转行面板
 */
import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { useEditorStore } from './stores/editorStore';
import type { Tab } from './stores/editorStore';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import { useFileOperations } from './hooks/useFileOperations';
import MenuBar from './components/MenuBar';
import TabBar from './components/TabBar';
import StatusBar from './components/StatusBar';
import GotoLinePanel from './components/GotoLinePanel';
import CloseSaveDialog from './components/CloseSaveDialog';
import NotificationCenter from './components/NotificationCenter';
import { colors, flexCenter } from './styles';
import { errorMessage, notify } from './utils/notifications';
import { flushEditorSession } from './sessionPersistence';
import { detectLanguage } from './utils/detectLanguage';

// 重型编辑能力按需加载：空白欢迎页无需加载 CodeMirror、语言解析器和 Markdown。
const Editor = lazy(() => import('./components/Editor'));
const SearchPanel = lazy(() => import('./components/SearchPanel'));
const MarkdownPreview = lazy(() => import('./components/MarkdownPreview'));
const TodoPage = lazy(() => import('./components/TodoPage'));

function saveTabForClose(tab: Tab, filePath: string, encoding: string) {
  return invoke('save_file_cmd', {
    path: filePath,
    content: tab.content,
    encoding,
  });
}

function App() {
  const tabs = useEditorStore((state) => state.tabs);
  const activeTabId = useEditorStore((state) => state.activeTabId);
  const activePage = useEditorStore((state) => state.activePage);
  const previewMode = useEditorStore((s) => s.settings.previewMode);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
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

  // 与原生桌面编辑器一致：窗口标题始终反映当前页面、文件和修改状态。
  useEffect(() => {
    if (activePage === 'todo') {
      document.title = 'Todo — Mac Editor';
    } else if (activeTab) {
      document.title = `${activeTab.isModified ? '● ' : ''}${activeTab.fileName} — Mac Editor`;
    } else {
      document.title = 'Mac Editor';
    }
  }, [activePage, activeTab?.fileName, activeTab?.isModified]);

  // 关闭窗口前检查未保存的 tab
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    getCurrentWindow().onCloseRequested(async (event) => {
      if (closingRef.current) return; // 自身触发的 close，放行

      const unsaved = useEditorStore.getState().tabs.filter(
        (t) => t.isModified && (t.filePath || t.content.trim().length > 0)
      );
      if (unsaved.length === 0) {
        event.preventDefault();
        try {
          await flushEditorSession();
        } catch {
          // 持久化层已提示错误；干净文件仍可从磁盘重新打开，不阻塞退出。
        }
        closingRef.current = true;
        await getCurrentWindow().close();
        return;
      }

      event.preventDefault();
      setCloseQueue(unsaved);
      setCloseIndex(0);
    }).then((fn) => {
      // cleanup 可能早于 promise resolve（StrictMode 双挂载），此时立即解绑
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => { cancelled = true; unlisten?.(); };
  }, []);

  // 浏览器刷新/系统终止 webview 时尽力提交最后一份待写快照。
  useEffect(() => {
    const flush = () => { void flushEditorSession().catch(() => {}); };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
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
    try {
      if (pendingCloseTab.filePath) {
        await saveTabForClose(pendingCloseTab, pendingCloseTab.filePath, pendingCloseTab.encoding);
      } else {
        const filePath = await save({ defaultPath: pendingCloseTab.fileName });
        if (!filePath) {
          return; // 用户取消了另存为对话框，不关闭 tab
        }
        await saveTabForClose(pendingCloseTab, filePath, 'UTF-8');
      }
    } catch (error) {
      console.error('[close-save] Failed to save:', error);
      notify(`保存失败：${errorMessage(error)}`, 'error');
      return;
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
    try {
      if (tab.filePath) {
        await saveTabForClose(tab, tab.filePath, tab.encoding);
        useEditorStore.getState().setTabModified(tab.id, false);
      } else {
        const filePath = await save({ defaultPath: tab.fileName });
        if (!filePath) {
          return; // 用户取消了另存为对话框，不关闭 tab，不继续
        }
        await saveTabForClose(tab, filePath, 'UTF-8');
        const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || tab.fileName;
        const store = useEditorStore.getState();
        store.setTabFilePath(tab.id, filePath, fileName);
        store.setTabLanguage(tab.id, detectLanguage(fileName));
        store.setTabEncoding(tab.id, 'UTF-8');
        store.setTabModified(tab.id, false);
        store.addRecentFile(filePath, fileName);
      }
    } catch (error) {
      console.error('[close-save] Failed to save:', error);
      notify(`保存失败：${errorMessage(error)}`, 'error');
      return;
    }
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

  const advanceOrClose = useCallback(async () => {
    if (!closeQueue) return;
    const next = closeIndex + 1;
    if (next >= closeQueue.length) {
      setCloseQueue(null);
      setCloseIndex(0);
      try {
        await flushEditorSession();
      } catch {
        // 持久化层已提示错误；不让恢复数据故障锁死应用退出。
      }
      closingRef.current = true;
      await getCurrentWindow().close();
    } else {
      setCloseIndex(next);
    }
  }, [closeQueue, closeIndex]);

  // 监听打开搜索面板的事件
  useEffect(() => {
    const handler = () => {
      if (useEditorStore.getState().activeTabId) setShowSearch(true);
    };
    window.addEventListener('mac-editor:open-search', handler);
    return () => window.removeEventListener('mac-editor:open-search', handler);
  }, []);

  // 监听跳转到行面板事件（⌘G / 工具栏按钮）
  useEffect(() => {
    const handler = () => {
      if (useEditorStore.getState().activeTabId) setShowGotoLine(true);
    };
    window.addEventListener('mac-editor:open-goto-line', handler);
    return () => window.removeEventListener('mac-editor:open-goto-line', handler);
  }, []);

  const currentCloseTab = closeQueue ? closeQueue[closeIndex] : null;

  return (
    <div className="app-shell" style={styles.root}>
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
        {tabs.length > 0 && (
          /* Todo/full preview 模式只隐藏编辑器，保持 CodeMirror 实例与光标/滚动状态。 */
          <div
            style={{
              ...styles.editorPane,
              display:
                activePage === 'todo'
                || (activeTab?.language === 'markdown' && previewMode === 'full')
                  ? 'none'
                  : undefined,
            }}
          >
            <Suspense fallback={<WorkspaceLoading label="正在准备编辑器…" />}>
              <EditorTabs tabs={tabs} activeTabId={activeTabId} />
            </Suspense>
          </div>
        )}
        {activePage === 'todo' ? (
          <Suspense fallback={<WorkspaceLoading label="正在加载待办事项…" />}>
            <TodoPage />
          </Suspense>
        ) : tabs.length === 0 ? (
          <WelcomeScreen />
        ) : (
          <>
            {activeTab?.language === 'markdown' && previewMode !== 'code' && (
              <Suspense fallback={<WorkspaceLoading label="正在准备预览…" compact />}>
                <MarkdownPreview content={activeTab.content} filePath={activeTab.filePath} />
              </Suspense>
            )}
          </>
        )}
      </div>
      {activePage === 'editor' && activeTab && <StatusBar />}
      {/* 按需渲染搜索和跳转面板 */}
      <Suspense fallback={null}>
        {showSearch && <SearchPanel onClose={() => setShowSearch(false)} />}
      </Suspense>
      {showGotoLine && <GotoLinePanel onClose={() => setShowGotoLine(false)} />}
      <NotificationCenter />
    </div>
  );
}

function WorkspaceLoading({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div className={`workspace-loading${compact ? ' is-compact' : ''}`} role="status">
      <span className="workspace-loading-spinner" aria-hidden="true" />
      <span>{label}</span>
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
  const { newFile, openFile, openFileAtPath } = useFileOperations();
  const allRecentFiles = useEditorStore((s) => s.recentFiles);
  const recentFiles = allRecentFiles.slice(0, 5);

  return (
    <div className="welcome-screen" style={{ ...flexCenter, flex: 1 }}>
      <div className="welcome-card">
        <div className="welcome-brand" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none">
            <rect x="8" y="5" width="32" height="38" rx="8" fill="currentColor" opacity=".12" />
            <path d="M16 15h16M16 22h12M16 29h8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            <path d="m28 34 8-8 3 3-8 8-4 1 1-4Z" fill="currentColor" />
          </svg>
        </div>
        <div className="welcome-copy">
          <div className="welcome-eyebrow">MAC EDITOR</div>
          <h1>从一个好想法开始</h1>
          <p>轻量、专注，随时打开文件开始编辑。</p>
        </div>

        <div className="welcome-actions">
          <button className="welcome-action welcome-action-primary" onClick={newFile}>
            <span>新建文件</span><kbd>⌘N</kbd>
          </button>
          <button className="welcome-action" onClick={openFile}>
            <span>打开文件</span><kbd>⌘O</kbd>
          </button>
        </div>

        {recentFiles.length > 0 && (
          <div className="welcome-recents">
            <div className="welcome-section-title">最近打开</div>
            {recentFiles.map((file) => (
              <button
                key={file.filePath}
                className="welcome-recent-item"
                onClick={() => openFileAtPath(file.filePath)}
                title={file.filePath}
              >
                <span className="welcome-file-icon" aria-hidden="true" />
                <span className="welcome-file-copy">
                  <strong>{file.fileName}</strong>
                  <small>{file.filePath}</small>
                </span>
                <span aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        )}

        <div className="welcome-tip">
          <span>提示</span> 也可以把文件直接拖到窗口中打开
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
  editorPane: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    position: 'relative',
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
