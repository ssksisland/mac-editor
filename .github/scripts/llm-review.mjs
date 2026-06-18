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
import OpenAI from 'openai';

const {
  REVIEW_BASE_URL,
  REVIEW_API_KEY,
  REVIEW_MODEL,
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

/**
 * 解析 git diff，返回 [{ path, patch, validLines:Set<number> }]
 * validLines = 该文件 diff 中「新增行」在新文件里的行号集合（行级评论只能落在这些行）
 */
function parseDiff(raw) {
  const files = [];
  const chunks = raw.split(/^diff --git /m).slice(1);
  let total = 0;

  for (const chunk of chunks) {
    // 文件路径：取 +++ b/xxx
    const pathMatch = chunk.match(/^\+\+\+ b\/(.+)$/m);
    if (!pathMatch) continue;            // 二进制/删除文件无 +++ b/
    const path = pathMatch[1].trim();
    if (SKIP_PATTERNS.some((re) => re.test(path))) continue;
    if (/^Binary files /m.test(chunk)) continue;

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
    if (validLines.size === 0) continue;

    let patch = patchLines.join('\n');
    if (patch.length > MAX_FILE_PATCH) patch = patch.slice(0, MAX_FILE_PATCH) + '\n... (截断)';
    total += patch.length;
    if (total > MAX_TOTAL) {
      console.log('[llm-review] diff 过大，已截断后续文件');
      break;
    }
    files.push({ path, patch, validLines });
  }
  return files;
}

// ---- 取 diff ----
let rawDiff;
try {
  rawDiff = execSync(`git diff --unified=3 ${BASE_SHA} ${HEAD_SHA}`, {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
} catch (e) {
  skip(`git diff 失败：${e.message}`);
}

const files = parseDiff(rawDiff);
if (files.length === 0) skip('无可审查的代码改动');

console.log(`[llm-review] 审查 ${files.length} 个文件`);

// ---- 调 LLM ----
const SYSTEM_PROMPT = `你是一名资深代码审查员。只报告真实问题：bug、空指针/未定义访问、资源泄漏、并发问题、安全漏洞（注入、越权、密钥泄露）、明显的逻辑错误。
不要报告风格、命名、格式、注释等吹毛求疵的意见。宁缺毋滥——没有真实问题就返回空数组。
必须只返回 JSON，格式：
{"issues":[{"file":"文件路径","line":行号(整数,必须是 diff 中带行号标注的某一行),"severity":"high|medium|low","comment":"简洁的中文问题说明与修复建议"}]}`;

const userContent = files
  .map((f) => `### 文件: ${f.path}\n（行首数字为新文件行号，+ 表示新增行）\n\`\`\`diff\n${f.patch}\n\`\`\``)
  .join('\n\n');

let issues = [];
try {
  const client = new OpenAI({ baseURL: REVIEW_BASE_URL || undefined, apiKey: REVIEW_API_KEY });
  const resp = await client.chat.completions.create({
    model: REVIEW_MODEL || 'gpt-4o-mini',
    temperature: 0,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
  });
  const text = resp.choices?.[0]?.message?.content ?? '{}';
  // 解析兜底：剥离可能的 ```json 包裹
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(cleaned);
  issues = Array.isArray(parsed.issues) ? parsed.issues : [];
} catch (e) {
  skip(`LLM 调用/解析失败：${e.message}`);
}

console.log(`[llm-review] LLM 返回 ${issues.length} 个问题`);

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
if (issues.length === 0) {
  summary = '🤖 LLM 代码审查：本次改动未发现明显问题。（仅供参考，不替代人工审查）';
} else {
  summary =
    `🤖 LLM 代码审查：发现 ${issues.length} 个潜在问题（**仅建议，不阻断合并**）。\n\n` +
    (orphan.length ? `未能定位到具体行的问题：\n${orphan.join('\n')}\n\n` : '') +
    `> LLM 审查有随机性，可能误报或漏报，请结合人工判断。`;
}

// ---- 调 GitHub PR Review API ----
try {
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
