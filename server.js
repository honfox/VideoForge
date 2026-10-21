#!/usr/bin/env node
/**
 * VideoForge 零依赖静态服务器 / 单文件版宿主
 *
 * 开发模式（资源走磁盘）:
 *   node server.js [--open] [--no-open] [port]
 *
 * 单文件模式（build.js 打包出的 VideoForge.exe，资源内置于 exe）:
 *   VideoForge.exe [--no-open] [port]
 *
 * 退出方式:
 *   - Ctrl+C
 *   - 关闭浏览器标签页 / 窗口（页面通过 /__events 与服务端保持连接，断开即退出）
 *   - 浏览器访问 /__quit
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { exec } = require('node:child_process');

const ROOT = __dirname;
const ARGS = process.argv.slice(2);

/* ------------------------------------------------------------------ *
 * 运行模式
 * ------------------------------------------------------------------ */
let sea = null;
try {
  sea = require('node:sea');
} catch {
  sea = null; // Node < 20 没有 node:sea，按开发模式跑
}
const IS_SEA = !!(sea && sea.isSea());

const portArg = ARGS.find((a) => /^\d+$/.test(a));
const PORT = Number(portArg || process.env.PORT || 5173);
const NO_OPEN = ARGS.includes('--no-open');
// 单文件版双击运行时默认打开浏览器；node server.js 默认不开（保持原行为）
const OPEN_BROWSER = NO_OPEN ? false : ARGS.includes('--open') || IS_SEA;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.flv': 'video/x-flv',
};

/* ------------------------------------------------------------------ *
 * 静态资源：SEA 模式从内嵌资源读取，开发模式读磁盘
 * ------------------------------------------------------------------ */
const embeddedCache = new Map(); // relPath -> Buffer（懒加载，避免重复拷贝）

function readEmbedded(relPath) {
  if (embeddedCache.has(relPath)) return embeddedCache.get(relPath);
  const buf = Buffer.from(sea.getAsset(relPath)); // 不存在时抛错
  embeddedCache.set(relPath, buf);
  return buf;
}

function cacheHeaders(relPath) {
  // 嵌入资源永不变；开发模式下只对 vendor / 字体做长缓存
  const immutable = IS_SEA || relPath.startsWith('vendor/') || /\.(wasm|woff2)$/.test(relPath);
  return immutable ? 'public, max-age=31536000, immutable' : 'no-cache';
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
}

/** 把 URL 路径收敛成安全的相对路径（防目录穿越），非法返回 null */
function safeRelPath(pathname) {
  if (pathname === '/') pathname = '/index.html';
  let rel;
  try {
    rel = path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  } catch {
    return null;
  }
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

function sendAsset(req, res, relPath) {
  const ext = path.extname(relPath).toLowerCase();
  const baseHeaders = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cacheHeaders(relPath),
    // 多线程 ffmpeg.wasm 需要 SharedArrayBuffer，页面必须处于 cross-origin isolated 状态
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };

  if (IS_SEA) {
    let data;
    try {
      data = readEmbedded(relPath);
    } catch {
      notFound(res);
      return;
    }
    res.writeHead(200, { ...baseHeaders, 'Content-Length': data.length });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.end(data);
    return;
  }

  const filePath = path.join(ROOT, relPath);
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      notFound(res);
      return;
    }
    res.writeHead(200, { ...baseHeaders, 'Content-Length': stat.size });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath)
      .on('error', () => res.destroy())
      .pipe(res);
  });
}

/* ------------------------------------------------------------------ *
 * 退出管理：页面保活连接断开 -> 宽限 3 秒（覆盖刷新）-> 退出
 * ------------------------------------------------------------------ */
const QUIT_GRACE = 3000; // 最后一个页面断开后的宽限时间
let clients = 0; // 打开的页面保活连接数
let emptySince = 0; // 连接数归零的时间戳
let shuttingDown = false;

function openEventStream(req, res) {
  clients++;
  emptySince = 0;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  });
  res.write(': connected\n\n');

  const keepAlive = setInterval(() => {
    try {
      res.write(': keep-alive\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 15000);

  // req/res 的 close 可能重复触发，必须保证只计数一次
  let closed = false;
  const done = () => {
    if (closed) return;
    closed = true;
    clearInterval(keepAlive);
    if (--clients === 0) emptySince = Date.now();
  };
  req.on('close', done);
  res.on('close', done);
  res.on('error', done);
}

function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n  正在退出（${reason}）…`);
  try {
    server.closeAllConnections?.();
  } catch {
    /* 旧版本 Node 没有该方法，忽略 */
  }
  server.close(() => process.exit(0));
  // 兜底：1.5 秒内无论是否还有残留连接都强制退出
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', () => shutdown('Ctrl+C'));
process.on('SIGTERM', () => shutdown('终止信号'));

setInterval(() => {
  if (!shuttingDown && clients === 0 && emptySince && Date.now() - emptySince > QUIT_GRACE) {
    shutdown('页面已关闭');
  }
}, 1000);

/* ------------------------------------------------------------------ *
 * HTTP 服务
 * ------------------------------------------------------------------ */
const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  // 页面保活连接：浏览器开着页面就连着，页面全部关闭后服务端自动退出
  if (pathname === '/__events') {
    openEventStream(req, res);
    return;
  }

  // 手动退出：浏览器访问 http://localhost:<port>/__quit
  if (pathname === '/__quit') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><p>服务已退出，可以关闭此标签页。</p>');
    setTimeout(() => shutdown('手动退出'), 50);
    return;
  }

  const relPath = safeRelPath(pathname);
  if (!relPath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  sendAsset(req, res, relPath);
});

function openBrowser(url) {
  const cmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.log(`  请手动打开: ${url}`);
  });
}

function listen(port, attempt = 0) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < 20) {
      listen(port + 1, attempt + 1);
      return;
    }
    console.error('启动失败:', err.message);
    process.exit(1);
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log('');
    console.log(`  VideoForge 视频格式转换器已启动${IS_SEA ? '（单文件版）' : ''}`);
    console.log(`  → ${url}`);
    console.log('');
    console.log('  关闭浏览器标签页、按 Ctrl+C 或访问 /__quit 均可退出');
    if (OPEN_BROWSER) openBrowser(url);
  });
}

listen(PORT);
