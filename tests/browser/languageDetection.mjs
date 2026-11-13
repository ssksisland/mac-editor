import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
let server;
try {
  server = await preview({ preview: { host: '127.0.0.1', port: 0 } });
  const baseUrl = `http://127.0.0.1:${server.httpServer.address().port}`;
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'warning') errors.push(message.text()); });
  page.on('request', request => requests.push(request.url()));
  await page.addInitScript(() => {
    window.__testViews = new Map();
    let api;
    Object.defineProperty(window, '__macEditor', {
      configurable: true,
      get: () => api,
      set(value) {
        api = value;
        const register = api.registerView;
        const unregister = api.unregisterView;
        api.registerView = (id, view) => { window.__testViews.set(id, view); register(id, view); };
        api.unregisterView = (id) => { window.__testViews.delete(id); unregister(id); };
      },
    });
  });
  const menu = page.locator('[aria-label="语法语言"]');
  const editor = () => page.locator('.cm-content:visible');
  const newTab = () => page.getByRole('button', { name: '新建文件', exact: true }).click();
  const waitLanguage = (name) => page.waitForFunction(
    expected => document.querySelector('[aria-label="语法语言"] option:checked')?.textContent.includes(expected),
    name, { timeout: 12000 },
  );
  const code = 'def greet(name):\n    print("Hello", name)\n';
  const sql = 'SELECT u.id, u.name, COUNT(o.id) AS total\nFROM users u\nLEFT JOIN orders o ON o.user_id = u.id\nGROUP BY u.id, u.name\nORDER BY total DESC;';

  try {
    await page.goto(baseUrl);
    await newTab();
    await editor().fill(code);
    await page.locator('.cm-lineNumbers:visible .cm-gutterElement').filter({ hasText: /^1$/ }).click();
    await page.evaluate(() => {
      const view = [...window.__testViews.values()].at(-1);
      window.__beforeView = view;
      view.dispatch({ selection: { anchor: 4, head: 12 } });
    });
    await waitLanguage('Python');
    assert.equal(await page.evaluate(() => [...window.__testViews.values()].at(-1) === window.__beforeView), true);
    assert.deepEqual(await page.evaluate(() => ({ from: window.__beforeView.state.selection.main.from, to: window.__beforeView.state.selection.main.to })), { from: 4, to: 12 });
    assert.ok(await page.locator('.cm-bookmark-dot:visible').count() >= 1);
    console.log('PASS Python detection preserves editor, selection and bookmarks');

    await editor().focus();
    await page.keyboard.press('Meta+z');
    await page.waitForFunction(() => window.__beforeView.state.doc.length === 0);
    console.log('PASS undo survives automatic language switch');

    await menu.selectOption('txt');
    await editor().fill(sql);
    await page.waitForTimeout(1000);
    assert.equal(await menu.inputValue(), 'txt');
    await page.reload();
    await editor().waitFor();
    assert.equal(await menu.inputValue(), 'txt');
    console.log('PASS manual Plain Text selection persists across reload');

    await menu.selectOption('auto');
    await waitLanguage('SQL');
    assert.ok(requests.some(url => /model-.*\.json/.test(url)));
    assert.ok(requests.some(url => /group1-shard1of1-.*\.bin/.test(url)));
    assert.ok(requests.every(url => url.startsWith(baseUrl + '/')));
    console.log('PASS real neural model loads local assets and detects SQL');

    for (const [language, source] of [
      ['Go', 'package main\n\nimport "fmt"\n\nfunc main() {\n fmt.Println("hello")\n}\n'],
      ['JSON', '{"name":"mac-editor","version":"1.2.0","private":true}'],
      ['TypeScript', 'export interface User { name: string; age: number; }\nexport function greet(user: User): string {\n  return `Hello ${user.name}`;\n}\n'],
      ['JavaScript', 'export function greet(name) {\n  const greeting = `Hello ${name}`;\n  console.log(greeting);\n  return greeting;\n}\n'],
    ]) {
      await newTab();
      await editor().fill(source);
      await waitLanguage(language);
      console.log(`PASS ${language} content detection`);
    }

    await page.locator('.editor-tab.is-active').dblclick();
    const rename = page.getByRole('textbox', { name: /^重命名 / });
    await rename.fill('example.py');
    await rename.press('Enter');
    await waitLanguage('Python');
    await editor().fill(sql);
    await page.waitForTimeout(900);
    await waitLanguage('Python');
    console.log('PASS known filename keeps priority over content');

    await newTab();
    await editor().fill('这是编辑器中的一段普通笔记，今天需要记录一些想法和待办事项。');
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('[aria-label="语法语言"] option:checked').textContent(), '自动检测');
    console.log('PASS plain prose stays plain text');

    assert.deepEqual(errors, []);
    await page.screenshot({ path: join(tmpdir(), 'mac-editor-language-detection.png') });
    console.log('ALL BROWSER CHECKS PASSED');
  } catch (error) {
    console.log('ERRORS', errors);
    console.log('CURRENT_LANGUAGE', await menu.locator('option:checked').textContent());
    await page.screenshot({ path: join(tmpdir(), 'mac-editor-language-detection-failure.png') });
    throw error;
  }
} finally {
  await browser.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
}
