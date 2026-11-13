import { describe, expect, it } from 'vitest';
import { canDetectLanguage, detectLanguageFromHints, getInitialLanguageSource, selectDetectedLanguage } from '../src/utils/languageDetectionPolicy';

describe('内容检测策略', () => {
  it('映射模型语言，保留文件名和手动选择的优先级', () => {
    expect(selectDetectedLanguage([{ languageId: 'py', confidence: 0.9 }])).toBe('python');
    expect(selectDetectedLanguage([{ languageId: 'ts', confidence: 0.9 }])).toBe('typescript');
    expect(canDetectLanguage({ fileName: '未命名', language: 'txt' })).toBe(true);
    expect(canDetectLanguage({ fileName: 'script', language: 'python', languageSource: 'auto' })).toBe(true);
    expect(canDetectLanguage({ fileName: 'app.ts', language: 'typescript' })).toBe(false);
    expect(canDetectLanguage({ fileName: '未命名', language: 'txt', languageSource: 'manual' })).toBe(false);
  });

  it('不接受低置信度、接近的候选或不支持的第一候选', () => {
    expect(selectDetectedLanguage([])).toBeUndefined();
    expect(selectDetectedLanguage([{ languageId: 'py', confidence: 0.12 }])).toBeUndefined();
    expect(selectDetectedLanguage([{ languageId: 'py', confidence: NaN }])).toBeUndefined();
    expect(selectDetectedLanguage([
      { languageId: 'js', confidence: 0.45 }, { languageId: 'ts', confidence: 0.42 },
    ])).toBeUndefined();
    expect(selectDetectedLanguage([
      { languageId: 'asm', confidence: 0.9 }, { languageId: 'c', confidence: 0.05 },
    ])).toBeUndefined();
  });

  it('明确特征能识别短片段，共有关键字和普通文本不匹配', () => {
    expect(detectLanguageFromHints('{"enabled":true}')).toBe('json');
    expect(detectLanguageFromHints('[1, 2, 3]')).toBe('json');
    expect(detectLanguageFromHints('def hello(name):\n    print(name)')).toBe('python');
    expect(detectLanguageFromHints('#!/usr/bin/env python3\nprint("hello")')).toBe('python');
    expect(detectLanguageFromHints('#!/bin/bash\necho hello')).toBe('shell');
    expect(detectLanguageFromHints('export function greet(name) { return name; }')).toBe('javascript');
    expect(detectLanguageFromHints('export function greet(name: string) { return name; }')).toBeUndefined();
    expect(detectLanguageFromHints('普通的笔记内容，没有编程语言特征。')).toBeUndefined();
    expect(detectLanguageFromHints('import foo\nclass Bar')).toBeUndefined();
    expect(detectLanguageFromHints('def hello(name)\n puts name\nend')).toBeUndefined();
  });

  it('迁移旧会话时保留已选语言', () => {
    expect(getInitialLanguageSource({ fileName: '未命名', language: 'txt' })).toBe('auto');
    expect(getInitialLanguageSource({ fileName: 'app.py', language: 'python' })).toBe('filename');
    expect(getInitialLanguageSource({ fileName: '未命名', language: 'python' })).toBe('manual');
    expect(getInitialLanguageSource({ fileName: 'app.py', language: 'sql' })).toBe('manual');
  });
});
