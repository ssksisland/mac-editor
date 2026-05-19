/**
 * CodeMirror 插件 — 显示不可见字符（空格、Tab、换行符 LF/CRLF）。
 *
 * 实现方式：
 * 1. showInvisibleField — StateField，记录开关状态
 * 2. invisiblePlugin    — ViewPlugin，根据开关状态遍历文档生成 Decoration
 * 3. LineBreakWidget    — WidgetType，在行尾渲染 LF / CRLF 标签
 *
 * 仅对可视口（viewport）内的行生成装饰，避免大文件性能问题。
 */
import { EditorView, Decoration, WidgetType, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { StateEffect, StateField, RangeSetBuilder } from '@codemirror/state';

class LineBreakWidget extends WidgetType {
  private isCrlf: boolean;
  constructor(isCrlf: boolean) {
    super();
    this.isCrlf = isCrlf;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = this.isCrlf ? 'cm-linebreak-crlf' : 'cm-linebreak-lf';
    span.textContent = this.isCrlf ? 'CRLF' : 'LF';
    return span;
  }
  eq(other: LineBreakWidget) { return this.isCrlf === other.isCrlf; }
  ignoreEvent() { return true; }
}

const spaceMark = Decoration.mark({ class: 'cm-invisible-space' });
const tabMark = Decoration.mark({ class: 'cm-invisible-tab' });

export const toggleInvisible = StateEffect.define<boolean>();
export const showInvisibleField = StateField.define({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(toggleInvisible)) return e.value;
    }
    return value;
  },
});

function buildDecorations(view: EditorView) {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const { state } = view;

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);

    const start = Math.max(line.from, view.viewport.from);
    const end = Math.min(line.to, view.viewport.to);
    for (let pos = start; pos < end; pos++) {
      const ch = state.sliceDoc(pos, pos + 1);
      if (ch === '\t') {
        builder.add(pos, pos + 1, tabMark);
      } else if (ch === ' ') {
        builder.add(pos, pos + 1, spaceMark);
      }
    }

    if (line.to < doc.length) {
      const ch = state.sliceDoc(line.to, line.to + 1);
      const isCrlf = ch === '\n' && state.sliceDoc(line.to - 1, line.to) === '\r';
      builder.add(line.to, line.to, Decoration.widget({
        widget: new LineBreakWidget(isCrlf),
        side: 1,
      }));
    }
  }

  return builder.finish();
}

const invisiblePlugin = ViewPlugin.fromClass(
  class {
    decorations: any;
    constructor(view: EditorView) {
      this.decorations = view.state.field(showInvisibleField) ? buildDecorations(view) : Decoration.none;
    }
    update(update: ViewUpdate) {
      const show = update.state.field(showInvisibleField);
      if (!show) { this.decorations = Decoration.none; return; }
      if (update.docChanged || update.viewportChanged || update.startState.field(showInvisibleField) !== show) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

export function invisibleChars() {
  return [showInvisibleField, invisiblePlugin];
}
