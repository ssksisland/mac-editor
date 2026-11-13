import { MAX_DETECTION_LENGTH, MIN_DETECTION_LENGTH } from './languageDetectionPolicy';

interface PendingDetection {
  resolve: (language: string | undefined) => void;
  timer: ReturnType<typeof setTimeout>;
}

let worker: Worker | undefined;
let nextId = 0;
let failed = false;
const pending = new Map<number, PendingDetection>();

function stopWorker(error: unknown) {
  console.warn('[language-detection] 自动检测暂不可用：', error);
  failed = true;
  worker?.terminate();
  worker = undefined;
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.resolve(undefined);
  }
  pending.clear();
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/languageDetection.worker.ts', import.meta.url), {
      type: 'module',
      name: 'language-detection',
    });
    worker.onmessage = (event: MessageEvent<{ id: number; language?: string; error?: string }>) => {
      if (event.data.error) {
        stopWorker(event.data.error);
        return;
      }
      const request = pending.get(event.data.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(event.data.id);
      request.resolve(event.data.language);
    };
    worker.onerror = (event) => stopWorker(event.message);
    worker.onmessageerror = () => stopWorker('无法读取检测结果');
  }
  return worker;
}

/** 只在确实需要识别时启动 Worker；异常不会影响输入和手动选语言。 */
export function detectContentLanguage(content: string): Promise<string | undefined> {
  const sample = content.slice(0, MAX_DETECTION_LENGTH);
  if (failed || sample.trim().length < MIN_DETECTION_LENGTH) return Promise.resolve(undefined);

  return new Promise((resolve) => {
    try {
      const target = getWorker();
      const id = ++nextId;
      const timer = setTimeout(() => stopWorker('检测超时'), 30_000);
      pending.set(id, { resolve, timer });
      target.postMessage({ id, content: sample });
    } catch (error) {
      stopWorker(error);
      resolve(undefined);
    }
  });
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    worker?.terminate();
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.resolve(undefined);
    }
    pending.clear();
  });
}
