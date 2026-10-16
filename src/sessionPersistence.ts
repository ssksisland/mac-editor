import { invoke, isTauri } from '@tauri-apps/api/core';
import { errorMessage, notify } from './utils/notifications';

const BROWSER_STORAGE_KEY = 'mac-editor-session-v1';
const IDLE_SAVE_DELAY_MS = 250;
const MAX_SAVE_DELAY_MS = 2_000;

export interface PersistedTab {
  id: string;
  filePath: string | null;
  fileName: string;
  content: string;
  isModified: boolean;
  encoding: string;
  language: string;
}

export interface EditorSessionSnapshot {
  tabs: PersistedTab[];
  activeTabId: string | null;
  activePage: 'editor' | 'todo';
}

let pendingSnapshot: EditorSessionSnapshot | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let maxTimer: ReturnType<typeof setTimeout> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let hasReportedSaveError = false;

function isPersistedTab(value: unknown): value is PersistedTab {
  if (!value || typeof value !== 'object') return false;
  const tab = value as Record<string, unknown>;
  return typeof tab.id === 'string'
    && tab.id.trim().length > 0
    && (tab.filePath === null || typeof tab.filePath === 'string')
    && typeof tab.fileName === 'string'
    && typeof tab.content === 'string'
    && typeof tab.isModified === 'boolean'
    && typeof tab.encoding === 'string'
    && typeof tab.language === 'string';
}

function parseSession(value: unknown): EditorSessionSnapshot {
  if (!value || typeof value !== 'object') throw new Error('会话数据格式无效');
  const session = value as Record<string, unknown>;
  if (!Array.isArray(session.tabs) || !session.tabs.every(isPersistedTab)) {
    throw new Error('会话标签页数据格式无效');
  }
  if (session.activePage !== 'editor' && session.activePage !== 'todo') {
    throw new Error('会话页面状态无效');
  }
  if (session.activeTabId !== null && typeof session.activeTabId !== 'string') {
    throw new Error('会话活跃标签状态无效');
  }

  const ids = new Set(session.tabs.map((tab) => tab.id));
  if (ids.size !== session.tabs.length) throw new Error('会话包含重复的标签页');
  if (session.tabs.length === 0 && session.activeTabId !== null) {
    throw new Error('空会话不能包含活跃标签页');
  }
  if (session.tabs.length > 0 && !ids.has(session.activeTabId as string)) {
    throw new Error('会话的活跃标签页不存在');
  }

  return {
    tabs: session.tabs,
    activeTabId: session.activeTabId as string | null,
    activePage: session.activePage,
  };
}

async function writeSnapshot(snapshot: EditorSessionSnapshot): Promise<void> {
  if (isTauri()) {
    await invoke('save_editor_session_cmd', { session: snapshot });
    return;
  }
  localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(snapshot));
}

function reportSaveError(error: unknown) {
  console.error('[session] Failed to save editor session:', error);
  if (!hasReportedSaveError) {
    hasReportedSaveError = true;
    notify(`无法保存恢复数据：${errorMessage(error)}`, 'error');
  }
}

function enqueueWrite(snapshot: EditorSessionSnapshot): Promise<void> {
  const operation = writeQueue.then(() => writeSnapshot(snapshot));
  writeQueue = operation.then(
    () => { hasReportedSaveError = false; },
    (error) => { reportSaveError(error); },
  );
  return operation;
}

function clearTimers() {
  if (idleTimer !== null) clearTimeout(idleTimer);
  if (maxTimer !== null) clearTimeout(maxTimer);
  idleTimer = null;
  maxTimer = null;
}

/**
 * 延迟保存最新快照：停止操作后快速落盘；连续输入时也会周期性落盘，
 * 避免只有停止输入后才拥有可恢复的数据。
 */
export function scheduleEditorSessionSave(snapshot: EditorSessionSnapshot) {
  pendingSnapshot = snapshot;

  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    void flushEditorSession().catch(() => {});
  }, IDLE_SAVE_DELAY_MS);

  if (maxTimer === null) {
    maxTimer = setTimeout(() => {
      void flushEditorSession().catch(() => {});
    }, MAX_SAVE_DELAY_MS);
  }
}

/** 立即将当前待写快照排入串行队列，防止旧写入覆盖新状态。 */
export function flushEditorSession(): Promise<void> {
  clearTimers();
  const snapshot = pendingSnapshot;
  pendingSnapshot = null;
  return snapshot ? enqueueWrite(snapshot) : writeQueue;
}

/** 启动时读取上次会话；没有保存过会话时返回 null。 */
export async function loadEditorSession(): Promise<EditorSessionSnapshot | null> {
  if (isTauri()) {
    const session = await invoke<unknown | null>('load_editor_session_cmd');
    return session === null ? null : parseSession(session);
  }

  const raw = localStorage.getItem(BROWSER_STORAGE_KEY);
  return raw === null ? null : parseSession(JSON.parse(raw));
}
