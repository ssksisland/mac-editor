import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { afterAll, describe, expect, it } from 'vitest';
import { ModelOperations } from '@vscode/vscode-languagedetection';
import { detectLanguageFromHints, selectDetectedLanguage } from '../src/utils/languageDetectionPolicy';

const require = createRequire(import.meta.url);
const model = new ModelOperations({
  modelJsonLoaderFunc: async () => JSON.parse(await readFile(
    require.resolve('@vscode/vscode-languagedetection/model/model.json'), 'utf8',
  )),
  weightsLoaderFunc: async () => {
    const bytes = await readFile(require.resolve('@vscode/vscode-languagedetection/model/group1-shard1of1.bin'));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  },
});
afterAll(() => model.dispose());

describe('实际 VS Code 模型', () => {
  it.each([
    ['python', 'import os\n\ndef greet(name):\n    print(f"Hello {name}")\n\nif __name__ == "__main__":\n    greet("world")\n'],
    ['go', 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, world!")\n}\n'],
    ['json', '{"name":"mac-editor","version":"1.2.0","scripts":{"dev":"vite"},"private":true}'],
    ['sql', 'SELECT u.id, u.name, COUNT(o.id) AS total\nFROM users u\nLEFT JOIN orders o ON o.user_id = u.id\nGROUP BY u.id, u.name\nORDER BY total DESC;'],
  ])('识别 %s', async (language, code) => {
    const results = await model.runModel(code);
    expect(detectLanguageFromHints(code) ?? selectDetectedLanguage(results), JSON.stringify(results.slice(0, 2))).toBe(language);
  });

  it('空文本不产生候选', async () => {
    expect(await model.runModel('')).toEqual([]);
  });
});
