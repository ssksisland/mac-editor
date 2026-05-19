/**
 * CodeMirror 搜索高亮插件。
 *
 * 使用 StateEffect + StateField 组合实现搜索匹配标记的高亮。
 * SearchPanel 通过 dispatch effects 传入匹配位置数组，
 * 此插件将匹配区域渲染为带高亮 class 的 Decoration.mark。
 */
import { StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';
import { EditorView, Decoration } from '@codemirror/view';

// 定义高亮效果
export const highlightEffect = StateEffect.define<{
  matches: Array<{ from: number; to: number }>;
} | null>();

// 创建高亮字段
export const highlightField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(highlights, tr) {
    for (const effect of tr.effects) {
      if (effect.is(highlightEffect)) {
        if (!effect.value) {
          return Decoration.none;
        }
        const builder = new RangeSetBuilder<Decoration>();
        for (const match of effect.value.matches) {
          builder.add(
            match.from,
            match.to,
            Decoration.mark({ class: 'cm-search-highlight' })
          );
        }
        return builder.finish();
      }
    }
    return highlights.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});
