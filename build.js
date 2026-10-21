#!/usr/bin/env node
/**
 * 把 VideoForge 打包成单个 exe（Node SEA 单文件应用，无需 pkg / nexe 等第三方打包器）
 *
 * 用法:
 *   npm install     # 首次：安装 devDependency postject
 *   npm run build   # 产出 dist/VideoForge.exe
 *
 * 原理:
 *   1. 把 index.html + assets/ + vendor/ 全部作为 assets 嵌入 SEA blob
 *   2. server.js 检测 sea.isSea()，直接从内嵌资源读文件发给浏览器
 *   3. 复制当前 node.exe 并用 postject 把 blob 注入成独立 exe
 */
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const BLOB = path.join(ROOT, 'sea-prep.blob');
const SEA_CONFIG = path.join(ROOT, 'sea-config.json');
const OUT_EXE = path.join(DIST, 'VideoForge.exe');

/** 只嵌入这些扩展名，避免误入测试视频等大文件 */
const ALLOWED_EXT = new Set([
  '.html', '.css', '.js', '.mjs', '.json', '.wasm', '.svg', '.png',
  '.jpg', '.jpeg', '.ico', '.woff2', '.txt', '.map',
]);

function walk(dir, base, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walk(full, rel, out);
    } else if (ALLOWED_EXT.has(path.extname(entry.name).toLowerCase())) {
      out.push(rel);
    }
  }
}

function collectAssets() {
  const files = ['index.html'];
  for (const dir of ['assets', 'vendor']) {
    walk(path.join(ROOT, dir), dir, files);
  }
  return files.sort();
}

/** 从 node.exe 中探测当前版本真实的 SEA sentinel（不同 Node 构建值可能不同） */
function detectSentinel(nodeExe) {
  const text = fs.readFileSync(nodeExe).toString('latin1');
  const m = text.match(/NODE_SEA_FUSE_[0-9a-f]+/);
  if (m) return m[0];
  return 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
}

function loadPostject() {
  try {
    return require('postject');
  } catch {
    console.error('  [x] 缺少 postject，请先执行: npm install');
    process.exit(1);
  }
}

async function main() {
  const nodeExe = process.execPath;
  const assets = collectAssets();
  const totalSize = assets.reduce((sum, rel) => sum + fs.statSync(path.join(ROOT, rel)).size, 0);

  console.log('  VideoForge 单文件打包 (Node SEA)');
  console.log(`  Node: ${process.version}  (${nodeExe})`);
  console.log(`  嵌入资源: ${assets.length} 个文件, ${(totalSize / 1024 / 1024).toFixed(1)} MB`);

  // 1. 生成 sea-config.json
  const assetMap = {};
  for (const rel of assets) assetMap[rel] = rel;
  fs.writeFileSync(
    SEA_CONFIG,
    JSON.stringify(
      {
        main: 'server.js',
        output: 'sea-prep.blob',
        disableExperimentalSEAWarning: true,
        assets: assetMap,
      },
      null,
      2,
    ),
  );

  // 2. 生成 SEA blob
  execFileSync(nodeExe, ['--experimental-sea-config', SEA_CONFIG], { stdio: 'inherit', cwd: ROOT });

  // 3. 复制 node.exe 作为基底（必须用干净副本，postject 是原地修改）
  fs.mkdirSync(DIST, { recursive: true });
  fs.copyFileSync(nodeExe, OUT_EXE);

  // 4. 注入 blob
  const sentinelFuse = detectSentinel(nodeExe);
  const postject = loadPostject();
  await postject.inject(OUT_EXE, 'NODE_SEA_BLOB', fs.readFileSync(BLOB), { sentinelFuse });

  // 5. 清理中间产物
  fs.rmSync(BLOB, { force: true });
  fs.rmSync(SEA_CONFIG, { force: true });

  const exeSize = fs.statSync(OUT_EXE).size;
  console.log('');
  console.log(`  [ok] 已生成: ${OUT_EXE}`);
  console.log(`       大小: ${(exeSize / 1024 / 1024).toFixed(1)} MB`);
  console.log('       双击即可运行；也可加参数: VideoForge.exe --no-open 8888');
}

main().catch((err) => {
  console.error('  [x] 打包失败:', err.message);
  process.exit(1);
});
