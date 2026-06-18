# Mac Editor

轻量级 macOS 桌面代码编辑器，基于 Tauri 2 + React 19 + CodeMirror 6。

## 功能

- **多标签页编辑** — Chrome 风格标签栏，支持拖拽排序、双击重命名（同步重命名磁盘文件）
- **语法高亮** — 30+ 种语言，自动检测文件类型
- **Markdown 预览** — 三种模式（纯代码 / 分屏 / 预览全屏）单按钮循环切换，支持本地图片、页内锚点跳转
- **搜索 & 替换** — 正则、大小写、转义序列、全部替换
- **多光标编辑** — Cmd+Click、Cmd 拖动列选区、列选择、相邻行光标
- **行标记** — 点击行号标记整行（类 Notepad++）
- **按行去重** — 类似 SQL DISTINCT，选中行或全文去重
- **不可见字符** — 空格/Tab/换行符显示切换
- **编码自动检测与保存** — 基于 chardetng 识别编码，按原始编码回写（GBK/Shift-JIS 等不被转成 UTF-8）
- **最近文件** — 快速重新打开近期编辑的文件
- **关闭保存确认** — 关闭 tab 或窗口时逐个询问是否保存（Excel 风格）
- **文件拖放打开** — 从 Finder 拖入文件直接打开
- **Finder 打开方式** — 在 Finder 中用 mac-editor 打开任意文件

## 安装

下载 `mac-editor_x.y.z_aarch64.dmg`，打开后将 `mac-editor.app` 拖入 `Applications` 文件夹。

### 首次打开提示"已损坏，无法打开"？

由于本应用未经过 Apple 付费签名与公证，macOS Gatekeeper 会拦截来自网络下载的未签名应用。这不代表应用真的损坏，在终端执行以下命令即可解除：

```bash
sudo xattr -rd com.apple.quarantine /Applications/mac-editor.app
```

执行后再次打开应用即可正常使用。

## 开发

```bash
npm install
npm run tauri dev    # 桌面 App
npm run dev          # 纯浏览器（文件 I/O 不可用）
```

## 构建

```bash
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/`。

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Tauri 2 (Rust) |
| 前端 | React 19 + TypeScript |
| 编辑器 | CodeMirror 6 |
| 状态管理 | Zustand 5 |
| 构建 | Vite 7 |
| 编码检测 | chardetng (Rust) |

## 版本

当前版本：**v0.5.0** — 详见 [CHANGELOG.md](CHANGELOG.md)
