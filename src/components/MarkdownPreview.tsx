/**
 * Markdown 实时预览面板。
 *
 * 将 Markdown 源码通过 marked 解析为 HTML 并渲染。
 * 使用 300ms debounce 避免每次击键都重新解析。
 * 本地图片通过 Rust 命令读取为 base64 data URL 显示。
 * 容器独立滚动，左侧有分隔线。
 */
import { useState, useEffect, useRef } from 'react';
import { marked, Renderer } from 'marked';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

/** HTML 转义，防止 XSS */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 判断图片路径是否为本地绝对路径。
 * 匹配 / 开头（Unix）或盘符开头（Windows C:\）。
 */
function isLocalAbsPath(src: string): boolean {
  return src.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(src);
}

/**
 * 判断是否为远程 URL（http/https/data:）。
 */
function isRemoteUrl(src: string): boolean {
  return /^(https?:|data:|blob:)/.test(src);
}

/**
 * 从文件路径中提取目录路径。
 */
function dirname(filePath: string): string {
  const lastSlash = filePath.lastIndexOf('/');
  if (lastSlash === -1) return filePath;
  return filePath.slice(0, lastSlash);
}

/**
 * 将相对路径解析为绝对路径（简单的路径拼接 + 规范化）。
 */
function resolveRelativePath(basePath: string, relativePath: string): string {
  const dir = dirname(basePath);
  const combined = `${dir}/${relativePath}`;
  // 提取 Windows 盘符前缀（如 C:），不参与路径规范化
  const driveMatch = combined.match(/^([a-zA-Z]:)/);
  const pathToNormalize = driveMatch ? combined.slice(2) : combined;
  // 规范化路径：处理 ./ 和 ../
  const parts = pathToNormalize.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }
  const prefix = driveMatch ? driveMatch[1] : '';
  return prefix + '/' + resolved.join('/');
}

/**
 * GitHub 风格 slug：小写、空格转连字符、去除非单词字符（保留中文/字母数字/连字符）。
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/<[^>]+>/g, '')          // 去标签
    .replace(/[^\w一-龥\- ]/g, '') // 去标点（保留中文、字母数字、连字符、空格）
    .replace(/\s+/g, '-');
}

/**
 * 创建自定义渲染器。
 * 本地图片输出为 <img data-local-src="..." src="" /> 形式，
 * 后续由 useEffect 异步加载。
 * 标题生成 GitHub 风格 id（带去重），供页内锚点跳转。
 */
function createRenderer(basePath: string | null) {
  const renderer = new Renderer();
  const slugCounts: Record<string, number> = {};
  const defaultImage = renderer.image.bind(renderer);

  renderer.heading = function (token) {
    const text = this.parser.parseInline(token.tokens);
    let slug = slugify(token.text);
    // 同名标题去重：model, model-1, model-2 ...
    if (slugCounts[slug] !== undefined) {
      slugCounts[slug]++;
      slug = `${slug}-${slugCounts[slug]}`;
    } else {
      slugCounts[slug] = 0;
    }
    return `<h${token.depth} id="${escapeHtml(slug)}">${text}</h${token.depth}>\n`;
  };

  renderer.image = function (token) {
    // 非 Tauri 环境或远程 URL，直接渲染
    if (!isTauri() || isRemoteUrl(token.href)) {
      return defaultImage(token);
    }

    let resolvedPath: string | null = null;
    if (isLocalAbsPath(token.href)) {
      resolvedPath = token.href;
    } else if (basePath) {
      // 相对路径：基于 Markdown 文件所在目录解析
      resolvedPath = resolveRelativePath(basePath, token.href);
    }

    if (resolvedPath) {
      // 输出带 data-local-src 的 img 标签，后续异步加载
      const alt = escapeHtml(token.text || '');
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
      return `<img data-local-src="${escapeHtml(resolvedPath)}" alt="${alt}"${title} style="max-width:100%" />`;
    }

    return defaultImage(token);
  };
  return renderer;
}

// 配置 marked：启用 GFM（GitHub Flavored Markdown）和换行符转 <br>
marked.setOptions({
  gfm: true,
  breaks: true,
});

interface MarkdownPreviewProps {
  /** Markdown 源码 */
  content: string;
  /** 当前文件路径（用于解析相对路径图片） */
  filePath?: string | null;
}

export default function MarkdownPreview({ content, filePath }: MarkdownPreviewProps) {
  const [html, setHtml] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 300ms debounce 解析 Markdown
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        const renderer = createRenderer(filePath ?? null);
        const result = marked.parse(content, { renderer });
        // marked.parse 可能返回 string | Promise<string>，同步模式下是 string
        if (typeof result === 'string') {
          setHtml(result);
        }
      } catch {
        setHtml('<p style="color:red">Markdown 解析错误</p>');
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [content, filePath]);

  // 异步加载本地图片
  useEffect(() => {
    if (!containerRef.current || !isTauri()) return;

    let cancelled = false;
    const images = containerRef.current.querySelectorAll<HTMLImageElement>('img[data-local-src]');
    images.forEach(async (img) => {
      const localPath = img.getAttribute('data-local-src');
      if (!localPath) return;
      try {
        const dataUrl = await invoke<string>('read_image_data_url', { path: localPath });
        if (cancelled) return; // html 已更新或组件卸载，丢弃过期结果
        img.src = dataUrl;
      } catch (e) {
        if (cancelled) return;
        console.warn('Failed to load image:', localPath, e);
        img.alt = `[图片加载失败: ${localPath}]`;
      }
    });

    return () => { cancelled = true; };
  }, [html]);

  // 拦截预览区链接点击：本地文件用编辑器新 tab 打开，远程链接用系统浏览器，
  // 阻止 webview 直接导航（否则会把整个 app 页面替换/重载）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href) return;

      // 页内锚点（#section）：手动滚动到对应标题（容器独立滚动，默认行为不可靠）
      if (href.startsWith('#')) {
        e.preventDefault();
        const id = decodeURIComponent(href.slice(1));
        const target = container.querySelector(`#${CSS.escape(id)}`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      e.preventDefault();

      if (!isTauri()) return;

      if (isRemoteUrl(href) || /^(mailto:|tel:)/.test(href)) {
        // 远程链接 / mailto：系统默认应用打开
        openUrl(href).catch((err) => console.warn('打开链接失败:', href, err));
        return;
      }

      // 本地文件链接：解析为绝对路径后用编辑器打开
      const raw = href.replace(/^file:\/\//, '');
      let target: string | null = null;
      if (isLocalAbsPath(raw)) {
        target = decodeURI(raw);
      } else if (filePath) {
        target = resolveRelativePath(filePath, decodeURI(raw));
      }
      if (target) {
        (window as any).__handleFileDrop?.([target]);
      }
    };

    container.addEventListener('click', handleClick, { capture: true });
    return () => container.removeEventListener('click', handleClick, { capture: true });
  }, [filePath]);

  return (
    <div ref={containerRef} style={styles.container}>
      <div
        className="markdown-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    minWidth: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    borderLeft: '1px solid #ddd',
    padding: '16px 24px',
    background: '#fff',
  },
};
