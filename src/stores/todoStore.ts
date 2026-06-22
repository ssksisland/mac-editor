import { invoke, isTauri } from '@tauri-apps/api/core';
import { create } from 'zustand';

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'completed';
  createdAt: number;
  completedAt: number | null;
}

interface TodoState {
  todos: TodoItem[];
  initialized: boolean;
  initializing: boolean;
  loadError: string | null;
  persistenceError: string | null;
  initialize: () => Promise<void>;
  retryPersistence: () => void;
  addTodo: (content: string) => void;
  updateTodo: (id: string, content: string) => void;
  completeTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
}

const LEGACY_STORAGE_KEY = 'mac-editor-todos';
let writeQueue: Promise<void> = Promise.resolve();

function isTodoItem(value: unknown): value is TodoItem {
  if (!value || typeof value !== 'object') return false;
  const todo = value as Partial<TodoItem>;
  return typeof todo.id === 'string'
    && typeof todo.content === 'string'
    && (todo.status === 'pending' || todo.status === 'completed')
    && typeof todo.createdAt === 'number'
    && (todo.completedAt === null || typeof todo.completedAt === 'number');
}

function loadLegacyTodos(): TodoItem[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) ?? '[]');
    if (Array.isArray(value)) return value.filter(isTodoItem);
  } catch {
    // Invalid legacy data is ignored; the disk copy remains authoritative.
  }
  return [];
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function persistInBrowser(todos: TodoItem[]) {
  localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(todos));
}

function queueTodoWrite(todos: TodoItem[]) {
  if (!isTauri()) {
    try {
      persistInBrowser(todos);
      useTodoStore.setState({ persistenceError: null });
    } catch (error) {
      useTodoStore.setState({ persistenceError: errorMessage(error) });
    }
    return;
  }

  // Serialize writes so a slower, older request can never overwrite newer state.
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(() => invoke<void>('save_todos_cmd', { todos }));
  void writeQueue.then(
    () => useTodoStore.setState({ persistenceError: null }),
    (error) => useTodoStore.setState({ persistenceError: errorMessage(error) }),
  );
}

function createId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `todo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useTodoStore = create<TodoState>((set, get) => ({
  todos: [],
  initialized: false,
  initializing: false,
  loadError: null,
  persistenceError: null,

  initialize: async () => {
    if (get().initialized || get().initializing) return;
    set({ initializing: true, loadError: null });

    try {
      const legacyTodos = loadLegacyTodos();
      if (!isTauri()) {
        set({ todos: legacyTodos, initialized: true, initializing: false });
        return;
      }

      const diskTodos = await invoke<TodoItem[]>('load_todos_cmd');
      const shouldMigrate = diskTodos.length === 0 && legacyTodos.length > 0;
      const todos = shouldMigrate ? legacyTodos : diskTodos;

      if (shouldMigrate) {
        await invoke<void>('save_todos_cmd', { todos });
      }
      // Only remove legacy data after disk loading and any required migration succeed.
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      set({
        todos,
        initialized: true,
        initializing: false,
        loadError: null,
        persistenceError: null,
      });
    } catch (error) {
      set({
        initialized: false,
        initializing: false,
        loadError: errorMessage(error),
      });
    }
  },

  retryPersistence: () => queueTodoWrite(get().todos),

  addTodo: (content) => {
    const trimmed = content.trim();
    if (!trimmed || !get().initialized) return;
    const todos = [
      ...get().todos,
      {
        id: createId(),
        content: trimmed,
        status: 'pending' as const,
        createdAt: Date.now(),
        completedAt: null,
      },
    ];
    set({ todos });
    queueTodoWrite(todos);
  },

  updateTodo: (id, content) => {
    const trimmed = content.trim();
    if (!trimmed || !get().initialized) return;
    const todos = get().todos.map((todo) =>
      todo.id === id ? { ...todo, content: trimmed } : todo
    );
    set({ todos });
    queueTodoWrite(todos);
  },

  completeTodo: (id) => {
    if (!get().initialized) return;
    const todos = get().todos.map((todo) =>
      todo.id === id && todo.status === 'pending'
        ? { ...todo, status: 'completed' as const, completedAt: Date.now() }
        : todo
    );
    set({ todos });
    queueTodoWrite(todos);
  },

  deleteTodo: (id) => {
    if (!get().initialized) return;
    const todos = get().todos.filter((todo) => todo.id !== id);
    set({ todos });
    queueTodoWrite(todos);
  },
}));
