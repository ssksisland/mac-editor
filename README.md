# Mac Editor

一个轻量级的 macOS 文本编辑器。

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
npm run tauri dev
```

## 构建

```bash
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/`。
