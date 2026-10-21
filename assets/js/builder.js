import { getFormat } from './formats.js';

/** 把秒数格式化成 HH:MM:SS.mmm（ffmpeg 时间戳） */
export function formatTimestamp(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${rest.toFixed(3).padStart(6, '0')}`;
}

/** 解析 "90" / "1:30" / "00:01:30.5" 为秒 */
export function parseTime(value) {
  if (value === null || value === undefined) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  if (!raw.includes(':')) {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  const parts = raw.split(':').map((p) => Number(p) || 0);
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p;
  return Number.isFinite(sec) ? Math.max(0, sec) : 0;
}

export function humanTime(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '--:--';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

const even = (n) => Math.max(2, Math.round(Number(n) / 2) * 2);

/** 计算目标宽高，返回 { width, height } 或 null */
export function targetSize(state) {
  const { mode, width, height } = state.resolution || {};
  if (mode === 'source') return null;
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (mode === 'custom') {
    if (!w && !h) return null;
    return { width: w ? even(w) : 0, height: h ? even(h) : 0 };
  }
  if (!w && !h) return null;
  return { width: even(w), height: even(h) };
}

/**
 * 构建 -vf 滤镜链
 */
function buildVideoFilter(state, fmt, ctx) {
  const parts = [];
  const size = targetSize(state);
  const flags = state.swsFlags || 'lanczos';

  if (size && state.scaleMode !== 'none') {
    const { width: w, height: h } = size;
    switch (state.scaleMode) {
      case 'fit':
        if (w && h) {
          parts.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=${flags}`);
          const padColor = (state.padColor || '#000000').replace('#', '0x');
          parts.push(`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=${padColor}`);
        } else if (w) {
          parts.push(`scale=${w}:-2:flags=${flags}`);
        } else {
          parts.push(`scale=-2:${h}:flags=${flags}`);
        }
        break;
      case 'fill':
        if (w && h) {
          parts.push(`scale=${w}:${h}:force_original_aspect_ratio=increase:flags=${flags}`);
          parts.push(`crop=${w}:${h}`);
        } else if (w) {
          parts.push(`scale=${w}:-2:flags=${flags}`);
        } else {
          parts.push(`scale=-2:${h}:flags=${flags}`);
        }
        break;
      case 'stretch':
        parts.push(`scale=${w || -2}:${h || -2}:flags=${flags}`);
        break;
      case 'width':
        parts.push(`scale=${w || -2}:-2:flags=${flags}`);
        break;
      case 'height':
        parts.push(`scale=-2:${h || -2}:flags=${flags}`);
        break;
      default:
        break;
    }
  }

  if (size && state.scaleMode === 'none') {
    ctx.warnings.push('缩放方式为“不缩放”，分辨率设置不会生效。');
  }

  // 统一像素宽高比，避免非方形像素导致播放器拉伸
  if (parts.length) parts.push('setsar=1');

  // 帧率滤镜（GIF 必须显式 fps，否则默认 10fps 且不均匀）
  const passThrough = state.fps?.sync === 'vfr' || state.fps?.sync === 'passthrough';
  const fpsValue = !passThrough && state.fps?.mode === 'value' ? Number(state.fps.value) : 0;
  if (fpsValue > 0) parts.push(`fps=${fpsValue}`);

  if (fmt.id === 'gif') {
    if (!(fpsValue > 0)) parts.push('fps=12');
    const head = parts.length ? `${parts.join(',')},` : '';
    // 调色板滤镜需要独立的链，用分号分隔
    return (
      `${head}split[palette_src][palette_out];` +
      '[palette_src]palettegen=max_colors=256:stats_mode=diff[palette];' +
      '[palette_out][palette]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle'
    );
  }

  return parts.join(',');
}

function qualityParam(codec, crf) {
  const value = Number(crf);
  if (['libx264', 'libvpx', 'libvpx-vp9'].includes(codec)) return value;
  // mpeg4 / mjpeg / amv 使用 qscale 1-31（越小越清晰、文件越大）
  // 旧映射 (crf/51)*30+1 在低 CRF 段过于宽松：CRF 15 → q10，MJPEG/AMV 输出会无谓膨胀。
  // 新曲线 4 + crf*26/51：CRF 15 → q12、CRF 18 → q13、CRF 23 → q16、CRF 51 → q30，
  // 在老编码器上同画质下体积明显下降（160×120 的 AMV 屏幕上也看不出差别）。
  return Math.min(31, Math.max(2, Math.round(4 + (value * 26) / 51)));
}

/** 人类可读的字节数 */
export function humanBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = Number(bytes) || 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** 目标帧率：用户指定 > 源帧率 > 30 兜底；GIF 未指定时滤镜强制 fps=12 */
function effectiveFps(state, source) {
  if (state.fps?.mode === 'value' && Number(state.fps.value) > 0) return Number(state.fps.value);
  if (source?.fps > 0) return source.fps;
  const fmt = getFormat(state.formatId);
  if (fmt.id === 'gif') return 12;
  return 30;
}

/** 估算视频码率（kbps）。经验模型，误差 ±50% 属正常，只用于“会不会比源文件还大”这类判断 */
function estimateVideoKbps(state, fmt, w, h, fps, source) {
  // 纯音频格式没有视频流（GIF 虽是 image 但按视频估算）
  if (fmt.kind !== 'video' && fmt.id !== 'gif') return 0;
  if (!w || !h || !fps) return 0;
  const copyable = fmt.kind === 'video' && fmt.id !== 'gif' && fmt.id !== 'amv';
  if (state.video?.copy && copyable) {
    // 复制流：直接沿用源码率（探测不到则无法预估）
    return Math.max(0, Number(source?.videoKbps) || 0);
  }
  const vcodec = state.video?.codec || fmt.vcodec;
  const supportsBitrate = ['libx264', 'libvpx', 'libvpx-vp9'].includes(vcodec);
  if (supportsBitrate && state.video?.rateMode === 'bitrate') {
    return Number(state.video?.bitrate) || 2500;
  }
  // 每“像素×帧”每秒的基础码率（kbps，CRF 23 经验值）
  const divisor = {
    libx264: 15000,
    libvpx: 17000,
    'libvpx-vp9': 18000,
    mpeg4: 9000,
    mjpeg: 1000,
    amv: 1000,
    gif: 1000,
  }[vcodec] || 15000;
  const crf = Number(state.video?.crf ?? 23);
  // x264 / VPx 的码率随 CRF 指数变化；JPEG 系（mpeg4 / mjpeg / amv / gif）由 qscale 决定，
  // 大致随 (31/q)^1.5 变化，以 q16（≈ CRF 23）为基准归一，避免低 CRF 时严重高估
  const quality = ['mpeg4', 'mjpeg', 'amv', 'gif'].includes(vcodec)
    ? Math.pow(31 / qualityParam(vcodec, crf), 1.5) / Math.pow(31 / 16, 1.5)
    : Math.pow(2, (23 - crf) / 4);
  return Math.round(Math.min(80000, Math.max(10, ((w * h * fps) / divisor) * quality)));
}

/** 估算音频码率（kbps） */
function estimateAudioKbps(state, fmt) {
  if (fmt.kind === 'image') return 0;
  const mode = state.audio?.mode || 'encode';
  if (mode === 'none') return 0;
  if (mode === 'copy') return 128; // 源码率未知时的常见值
  const acodec = state.audio?.codec || fmt.acodec;
  if (acodec === 'adpcm_ima_amv') {
    // IMA ADPCM 固定 4bit/采样
    const rate = Number(state.audio?.rate) || 22050;
    const ch = Number(state.audio?.channels) || 1;
    return Math.round((rate * ch * 0.5 * 8) / 1000);
  }
  if (acodec === 'pcm_s16le') {
    const rate = Number(state.audio?.rate) || 48000;
    const ch = Number(state.audio?.channels) || 2;
    return Math.round((rate * ch * 16) / 1000);
  }
  const kb = Number(String(state.audio?.bitrate || '128k').replace(/k$/i, ''));
  return kb > 0 ? kb : 128;
}

/**
 * 粗略估算输出体积
 * @param state 同 buildCommand 的状态
 * @param source {{bytes:number, duration:number, width:number, height:number, fps:number, videoKbps:number}|null}
 * @returns {{bytes:number, videoKbps:number, audioKbps:number, seconds:number, known:boolean}}
 */
export function estimateOutput(state, source) {
  const fmt = getFormat(state.formatId);

  // 有效时长（考虑起止裁剪）
  let seconds = Number(source?.duration) || 0;
  const startSec = parseTime(state.trim?.start);
  const endSec = parseTime(state.trim?.end);
  if (startSec > 0) seconds = Math.max(0, seconds - startSec);
  if (endSec > 0) seconds = Math.min(seconds, Math.max(0, endSec - startSec));

  // 目标尺寸：显式设置优先，否则回落到源尺寸
  const size = targetSize(state);
  let w = size ? size.width || 0 : 0;
  let h = size ? size.height || 0 : 0;
  const sw = Number(source?.width) || 0;
  const sh = Number(source?.height) || 0;
  if (sw && sh) {
    if (w && !h) h = Math.round((sh * w) / sw);
    if (h && !w) w = Math.round((sw * h) / sh);
  }
  if (!size && sw && sh) {
    w = sw;
    h = sh;
  }
  w = even(w);
  h = even(h);

  const fps = effectiveFps(state, source);
  const videoKbps = estimateVideoKbps(state, fmt, w, h, fps, source);
  const audioKbps = estimateAudioKbps(state, fmt);

  const known =
    seconds > 0 &&
    (fmt.kind === 'video' || fmt.id === 'gif' ? videoKbps > 0 : audioKbps > 0);
  const bytes = known ? ((videoKbps + audioKbps) * 1000 * seconds) / 8 : 0;
  return { bytes, videoKbps, audioKbps, seconds, known };
}

/**
 * 生成 ffmpeg 参数数组
 * @param state 参数状态
 * @param source 源文件信息（体积 / 时长 / 分辨率），用于输出体积预估与警告
 * @returns {{args: string[], outputName: string, warnings: string[]}}
 */
export function buildCommand(state, source = null) {
  const fmt = getFormat(state.formatId);
  const warnings = [];
  const ctx = { warnings };

  const inputName = state.inputName || 'input.mp4';
  const baseName = inputName.replace(/\.[^./]+$/, '');
  const outputName = state.outputName || `${baseName}.${fmt.ext}`;

  const args = ['-hide_banner', '-y'];

  // ---- 时间裁剪 ----
  const startSec = parseTime(state.trim?.start);
  const endSec = parseTime(state.trim?.end);
  if (startSec > 0) args.push('-ss', formatTimestamp(startSec));
  args.push('-i', inputName);
  if (endSec > 0) {
    if (endSec <= startSec) {
      warnings.push('结束时间需大于开始时间，已忽略时间范围设置。');
    } else {
      args.push('-t', formatTimestamp(endSec - startSec));
    }
  }

  const hasVideo = fmt.kind !== 'audio';
  const hasAudio = fmt.kind !== 'image';

  // ---- 视频 ----
  if (!hasVideo) {
    args.push('-vn');
  } else if (state.video?.copy) {
    if (fmt.id === 'gif' || fmt.id === 'amv') {
      warnings.push(`点击复制流不支持 ${fmt.label} 封装，已改为重新编码。`);
    } else {
      args.push('-c:v', 'copy');
      if (targetSize(state) || state.fps?.mode === 'value') {
        warnings.push('已选择“复制视频流”，分辨率与帧率设置不会生效。');
      }
    }
  }

  const videoCopy = hasVideo && state.video?.copy && fmt.id !== 'gif' && fmt.id !== 'amv';

  if (hasVideo && !videoCopy) {
    const vcodec = state.video?.codec || fmt.vcodec;
    const filter = buildVideoFilter(state, fmt, ctx);
    if (filter) args.push('-vf', filter);

    const threads = Number(state.encoderThreads) || 0;
    if (threads > 1) args.push('-threads', String(threads));

    args.push('-c:v', vcodec);

    if (fmt.id === 'gif') {
      // gif 编码器无码率参数
    } else if (['mjpeg', 'mpeg4', 'amv'].includes(vcodec)) {
      args.push('-q:v', String(qualityParam(vcodec, state.video?.crf ?? 23)));
    } else if (vcodec === 'libvpx-vp9') {
      if (state.video?.rateMode === 'bitrate') {
        args.push('-b:v', `${Number(state.video?.bitrate) || 2000}k`);
      } else {
        args.push('-crf', String(state.video?.crf ?? 32), '-b:v', '0');
      }
      args.push('-deadline', 'good', '-cpu-used', '5');
    } else if (vcodec === 'libvpx') {
      // VP8 的 CRF（CQ）模式必须搭配 -b:v 0，否则 -crf 被忽略、按固定码率编码
      if (state.video?.rateMode === 'bitrate') {
        const kbps = Number(state.video?.bitrate) || 2000;
        args.push('-b:v', `${kbps}k`);
      } else {
        args.push('-crf', String(Math.min(30, Math.max(4, Math.round((state.video?.crf ?? 23) / 2)))), '-b:v', '0');
      }
      args.push('-deadline', 'good', '-cpu-used', '5');
    } else {
      // libx264
      const preset = state.video?.preset || 'fast';
      args.push('-preset', preset);
      if (state.video?.rateMode === 'bitrate') {
        const kbps = Number(state.video?.bitrate) || 2500;
        args.push('-b:v', `${kbps}k`);
        const maxrate = Number(state.video?.maxrate) || Math.round(kbps * 1.5);
        args.push('-maxrate', `${maxrate}k`, '-bufsize', `${maxrate * 2}k`);
      } else {
        args.push('-crf', String(state.video?.crf ?? 23));
      }
    }

    if (vcodec === 'mjpeg' || vcodec === 'amv') {
      args.push('-pix_fmt', 'yuvj420p');
    } else if (state.video?.pixFmt && vcodec !== 'gif') {
      args.push('-pix_fmt', state.video.pixFmt);
    } else if (['libx264', 'libvpx', 'libvpx-vp9'].includes(vcodec)) {
      args.push('-pix_fmt', 'yuv420p');
    }

    if (state.video?.gop && Number(state.video.gop) > 0 && vcodec !== 'gif') {
      args.push('-g', String(Math.round(Number(state.video.gop))));
    }
  }

  // ---- 帧率 ----
  if (hasVideo && !videoCopy) {
    const sync = state.fps?.sync;
    const passThrough = sync === 'vfr' || sync === 'passthrough';
    const fpsValue = state.fps?.mode === 'value' ? Number(state.fps.value) : 0;
    if (passThrough) {
      if (fpsValue > 0) warnings.push('VFR / 透传模式会保留原始时间戳，目标帧速率设置不会生效。');
      args.push('-fps_mode', sync);
    } else {
      if (fpsValue > 0) args.push('-r', String(fpsValue));
      if (sync === 'cfr') args.push('-fps_mode', 'cfr');
    }
  }

  // ---- 音频 ----
  const audioMode = state.audio?.mode || 'encode';
  if (!hasAudio || fmt.kind === 'image' || audioMode === 'none') {
    args.push('-an');
  } else if (audioMode === 'copy') {
    args.push('-c:a', 'copy');
  } else {
    const acodec = state.audio?.codec || fmt.acodec;
    args.push('-c:a', acodec);
    if (acodec === 'adpcm_ima_amv') {
      // AMV 要求每个视频帧对应一个固定大小的音频块：block_size = 22050 / fps
      const amvFps = state.fps?.mode === 'value' ? Number(state.fps.value) : 15;
      const blockSize = Math.max(1, Math.round(22050 / (amvFps || 15)));
      args.push('-ar', '22050', '-ac', '1');
      args.push('-block_size', String(blockSize));
    } else if (acodec === 'pcm_s16le') {
      args.push('-ar', String(state.audio?.rate || 48000));
      if (state.audio?.channels) args.push('-ac', String(state.audio.channels));
    } else {
      const rate = state.audio?.rate;
      if (rate) args.push('-ar', String(rate));
      if (state.audio?.channels) args.push('-ac', String(state.audio.channels));
      const bitrate = state.audio?.bitrate;
      if (bitrate) args.push('-b:a', bitrate);
    }
  }

  // ---- 容器细节 ----
  if (fmt.id === 'mp4' || fmt.id === 'mov' || fmt.id === 'm4a') {
    if (state.faststart) args.push('-movflags', '+faststart');
  }
  if (fmt.id === 'gif') {
    args.push('-loop', '0');
  }
  if (fmt.id === 'amv') {
    // 160x120 的高度不是 16 的倍数，需要放宽严格标准
    args.push('-strict', '-1');
    args.push('-f', 'amv');
    const amvFps = state.fps?.mode === 'value' ? Number(state.fps.value) : 15;
    if (!amvFps || 22050 % amvFps !== 0) {
      warnings.push('AMV 要求帧率能整除 22050Hz，建议使用 10 / 14 / 15 / 18 / 21 / 25 / 30 fps。');
    }
  }
  if (state.stripMeta) args.push('-map_metadata', '-1');
  if (fmt.kind === 'video') args.push('-sn', '-dn');

  args.push(outputName);

  // ---- 性能提示 ----
  const size = targetSize(state);
  if (hasVideo && size && (size.width >= 1920 || size.height >= 1080) && !videoCopy) {
    warnings.push('目标分辨率较高，浏览器内转码速度会明显变慢，建议先在 720p 以下试跑。');
  }

  // ---- 输出体积预估与警告 ----
  const est = estimateOutput(state, source);
  if (est.known) {
    const srcBytes = Number(source?.bytes) || 0;
    if (srcBytes > 0 && est.bytes > srcBytes * 1.1) {
      const times = (est.bytes / srcBytes).toFixed(1);
      const advice =
        fmt.kind === 'audio'
          ? ''
          : '重编码按画质优先分配码率，源文件码率越低膨胀越明显；想要更小可提高 CRF、切换“目标码率”模式、或降低分辨率 / 帧率。';
      warnings.push(
        `体积提醒：预计输出约 ${humanBytes(est.bytes)}，约为源文件（${humanBytes(srcBytes)}）的 ${times} 倍。${advice}`
      );
    }
    if (fmt.id === 'gif') {
      warnings.push(
        `体积提醒：GIF 每帧独立压缩、无音频流压缩，预计输出约 ${humanBytes(est.bytes)}，通常远大于源视频。` +
          '建议先用起止时间截短片段，并把帧率降到 10~12、分辨率降到 480p 以下。'
      );
    } else if (fmt.id === 'wav') {
      const mbPerMin = (est.audioKbps * 1000 * 60) / 8 / 1048576;
      warnings.push(
        `体积提醒：WAV 是未压缩 PCM，约 ${mbPerMin.toFixed(1)} MB/分钟；` +
          '仅存储或传输请改用 MP3 / M4A。'
      );
    } else if (fmt.id === 'amv' && est.seconds > 600) {
      warnings.push(
        `体积提醒：AMV（MJPEG）压缩率有限，超过 10 分钟的视频预计输出约 ${humanBytes(est.bytes)}，` +
          '建议分段转换，或在可接受画质损失时调高 CRF。'
      );
    }
    if (est.bytes > 2 * 1024 * 1024 * 1024) {
      warnings.push(`体积提醒：预计输出超过 2 GB，浏览器内存可能无法一次容纳，建议分段转换。`);
    }
  }

  return { args, outputName, warnings, estimate: est };
}

/** 把 args 拼成可读命令 */
export function commandToString(args) {
  return `ffmpeg ${args
    .map((a) => (/^[-\w.:/+%=@]+$/.test(a) ? a : `"${a}"`))
    .join(' ')}`;
}
