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

## 可选诊断配置

在 GitHub 仓库 `Settings → Secrets and variables → Actions → Variables` 可添加：

| Variable | 说明 | 默认值 |
|----------|------|--------|
| `REVIEW_TIMEOUT_MS` | LLM 请求超时时间，毫秒 | `120000` |
| `REVIEW_MAX_RETRIES` | LLM SDK 请求重试次数 | `1` |
| `REVIEW_MAX_BATCH_CHARS` | 单个 LLM 请求最多包含的 diff 字符数，超出会拆成多批 | `25000` |
| `REVIEW_LOG_RAW_RESPONSE` | 设为 `true` 或 `1` 时打印模型原始响应前 2000 字符 | 关闭 |

脚本默认会打印端点、模型、diff 规模、过滤统计、请求耗时、错误类型、状态码和 request id；不会打印 `REVIEW_API_KEY`。
如果日志里 `userChars` 很大并超时，优先降低 `REVIEW_MAX_BATCH_CHARS`，例如设为 `15000`。

## ⚠️ 隐私提示

本次 PR 改动的**代码 diff 会上传到所配置的 LLM 端点**。敏感 / 私有仓库请谨慎使用，或改用自托管模型（如 Ollama，配 `REVIEW_BASE_URL` 指向本地端点）。

## 文件

- `.github/workflows/llm-review.yml` — workflow 定义
- `.github/scripts/llm-review.mjs` — 审查逻辑（取 diff → 调 LLM → 发行级评论）
