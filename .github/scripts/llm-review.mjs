/**
 * LLM 代码审查脚本（CI 中运行）。
 *
 * 流程：
 *   1. 取本次 PR 的 diff（BASE_SHA..HEAD_SHA），过滤无关文件，解析新增行的行号
 *   2. 把 diff 交给 LLM（OpenAI 兼容端点），要求返回结构化 JSON 问题列表
 *   3. 通过 GitHub PR Review API 把问题以行级评论贴到对应代码行 + 一条汇总
 *
 * 设计原则（对照最佳实践）：
 *   - 仅评论不阻断：任何分支都 exit 0，不让 PR 合并被卡
 *   - 降级优先：未配密钥 / API 失败 / 解析失败 → 警告并放行
 *   - 只审 diff，过滤二进制/lock/生成文件，超长截断
 *   - 行号校验：只在 diff 真实涉及的新增行上评论（GitHub API 限制）
 *   - 不打印任何密钥
 */
import { execSync } from 'node:child_process';

const {
  REVIEW_BASE_URL,
  REVIEW_API_KEY,
  REVIEW_MODEL,
  REVIEW_TIMEOUT_MS,
  REVIEW_MAX_RETRIES,
  REVIEW_MAX_BATCH_CHARS,
  REVIEW_CONCURRENCY: REVIEW_CONCURRENCY_ENV,
  REVIEW_LOG_RAW_RESPONSE,
  GITHUB_TOKEN,
  REPO,
  PR_NUMBER,
  BASE_SHA,
  HEAD_SHA,
} = process.env;

// ---- 降级保护：缺关键配置就跳过，绝不卡 PR ----
function skip(reason) {
  console.log(`[llm-review] 跳过：${reason}`);
  process.exit(0);
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function shortSha(sha) {
  return sha ? sha.slice(0, 12) : '(missing)';
}

function safeUrl(value) {
  if (!value) return 'OpenAI SDK 默认端点';
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return '(REVIEW_BASE_URL 不是合法 URL，原值不打印)';
  }
}

function elapsedMs(startedAt) {
  return `${Date.now() - startedAt}ms`;
}

function describeError(error) {
  const details = [
    `name=${error?.name ?? 'UnknownError'}`,
    `message=${error?.message ?? String(error)}`,
  ];

  if (error?.status) details.push(`status=${error.status}`);
  if (error?.code) details.push(`code=${error.code}`);
  if (error?.type) details.push(`type=${error.type}`);
  if (error?.cause?.name || error?.cause?.message) {
    details.push(`cause=${error.cause.name ?? 'Error'}:${error.cause.message ?? ''}`);
  }
  if (error?.headers?.['x-request-id']) {
    details.push(`request_id=${error.headers['x-request-id']}`);
  }

  return details.join(' | ');
}

async function createOpenAIClient() {
  let OpenAI;
  try {
    ({ default: OpenAI } = await import('openai'));
  } catch (e) {
    skip(`加载 openai 依赖失败：${describeError(e)}`);
  }

  return new OpenAI({
    baseURL: REVIEW_BASE_URL || undefined,
    apiKey: REVIEW_API_KEY,
    timeout: REVIEW_TIMEOUT,
    maxRetries: REVIEW_RETRIES,
  });
}

if (!REVIEW_API_KEY) skip('未配置 REVIEW_API_KEY（在仓库 Secrets 设置后启用）');
if (!GITHUB_TOKEN || !REPO || !PR_NUMBER || !BASE_SHA || !HEAD_SHA) {
  skip('缺少 GitHub 上下文环境变量（非 PR 事件？）');
}

// ---- 过滤规则：不审这些文件 ----
const SKIP_PATTERNS = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)Cargo\.lock$/,
  /\.lock$/,
  /(^|\/)(dist|node_modules|target|releases)\//,
  /\.(png|jpe?g|gif|svg|webp|bmp|ico|dmg|icns|woff2?|ttf|map)$/i,
];
const MAX_FILE_PATCH = 30_000;   // 单文件 patch 超此字节截断
const MAX_TOTAL = 120_000;       // 总 diff 超此字节停止收集
const REVIEW_TIMEOUT = parsePositiveInt(REVIEW_TIMEOUT_MS, 600_000);
const REVIEW_RETRIES = parsePositiveInt(REVIEW_MAX_RETRIES, 1);
// 单批字符数越小，单次 LLM 请求越快、越不容易超时。文件多时这是主要调节项。
const MAX_BATCH_CHARS = parsePositiveInt(REVIEW_MAX_BATCH_CHARS, 12_000);
// 并发跑多个 batch，避免文件多时串行累加导致整体耗时线性增长。
const REVIEW_CONCURRENCY = parsePositiveInt(REVIEW_CONCURRENCY_ENV, 3);
const LOG_RAW_RESPONSE = REVIEW_LOG_RAW_RESPONSE === '1' || REVIEW_LOG_RAW_RESPONSE === 'true';

/**
 * 解析 git diff，返回 [{ path, patch, validLines:Set<number> }]
 * validLines = 该文件 diff 中「新增行」在新文件里的行号集合（行级评论只能落在这些行）
 */
function parseDiff(raw) {
  const files = [];
  const chunks = raw.split(/^diff --git /m).slice(1);
  let total = 0;
  const stats = {
    rawFiles: chunks.length,
    skippedFiles: 0,
    truncatedFiles: 0,
    totalLimitReached: false,
  };

  for (const chunk of chunks) {
    // 文件路径：取 +++ b/xxx
    const pathMatch = chunk.match(/^\+\+\+ b\/(.+)$/m);
    if (!pathMatch) {                    // 二进制/删除文件无 +++ b/
      stats.skippedFiles++;
      continue;
    }
    const path = pathMatch[1].trim();
    if (SKIP_PATTERNS.some((re) => re.test(path))) {
      stats.skippedFiles++;
      continue;
    }
    if (/^Binary files /m.test(chunk)) {
      stats.skippedFiles++;
      continue;
    }

    // 逐行扫 hunk，记录新增行的新文件行号
    const validLines = new Set();
    let newLineNo = 0;
    const lines = chunk.split('\n');
    const patchLines = [];
    let inHunk = false;
    for (const line of lines) {
      const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (hunk) {
        newLineNo = parseInt(hunk[1], 10);
        inHunk = true;
        patchLines.push(line);
        continue;
      }
      if (!inHunk) continue;
      // diff 元数据行（如 "\ No newline at end of file"）：不是真实内容，跳过且不递增行号
      if (line.startsWith('\\')) {
        continue;
      }
      if (line.startsWith('+')) {
        validLines.add(newLineNo);
        patchLines.push(`${newLineNo}: ${line}`); // 给 LLM 标注行号
        newLineNo++;
      } else if (line.startsWith('-')) {
        patchLines.push(line);                      // 删除行不占新行号
      } else {
        patchLines.push(`${newLineNo}: ${line}`);
        newLineNo++;
      }
    }
    if (validLines.size === 0) {
      stats.skippedFiles++;
      continue;
    }

    let patch = patchLines.join('\n');
    if (patch.length > MAX_FILE_PATCH) {
      patch = patch.slice(0, MAX_FILE_PATCH) + '\n... (截断)';
      stats.truncatedFiles++;
    }
    total += patch.length;
    if (total > MAX_TOTAL) {
      console.log('[llm-review] diff 过大，已截断后续文件');
      stats.totalLimitReached = true;
      break;
    }
    files.push({ path, patch, validLines });
  }
  stats.reviewFiles = files.length;
  stats.reviewChars = files.reduce((sum, file) => sum + file.patch.length, 0);
  stats.validAddedLines = files.reduce((sum, file) => sum + file.validLines.size, 0);
  return { files, stats };
}

console.log(`[llm-review] 环境：node=${process.version} repo=${REPO} pr=#${PR_NUMBER}`);
console.log(`[llm-review] commit：base=${shortSha(BASE_SHA)} head=${shortSha(HEAD_SHA)}`);
console.log(
  `[llm-review] LLM 配置：baseURL=${safeUrl(REVIEW_BASE_URL)} model=${REVIEW_MODEL || 'gpt-4o-mini'} ` +
    `timeout=${REVIEW_TIMEOUT}ms retries=${REVIEW_RETRIES} maxBatchChars=${MAX_BATCH_CHARS} concurrency=${REVIEW_CONCURRENCY}`,
);

// ---- 取 diff ----
let rawDiff;
try {
  const startedAt = Date.now();
  rawDiff = execSync(`git diff --unified=3 ${BASE_SHA} ${HEAD_SHA}`, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  console.log(`[llm-review] git diff 完成：bytes=${Buffer.byteLength(rawDiff, 'utf8')} elapsed=${elapsedMs(startedAt)}`);
} catch (e) {
  skip(`git diff 失败：${describeError(e)}`);
}

const { files, stats: diffStats } = parseDiff(rawDiff);
if (files.length === 0) skip('无可审查的代码改动');

console.log(`[llm-review] 审查 ${files.length} 个文件`);
console.log(
  `[llm-review] diff 统计：rawFiles=${diffStats.rawFiles} skipped=${diffStats.skippedFiles} truncatedFiles=${diffStats.truncatedFiles} ` +
    `reviewChars=${diffStats.reviewChars} validAddedLines=${diffStats.validAddedLines} totalLimitReached=${diffStats.totalLimitReached}`,
);

// ---- 调 LLM ----
const SYSTEM_PROMPT = `你是一名资深代码审查员。只报告真实问题：bug、空指针/未定义访问、资源泄漏、并发问题、安全漏洞（注入、越权、密钥泄露）、明显的逻辑错误。
不要报告风格、命名、格式、注释等吹毛求疵的意见。宁缺毋滥——没有真实问题就返回空数组。
必须只返回 JSON，格式：
{"issues":[{"file":"文件路径","line":行号(整数,必须是 diff 中带行号标注的某一行),"severity":"high|medium|low","comment":"简洁的中文问题说明与修复建议"}]}`;

function filePrompt(file) {
  return `### 文件: ${file.path}\n（行首数字为新文件行号，+ 表示新增行）\n\`\`\`diff\n${file.patch}\n\`\`\``;
}

function buildUserContent(batchFiles) {
  return batchFiles.map(filePrompt).join('\n\n');
}

function makeBatches(reviewFiles) {
  const batches = [];
  let current = [];
  let currentChars = 0;

  for (const file of reviewFiles) {
    const promptChars = filePrompt(file).length;
    if (current.length > 0 && currentChars + promptChars > MAX_BATCH_CHARS) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(file);
    currentChars += promptChars;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

async function reviewBatch(client, batchFiles, batchIndex, batchCount) {
  const userContent = buildUserContent(batchFiles);
  const startedAt = Date.now();
  const fileNames = batchFiles.map((file) => file.path).join(', ');
  console.log(
    `[llm-review] LLM batch ${batchIndex}/${batchCount} 请求开始：files=${batchFiles.length} ` +
      `userChars=${userContent.length} files=[${fileNames}]`,
  );

  const resp = await client.chat.completions.create({
    model: REVIEW_MODEL || 'gpt-4o-mini',
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
  });

  console.log(`[llm-review] LLM batch ${batchIndex}/${batchCount} 请求完成：elapsed=${elapsedMs(startedAt)} id=${resp.id ?? '(no id)'}`);
  const text = resp.choices?.[0]?.message?.content ?? '{}';
  console.log(
    `[llm-review] LLM batch ${batchIndex}/${batchCount} 响应：chars=${text.length} ` +
      `finishReason=${resp.choices?.[0]?.finish_reason ?? '(missing)'}`,
  );
  if (LOG_RAW_RESPONSE) {
    console.log(`[llm-review] LLM batch ${batchIndex}/${batchCount} 原始响应前 2000 字符：${text.slice(0, 2000)}`);
  }

  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  return Array.isArray(parsed.issues) ? parsed.issues : [];
}

let issues = [];
const failedBatches = [];
try {
  const client = await createOpenAIClient();
  const batches = makeBatches(files);
  console.log(`[llm-review] LLM 分批：batches=${batches.length} concurrency=${REVIEW_CONCURRENCY}`);

  // 用固定大小的 worker 池并发跑各 batch，避免文件多时串行累加耗时。
  let cursor = 0;
  async function worker() {
    while (cursor < batches.length) {
      const index = cursor++;
      const batchNumber = index + 1;
      const batchFiles = batches[index];
      try {
        const batchIssues = await reviewBatch(client, batchFiles, batchNumber, batches.length);
        console.log(`[llm-review] LLM batch ${batchNumber}/${batches.length} 返回 ${batchIssues.length} 个问题`);
        issues.push(...batchIssues);
      } catch (e) {
        const message = describeError(e);
        failedBatches.push({ batch: batchNumber, files: batchFiles.map((file) => file.path), message });
        console.log(`[llm-review] LLM batch ${batchNumber}/${batches.length} 失败：${message}`);
      }
    }
  }

  const workerCount = Math.min(REVIEW_CONCURRENCY, batches.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (issues.length === 0 && failedBatches.length === batches.length) {
    skip(`所有 LLM batch 均失败，首个错误：${failedBatches[0]?.message ?? 'unknown'}`);
  }
} catch (e) {
  skip(`LLM 调用/解析失败：${describeError(e)}`);
}

console.log(`[llm-review] LLM 返回 ${issues.length} 个问题，失败 batch=${failedBatches.length}`);

// ---- 行号校验：只保留落在合法新增行上的评论 ----
const byPath = new Map(files.map((f) => [f.path, f.validLines]));
const lineComments = [];
const orphan = []; // 行号非法/文件不在 diff 的，降级进汇总
for (const it of issues) {
  if (!it || typeof it.comment !== 'string') continue;
  const valid = byPath.get(it.file);
  const sev = ['high', 'medium', 'low'].includes(it.severity) ? it.severity : 'low';
  const body = `**[${sev.toUpperCase()}] 🤖 LLM 审查**\n\n${it.comment}`;
  if (valid && Number.isInteger(it.line) && valid.has(it.line)) {
    lineComments.push({ path: it.file, line: it.line, body });
  } else {
    orphan.push(`- \`${it.file}${it.line ? ':' + it.line : ''}\` [${sev}] ${it.comment}`);
  }
}

// ---- 汇总评论正文 ----
let summary;
const failedBatchSummary = failedBatches.length
  ? `\n\nLLM 审查未完整完成：${failedBatches.length} 个 batch 失败，请查看 Actions 日志。`
  : '';
if (issues.length === 0 && failedBatches.length === 0) {
  summary = '🤖 LLM 代码审查：本次改动未发现明显问题。（仅供参考，不替代人工审查）';
} else if (issues.length === 0) {
  summary = `🤖 LLM 代码审查：未返回可发布的问题，但部分审查请求失败。（仅建议，不阻断合并）${failedBatchSummary}`;
} else {
  summary =
    `🤖 LLM 代码审查：发现 ${issues.length} 个潜在问题（**仅建议，不阻断合并**）。\n\n` +
    (orphan.length ? `未能定位到具体行的问题：\n${orphan.join('\n')}\n\n` : '') +
    `> LLM 审查有随机性，可能误报或漏报，请结合人工判断。` +
    failedBatchSummary;
}

// ---- 调 GitHub PR Review API ----
try {
  const startedAt = Date.now();
  console.log(`[llm-review] 发布 review 开始：lineComments=${lineComments.length} orphan=${orphan.length}`);
  const res = await fetch(`https://api.github.com/repos/${REPO}/pulls/${PR_NUMBER}/reviews`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      commit_id: HEAD_SHA,
      event: 'COMMENT', // 中性评论，不是 approve/request changes（不阻断）
      body: summary,
      comments: lineComments,
    }),
  });
  console.log(`[llm-review] 发布 review 响应：status=${res.status} elapsed=${elapsedMs(startedAt)}`);
  if (!res.ok) {
    const errText = await res.text();
    console.log(`[llm-review] 发布 review 失败(${res.status})：${errText.slice(0, 500)}`);
  } else {
    console.log(`[llm-review] 已发布：${lineComments.length} 条行级评论 + 汇总`);
  }
} catch (e) {
  console.log(`[llm-review] 发布 review 异常：${e.message}`);
}

// 始终成功退出——不阻断 PR
process.exit(0);
