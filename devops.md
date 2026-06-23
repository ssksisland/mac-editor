# mac-editor DevOps 手册

本项目的代码更新与版本发布流程。所有改动通过 Pull Request 合入 `main`，由 CI 门禁把关，版本发布走 Git tag + GitHub Releases。

---

## 总览

```
功能开发                          版本发布
─────────                        ─────────
建分支 → 改代码 → 提交 → 推送       改版本号+CHANGELOG → 走一次 PR
  → 开 PR → CI 自动跑               → 合并 → 同步 main
  → 审查/讨论 → CI 绿灯             → 打 tag → 构建 DMG
  → 合并 main → 同步本地            → gh release create 发布
```

核心原则：
- **`main` 永远是经过检查的干净代码** —— 禁止直接 push，一切走 PR。
- **CI 是合并门禁** —— `tsc` 和 `cargo check` 必须通过才能合并。
- **DMG 不进 git** —— 安装包通过 GitHub Releases 分发。

---

## 一、日常功能开发（走 PR）

### 1. 从最新 main 建功能分支
```bash
git switch main
git pull                          # 确保基于最新 main
git switch -c feature/xxx         # feature/ 修复用 fix/ 文档用 docs/
```

### 2. 改代码并本地自检
```bash
# 前端改动
npx tsc --noEmit
# Rust 改动
cargo check --manifest-path src-tauri/Cargo.toml
```

### 3. 提交并推送
```bash
git add <具体文件>                # 避免 git add .
git commit -m "清晰描述改了什么"
git push -u origin feature/xxx    # 首次推送用 -u 建立追踪
```

### 4. 开 PR（命令行）
```bash
gh pr create --base main --title "标题" --body "说明：改了什么、为什么、怎么测"
```

### 5. 等 CI + 合并
```bash
gh pr checks                      # 看检查状态
gh pr merge --squash              # 全绿后 squash 合并（会自动等门禁通过）
```

> CI 未通过时 `main` 的合并按钮会被禁用（分支保护规则 `protect-main`）。

### 6. 合并后同步本地 main
```bash
git switch main
git pull
```
> squash 合并后本地分支可能与远端分叉，可用 `git reset --hard origin/main` 对齐
> （仅当本地改动已通过 PR 合入、本地副本冗余时才用）。

---

## 二、CI 说明

配置：`.github/workflows/ci.yml`，PR 和 push 到 main 时触发。

| Job | 作用 | 是否门禁 |
|-----|------|---------|
| `Frontend (tsc)` | TypeScript 类型检查 | ✅ 必须通过 |
| `Rust (cargo check)` | Rust 编译检查（Linux，需 apt 装 Tauri 系统依赖） | ✅ 必须通过 |
| `LLM Review` | LLM 审查 diff，行级评论 | ❌ 仅建议，不阻断 |

注意：
- CI 跑在 GitHub 临时虚拟机上，每次全新。Rust 编译产物由 `Swatinem/rust-cache` 缓存（apt 系统包不缓存，每次重装约 1-2 分钟）。
- CI 卡在网络相关步骤（apt / 下载）大多是偶发，**先重跑**：`gh run rerun --failed`。

---

## 三、分支保护（已配置）

GitHub `Settings → Rules → Rulesets`，规则集 `protect-main`，作用于默认分支：
- **Require a pull request before merging**（Required approvals = 0，单人开发）
- **Require status checks to pass** → `Frontend (tsc)` + `Rust (cargo check)`
- Restrict deletions、Block force pushes

效果：坏代码 → CI 红灯 → PR 无法合并 → 进不了 main。

> 注意：分支保护**只拦代码 push 到 main**，**不拦 tag push**。所以发版打 tag 不受影响。

---

## 四、版本发布流程

语义化版本：`主.次.修订`（破坏性升主、新功能升次、修复升修订）。

发版需同步 **3 处版本号**：
| 文件 | 字段 |
|------|------|
| `package.json` | `version` |
| `src-tauri/tauri.conf.json` | `version` |
| `src-tauri/Cargo.toml` | `version`（改后 `cargo check` 会同步 `Cargo.lock`） |

### 完整步骤

**1. 建发版分支，改版本号 + CHANGELOG**
```bash
git switch main && git pull
git switch -c release/vX.Y.Z
# 改 package.json / tauri.conf.json / Cargo.toml 三处版本号
# 在 CHANGELOG.md 顶部加 vX.Y.Z 章节（Added/Changed/Fixed）
# 更新 README.md 的版本号与功能列表（如有变化）
```

**2. 走 PR 合并**（发版改动也经过 CI）
```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock CHANGELOG.md README.md
git commit -m "发布 vX.Y.Z：一句话概括"
git push -u origin release/vX.Y.Z
gh pr create --base main --title "发布 vX.Y.Z" --body "..."
gh pr checks && gh pr merge --squash
```

**3. 同步 main 后打 tag**（tag 必须基于合并后的 main）
```bash
git switch main
git fetch origin && git reset --hard origin/main
grep '"version"' package.json | head -1     # 确认是 X.Y.Z
git tag -a vX.Y.Z -m "vX.Y.Z：一句话概括"
git push origin vX.Y.Z                        # tag push 不受分支保护限制
```

**4. 构建 DMG**
```bash
npm run tauri build
# 产物：src-tauri/target/release/bundle/dmg/mac-editor_X.Y.Z_aarch64.dmg
```

**5. 发布 GitHub Release（DMG 作为附件，不进 git）**
```bash
gh release create vX.Y.Z \
  src-tauri/target/release/bundle/dmg/mac-editor_X.Y.Z_aarch64.dmg \
  --title "vX.Y.Z — 一句话标题" \
  --notes "本版变更，详见 CHANGELOG.md"

gh release view vX.Y.Z              # 确认 asset 已上传
```

发版**不需要为 DMG 再开 PR** —— DMG 走 Releases，与代码仓库解耦。

---

## 五、常用排查

| 现象 | 处理 |
|------|------|
| `git push` 到 main 被拒 | 分支保护生效，改走 PR |
| `git status` 显示同步但实际落后 | 先 `git fetch` 再判断，status 只看本地缓存 |
| 合并后本地 main 没有新代码 | GitHub 合并不会自动同步本地，需 `git pull` |
| squash 后本地分叉 | `git reset --hard origin/main` 对齐 |
| CI 卡在 apt/下载 | 偶发网络问题，`gh run rerun --failed` 重跑 |
| `cargo check` 在 Linux 报 `RunEvent::Opened` 不存在等 | macOS 专属 API 缺条件编译，加 `#[cfg(target_os = "macos")]` |
| 本地编译过、CI 挂 | CI 在 Linux 环境，会暴露跨平台问题，按 CI 报错修 |

---

## 六、LLM 代码审查（可选增强）

配置：`.github/workflows/llm-review.yml` + `.github/scripts/llm-review.mjs`。
- PR 触发，LLM 审查 diff，行级评论，**仅建议不阻断**。
- 需在仓库 Secrets 配 `REVIEW_API_KEY` / `REVIEW_BASE_URL` / `REVIEW_MODEL`，未配则自动跳过。
- ⚠️ 代码 diff 会上传到所配置的 LLM 端点，敏感仓库慎用。详见 `.github/scripts/README.md`。
