# LLM 代码审查（CI）

PR 打开/更新时，自动用 LLM 审查本次改动的 diff，把发现的潜在问题以**行级评论**贴到 PR。

## 特点

- **仅评论，不阻断合并**：LLM 有随机性，不当合并门禁；真正卡合并的是 `ci.yml` 里确定性的 tsc / cargo check。
- **只审 diff**：仅本次 PR 改动，过滤 lock / 二进制 / 生成文件，超长截断。
- **降级优先**：未配密钥、API 失败、解析失败 → 打印警告并放行，绝不卡住 PR。

## 配置（必须）

在 GitHub 仓库 `Settings → Secrets and variables → Actions → New repository secret` 添加：

| Secret | 说明 | 示例 |
|--------|------|------|
| `REVIEW_API_KEY` | LLM 端点的 API Key | `sk-...` |
| `REVIEW_BASE_URL` | OpenAI 兼容端点地址（官方 OpenAI 可留空） | `https://your-endpoint/v1` |
| `REVIEW_MODEL` | 模型名 | `gpt-4o-mini` |

> `GITHUB_TOKEN` 由 GitHub Actions 自动注入，无需手动配置。
>
> 不配 `REVIEW_API_KEY` 时，审查 job 会自动跳过（exit 0），不影响其他 CI。

## ⚠️ 隐私提示

本次 PR 改动的**代码 diff 会上传到所配置的 LLM 端点**。敏感 / 私有仓库请谨慎使用，或改用自托管模型（如 Ollama，配 `REVIEW_BASE_URL` 指向本地端点）。

## 文件

- `.github/workflows/llm-review.yml` — workflow 定义
- `.github/scripts/llm-review.mjs` — 审查逻辑（取 diff → 调 LLM → 发行级评论）
