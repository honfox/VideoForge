import { FFmpeg } from '../../vendor/ffmpeg/index.js';

const CORE_ST = new URL('../../vendor/core/ffmpeg-core.js', import.meta.url).href;
const WASM_ST = new URL('../../vendor/core/ffmpeg-core.wasm', import.meta.url).href;

const CORE_MT = new URL('../../vendor/core-mt/ffmpeg-core.js', import.meta.url).href;
const WASM_MT = new URL('../../vendor/core-mt/ffmpeg-core.wasm', import.meta.url).href;
const WORKER_MT = new URL('../../vendor/core-mt/ffmpeg-core.worker.js', import.meta.url).href;

const MIME_BY_EXT = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  amv: 'video/x-amv',
  gif: 'image/gif',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
};

export function mimeFor(ext) {
  return MIME_BY_EXT[String(ext).toLowerCase()] || 'application/octet-stream';
}

async function fetchWithProgress(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`无法加载 ${url} (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !onProgress) {
    return new Blob([await res.arrayBuffer()], { type: 'application/wasm' });
  }
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress({ received, total });
  }
  return new Blob(chunks, { type: 'application/wasm' });
}

function parseDuration(text) {
  const m = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function parseProbe(text) {
  const info = { duration: 0, width: 0, height: 0, fps: 0, vcodec: '', acodec: '', bitrate: 0 };
  info.duration = parseDuration(text);

  const videoLine = text.split('\n').find((l) => /Stream #\d+:\d+.*: Video:/.test(l));
  if (videoLine) {
    info.vcodec = (videoLine.match(/Video:\s*([a-zA-Z0-9_\-]+)/) || [])[1] || '';
    const dim = videoLine.match(/,\s*(\d{2,5})x(\d{2,5})[\s,[\]/]/);
    if (dim) {
      info.width = Number(dim[1]);
      info.height = Number(dim[2]);
    }
    const fps = videoLine.match(/(\d+(?:\.\d+)?)\s*(?:fps|tbr)/);
    if (fps) info.fps = Number(fps[1]);
  }
  const audioLine = text.split('\n').find((l) => /Stream #\d+:\d+.*: Audio:/.test(l));
  if (audioLine) info.acodec = (audioLine.match(/Audio:\s*([a-zA-Z0-9_\-]+)/) || [])[1] || '';

  const br = text.match(/bitrate:\s*(\d+)\s*kb\/s/);
  if (br) info.bitrate = Number(br[1]);
  return info;
}

export class VideoEngine {
  constructor() {
    this.ffmpeg = null;
    this.loaded = false;
    this.loading = false;
    this.mode = 'single'; // 'single' | 'multi'
    this.threads = 1;
    this.logListeners = new Set();
    this.progressListeners = new Set();
    this.wasmBlobUrl = null;
  }

  /** 多线程需要 SharedArrayBuffer，前提是页面处于 cross-origin isolated 状态 */
  get multiThreadAvailable() {
    return typeof crossOriginIsolated === 'boolean' && crossOriginIsolated === true;
  }

  onLog(fn) {
    this.logListeners.add(fn);
    return () => this.logListeners.delete(fn);
  }

  onProgress(fn) {
    this.progressListeners.add(fn);
    return () => this.progressListeners.delete(fn);
  }

  emitLog(type, message) {
    for (const fn of this.logListeners) fn(type, message);
  }

  emitProgress(payload) {
    for (const fn of this.progressListeners) fn(payload);
  }

  #createInstance() {
    const ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ type, message }) => this.emitLog(type, message));
    ffmpeg.on('progress', ({ progress, time }) => {
      this.emitProgress({ progress: Number(progress), time: Number(time) });
    });
    return ffmpeg;
  }

  async #boot(multi, onStage) {
    const coreURL = multi ? CORE_MT : CORE_ST;
    const wasmURL = multi ? WASM_MT : WASM_ST;

    onStage?.({ stage: 'core', multi, progress: 0 });
    const blob = await fetchWithProgress(wasmURL, ({ received, total }) => {
      onStage?.({ stage: 'core', multi, progress: total ? received / total : 0, received, total });
    });

    if (this.wasmBlobUrl) URL.revokeObjectURL(this.wasmBlobUrl);
    this.wasmBlobUrl = URL.createObjectURL(blob);
    onStage?.({ stage: 'init', multi, progress: 1 });

    const ffmpeg = this.#createInstance();
    const config = { coreURL, wasmURL: this.wasmBlobUrl };
    if (multi) config.workerURL = WORKER_MT;
    await ffmpeg.load(config);
    return ffmpeg;
  }

  async load({ onStage } = {}) {
    if (this.loaded) return;
    if (this.loading) throw new Error('引擎正在加载中');
    this.loading = true;

    try {
      const wantMulti = this.multiThreadAvailable;
      if (wantMulti) {
        try {
          this.ffmpeg = await this.#boot(true, onStage);
          this.mode = 'multi';
          // Emscripten 的 pthread 池大小为 4，超过会导致线程创建死锁；
          // 同时给主线程留出余量，4 线程已是实测最优区间
          this.threads = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
          this.emitLog('info', `ffmpeg 多线程引擎已就绪（${this.threads} 线程）`);
        } catch (err) {
          this.emitLog('warn', `多线程运行时启动失败，回退单线程：${err?.message || err}`);
          this.ffmpeg = null;
        }
      }
      if (!this.ffmpeg) {
        this.ffmpeg = await this.#boot(false, onStage);
        this.mode = 'single';
        this.threads = 1;
        if (!wantMulti) {
          this.emitLog('info', '当前页面未处于 cross-origin isolated 状态，使用单线程运行时');
        }
        this.emitLog('info', 'ffmpeg 单线程引擎已就绪');
      }
      this.loaded = true;
    } catch (err) {
      this.loaded = false;
      this.ffmpeg = null;
      throw err;
    } finally {
      this.loading = false;
    }
  }

  /** 读取媒体元数据 */
  async probe(data, ext) {
    if (!this.loaded) throw new Error('引擎未加载');
    const name = `probe_${Date.now()}.${ext || 'bin'}`;
    const logs = [];
    const handler = (_type, message) => logs.push(message);
    this.logListeners.add(handler);
    try {
      await this.ffmpeg.writeFile(name, data);
      try {
        await this.ffmpeg.exec(['-hide_banner', '-i', name]);
      } catch {
        /* -i 无输出必然返回非 0，忽略 */
      }
    } finally {
      this.logListeners.delete(handler);
      try {
        await this.ffmpeg.deleteFile(name);
      } catch {
        /* ignore */
      }
    }
    return parseProbe(logs.join('\n'));
  }

  /**
   * 执行转码
   * @returns {Promise<{data: Uint8Array, elapsed: number}>}
   */
  async run({ data, inputName, outputName, args, duration, onLog }) {
    if (!this.loaded) throw new Error('引擎未加载');
    const started = performance.now();
    const tail = [];
    const removeLog = this.onLog((type, message) => {
      if (message && String(message).trim()) {
        tail.push(message);
        if (tail.length > 10) tail.shift();
      }
      onLog?.(type, message);
    });

    try {
      await this.ffmpeg.writeFile(inputName, data);
      await this.ffmpeg.exec(args);
      const out = await this.ffmpeg.readFile(outputName);
      const elapsed = (performance.now() - started) / 1000;
      const bytes = out instanceof Uint8Array ? out : new Uint8Array(out);
      if (!bytes.length) {
        const reason = tail
          .filter((l) => /error|failed|invalid|must be/i.test(l))
          .slice(-1)
          .join(' ');
        throw new Error(reason ? `转码失败：${reason.trim()}` : '转码未产生输出文件，请检查参数');
      }
      return { data: bytes, elapsed, duration };
    } finally {
      removeLog?.();
      for (const name of [inputName, outputName]) {
        try {
          await this.ffmpeg.deleteFile(name);
        } catch {
          /* ignore */
        }
      }
    }
  }

  async cancel() {
    if (!this.ffmpeg) return;
    try {
      this.ffmpeg.terminate();
    } catch {
      /* ignore */
    }
    this.ffmpeg = null;
    this.loaded = false;
  }
}
