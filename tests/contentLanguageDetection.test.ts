import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: { data: { id: number; language?: string; error?: string } }) => void;
  onerror?: (event: { message: string }) => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
}
const content = 'def greet(name):\n    print("Hello", name)';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('本地检测 Worker 客户端', () => {
  it('短文本不启动模型，多次请求共用 Worker，结果按 ID 匹配', async () => {
    const { detectContentLanguage } = await import('../src/utils/contentLanguageDetection');
    expect(await detectContentLanguage('hello')).toBeUndefined();
    expect(FakeWorker.instances).toHaveLength(0);
    const first = detectContentLanguage(content);
    const second = detectContentLanguage('SELECT id, name FROM users ORDER BY name;');
    expect(FakeWorker.instances).toHaveLength(1);
    const worker = FakeWorker.instances[0];
    const [a, b] = worker.postMessage.mock.calls.map(([request]) => request);
    worker.onmessage!({ data: { id: b.id, language: 'sql' } });
    worker.onmessage!({ data: { id: a.id, language: 'python' } });
    expect(await first).toBe('python');
    expect(await second).toBe('sql');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('只发送前一万个字符', async () => {
    const { detectContentLanguage } = await import('../src/utils/contentLanguageDetection');
    const result = detectContentLanguage(content.repeat(500));
    const worker = FakeWorker.instances[0];
    const request = worker.postMessage.mock.calls[0][0];
    expect(request.content.length).toBe(10_000);
    worker.onmessage!({ data: { id: request.id } });
    expect(await result).toBeUndefined();
  });

  it.each(['error', 'timeout'])('模型 %s 时结束请求，后续输入仍能继续', async (failure) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { detectContentLanguage } = await import('../src/utils/contentLanguageDetection');
    const first = detectContentLanguage(content);
    const second = detectContentLanguage(content);
    const worker = FakeWorker.instances[0];
    if (failure === 'error') worker.onerror!({ message: 'model unavailable' });
    else vi.advanceTimersByTime(30_000);
    expect(await first).toBeUndefined();
    expect(await second).toBeUndefined();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(await detectContentLanguage(content)).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
    vi.restoreAllMocks();
  });
});
