import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { useEditorStore } from "./stores/editorStore";
import { loadEditorSession } from "./sessionPersistence";
import { errorMessage, notify } from "./utils/notifications";

async function bootstrap() {
  let restoreError: unknown = null;
  try {
    const session = await loadEditorSession();
    if (session) useEditorStore.getState().restoreSession(session);
  } catch (error) {
    restoreError = error;
    console.error('[session] Failed to restore editor session:', error);
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );

  if (restoreError) {
    // 等 NotificationCenter 完成挂载后再展示恢复错误。
    setTimeout(() => {
      notify(`无法恢复上次会话：${errorMessage(restoreError)}`, 'error');
    }, 0);
  }
}

void bootstrap();
