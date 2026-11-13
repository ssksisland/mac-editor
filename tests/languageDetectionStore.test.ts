import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { useEditorStore as Store } from '../src/stores/editorStore';

vi.mock('../src/sessionPersistence', () => ({ scheduleEditorSessionSave: vi.fn() }));

let useEditorStore: typeof Store;
beforeAll(async () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  ({ useEditorStore } = await import('../src/stores/editorStore'));
});
beforeEach(() => useEditorStore.setState({ tabs: [], activeTabId: null }));

function newTab(fileName = '未命名', language = 'txt') {
  return useEditorStore.getState().addTab({
    fileName, language, filePath: null, content: 'def hello():\n    print("hello")\n',
    encoding: 'UTF-8', isModified: true, editorView: null,
  });
}
function tab(id: string) { return useEditorStore.getState().tabs.find((item) => item.id === id)!; }
function apply(id: string, language = 'python', content = tab(id).content, name = tab(id).fileName) {
  useEditorStore.getState().applyDetectedLanguage(id, content, name, language);
}

describe('标签页语言检测', () => {
  it('只更新请求的标签页，不改变修改状态', () => {
    const id = newTab();
    const other = newTab();
    useEditorStore.getState().setTabModified(id, false);
    apply(id);
    expect(tab(id)).toMatchObject({ language: 'python', languageSource: 'auto', isModified: false });
    expect(tab(other).language).toBe('txt');
  });

  it('丢弃内容变化、重命名或关闭标签后的旧结果', () => {
    const id = newTab();
    const { content, fileName } = tab(id);
    useEditorStore.getState().updateTabContent(id, 'SELECT id FROM users;');
    apply(id, 'python', content, fileName);
    expect(tab(id).language).toBe('txt');
    useEditorStore.getState().setTabFileName(id, 'query');
    apply(id, 'sql', tab(id).content, fileName);
    expect(tab(id).language).toBe('txt');
    useEditorStore.getState().removeTab(id);
    expect(() => apply(id, 'sql', content, fileName)).not.toThrow();
  });

  it('手动选择纯文本后，内容检测及保存/重命名均不能覆盖', () => {
    const id = newTab();
    useEditorStore.getState().setTabLanguage(id, 'txt');
    apply(id);
    useEditorStore.getState().setTabFilePath(id, '/tmp/app.py', 'app.py');
    useEditorStore.getState().setTabLanguage(id, 'python', 'filename');
    expect(tab(id)).toMatchObject({ language: 'txt', languageSource: 'manual' });
    useEditorStore.getState().enableLanguageDetection(id);
    expect(tab(id)).toMatchObject({ language: 'python', languageSource: 'filename' });
  });

  it('自动模式下保存到已知扩展名时优先文件名', () => {
    const id = newTab();
    apply(id);
    const { content, fileName } = tab(id);
    useEditorStore.getState().setTabFilePath(id, '/tmp/app.ts', 'app.ts');
    useEditorStore.getState().setTabLanguage(id, 'typescript', 'filename');
    apply(id, 'python', content, fileName);
    expect(tab(id)).toMatchObject({ language: 'typescript', languageSource: 'filename' });
  });

  it('手动选择及恢复自动模式可随会话恢复', () => {
    const id = newTab();
    useEditorStore.getState().setTabLanguage(id, 'sql');
    const { editorView: _view, ...persisted } = tab(id);
    useEditorStore.getState().restoreSession({
      tabs: [persisted], activeTabId: id, activePage: 'editor',
    });
    apply(id);
    expect(tab(id)).toMatchObject({ language: 'sql', languageSource: 'manual' });
    useEditorStore.getState().enableLanguageDetection(id);
    apply(id);
    expect(tab(id)).toMatchObject({ language: 'python', languageSource: 'auto' });
  });
});
