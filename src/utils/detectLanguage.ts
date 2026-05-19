/**
 * 根据文件扩展名或文件名检测编程语言。
 *
 * 优先匹配特殊文件名（如 Dockerfile、Makefile），
 * 再按扩展名映射到对应语言。
 * 无法识别时返回 'txt'（纯文本）。
 */
export function detectLanguage(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex === -1 || dotIndex === fileName.length - 1) {
    return 'txt';
  }

  const ext = fileName.slice(dotIndex + 1).toLowerCase();
  const baseName = fileName.slice(0, dotIndex).toLowerCase();

  // Special filename-based detection (e.g., Dockerfile, Makefile)
  const filenameMap: Record<string, string> = {
    dockerfile: 'dockerfile',
    makefile: 'txt',
    license: 'txt',
    readme: 'markdown',
  };
  if (filenameMap[baseName]) {
    return filenameMap[baseName];
  }

  const langMap: Record<string, string> = {
    // Web
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'css',
    sass: 'css',
    less: 'css',
    json: 'json',
    jsonl: 'json',

    // Scripting
    py: 'python',
    pyw: 'python',
    pyi: 'python',
    rb: 'ruby',
    pl: 'perl',
    pm: 'perl',
    php: 'php',
    php3: 'php',
    php4: 'php',
    phtml: 'php',

    // Shell
    sh: 'shell',
    bash: 'shell',
    zsh: 'shell',
    fish: 'shell',
    ksh: 'shell',
    csh: 'shell',

    // Systems
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    hpp: 'cpp',
    hxx: 'cpp',
    rs: 'rust',
    rlib: 'rust',
    go: 'go',
    swift: 'swift',
    java: 'java',
    kt: 'kotlin',
    kts: 'kotlin',
    scala: 'txt',

    // Data / Config
    xml: 'xml',
    svg: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    ini: 'ini',
    conf: 'conf',
    cfg: 'ini',
    properties: 'txt',
    sql: 'sql',
    graphql: 'txt',
    gql: 'txt',

    // Docs
    md: 'markdown',
    markdown: 'markdown',
    mdown: 'markdown',
    txt: 'txt',
    log: 'txt',
    rtf: 'txt',

    // Other
    lua: 'lua',
    r: 'r',
    dart: 'dart',
    perl: 'perl',
    nginx: 'nginx',
    vue: 'html',
    svelte: 'html',
  };

  return langMap[ext] || 'txt';
}
