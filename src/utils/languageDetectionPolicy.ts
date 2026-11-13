import type { ModelResult } from '@vscode/vscode-languagedetection';
import { detectLanguage } from './detectLanguage';

export type LanguageSource = 'auto' | 'filename' | 'manual';

export const MAX_DETECTION_LENGTH = 10_000;
export const MIN_DETECTION_LENGTH = 20;

interface LanguageTarget {
  fileName: string;
  language: string;
  languageSource?: LanguageSource;
}

/** 兼容旧会话：保留已选择的语言，新建纯文本默认自动检测。 */
export function getInitialLanguageSource(tab: LanguageTarget): LanguageSource {
  if (tab.languageSource) return tab.languageSource;
  const filenameLanguage = detectLanguage(tab.fileName);
  if (filenameLanguage !== 'txt' && filenameLanguage === tab.language) return 'filename';
  return tab.language === 'txt' ? 'auto' : 'manual';
}

export function canDetectLanguage(tab: LanguageTarget): boolean {
  return getInitialLanguageSource(tab) !== 'manual' && detectLanguage(tab.fileName) === 'txt';
}

/** 短片段的强特征优先；不使用单个 import/class 等多语言共有关键字。 */
export function detectLanguageFromHints(content: string): string | undefined {
  const text = content.trimStart();
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const value: unknown = JSON.parse(text);
      if (value !== null && typeof value === 'object') return 'json';
    } catch { /* 尚未输入完整 JSON 时交给模型。 */ }
  }
  const interpreter = /^#![^\r\n]*\b(python[\d.]*|node|ruby|perl|bash|zsh|sh)\b/.exec(text)?.[1];
  if (interpreter) {
    if (interpreter.startsWith('python')) return 'python';
    return ({ node: 'javascript', ruby: 'ruby', perl: 'perl' } as Record<string, string>)[interpreter] ?? 'shell';
  }
  if (/^<\?php\b/i.test(text)) return 'php';
  if (/^<!doctype\s+html\b/i.test(text)) return 'html';
  if (/^<\?xml\s/i.test(text)) return 'xml';
  if (/^(?:async\s+)?def\s+\w+\([^\r\n]*\)\s*(?:->[^\r\n:]+)?\s*:/m.test(text)) return 'python';
  if (/^package\s+\w+\s*$/m.test(text) && /^func\s+\w+\(/m.test(text)) return 'go';
  if (/^export\s+(?:default\s+)?(?:async\s+)?function\s+\w+\([^():$\r\n]*\)\s*\{/m.test(text)) return 'javascript';
  return undefined;
}

/** 模型返回扩展名缩写，只映射到当前编辑器支持的语法。 */
const MODEL_LANGUAGES: Record<string, string> = {
  js: 'javascript', ts: 'typescript', py: 'python', html: 'html', css: 'css',
  json: 'json', md: 'markdown', sh: 'shell', c: 'c', cpp: 'cpp', java: 'java',
  php: 'php', rs: 'rust', go: 'go', rb: 'ruby', pl: 'perl', sql: 'sql',
  xml: 'xml', yaml: 'yaml', dockerfile: 'dockerfile', swift: 'swift', kt: 'kotlin',
  cs: 'csharp', dart: 'dart', r: 'r', lua: 'lua', toml: 'toml',
};

/** 不把不支持的第一候选替换成较低分的候选，也不接受接近的猜测。 */
export function selectDetectedLanguage(results: readonly ModelResult[]): string | undefined {
  const [best, second] = results;
  if (!best || !Number.isFinite(best.confidence) || best.confidence < 0.2) return;
  if (second && best.confidence - second.confidence < 0.1) return;
  return MODEL_LANGUAGES[best.languageId];
}
