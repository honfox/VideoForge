import {
  FORMATS,
  RESOLUTIONS,
  SCALE_MODES,
  SWS_FLAGS,
  FPS_PRESETS,
  X264_PRESETS,
  PIX_FMTS,
  AUDIO_BITRATES,
  getFormat,
  videoCodecOptions,
  audioCodecOptions,
} from './formats.js';
import { buildCommand, targetSize, humanTime, formatTimestamp, parseTime, estimateOutput } from './builder.js';
import { VideoEngine, mimeFor } from './engine.js';
import { loadSettings, saveSettings, clearSettings } from './storage.js';
import {
  analyzeDevice,
  orientSize,
  LONG_EDGES,
  DEFAULT_LONG_EDGE,
  AMV_MAX,
} from './device-fit.js';

const $ = (id) => document.getElementById(id);
const el = {
  enginePill: $('enginePill'),
  engineLabel: $('engineLabel'),
  engineBar: $('engineBar'),
  engineBarFill: $('engineBarFill'),
  dropzone: $('dropzone'),
  fileInput: $('fileInput'),
  fileList: $('fileList'),
  clearFilesBtn: $('clearFilesBtn'),
  sourceMeta: $('sourceMeta'),
  deviceMeta: $('deviceMeta'),
  devWidth: $('devWidth'),
  devHeight: $('devHeight'),
  devUnit: $('devUnit'),
  devKnownRes: $('devKnownRes'),
  devKnownSize: $('devKnownSize'),
  devKnownW: $('devKnownW'),
  devKnownH: $('devKnownH'),
  devLongEdge: $('devLongEdge'),
  devError: $('devError'),
  devResult: $('devResult'),
  devRatioBadge: $('devRatioBadge'),
  devRatioText: $('devRatioText'),
  devRecText: $('devRecText'),
  devLandscapeBtn: $('devLandscapeBtn'),
  devPortraitBtn: $('devPortraitBtn'),
  devLandscapeSize: $('devLandscapeSize'),
  devPortraitSize: $('devPortraitSize'),
  devSquareNote: $('devSquareNote'),
  devAmvNote: $('devAmvNote'),
  devApplyNote: $('devApplyNote'),
  formatGrid: $('formatGrid'),
  formatMeta: $('formatMeta'),
  formatNote: $('formatNote'),
  tabs: $('tabs'),
  resSelect: $('resSelect'),
  ratioBadge: $('ratioBadge'),
  customSize: $('customSize'),
  customW: $('customW'),
  customH: $('customH'),
  swapWH: $('swapWH'),
  sizeError: $('sizeError'),
  scaleGrid: $('scaleGrid'),
  scaleHint: $('scaleHint'),
  padColor: $('padColor'),
  padColorText: $('padColorText'),
  padColorField: $('padColorField'),
  swsFlags: $('swsFlags'),
  fpsChips: $('fpsChips'),
  fpsCustomWrap: $('fpsCustomWrap'),
  fpsCustom: $('fpsCustom'),
  fpsSync: $('fpsSync'),
  srcFpsBadge: $('srcFpsBadge'),
  vcodec: $('vcodec'),
  copyVideo: $('copyVideo'),
  copyVideoNote: $('copyVideoNote'),
  copySizeNotice: $('copySizeNotice'),
  copyFpsNotice: $('copyFpsNotice'),
  videoEncodeFields: $('videoEncodeFields'),
  rateMode: $('rateMode'),
  crfField: $('crfField'),
  crfRange: $('crfRange'),
  crfValue: $('crfValue'),
  bitrateFields: $('bitrateFields'),
  bitrate: $('bitrate'),
  maxrate: $('maxrate'),
  presetField: $('presetField'),
  x264Preset: $('x264Preset'),
  pixFmtField: $('pixFmtField'),
  pixFmt: $('pixFmt'),
  gop: $('gop'),
  audioMode: $('audioMode'),
  audioEncodeFields: $('audioEncodeFields'),
  acodec: $('acodec'),
  abitrate: $('abitrate'),
  arate: $('arate'),
  achannels: $('achannels'),
  amvBanner: $('amvBanner'),
  amvAudioNote: $('amvAudioNote'),
  trimStart: $('trimStart'),
  trimEnd: $('trimEnd'),
  trimError: $('trimError'),
  faststart: $('faststart'),
  stripMeta: $('stripMeta'),
  saveIndicator: $('saveIndicator'),
  resetBtn: $('resetBtn'),
  cmdPreview: $('cmdPreview'),
  warnings: $('warnings'),
  copyCmd: $('copyCmd'),
  taskMeta: $('taskMeta'),
  clearResultsBtn: $('clearResultsBtn'),
  progressBlock: $('progressBlock'),
  progressLabel: $('progressLabel'),
  progressPct: $('progressPct'),
  progressBar: $('progressBar'),
  progressTime: $('progressTime'),
  cancelBtn: $('cancelBtn'),
  results: $('results'),
  resultsEmpty: $('resultsEmpty'),
  log: $('log'),
  logCard: $('logCard'),
  clearLog: $('clearLog'),
  toggleLogBtn: $('toggleLogBtn'),
  panePlaceholder: $('panePlaceholder'),
  dockTitle: $('dockTitle'),
  dockSub: $('dockSub'),
  dockEst: $('dockEst'),
  convertBtn: $('convertBtn'),
  toastWrap: $('toastWrap'),
};

const DEFAULTS = () => ({
  formatId: 'mp4',
  resolution: { mode: 'source', width: 0, height: 0 },
  scaleMode: 'fit',
  padColor: '#000000',
  swsFlags: 'lanczos',
  fps: { mode: 'source', value: 30, sync: 'auto' },
  video: {
    codec: 'libx264',
    rateMode: 'crf',
    crf: 23,
    bitrate: 2500,
    maxrate: 4000,
    preset: 'fast',
    pixFmt: 'yuv420p',
    gop: 0,
    copy: false,
  },
  audio: { mode: 'encode', codec: 'aac', bitrate: '128k', rate: 0, channels: 0 },
  trim: { start: '', end: '' },
  faststart: true,
  stripMeta: true,
  device: {
    width: '',
    height: '',
    unit: 'mm',
    knownRes: false,
    knownW: 0,
    knownH: 0,
    longEdge: DEFAULT_LONG_EDGE,
  },
});

/* ------------------------------------------------------------------ *
 * 参数持久化：恢复 + 防抖保存
 * ------------------------------------------------------------------ */
function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function clampNum(v, min, max, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

const pickEnum = (v, list, fallback) => (list.includes(v) ? v : fallback);

/** 把任意来源（localStorage）的状态对象清洗成合法状态，字段缺失 / 越界 / 枚举不存在时回退默认 */
function sanitizeState(s) {
  const d = DEFAULTS();
  const out = { ...d };
  if (!s || typeof s !== 'object') return out;

  out.formatId = pickEnum(s.formatId, FORMATS.map((f) => f.id), d.formatId);

  const r = s.resolution || {};
  out.resolution = {
    mode: pickEnum(r.mode, ['source', 'preset', 'custom'], 'source'),
    width: clampInt(r.width, 0, 8192, 0),
    height: clampInt(r.height, 0, 8192, 0),
  };

  out.scaleMode = pickEnum(s.scaleMode, SCALE_MODES.map((m) => m.id), d.scaleMode);
  out.padColor = /^#[0-9a-f]{6}$/i.test(s.padColor) ? s.padColor : d.padColor;
  out.swsFlags = pickEnum(s.swsFlags, SWS_FLAGS.map((x) => x.id), d.swsFlags);

  const fp = s.fps || {};
  out.fps = {
    mode: fp.mode === 'value' ? 'value' : 'source',
    value: clampNum(fp.value, 1, 240, 30),
    sync: pickEnum(fp.sync, ['auto', 'cfr', 'vfr', 'passthrough'], 'auto'),
  };

  const v = s.video || {};
  out.video = {
    codec: typeof v.codec === 'string' && v.codec ? v.codec : d.video.codec,
    rateMode: pickEnum(v.rateMode, ['crf', 'bitrate'], 'crf'),
    crf: clampInt(v.crf, 0, 51, 23),
    bitrate: clampInt(v.bitrate, 0, 100000, 2500),
    maxrate: clampInt(v.maxrate, 0, 200000, 4000),
    preset: pickEnum(v.preset, X264_PRESETS.map((p) => p.id), d.video.preset),
    pixFmt: pickEnum(v.pixFmt, PIX_FMTS.map((p) => p.id), d.video.pixFmt),
    gop: clampInt(v.gop, 0, 1000, 0),
    copy: !!v.copy,
  };

  const a = s.audio || {};
  out.audio = {
    mode: pickEnum(a.mode, ['encode', 'copy', 'none'], 'encode'),
    codec: typeof a.codec === 'string' && a.codec ? a.codec : d.audio.codec,
    bitrate: pickEnum(a.bitrate, AUDIO_BITRATES, d.audio.bitrate),
    rate: pickEnum(Number(a.rate), [0, 8000, 16000, 22050, 32000, 44100, 48000], 0),
    channels: pickEnum(Number(a.channels), [0, 1, 2], 0),
  };

  const t = s.trim || {};
  const timeStr = (x) => (typeof x === 'string' ? x.slice(0, 32) : '');
  out.trim = { start: timeStr(t.start), end: timeStr(t.end) };

  out.faststart = !!s.faststart;
  out.stripMeta = !!s.stripMeta;

  const dv = s.device || {};
  const edgeStr = (x) => {
    const n = Number(x);
    return Number.isFinite(n) && n > 0 ? String(n).slice(0, 10) : '';
  };
  out.device = {
    width: edgeStr(dv.width),
    height: edgeStr(dv.height),
    unit: pickEnum(dv.unit, ['mm', 'cm', 'inch'], 'mm'),
    knownRes: !!dv.knownRes,
    knownW: clampInt(dv.knownW, 0, 8192, 0),
    knownH: clampInt(dv.knownH, 0, 8192, 0),
    longEdge: pickEnum(Number(dv.longEdge), LONG_EDGES, DEFAULT_LONG_EDGE),
  };
  return out;
}

const savedSettings = loadSettings();
const restoredFromStorage = !!savedSettings;

let state = sanitizeState(savedSettings || DEFAULTS());
let lastFormatId = null;
let files = [];
let busy = false;
let cancelRequested = false;
let results = [];
let uid = 0;
// 切换到 AMV 之前的参数快照，离开 AMV 时恢复（不持久化）
let amvBackup = null;

const engine = new VideoEngine();
const fmt = () => getFormat(state.formatId);
const hasVideo = () => fmt().kind !== 'audio';
const hasAudio = () => fmt().kind !== 'image';

let saveTimer = null;

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 300);
}

function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  saveSettings(state);
  el.saveIndicator.textContent = '已保存';
  el.saveIndicator.classList.add('is-saved');
  clearTimeout(flushSave._t);
  flushSave._t = setTimeout(() => {
    el.saveIndicator.textContent = '自动保存';
    el.saveIndicator.classList.remove('is-saved');
  }, 1400);
}

function toast(message) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  el.toastWrap.appendChild(node);
  setTimeout(() => node.classList.add('is-out'), 1800);
  setTimeout(() => node.remove(), 2200);
}

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function gcd(a, b) {
  return b ? gcd(b, a % b) : a;
}

function ratioText(w, h) {
  if (!w || !h) return '';
  const g = gcd(w, h);
  const rw = w / g;
  const rh = h / g;
  if (rw > 30 || rh > 30) return (w / h).toFixed(2) + ':1';
  return `${rw}:${rh}`;
}

function currentFile() {
  return files.find((f) => f.status !== 'done') || files[0] || null;
}

/** 汇总当前文件的源信息，供输出体积预估使用 */
function sourceInfo() {
  const file = currentFile();
  if (!file) return null;
  return {
    bytes: file.size,
    duration: file.meta?.duration || 0,
    width: file.meta?.width || 0,
    height: file.meta?.height || 0,
    fps: file.meta?.fps || 0,
    videoKbps: file.meta?.bitrate || 0,
  };
}

/* ------------------------------------------------------------------ *
 * 日志
 * ------------------------------------------------------------------ */
const MAX_LOG_LINES = 260;
let logQueue = [];
let logTimer = null;

// 多线程 ffmpeg 的日志量极大，逐条写 DOM 会把主线程拖死，这里统一批量刷入
function enqueueLog(className, text) {
  logQueue.push({ className, text });
  if (logQueue.length > 600) logQueue.splice(0, logQueue.length - 600);
  if (!logTimer) logTimer = setTimeout(flushLog, 150);
}

function flushLog() {
  logTimer = null;
  if (!logQueue.length) return;
  const batch = logQueue;
  logQueue = [];
  const frag = document.createDocumentFragment();
  for (const item of batch) {
    const line = document.createElement('div');
    line.className = item.className;
    line.textContent = item.text;
    frag.appendChild(line);
  }
  el.log.appendChild(frag);
  let extra = el.log.childElementCount - MAX_LOG_LINES;
  while (extra-- > 0 && el.log.firstChild) el.log.removeChild(el.log.firstChild);
  el.log.scrollTop = el.log.scrollHeight;
}

function log(type, message) {
  if (!message) return;
  const text = String(message).replace(/\s+$/, '');
  if (!text.trim()) return;
  // ffmpeg.wasm 在每次 exec 结束时会输出 Aborted()，属于正常清理，不展示
  if (/^Aborted\(\)$/i.test(text.trim())) return;
  const kind = /error|invalid|failed|unable/i.test(text)
    ? 'error'
    : /warning|deprecated/i.test(text)
      ? 'warn'
      : type === 'info'
        ? 'info'
        : '';
  enqueueLog(`ln ${kind}`, text);
}

function sysLog(message) {
  enqueueLog('ln sys', `› ${message}`);
}

function setLogCollapsed(collapsed) {
  el.logCard.classList.toggle('is-collapsed', collapsed);
  el.toggleLogBtn.textContent = collapsed ? '展开' : '收起';
}

/* ------------------------------------------------------------------ *
 * 引擎
 * ------------------------------------------------------------------ */
function setEngineState(stateName, text) {
  el.enginePill.dataset.state = stateName;
  el.engineLabel.textContent = text;
  el.engineBar.hidden = true;
}

let engineLoadTask = null;

function loadEngine() {
  if (engine.loaded) return Promise.resolve();
  if (engineLoadTask) return engineLoadTask;
  engineLoadTask = doLoadEngine().finally(() => {
    engineLoadTask = null;
  });
  return engineLoadTask;
}

async function doLoadEngine() {
  setEngineState('loading', '正在加载转码引擎…');
  setLogCollapsed(false); // 加载过程有反馈，展开日志
  sysLog(
    engine.multiThreadAvailable
      ? '检测到 cross-origin isolated，尝试加载多线程运行时（约 33 MB，仅首次）'
      : '开始下载 ffmpeg.wasm 单线程运行时（约 32 MB，仅首次）'
  );
  try {
    await engine.load({
      onStage: ({ stage, multi, progress, received, total }) => {
        if (stage === 'core') {
          const pct = Math.round(progress * 100);
          const kind = multi ? '多线程' : '单线程';
          el.engineBar.hidden = !total;
          el.engineBarFill.style.width = `${pct}%`;
          setEngineState(
            'loading',
            total
              ? `下载${kind}运行时 ${pct}%（${formatBytes(received)} / ${formatBytes(total)}）`
              : `正在下载${kind}运行时…`
          );
          el.engineBar.hidden = !total;
        } else {
          setEngineState('loading', '正在初始化 WebAssembly…');
        }
      },
    });
    setEngineState(
      'ready',
      engine.mode === 'multi' ? `多线程引擎 · ${engine.threads} 线程` : '单线程引擎已就绪'
    );
    sysLog(`引擎加载完成：${engine.mode === 'multi' ? `多线程（${engine.threads} 线程）` : '单线程'}`);
    // 对缺少时长的文件补一次 ffmpeg 探测
    for (const item of files) {
      if (!item.meta?.duration) await probeWithFfmpeg(item);
    }
    updateDock();
  } catch (err) {
    setEngineState('error', '引擎加载失败');
    log('error', `引擎加载失败：${err?.message || err}`);
    sysLog('提示：必须通过 http:// 访问页面（npm start），直接双击 index.html 会因浏览器安全策略失败');
    throw err;
  }
}

el.enginePill.addEventListener('click', () => {
  if (!engine.loaded && !engine.loading) loadEngine().catch(() => {});
});

/* ------------------------------------------------------------------ *
 * 文件处理
 * ------------------------------------------------------------------ */
function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : 'bin';
}

function readMediaMeta(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const media = document.createElement('video');
    let settled = false;
    const finish = (meta) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      media.removeAttribute('src');
      resolve(meta);
    };
    media.preload = 'metadata';
    media.muted = true;
    media.onloadedmetadata = () =>
      finish({
        duration: Number.isFinite(media.duration) ? media.duration : 0,
        width: media.videoWidth || 0,
        height: media.videoHeight || 0,
        fps: 0,
      });
    media.onerror = () => finish({ duration: 0, width: 0, height: 0, fps: 0 });
    media.src = url;
    setTimeout(() => finish({ duration: 0, width: 0, height: 0, fps: 0 }), 6000);
  });
}

async function addFiles(list) {
  const incoming = Array.from(list || []).filter((f) => f.size > 0);
  if (!incoming.length) return;
  for (const file of incoming) {
    const item = {
      id: ++uid,
      file,
      name: file.name,
      size: file.size,
      ext: extOf(file.name),
      meta: { duration: 0, width: 0, height: 0, fps: 0 },
      status: 'pending',
    };
    files.push(item);
    readMediaMeta(file).then((meta) => {
      item.meta = { ...item.meta, ...meta };
      renderFiles();
      syncUI();
    });
    if (file.size > 512 * 1024 * 1024) {
      sysLog(`${file.name} 超过 512 MB，浏览器内存可能不足，建议先切片处理`);
    }
  }
  renderFiles();
  syncUI();
  updateDock();
  if (!engine.loaded) loadEngine().catch(() => {});
}

async function probeWithFfmpeg(item) {
  if (!engine.loaded || item.meta?.duration) return;
  try {
    item.status = 'probing';
    renderFiles();
    const data = new Uint8Array(await item.file.arrayBuffer());
    const info = await engine.probe(data, item.ext);
    item.meta = { ...item.meta, ...info };
  } catch {
    /* 探测失败不影响转换 */
  } finally {
    if (item.status === 'probing') item.status = 'pending';
    renderFiles();
    syncUI();
  }
}

el.dropzone.addEventListener('click', () => el.fileInput.click());
el.dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    el.fileInput.click();
  }
});
el.fileInput.addEventListener('change', () => {
  addFiles(el.fileInput.files);
  el.fileInput.value = '';
});
['dragenter', 'dragover'].forEach((evt) =>
  el.dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    el.dropzone.classList.add('is-over');
  })
);
['dragleave', 'drop'].forEach((evt) =>
  el.dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    if (evt === 'dragleave' && e.relatedTarget && el.dropzone.contains(e.relatedTarget)) return;
    el.dropzone.classList.remove('is-over');
  })
);
el.dropzone.addEventListener('drop', (e) => {
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
});

const STATUS_TEXT = {
  pending: '待转换',
  probing: '识别中',
  processing: '转换中',
  done: '已完成',
  error: '失败',
};

function renderFiles() {
  el.clearFilesBtn.hidden = !files.length;
  if (!files.length) {
    el.fileList.innerHTML = '';
    el.sourceMeta.textContent = '尚未选择';
    return;
  }
  const total = files.reduce((sum, f) => sum + f.size, 0);
  el.sourceMeta.textContent = `${files.length} 个文件 · ${formatBytes(total)}`;
  el.fileList.innerHTML = files
    .map((f) => {
      const meta = [];
      meta.push(formatBytes(f.size));
      if (f.meta?.duration) meta.push(humanTime(f.meta.duration));
      if (f.meta?.width) meta.push(`${f.meta.width}×${f.meta.height}`);
      if (f.meta?.fps) meta.push(`${Number(f.meta.fps).toFixed(2)} fps`);
      meta.push(f.ext.toUpperCase());
      return `
        <li class="file-item" data-id="${f.id}">
          <span class="file-thumb">${esc(f.ext.slice(0, 4))}</span>
          <div class="file-info">
            <div class="file-name" title="${esc(f.name)}">${esc(f.name)}</div>
            <div class="file-meta">${meta.map((m) => `<span>${esc(m)}</span>`).join('')}
              <span class="${f.status === 'done' ? 'ok' : ''}">${STATUS_TEXT[f.status] || ''}</span>
            </div>
          </div>
          <button class="icon-btn" type="button" data-remove="${f.id}" aria-label="移除文件">
            <svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8"/></svg>
          </button>
        </li>`;
    })
    .join('');
}

el.fileList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-remove]');
  if (!btn || busy) return;
  const id = Number(btn.dataset.remove);
  files = files.filter((f) => f.id !== id);
  renderFiles();
  syncUI();
  updateDock();
});

el.clearFilesBtn.addEventListener('click', () => {
  if (busy || !files.length) return;
  files = [];
  renderFiles();
  syncUI();
  updateDock();
  toast('已清空文件列表');
});

/* ------------------------------------------------------------------ *
 * 渲染控件
 * ------------------------------------------------------------------ */
function renderFormats() {
  el.formatGrid.innerHTML = FORMATS.map(
    (f) => `
      <button class="format-card" type="button" data-format="${f.id}" role="radio" aria-checked="false">
        <span class="format-label">${esc(f.label)}${
          f.tag ? `<span class="format-tag">${esc(f.tag)}</span>` : ''
        }</span>
        <span class="format-hint">${esc(f.hint)}</span>
      </button>`
  ).join('');
}

function renderResolutions() {
  const opts = ['<option value="source">保持原始（不缩放）</option>'];
  opts.push('<optgroup label="标准分辨率">');
  for (const r of RESOLUTIONS) {
    opts.push(`<option value="${r.w}x${r.h}">${r.label} — ${r.w}×${r.h}</option>`);
  }
  opts.push('</optgroup>');
  opts.push('<option value="custom">自定义尺寸…</option>');
  el.resSelect.innerHTML = opts.join('');
}

function renderScaleModes() {
  el.scaleGrid.innerHTML = SCALE_MODES.map(
    (m) => `
      <button class="scale-card" type="button" data-scale="${m.id}" role="radio" aria-checked="false" title="${esc(m.desc)}">
        <svg viewBox="0 0 48 36" aria-hidden="true">${m.icon}</svg>
        <span class="scale-name">${esc(m.label)}</span>
        <span class="scale-desc">${esc(m.desc)}</span>
      </button>`
  ).join('');
}

// AMV 的音频块大小 = 22050 / 帧率，必须能整除，因此只暴露兼容帧率
const AMV_FPS_PRESETS = ['10', '14', '15', '18', '21', '25', '30'].map((v) => ({ id: v, label: v }));

function renderFpsChips() {
  const list = state.formatId === 'amv' ? AMV_FPS_PRESETS : FPS_PRESETS;
  el.fpsChips.innerHTML = list
    .map(
      (p) =>
        `<button class="chip" type="button" data-fps="${p.id}" role="radio" aria-checked="false">${esc(p.label)}</button>`
    )
    .join('');
}

function fillSelect(node, items, value) {
  node.innerHTML = items
    .map((i) => `<option value="${esc(i.id)}">${esc(i.label)}${i.detail ? ` — ${esc(i.detail)}` : ''}</option>`)
    .join('');
  if (value && items.some((i) => i.id === value)) node.value = value;
  else if (items.length) node.value = items[0].id;
  return node.value;
}

function renderStaticSelects() {
  el.swsFlags.innerHTML = SWS_FLAGS.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
  el.x264Preset.innerHTML = X264_PRESETS.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join('');
  el.pixFmt.innerHTML = PIX_FMTS.map((p) => `<option value="${p.id}">${esc(p.label)}</option>`).join('');
  el.abitrate.innerHTML = AUDIO_BITRATES.map((b) => `<option value="${b}">${b}</option>`).join('');
}

function renderCodecSelects(force = false) {
  const f = fmt();
  const vOptions = videoCodecOptions(f);
  if (force || lastFormatId !== f.id) {
    if (!vOptions.some((c) => c.id === state.video.codec)) {
      state.video.codec = vOptions[0]?.id || 'libx264';
    }
    const aOptions = audioCodecOptions(f);
    if (!aOptions.some((c) => c.id === state.audio.codec)) {
      state.audio.codec = aOptions[0]?.id || 'aac';
    }
    lastFormatId = f.id;
  }
  if (vOptions.length) fillSelect(el.vcodec, vOptions, state.video.codec);
  const aOptions = audioCodecOptions(f);
  if (aOptions.length) fillSelect(el.acodec, aOptions, state.audio.codec);

  const rates = aOptions.find((a) => a.id === state.audio.codec)?.rates || [48000, 44100];
  const rateOptions = [{ id: '0', label: '保持原始' }, ...rates.map((r) => ({ id: String(r), label: `${r} Hz` }))];
  const keep = rateOptions.some((r) => r.id === String(state.audio.rate)) ? String(state.audio.rate) : '0';
  el.arate.innerHTML = rateOptions.map((r) => `<option value="${r.id}">${r.label}</option>`).join('');
  el.arate.value = keep;
  state.audio.rate = Number(keep);
}

/* ------------------------------------------------------------------ *
 * 输入校验
 * ------------------------------------------------------------------ */
const TIME_RE = /^(\d+(\.\d+)?)(:\d+(\.\d+)?){0,2}$/;

function refreshTrimError() {
  const startRaw = el.trimStart.value.trim();
  const endRaw = el.trimEnd.value.trim();
  let problem = '';
  if (startRaw && !TIME_RE.test(startRaw)) problem = '开始时间格式无法识别，支持 90、1:30、00:01:30.5';
  else if (endRaw && !TIME_RE.test(endRaw)) problem = '结束时间格式无法识别，支持 90、1:30、00:01:30.5';
  else if (startRaw && endRaw) {
    const s = parseTime(startRaw);
    const e = parseTime(endRaw);
    if (e > 0 && s > 0 && e <= s) problem = '结束时间需要大于开始时间，当前时间范围会被忽略';
  }
  el.trimError.hidden = !problem;
  el.trimError.textContent = problem;
}

function refreshSizeError() {
  const wRaw = el.customW.value.trim();
  const hRaw = el.customH.value.trim();
  let problem = '';
  if (wRaw) {
    const w = Number(wRaw);
    if (!Number.isFinite(w) || w < 2) problem = '宽度最小为 2';
    else if (w > 8192) problem = '宽度不建议超过 8192';
    else if (w % 2 !== 0) problem = '奇数宽度会自动调整为偶数';
  }
  if (!problem && hRaw) {
    const h = Number(hRaw);
    if (!Number.isFinite(h) || h < 2) problem = '高度最小为 2';
    else if (h > 8192) problem = '高度不建议超过 8192';
    else if (h % 2 !== 0) problem = '奇数高度会自动调整为偶数';
  }
  el.sizeError.hidden = !problem;
  el.sizeError.textContent = problem;
}

/* ------------------------------------------------------------------ *
 * UI 同步
 * ------------------------------------------------------------------ */
function syncUI() {
  const f = fmt();
  const size = targetSize(state);

  // 格式卡片
  for (const card of el.formatGrid.querySelectorAll('[data-format]')) {
    const active = card.dataset.format === state.formatId;
    card.classList.toggle('is-active', active);
    card.setAttribute('aria-checked', String(active));
  }
  el.formatMeta.textContent = `${f.label} · ${f.hint}`;
  el.formatNote.textContent =
    f.id === 'amv'
      ? 'AMV 是廉价 MP4 播放器使用的 Motion-JPEG + ADPCM 格式，已自动套用 160×120 / 15fps / 单声道 22050Hz 预设；帧率需能整除 22050，否则音频块无法对齐。'
      : f.id === 'gif'
        ? 'GIF 使用 256 色调色板生成，无音频；帧率与尺寸直接决定文件体积。'
        : f.kind === 'audio'
          ? '仅导出音频轨道，画面会被丢弃。'
          : '';

  // 分辨率
  const resValue =
    state.resolution.mode === 'source'
      ? 'source'
      : state.resolution.mode === 'custom'
        ? 'custom'
        : `${state.resolution.width}x${state.resolution.height}`;
  const hasOption = Array.from(el.resSelect.options).some((o) => o.value === resValue);
  el.resSelect.value = hasOption ? resValue : 'custom';
  if (!hasOption && state.resolution.mode === 'preset') {
    state.resolution.mode = 'custom';
    el.resSelect.value = 'custom';
  }
  el.customSize.hidden = state.resolution.mode !== 'custom';
  if (state.resolution.mode === 'custom') {
    el.customW.value = state.resolution.width || '';
    el.customH.value = state.resolution.height || '';
  }

  const meta = currentFile()?.meta;
  if (!hasVideo()) {
    el.ratioBadge.textContent = '仅音频输出';
  } else if (size) {
    const rw = size.width || (meta?.width ? Math.round((meta.width * (size.height || 0)) / (meta.height || 1)) : 0);
    el.ratioBadge.textContent = `${size.width || '自动'}×${size.height || '自动'}${rw ? ` · ${ratioText(rw, size.height || meta?.height || 0)}` : ''}`;
  } else if (meta?.width) {
    el.ratioBadge.textContent = `源 ${meta.width}×${meta.height}`;
  } else {
    el.ratioBadge.textContent = '源尺寸未知';
  }

  // 缩放方式
  for (const card of el.scaleGrid.querySelectorAll('[data-scale]')) {
    const active = card.dataset.scale === state.scaleMode;
    card.classList.toggle('is-active', active);
    card.setAttribute('aria-checked', String(active));
  }
  const scaleMeta = SCALE_MODES.find((m) => m.id === state.scaleMode);
  el.scaleHint.textContent = scaleMeta?.desc || '';
  el.padColorField.style.display = state.scaleMode === 'fit' && state.resolution.mode !== 'source' ? '' : 'none';
  el.padColor.value = state.padColor;
  el.padColorText.textContent = state.padColor;
  el.swsFlags.value = state.swsFlags;

  // 帧率
  const fpsChipId =
    state.fps.mode === 'source'
      ? 'source'
      : FPS_PRESETS.some((p) => p.id !== 'custom' && p.id !== 'source' && Number(p.id) === Number(state.fps.value))
        ? String(state.fps.value)
        : 'custom';
  for (const chip of el.fpsChips.querySelectorAll('[data-fps]')) {
    const active = chip.dataset.fps === fpsChipId;
    chip.classList.toggle('is-active', active);
    chip.setAttribute('aria-checked', String(active));
  }
  el.fpsCustomWrap.hidden = fpsChipId !== 'custom';
  if (fpsChipId === 'custom') el.fpsCustom.value = state.fps.value;
  el.fpsSync.value = state.fps.sync;
  el.srcFpsBadge.textContent = meta?.fps ? `源 ${Number(meta.fps).toFixed(2)} fps` : '源帧率未知';

  // 视频
  el.vcodec.value = state.video.codec;
  el.copyVideo.checked = state.video.copy;
  const canCopy = f.id !== 'gif' && f.id !== 'amv';
  el.copyVideo.disabled = !canCopy;
  el.copyVideoNote.hidden = canCopy;
  const copyActive = state.video.copy && canCopy;
  el.copySizeNotice.hidden = !copyActive;
  el.copyFpsNotice.hidden = !copyActive;
  el.videoEncodeFields.style.display = copyActive ? 'none' : '';
  const supportsRateMode = ['libx264', 'libvpx', 'libvpx-vp9'].includes(state.video.codec);
  el.rateMode.parentElement.style.display = supportsRateMode ? '' : 'none';
  for (const b of el.rateMode.querySelectorAll('button')) {
    b.classList.toggle('is-active', b.dataset.value === state.video.rateMode);
  }
  const useBitrate = supportsRateMode && state.video.rateMode === 'bitrate';
  el.crfField.hidden = useBitrate;
  el.bitrateFields.hidden = !useBitrate;
  el.crfRange.value = state.video.crf;
  el.crfValue.textContent = String(state.video.crf);
  el.crfRange.style.setProperty('--fill', `${(Number(state.video.crf) / 51) * 100}%`);
  el.bitrate.value = state.video.bitrate;
  el.maxrate.value = state.video.maxrate;
  el.presetField.style.display = state.video.codec === 'libx264' ? '' : 'none';
  el.pixFmtField.style.display = state.video.codec === 'gif' ? 'none' : '';
  el.x264Preset.value = state.video.preset;
  el.pixFmt.value = state.video.pixFmt;
  el.gop.value = state.video.gop;

  // 音频
  for (const b of el.audioMode.querySelectorAll('button')) {
    b.classList.toggle('is-active', b.dataset.value === state.audio.mode);
  }
  const audioLocked = f.id === 'amv';
  el.audioMode.classList.toggle('is-locked', audioLocked);
  for (const b of el.audioMode.querySelectorAll('button')) {
    b.disabled = audioLocked && b.dataset.value !== 'encode';
  }
  el.amvAudioNote.hidden = !audioLocked;
  el.audioEncodeFields.style.display = state.audio.mode === 'encode' && hasAudio() ? '' : 'none';
  el.acodec.value = state.audio.codec;
  el.abitrate.value = state.audio.bitrate;
  el.arate.value = String(state.audio.rate);
  el.achannels.value = String(state.audio.channels);

  // 格式锁定提示（AMV）
  el.amvBanner.hidden = f.id !== 'amv';

  // 隐藏与当前格式无关的参数页；当前页被隐藏时显示占位说明，不强行跳走
  const hiddenTabs = new Set();
  if (!hasVideo()) ['size', 'fps', 'video'].forEach((t) => hiddenTabs.add(t));
  if (!hasAudio()) hiddenTabs.add('audio');
  for (const t of el.tabs.querySelectorAll('[data-tab]')) {
    t.style.display = hiddenTabs.has(t.dataset.tab) ? 'none' : '';
  }
  const activeTab = el.tabs.querySelector('.tab.is-active')?.dataset.tab;
  if (hiddenTabs.has(activeTab)) {
    for (const p of document.querySelectorAll('[data-pane]')) p.classList.remove('is-active');
    el.panePlaceholder.hidden = false;
    el.panePlaceholder.textContent = !hasVideo()
      ? `${f.label} 仅输出音频，没有视频相关参数，可切换到「音频 / 其它」继续设置。`
      : `${f.label} 为动图格式，没有音频参数，可切换到「分辨率 / 视频」继续设置。`;
  } else {
    el.panePlaceholder.hidden = true;
  }

  // 其它
  el.trimStart.value = state.trim.start;
  el.trimEnd.value = state.trim.end;
  refreshTrimError();
  el.faststart.checked = state.faststart;
  el.faststart.disabled = !['mp4', 'mov', 'm4a'].includes(f.id);
  el.faststart.closest('.switch-row')?.classList.toggle('is-disabled', el.faststart.disabled);
  el.stripMeta.checked = state.stripMeta;
  if (state.resolution.mode === 'custom') refreshSizeError();
  else {
    el.sizeError.hidden = true;
    el.sizeError.textContent = '';
  }

  updateDeviceFit();
  updatePreview();
  updateDock();
  scheduleSave();
}

function updatePreview() {
  const file = currentFile();
  const inputName = file ? file.name : 'input.mp4';
  const baseName = inputName.replace(/\.[^./]+$/, '');
  const previewState = {
    ...state,
    inputName,
    outputName: file ? `${baseName}.${fmt().ext}` : `output.${fmt().ext}`,
    encoderThreads: engine.loaded ? engine.threads : 0,
  };
  const { args, warnings } = buildCommand(previewState, sourceInfo());

  el.cmdPreview.innerHTML = args
    .map((arg, i) => {
      const safe = esc(arg);
      if (arg.startsWith('-')) return `<span class="arg-key">${safe}</span>`;
      if (i === args.length - 1) return `<span class="arg-file">${safe}</span>`;
      if (args[i - 1] === '-i') return `<span class="arg-file">${safe}</span>`;
      return `<span class="arg-val">${safe}</span>`;
    })
    .join(' ');

  if (warnings.length) {
    el.warnings.hidden = false;
    const hasSizeWarn = warnings.some((w) => w.startsWith('体积提醒'));
    el.warnings.innerHTML =
      warnings.map((w) => `<div class="warn-item">${esc(w)}</div>`).join('') +
      (hasSizeWarn
        ? '<button class="warn-btn" type="button" data-action="size-first">一键体积优先（CRF 27 · 音频 96k）</button>'
        : '');
  } else {
    el.warnings.hidden = true;
    el.warnings.innerHTML = '';
  }
  if (file) el.cmdPreview.dataset.copy = `ffmpeg ${args.join(' ')}`;
  else el.cmdPreview.dataset.copy = '';
}

/** 一键体积优先：牺牲可接受的画质换取明显更小的输出 */
function applySizeFirst() {
  if (busy) return;
  const f = fmt();
  state.video.rateMode = 'crf';
  // 老编码器（MJPEG / MPEG-4）压缩效率低，CRF 不用拉满，避免画面糊到不可看
  state.video.crf = f.id === 'amv' ? 23 : 27;
  if (f.kind !== 'image' && f.id !== 'amv') state.audio.bitrate = '96k';
  syncUI();
  sysLog('已应用体积优先：CRF 27 · 音频 96k，体积预估已更新');
  toast('已切换到体积优先参数');
}

el.warnings.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="size-first"]');
  if (!btn) return;
  applySizeFirst();
});

function updateDock() {
  const ready = files.length > 0;
  const size = targetSize(state);
  const f = fmt();
  el.convertBtn.disabled = busy || !ready;
  if (busy) return;
  if (!ready) {
    el.dockTitle.textContent = '准备就绪';
    el.dockSub.textContent = '选择源文件后即可开始转换';
    el.dockEst.textContent = '';
    return;
  }
  el.dockTitle.textContent = `准备转换 ${files.length} 个文件 → ${f.label}`;
  const bits = [size ? `${size.width || '自动'}×${size.height || '自动'}` : '原始分辨率'];
  bits.push(state.fps.mode === 'value' ? `${state.fps.value} fps` : '原始帧率');
  bits.push(f.ext.toUpperCase());
  const source = sourceInfo();
  const est = estimateOutput(state, source);
  const estText = est.known
    ? ` · 预计输出约 ${formatBytes(est.bytes)}${source?.bytes ? `（源 ${formatBytes(source.bytes)}）` : ''}`
    : '';
  el.dockSub.textContent = `将按 ${bits.join(' · ')} 输出${estText}，全部在本地完成`;
  el.dockEst.textContent = engine.loaded
    ? engine.mode === 'multi'
      ? `${engine.threads} 线程加速`
      : '单线程模式'
    : '引擎未加载';
  if (est.known && source?.bytes && est.bytes > source.bytes * 1.1) {
    el.dockEst.textContent += ' · 预计大于源文件';
  }
}

/* ------------------------------------------------------------------ *
 * 事件绑定
 * ------------------------------------------------------------------ */
el.formatGrid.addEventListener('click', (e) => {
  const card = e.target.closest('[data-format]');
  if (!card || busy) return;
  applyFormat(card.dataset.format);
});

function applyFormat(id) {
  const f = getFormat(id);
  const prevId = state.formatId;

  // 进入 AMV 前快照当前参数；离开 AMV 时恢复，避免预设污染用户的设置
  if (id === 'amv' && prevId !== 'amv') {
    amvBackup = {
      resolution: { ...state.resolution },
      fps: { ...state.fps },
      scaleMode: state.scaleMode,
      crf: state.video.crf,
      audio: { ...state.audio },
    };
  } else if (id !== 'amv' && prevId === 'amv') {
    if (amvBackup) {
      state.resolution = { ...amvBackup.resolution };
      state.fps = { ...amvBackup.fps };
      state.scaleMode = amvBackup.scaleMode;
      state.video.crf = amvBackup.crf;
      state.audio = { ...amvBackup.audio };
      sysLog('已恢复切换到 AMV 之前的参数');
    } else {
      // 刷新后直接进入 AMV 的场景没有快照，重置回默认值，避免残留 AMV 专用参数
      state.resolution = { mode: 'source', width: 0, height: 0 };
      state.fps = { ...state.fps, mode: 'source' };
      state.audio = { ...DEFAULTS().audio, mode: state.audio.mode };
      sysLog('已重置 AMV 锁定的参数');
    }
    amvBackup = null;
  }

  state.formatId = id;
  if (f.force) {
    const force = f.force;
    if (force.resolution) state.resolution = { mode: 'preset', ...force.resolution };
    if (force.scaleMode) state.scaleMode = force.scaleMode;
    if (force.fps) {
      state.fps.mode = 'value';
      state.fps.value = force.fps;
    }
    if (force.crf !== undefined) state.video.crf = force.crf;
    if (force.audioMode) state.audio.mode = force.audioMode;
    if (force.acodec) state.audio.codec = force.acodec;
    if (force.audioRate) state.audio.rate = force.audioRate;
    if (force.audioChannels) state.audio.channels = force.audioChannels;
    sysLog(`已应用 ${f.label} 预设：${force.resolution?.width}×${force.resolution?.height} · ${force.fps || 15}fps · 单声道 ADPCM`);
  } else if (f.kind === 'audio') {
    state.audio.mode = 'encode';
  }
  renderFpsChips();
  renderCodecSelects(true);
  syncUI();
}

function switchTab(name) {
  for (const t of el.tabs.querySelectorAll('[data-tab]')) t.classList.toggle('is-active', t.dataset.tab === name);
  for (const p of document.querySelectorAll('[data-pane]')) p.classList.toggle('is-active', p.dataset.pane === name);
  el.panePlaceholder.hidden = true;
}

el.tabs.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (!tab) return;
  switchTab(tab.dataset.tab);
});

el.resSelect.addEventListener('change', () => {
  const v = el.resSelect.value;
  if (v === 'source') {
    state.resolution = { mode: 'source', width: 0, height: 0 };
  } else if (v === 'custom') {
    state.resolution = {
      mode: 'custom',
      width: state.resolution.width || 1280,
      height: state.resolution.height || 720,
    };
  } else {
    const [w, h] = v.split('x').map(Number);
    state.resolution = { mode: 'preset', width: w, height: h };
  }
  syncUI();
});

const onCustomSize = () => {
  state.resolution.mode = 'custom';
  state.resolution.width = Number(el.customW.value) || 0;
  state.resolution.height = Number(el.customH.value) || 0;
  refreshSizeError();
  updatePreview();
  scheduleSave();
};
el.customW.addEventListener('input', onCustomSize);
el.customH.addEventListener('input', onCustomSize);
el.swapWH.addEventListener('click', () => {
  const w = state.resolution.width;
  state.resolution.width = state.resolution.height;
  state.resolution.height = w;
  syncUI();
});

/* ------------------------------------------------------------------ *
 * 设备屏幕适配
 * ------------------------------------------------------------------ */
// 最近一次成功适配的结果，供横 / 竖屏按钮使用
let deviceRec = null;

function renderDeviceLongEdges() {
  el.devLongEdge.innerHTML = LONG_EDGES.map(
    (e) =>
      `<option value="${e}">${e} px${
        e === DEFAULT_LONG_EDGE ? ' · 常见小屏播放器' : e === 1080 ? ' · 高清' : ''
      }</option>`
  ).join('');
}

/** 把 state.device 渲染回输入框（初始化 / 恢复默认时调用） */
function renderDeviceInputs() {
  el.devWidth.value = state.device.width;
  el.devHeight.value = state.device.height;
  el.devUnit.value = state.device.unit;
  el.devKnownRes.checked = state.device.knownRes;
  el.devKnownSize.hidden = !state.device.knownRes;
  el.devKnownW.value = state.device.knownW || '';
  el.devKnownH.value = state.device.knownH || '';
  el.devLongEdge.value = String(state.device.longEdge);
}

function readDeviceInput() {
  return {
    width: Number(el.devWidth.value) || 0,
    height: Number(el.devHeight.value) || 0,
    unit: el.devUnit.value,
    knownRes: el.devKnownRes.checked,
    knownW: Number(el.devKnownW.value) || 0,
    knownH: Number(el.devKnownH.value) || 0,
  };
}

function onDeviceInput() {
  state.device.width = el.devWidth.value.trim();
  state.device.height = el.devHeight.value.trim();
  state.device.unit = el.devUnit.value;
  state.device.knownRes = el.devKnownRes.checked;
  state.device.knownW = Number(el.devKnownW.value) || 0;
  state.device.knownH = Number(el.devKnownH.value) || 0;
  state.device.longEdge = Number(el.devLongEdge.value) || DEFAULT_LONG_EDGE;
  updateDeviceFit();
  scheduleSave();
}

/** 实时计算并渲染适配结果；输入不完整时收起面板 */
function updateDeviceFit() {
  const d = readDeviceInput();
  el.devKnownSize.hidden = !d.knownRes;

  // AMV 容器对分辨率有上限，适配时自动收敛并在面板里说明
  const amv = state.formatId === 'amv';
  const cap = amv ? { maxW: AMV_MAX.w, maxH: AMV_MAX.h } : null;
  const result = analyzeDevice({ ...d, longEdge: state.device.longEdge }, cap);

  const hasInput = d.width > 0 && d.height > 0;
  deviceRec = null;
  el.devResult.hidden = !result.ok;
  el.devError.hidden = result.ok || !hasInput;
  if (!result.ok) {
    el.devError.textContent = result.error;
    el.deviceMeta.textContent = hasInput ? '无法识别' : '未测量';
    return;
  }

  deviceRec = result;
  const { ratio, base, measured } = result;
  el.devRatioBadge.textContent = ratio.snapped ? `≈ ${ratio.label}` : ratio.rawLabel;
  el.devRatioText.textContent = ratio.snapped
    ? `实测比例 ${measured.ratio.toFixed(3)} ≈ ${ratio.label}（误差 ${(ratio.error * 100).toFixed(1)}%）`
    : `实测比例 ${measured.ratio.toFixed(3)}，未匹配到标准比例，将按原比例输出`;
  el.devRecText.textContent =
    result.source === 'known'
      ? `已采用设备标注分辨率 ${base.w}×${base.h}`
      : `推荐分辨率 ${base.w}×${base.h}（长边 ${state.device.longEdge}px）`;
  el.devLandscapeSize.textContent = `${base.w}×${base.h}`;
  el.devPortraitSize.textContent = `${base.h}×${base.w}`;
  el.devSquareNote.hidden = base.w !== base.h;
  el.devAmvNote.hidden = !result.capped;
  el.deviceMeta.textContent = `${ratio.snapped ? ratio.label : measured.ratio.toFixed(2)} · ${base.w}×${base.h}`;

  // 写入的分辨率在当前参数下是否会生效（不强制改用户的缩放 / 复制设置，只提醒）
  const ineffective = state.scaleMode === 'none' || state.video.copy;
  el.devApplyNote.hidden = !ineffective;
  el.devApplyNote.textContent = state.video.copy
    ? '「直接复制视频流」已开启，写入的分辨率不会生效，需要重新编码。'
    : '当前缩放方式为「不缩放」，写入的分辨率不会生效。';
}

/** 把适配结果写入自定义分辨率；缩放方式保持用户自己的选择 */
function applyDeviceFit(orientation) {
  if (!deviceRec) return;
  const size = orientSize(deviceRec.base.w, deviceRec.base.h, orientation);
  state.resolution = { mode: 'custom', width: size.w, height: size.h };
  switchTab('size');
  syncUI();
  el.customSize.classList.add('is-flash');
  clearTimeout(applyDeviceFit._flash);
  applyDeviceFit._flash = setTimeout(() => el.customSize.classList.remove('is-flash'), 1300);
  const ratioLabel = deviceRec.ratio.snapped ? deviceRec.ratio.label : deviceRec.ratio.rawLabel;
  sysLog(`设备适配：${ratioLabel} → ${size.w}×${size.h}（${orientation === 'portrait' ? '竖屏' : '横屏'}）`);
  toast(`已按${orientation === 'portrait' ? '竖屏' : '横屏'}写入 ${size.w}×${size.h}`);
}

el.devLandscapeBtn.addEventListener('click', () => applyDeviceFit('landscape'));
el.devPortraitBtn.addEventListener('click', () => applyDeviceFit('portrait'));
[
  el.devWidth,
  el.devHeight,
  el.devUnit,
  el.devKnownRes,
  el.devKnownW,
  el.devKnownH,
  el.devLongEdge,
].forEach((node) => {
  node.addEventListener('input', onDeviceInput);
  node.addEventListener('change', onDeviceInput);
});

el.scaleGrid.addEventListener('click', (e) => {
  const card = e.target.closest('[data-scale]');
  if (!card) return;
  state.scaleMode = card.dataset.scale;
  syncUI();
});

el.padColor.addEventListener('input', () => {
  state.padColor = el.padColor.value;
  syncUI();
});
el.swsFlags.addEventListener('change', () => {
  state.swsFlags = el.swsFlags.value;
  syncUI();
});

el.fpsChips.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-fps]');
  if (!chip) return;
  const id = chip.dataset.fps;
  if (id === 'source') {
    state.fps.mode = 'source';
  } else if (id === 'custom') {
    state.fps.mode = 'value';
    if (!state.fps.value) state.fps.value = 30;
  } else {
    state.fps.mode = 'value';
    state.fps.value = Number(id);
  }
  syncUI();
});

el.fpsCustom.addEventListener('input', () => {
  const v = Number(el.fpsCustom.value);
  if (v > 0) {
    state.fps.mode = 'value';
    state.fps.value = v;
    updatePreview();
    scheduleSave();
  }
});

el.fpsSync.addEventListener('change', () => {
  state.fps.sync = el.fpsSync.value;
  syncUI();
});

el.vcodec.addEventListener('change', () => {
  state.video.codec = el.vcodec.value;
  renderCodecSelects();
  syncUI();
});

el.copyVideo.addEventListener('change', () => {
  state.video.copy = el.copyVideo.checked;
  syncUI();
});

el.rateMode.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  state.video.rateMode = b.dataset.value;
  syncUI();
});

el.crfRange.addEventListener('input', () => {
  state.video.crf = Number(el.crfRange.value);
  syncUI();
});

['bitrate', 'maxrate', 'gop'].forEach((key) => {
  el[key].addEventListener('input', () => {
    state.video[key] = Number(el[key].value) || 0;
    updatePreview();
    scheduleSave();
  });
});

el.x264Preset.addEventListener('change', () => {
  state.video.preset = el.x264Preset.value;
  syncUI();
});
el.pixFmt.addEventListener('change', () => {
  state.video.pixFmt = el.pixFmt.value;
  syncUI();
});

el.audioMode.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (fmt().id === 'amv' && b.dataset.value !== 'encode') {
    sysLog('AMV 容器需要 ADPCM 音轨，无法移除或直接复制音频');
    return;
  }
  state.audio.mode = b.dataset.value;
  syncUI();
});

el.acodec.addEventListener('change', () => {
  state.audio.codec = el.acodec.value;
  renderCodecSelects();
  syncUI();
});
el.abitrate.addEventListener('change', () => {
  state.audio.bitrate = el.abitrate.value;
  syncUI();
});
el.arate.addEventListener('change', () => {
  state.audio.rate = Number(el.arate.value);
  syncUI();
});
el.achannels.addEventListener('change', () => {
  state.audio.channels = Number(el.achannels.value);
  syncUI();
});

el.trimStart.addEventListener('input', () => {
  state.trim.start = el.trimStart.value;
  refreshTrimError();
  updatePreview();
  scheduleSave();
});
el.trimEnd.addEventListener('input', () => {
  state.trim.end = el.trimEnd.value;
  refreshTrimError();
  updatePreview();
  scheduleSave();
});

el.faststart.addEventListener('change', () => {
  state.faststart = el.faststart.checked;
  updatePreview();
  scheduleSave();
});
el.stripMeta.addEventListener('change', () => {
  state.stripMeta = el.stripMeta.checked;
  updatePreview();
  scheduleSave();
});

// 恢复默认：二次确认，避免误触清空所有参数
let resetArmed = false;
let resetTimer = null;

function disarmReset() {
  resetArmed = false;
  clearTimeout(resetTimer);
  el.resetBtn.textContent = '恢复默认';
  el.resetBtn.classList.remove('is-danger');
}

el.resetBtn.addEventListener('click', () => {
  if (!resetArmed) {
    resetArmed = true;
    el.resetBtn.textContent = '确认恢复？';
    el.resetBtn.classList.add('is-danger');
    resetTimer = setTimeout(disarmReset, 2600);
    return;
  }
  disarmReset();
  const keepFormat = state.formatId;
  state = DEFAULTS();
  amvBackup = null;
  lastFormatId = null;
  clearSettings();
  renderDeviceInputs();
  applyFormat(keepFormat);
  sysLog('参数已恢复默认');
  toast('参数已恢复默认');
});

el.copyCmd.addEventListener('click', async () => {
  const text = el.cmdPreview.dataset.copy;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    el.copyCmd.textContent = '已复制';
    setTimeout(() => (el.copyCmd.textContent = '复制'), 1400);
  } catch {
    sysLog('浏览器拒绝访问剪贴板');
  }
});

el.clearLog.addEventListener('click', () => {
  logQueue = [];
  el.log.innerHTML = '';
});

el.toggleLogBtn.addEventListener('click', () => {
  setLogCollapsed(!el.logCard.classList.contains('is-collapsed'));
});

/* ------------------------------------------------------------------ *
 * 进度
 * ------------------------------------------------------------------ */
function setProgress(pct, label, remain) {
  const clamped = Math.max(0, Math.min(100, pct));
  el.progressBar.style.width = `${clamped}%`;
  el.progressPct.textContent = `${clamped.toFixed(clamped < 10 ? 1 : 0)}%`;
  if (label) el.progressLabel.textContent = label;
  if (remain !== undefined) el.progressTime.textContent = remain;
}

function setBusy(value) {
  busy = value;
  document.querySelector('.stack').inert = value;
  el.convertBtn.disabled = value || !files.length;
  el.convertBtn.textContent = value ? '转换中…' : '开始转换';
}

/* ------------------------------------------------------------------ *
 * 转换
 * ------------------------------------------------------------------ */
function renderResults() {
  el.resultsEmpty.hidden = results.length > 0;
  el.clearResultsBtn.hidden = results.length === 0;
  if (!busy) el.taskMeta.textContent = results.length ? `${results.length} 个结果` : '空闲';
  el.results.innerHTML = results
    .map(
      (r) => `
      <li class="result">
        <span class="result-check"><svg viewBox="0 0 16 16"><path d="M3 8.5 6.5 12 13 4.5"/></svg></span>
        <div class="result-info">
          <div class="result-name" title="${esc(r.name)}">${esc(r.name)}</div>
          <div class="result-meta">${formatBytes(r.size)} · 用时 ${r.elapsed.toFixed(1)}s</div>
        </div>
        <a class="btn-download" href="${r.blobUrl}" download="${esc(r.name)}">下载</a>
      </li>`
    )
    .join('');
}

function addResult({ name, blobUrl, size, elapsed }) {
  results.unshift({ name, blobUrl, size, elapsed });
  renderResults();
}

el.clearResultsBtn.addEventListener('click', () => {
  if (!results.length) return;
  for (const r of results) URL.revokeObjectURL(r.blobUrl);
  results = [];
  renderResults();
  toast('已清空转换结果');
});

async function convertOne(item) {
  const f = fmt();
  const inputName = `input.${item.ext || 'bin'}`;
  const outputName = `output.${f.ext}`;
  const cmd = buildCommand(
    { ...state, inputName, outputName, encoderThreads: engine.threads },
    {
      bytes: item.size,
      duration: item.meta?.duration || 0,
      width: item.meta?.width || 0,
      height: item.meta?.height || 0,
      fps: item.meta?.fps || 0,
      videoKbps: item.meta?.bitrate || 0,
    }
  );

  item.status = 'processing';
  renderFiles();
  el.taskMeta.textContent = `${item.name}`;
  el.progressBlock.hidden = false;
  el.cancelBtn.hidden = false;
  setProgress(0, `读取 ${item.name}`, '');

  const startedAt = performance.now();
  let lastActivity = Date.now();
  // 极端情况下 wasm 线程可能卡住，两分钟没有任何进展就强制中止
  const watchdog = setInterval(() => {
    if (Date.now() - lastActivity > 120000) {
      lastActivity = Date.now();
      sysLog('转码超过 2 分钟无进展，正在中止任务…');
      engine.cancel();
    }
  }, 10000);

  const offProgress = engine.onProgress(({ progress }) => {
    lastActivity = Date.now();
    if (!Number.isFinite(progress) || progress <= 0) return;
    const pct = Math.min(99, progress * 100);
    const elapsed = (performance.now() - startedAt) / 1000;
    let remain = '';
    if (progress > 0.02) {
      const total = elapsed / progress;
      remain = `剩余约 ${humanTime(Math.max(0, total - elapsed))}`;
    }
    setProgress(pct, `转码中 · ${item.name}`, remain);
  });

  try {
    sysLog(`开始转换 ${item.name} → ${outputName}`);
    // 体积预估警告（预计大于源文件等）在开跑前明确告知，避免转完才发现变大
    for (const w of cmd.warnings) {
      if (w.startsWith('体积提醒')) sysLog(w);
    }
    const data = new Uint8Array(await item.file.arrayBuffer());
    const result = await engine.run({
      data,
      inputName,
      outputName,
      args: cmd.args,
      duration: item.meta?.duration || 0,
      onLog: (type, message) => log(type, message),
    });
    const blob = new Blob([result.data], { type: mimeFor(f.ext) });
    const displayName = `${item.name.replace(/\.[^./]+$/, '')}.${f.ext}`;
    addResult({
      name: displayName,
      blobUrl: URL.createObjectURL(blob),
      size: blob.size,
      elapsed: result.elapsed,
    });
    item.status = 'done';
    setProgress(100, `完成 · ${displayName}`, `用时 ${result.elapsed.toFixed(1)}s`);
    sysLog(`✔ ${displayName}（${formatBytes(blob.size)}）`);
  } catch (err) {
    item.status = 'error';
    const msg = String(err?.message || err);
    if (cancelRequested) {
      sysLog('已取消当前任务');
    } else {
      log('error', `转换失败：${msg}`);
      sysLog(`✘ ${item.name} 转换失败：${msg.split('\n').pop()}`);
      if (/out of bounds|RuntimeError|Aborted|detached/i.test(msg)) {
        await engine.cancel();
        setEngineState('', '转码引擎待加载');
        sysLog('WebAssembly 内存异常，引擎已重置，请重新点击开始转换');
      }
    }
  } finally {
    clearInterval(watchdog);
    offProgress();
    el.cancelBtn.hidden = true;
    renderFiles();
  }
}

async function startConvert() {
  if (busy || !files.length) return;
  cancelRequested = false;
  setBusy(true);
  el.progressBlock.hidden = false;
  setProgress(0, '准备引擎…', '');
  el.taskMeta.textContent = '运行中';
  setLogCollapsed(false);

  let doneCount = 0;
  try {
    if (!engine.loaded) await loadEngine();
    for (const item of files) {
      if (cancelRequested) break;
      await convertOne(item);
      if (item.status === 'done') doneCount++;
    }
    if (!cancelRequested && doneCount) toast(`转换完成 · ${doneCount} 个文件`);
  } catch (err) {
    log('error', `任务中断：${err?.message || err}`);
  } finally {
    el.progressBlock.hidden = true;
    el.taskMeta.textContent = cancelRequested ? '已取消' : '空闲';
    setBusy(false);
    renderResults();
    updateDock();
  }
}

el.convertBtn.addEventListener('click', startConvert);

el.cancelBtn.addEventListener('click', async () => {
  cancelRequested = true;
  el.progressLabel.textContent = '正在取消…';
  await engine.cancel();
  setEngineState('', '转码引擎待加载');
  sysLog('已终止引擎，下次转换会重新加载');
});

/* ------------------------------------------------------------------ *
 * 初始化
 * ------------------------------------------------------------------ */
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    startConvert();
  }
});

function init() {
  renderFormats();
  renderResolutions();
  renderScaleModes();
  renderFpsChips();
  renderStaticSelects();
  renderDeviceLongEdges();
  renderDeviceInputs();
  renderCodecSelects(true);
  renderFiles();
  renderResults();
  el.cancelBtn.hidden = true;
  setLogCollapsed(true);
  syncUI();
  setEngineState('', '转码引擎待加载');
  if (restoredFromStorage) {
    sysLog('已恢复上次使用的转换参数');
    toast('已恢复上次的参数');
  }
  setTimeout(() => {
    if (!engine.loaded && !engine.loading) loadEngine().catch(() => {});
  }, 900);
}

/* ------------------------------------------------------------------ *
 * 与服务端保持连接：页面开着就连着，标签页/窗口全部关闭后服务端自动退出
 * （EventSource 断线会自动重连；刷新页面时旧连接断开、新连接秒建，不会误退出）
 * ------------------------------------------------------------------ */
(() => {
  const es = new EventSource('/__events');
  es.onerror = () => {
    /* EventSource 内置自动重连，无需处理 */
  };
})();

init();
