import { useEffect, useRef, useState } from 'react';
import { useTodoStore } from '../stores/todoStore';
import type { TodoItem } from '../stores/todoStore';

const EXIT_DURATION = 300;

export default function TodoPage() {
  const todos = useTodoStore((state) => state.todos);
  const initialized = useTodoStore((state) => state.initialized);
  const initializing = useTodoStore((state) => state.initializing);
  const loadError = useTodoStore((state) => state.loadError);
  const persistenceError = useTodoStore((state) => state.persistenceError);
  const initialize = useTodoStore((state) => state.initialize);
  const retryPersistence = useTodoStore((state) => state.retryPersistence);
  const addTodo = useTodoStore((state) => state.addTodo);
  const updateTodo = useTodoStore((state) => state.updateTodo);
  const completeTodo = useTodoStore((state) => state.completeTodo);
  const deleteTodo = useTodoStore((state) => state.deleteTodo);
  const [draft, setDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  const [completedOpen, setCompletedOpen] = useState(true);
  const exitTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const cancelEditRef = useRef(false);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => () => {
    exitTimers.current.forEach(clearTimeout);
    exitTimers.current.clear();
  }, []);

  const pending = todos
    .filter((todo) => todo.status === 'pending')
    .sort((a, b) => b.createdAt - a.createdAt);
  const completed = todos
    .filter((todo) => todo.status === 'completed')
    .sort((a, b) => b.createdAt - a.createdAt || (b.completedAt ?? 0) - (a.completedAt ?? 0));

  const createTodo = () => {
    const content = draft.trim();
    if (!content) return;
    addTodo(content);
    setDraft('');
  };

  const startEdit = (todo: TodoItem) => {
    cancelEditRef.current = false;
    setEditingId(todo.id);
    setEditDraft(todo.content);
  };

  const finishEdit = () => {
    if (cancelEditRef.current) {
      cancelEditRef.current = false;
      return;
    }
    const content = editDraft.trim();
    if (editingId && content) updateTodo(editingId, content);
    setEditingId(null);
    setEditDraft('');
  };

  const cancelEdit = () => {
    cancelEditRef.current = true;
    setEditingId(null);
    setEditDraft('');
  };

  const animateThen = (id: string, action: () => void) => {
    if (exitingIds.has(id)) return;
    setExitingIds((current) => new Set(current).add(id));
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0
      : EXIT_DURATION;
    const timer = setTimeout(() => {
      action();
      setExitingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      exitTimers.current.delete(timer);
    }, duration);
    exitTimers.current.add(timer);
  };

  const removeTodo = (todo: TodoItem) => {
    if (!window.confirm(`永久删除“${todo.content}”？`)) return;
    animateThen(todo.id, () => deleteTodo(todo.id));
  };

  return (
    <main className="todo-page">
      <div className="todo-shell">
        <header className="todo-header">
          <div>
            <p className="todo-eyebrow">MY TASKS</p>
            <h1>Todo List</h1>
          </div>
          <span className="todo-count">{pending.length} 项待完成</span>
        </header>

        {loadError ? (
          <div className="todo-state todo-state-error" role="alert">
            <strong>无法读取待办数据</strong>
            <span>{loadError}</span>
            <button onClick={() => void initialize()}>重新加载</button>
          </div>
        ) : !initialized ? (
          <div className="todo-state" aria-live="polite">
            {initializing ? '正在加载待办事项...' : '准备加载待办事项...'}
          </div>
        ) : (
          <>
            {persistenceError && (
              <div className="todo-save-error" role="alert">
                <span>更改尚未写入磁盘：{persistenceError}</span>
                <button onClick={retryPersistence}>重试保存</button>
              </div>
            )}

            <div className="todo-create">
              <input
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (isCompositionKey(event)) return;
                  if (event.key === 'Enter') createTodo();
                }}
                placeholder="添加一个待办事项..."
                aria-label="新建待办事项"
              />
              <button onClick={createTodo} disabled={!draft.trim()}>添加</button>
            </div>

            <TodoSection title="待办" count={pending.length} empty="暂无待办事项">
              {pending.map((todo) => (
                <TodoRow
                  key={todo.id}
                  todo={todo}
                  exiting={exitingIds.has(todo.id)}
                  editing={editingId === todo.id}
                  editDraft={editDraft}
                  onEditDraft={setEditDraft}
                  onStartEdit={() => startEdit(todo)}
                  onFinishEdit={finishEdit}
                  onCancelEdit={cancelEdit}
                  onComplete={() => animateThen(todo.id, () => completeTodo(todo.id))}
                  onDelete={() => removeTodo(todo)}
                />
              ))}
            </TodoSection>

            <TodoSection
              title="已完成"
              count={completed.length}
              empty="暂无已完成事项"
              completed
              open={completedOpen}
              onToggle={() => setCompletedOpen((open) => !open)}
            >
              {completed.map((todo) => (
                <TodoRow
                  key={todo.id}
                  todo={todo}
                  exiting={exitingIds.has(todo.id)}
                  editing={false}
                  editDraft=""
                  onEditDraft={() => undefined}
                  onStartEdit={() => undefined}
                  onFinishEdit={() => undefined}
                  onCancelEdit={() => undefined}
                  onComplete={() => undefined}
                  onDelete={() => removeTodo(todo)}
                />
              ))}
            </TodoSection>
          </>
        )}
      </div>
    </main>
  );
}

function TodoSection({
  title,
  count,
  empty,
  completed = false,
  open = true,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  completed?: boolean;
  open?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`todo-section${completed ? ' todo-section-completed' : ''}`}>
      {completed ? (
        <button
          className="todo-section-title todo-section-toggle"
          onClick={onToggle}
          aria-expanded={open}
        >
          <span className={`todo-chevron${open ? ' is-open' : ''}`}>›</span>
          <h2>{title}</h2>
          <span className="todo-section-count">{count}</span>
        </button>
      ) : (
        <div className="todo-section-title">
          <h2>{title}</h2>
          <span className="todo-section-count">{count}</span>
        </div>
      )}
      {open && (
        <div className="todo-list">
          {count === 0 ? <p className="todo-empty">{empty}</p> : children}
        </div>
      )}
    </section>
  );
}

function TodoRow({
  todo,
  exiting,
  editing,
  editDraft,
  onEditDraft,
  onStartEdit,
  onFinishEdit,
  onCancelEdit,
  onComplete,
  onDelete,
}: {
  todo: TodoItem;
  exiting: boolean;
  editing: boolean;
  editDraft: string;
  onEditDraft: (value: string) => void;
  onStartEdit: () => void;
  onFinishEdit: () => void;
  onCancelEdit: () => void;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const isCompleted = todo.status === 'completed';
  return (
    <article className={`todo-row${isCompleted ? ' is-completed' : ''}${exiting ? ' is-exiting' : ''}`}>
      <button
        className="todo-check"
        onClick={onComplete}
        disabled={isCompleted || exiting}
        aria-label={isCompleted ? `已完成：${todo.content}` : `完成待办：${todo.content}`}
      >
        {isCompleted && <span>✓</span>}
      </button>

      <div className="todo-row-content">
        {editing ? (
          <input
            className="todo-edit-input"
            autoFocus
            value={editDraft}
            onChange={(event) => onEditDraft(event.target.value)}
            onBlur={onFinishEdit}
            onKeyDown={(event) => {
              if (isCompositionKey(event)) return;
              if (event.key === 'Enter') onFinishEdit();
              if (event.key === 'Escape') onCancelEdit();
            }}
          />
        ) : (
          <div className="todo-copy" onDoubleClick={isCompleted ? undefined : onStartEdit}>
            <span className="todo-text">{todo.content}</span>
          </div>
        )}
      </div>

      <div className="todo-actions">
        {!isCompleted && !editing && <button onClick={onStartEdit}>编辑</button>}
        <button className="todo-delete" onClick={onDelete}>删除</button>
      </div>
      <div className="todo-meta">
        <span className="todo-time">创建于 {formatTime(todo.createdAt)}</span>
        {todo.completedAt && (
          <span className="todo-time">完成于 {formatTime(todo.completedAt)}</span>
        )}
      </div>
    </article>
  );
}

function formatTime(value: number) {
  const date = new Date(value);
  const two = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** WebKit may report keyCode 229 even when isComposing changes before Enter bubbles. */
function isCompositionKey(event: React.KeyboardEvent<HTMLInputElement>) {
  return event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
}
