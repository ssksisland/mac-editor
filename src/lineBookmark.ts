/**
 * CodeMirror 行标记（书签）插件 — 类 Notepad++ 行标记。
 *
 * 点击行号栏右侧的标记列，会在该行生成一个小圆点标记整行；再次点击取消。
 *
 * 实现方式：
 * 1. toggleBookmarkEffect — StateEffect，携带要切换的行首位置
 * 2. bookmarkField        — StateField，用 RangeSet<GutterMarker> 记录已标记行
 * 3. bookmarkGutter       — gutter，渲染圆点并处理点击切换
 */
import { StateField, StateEffect, RangeSet } from '@codemirror/state';
import { gutter, GutterMarker, EditorView } from '@codemirror/view';

/** 切换某行标记。payload 为该行内任意位置（会归一化到行首）。 */
export const toggleBookmarkEffect = StateEffect.define<number>();

/** 圆点标记 */
class BookmarkMarker extends GutterMarker {
  toDOM() {
    const dot = document.createElement('div');
    dot.className = 'cm-bookmark-dot';
    return dot;
  }
}
const bookmarkMarker = new BookmarkMarker();

/** 记录已标记行的 RangeSet（每个标记位于行首，零宽） */
const bookmarkField = StateField.define<RangeSet<GutterMarker>>({
  create() {
    return RangeSet.empty;
  },
  update(set, tr) {
    // 文档变化时同步标记位置
    set = set.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(toggleBookmarkEffect)) {
        const line = tr.state.doc.lineAt(e.value);
        const pos = line.from;
        let exists = false;
        // 检查该行是否已有标记
        set.between(pos, pos, () => { exists = true; return false; });
        if (exists) {
          set = set.update({ filter: (from) => from !== pos });
        } else {
          set = set.update({ add: [bookmarkMarker.range(pos)] });
        }
      }
    }
    return set;
  },
});

/** 行标记 gutter：显示圆点，并响应点击切换该行标记 */
const bookmarkGutter = gutter({
  class: 'cm-bookmark-gutter',
  markers: (view) => view.state.field(bookmarkField),
  initialSpacer: () => bookmarkMarker,
  domEventHandlers: {
    mousedown(view, line) {
      view.dispatch({ effects: toggleBookmarkEffect.of(line.from) });
      return true;
    },
  },
});

const bookmarkTheme = EditorView.theme({
  '.cm-bookmark-gutter': {
    width: '14px',
    cursor: 'pointer',
  },
  '.cm-bookmark-dot': {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#2f7bf6',
    margin: '0 auto',
    marginTop: '4px',
  },
});

export function lineBookmark() {
  return [bookmarkField, bookmarkGutter, bookmarkTheme];
}
