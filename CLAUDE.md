# mac-editor

Tauri 2 桌面代码编辑器 — React 19 + CodeMirror 6 + Zustand 5 + Vite 7.

## 运行

```
npm run dev          # 纯浏览器（Vite），文件 I/O 不可用
npm run tauri dev    # 桌面 App，含 Rust 后端
npm run build        # 生产构建
```

## 架构

```
App.tsx (垂直布局)
├── MenuBar       — 新建/打开/保存、语言切换、列选择、按行去重、Markdown 预览
├── TabBar        — 多 tab 标签页，拖拽排序，双击重命名，双击空白新建
├── Editor        — CodeMirror 6 封装，一个 tab 一个实例
│   ├── searchHighlight.ts  — 搜索匹配高亮（StateEffect + StateField）
│   ├── invisibleChars.ts   — 不可见字符显示（ViewPlugin + WidgetType）
│   └── GotoLinePanel
├── MarkdownPreview — Markdown 实时预览（左右分屏，300ms debounce）
├── StatusBar     — 行列号 / 编码 / 语言（200ms 轮询）
├── SearchPanel   — 搜索+替换（正则/Case/转义序列/标记所有）
└── CloseSaveDialog — 关闭前保存询问（Excel 三按钮风格）
```

## 状态 & 通信

- **Zustand store** (`stores/editorStore.ts`) — tabs[], activeTabId, settings, cursor position, recent files（localStorage 持久化）, moveTab
- **window.__macEditor** — 菜单栏按钮 → 编辑器实例的桥，绕过 React 树
  - `selectColumn()` — 所有行同列添加光标
  - `deduplicateLines()` — 按行去重（SQL DISTINCT）
  - `registerView(tabId, view)` / `unregisterView(tabId)`
- **viewsMap / activeView** — 模块级 Map，**放在 React 组件外**，Vite HMR 时不丢实例
- **mac-editor:close-tab** — 自定义事件，TabBar × 按钮 → App.tsx 保存确认
- **mac-editor:open-search** — 自定义事件，快捷键 → 打开搜索面板

## 关键设计

### Editor.tsx — 编辑器核心
- 语言变化 → **重建 EditorState**（CodeMirror 扩展不可变）
- 字体/字号/换行 → **直接操作 DOM**（`.scrollDOM`, `.contentDOM`），不重建
- 不可见字符开关 → dispatch StateEffect，不重建
- `buildExtensions()` 返回 ~20 个扩展的数组，包括 language 包、键盘快捷键、搜索高亮
- 语言注册表：原生 CM6 包（JS/Python/HTML…30+ 种） + `StreamLanguage` 兼容旧 mode（Go/Ruby/Perl…）
- 编码检测：Rust 端用 `chardetng`，而非 JS
- Tab 键：无选区插 `\t`，有选区调 `indentMore`
- 多光标：Cmd+Click 添加光标，Cmd-Alt-Arrow 相邻行列光标，Shift-Alt-Arrow 列选区

### TabBar.tsx — Chrome 风格标签栏
- 拖拽排序：HTML5 drag-and-drop，鼠标位置中点判定插入位置，蓝色指示条
- Chrome 视觉：非活跃 tab 透明融合、分隔线、活跃 tab 白色浮起 + 圆角 + 阴影
- 修改标记：文件名左侧 7px 小圆点（●）
- 关闭按钮：已修改 tab 触发 `mac-editor:close-tab` 事件，未修改直接关
- 新建 tab 命名："未命名" → "未命名1" → "未命名2"...

### 关闭确认（App.tsx + CloseSaveDialog.tsx）
- **单 tab 关闭**：TabBar × 或 Cmd+W → 已修改则弹出保存/不保存/取消对话框
- **窗口关闭**：逐个询问每个未保存 tab，Excel 风格（保存/不保存/取消）
  - 取消 = 停止整个关闭流程，窗口保持打开
  - 保存新文件时用户取消另存为 = 不关闭该 tab，停留在当前询问
  - 批量关闭过程中忽略单个 tab 关闭请求，避免对话框叠加
- `closingRef` 防止关闭流程重入

### 文件 I/O（Rust 端 `src-tauri/src/lib.rs`）
- `read_file_cmd` — 读文件 + 自动检测编码（chardetng → UTF-8）
- `save_file_cmd` — 写磁盘
- `detect_encoding_cmd` — 仅返回编码名
- `read_image_data_url` — 读取图片文件并返回 base64 data URL（用于 Markdown 预览）
- 拖拽事件：Tauri `DragDropEvent` → JS `window.__handleFileDrop()`

### 拖拽（useDragAndDrop.ts）
- Tauri 原生拖放：Rust `on_window_event` + `DragDropEvent` → JS bridge
- HTML5 拖放：`dragover/dragenter/dragleave/drop` 事件
- `isFileDrag()` 通过 `dataTransfer.types.includes('Files')` 区分文件拖放和 tab 拖拽
- `tauri.conf.json` 中 `dragDropEnabled: false`，避免 Tauri 拦截 HTML5 tab 拖拽事件

### HMR 兼容
- `viewsMap`（`Map<tabId, EditorView>`）和 `activeView` 是模块级变量，不放在 React state/ref 里
- 原因：Vite HMR 重渲染组件但保留模块作用域，放 ref 里会丢实例

### MarkdownPreview.tsx — Markdown 实时预览
- 仅当 `activeTab.language === 'markdown'` 时菜单栏显示预览按钮
- 点击按钮切换 `settings.showPreview`，右侧出现预览面板（左右分屏，各占 50%）
- 使用 `marked` 库解析 Markdown → HTML，300ms debounce
- 本地图片（绝对路径 `/Users/...` 和相对路径 `./img.png`）通过 Rust `read_image_data_url` 命令读取为 base64 data URL
- 相对路径基于当前 Markdown 文件的 `filePath` 所在目录解析
- 自定义 marked 渲染器输出 `<img data-local-src="...">`，useEffect 异步调用 invoke 加载图片
- GitHub 风格渲染样式定义在 `App.css` 的 `.markdown-body` 类中

## 权限（Tauri Capabilities）

`src-tauri/capabilities/default.json`:
- `core:default`, `core:window:allow-close`, `core:window:allow-destroy`
- `opener:default`, `dialog:default`, `fs:default`
- `fs:allow-read-text-file`, `fs:allow-write-text-file`, `fs:allow-exists`
- `fs:read-all` — 允许读取任意路径的文件（Markdown 预览加载本地图片需要）

## 版本发布

每次发布新版本时，**四个地方**的版本号要同步更新：

| 文件 | 字段 | 作用 |
|------|------|------|
| `package.json` | `version` | npm 脚本显示（`mac-editor@0.3.0 tauri`）|
| `src-tauri/tauri.conf.json` | `version` | 打包文件名（DMG、App）|
| `src-tauri/Cargo.toml` | `version` | Rust 侧版本 |
| Git tag | `vX.Y.Z` | GitHub Releases |

完整流程：
1. 更新 `CHANGELOG.md`（新版本章节）
2. 更新 `CLAUDE.md`（架构/设计有变化时）
3. 更新 `README.md`（版本号 + 新功能列表）
4. 更新 `package.json`、`tauri.conf.json`、`Cargo.toml` 的 version
5. `npm run tauri build` 构建 DMG
6. 将 DMG 拷到 `releases/`：`cp src-tauri/target/release/bundle/dmg/mac-editor_X.Y.Z_aarch64.dmg releases/`
7. `git add` + `git commit` + `git tag -a vX.Y.Z`
8. `git push origin main --tags`

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| ⌘N | 新建文件 |
| ⌘O | 打开文件 |
| ⌘S | 保存 |
| ⌘W | 关闭当前 tab（已修改则询问） |
| ⌘F | 搜索 |
| ⌘⇧D | 按行去重 |
| ⌘⇧I | 列编辑 |
| ⌘= / ⌘- / ⌘0 | 放大/缩小/重置字体 |
| ⌘Tab / ⌘⇧Tab | 切换 tab |

## 注意事项
- CodeMirror language 扩展在 `EditorState.create()` 之后不能替换，只能重建编辑器
- `buildExtensions` 依赖数组里有 `tabId`，但实际上 tabId 变 → language 变才会触发重建
- StatusBar 用 200ms `setInterval` 轮询，不 push 式更新
- `SearchPanel` 的 `findAllMatches` 是 O(n) 全文档扫描，大文件可能卡
- Rust `lib.rs` 的 `on_window_event` 使用非穷举枚举 match，加了 `_ => {}` future-proofing
- `dragDropEnabled: false` 是必须的，否则 Tauri 原生层拦截所有 HTML5 拖拽事件
