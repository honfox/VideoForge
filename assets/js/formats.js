/**
 * 输出格式 / 编码器 / 分辨率 / 帧率 等静态定义
 */

export const FORMATS = [
  {
    id: 'mp4',
    label: 'MP4',
    ext: 'mp4',
    mime: 'video/mp4',
    muxer: 'mp4',
    vcodec: 'libx264',
    acodec: 'aac',
    kind: 'video',
    hint: 'H.264 + AAC',
    tag: '推荐',
  },
  {
    id: 'webm',
    label: 'WebM',
    ext: 'webm',
    mime: 'video/webm',
    muxer: 'webm',
    vcodec: 'libvpx',
    acodec: 'libvorbis',
    kind: 'video',
    hint: 'VP8 + Vorbis',
  },
  {
    id: 'mkv',
    label: 'MKV',
    ext: 'mkv',
    mime: 'video/x-matroska',
    muxer: 'matroska',
    vcodec: 'libx264',
    acodec: 'aac',
    kind: 'video',
    hint: 'Matroska · 封装灵活',
  },
  {
    id: 'mov',
    label: 'MOV',
    ext: 'mov',
    mime: 'video/quicktime',
    muxer: 'mov',
    vcodec: 'libx264',
    acodec: 'aac',
    kind: 'video',
    hint: 'QuickTime',
  },
  {
    id: 'avi',
    label: 'AVI',
    ext: 'avi',
    mime: 'video/x-msvideo',
    muxer: 'avi',
    vcodec: 'mpeg4',
    acodec: 'libmp3lame',
    kind: 'video',
    hint: 'MPEG-4 + MP3',
  },
  {
    id: 'amv',
    label: 'AMV',
    ext: 'amv',
    mime: 'video/x-amv',
    muxer: 'amv',
    vcodec: 'amv',
    acodec: 'adpcm_ima_amv',
    kind: 'video',
    hint: 'MJPEG + ADPCM',
    tag: '设备',
    force: {
      resolution: { mode: 'preset', width: 160, height: 120 },
      scaleMode: 'fit',
      fps: 15,
      crf: 18,
      audioMode: 'encode',
      acodec: 'adpcm_ima_amv',
      audioRate: 22050,
      audioChannels: 1,
    },
  },
  {
    id: 'gif',
    label: 'GIF',
    ext: 'gif',
    mime: 'image/gif',
    muxer: 'gif',
    vcodec: 'gif',
    acodec: null,
    kind: 'image',
    hint: '256 色动图',
  },
  {
    id: 'mp3',
    label: 'MP3',
    ext: 'mp3',
    mime: 'audio/mpeg',
    muxer: 'mp3',
    vcodec: null,
    acodec: 'libmp3lame',
    kind: 'audio',
    hint: '仅提取音轨',
  },
  {
    id: 'm4a',
    label: 'M4A',
    ext: 'm4a',
    mime: 'audio/mp4',
    muxer: 'ipod',
    vcodec: null,
    acodec: 'aac',
    kind: 'audio',
    hint: 'AAC 音频',
  },
  {
    id: 'wav',
    label: 'WAV',
    ext: 'wav',
    mime: 'audio/wav',
    muxer: 'wav',
    vcodec: null,
    acodec: 'pcm_s16le',
    kind: 'audio',
    hint: '无损 PCM · 后期处理',
  },
];

export const RESOLUTIONS = [
  { id: 'uhd', label: '4K UHD', w: 3840, h: 2160 },
  { id: 'qhd', label: '2K QHD', w: 2560, h: 1440 },
  { id: 'fhd', label: '1080p', w: 1920, h: 1080 },
  { id: 'hd', label: '720p', w: 1280, h: 720 },
  { id: 'sd', label: '480p', w: 854, h: 480 },
  { id: 'low', label: '360p', w: 640, h: 360 },
  { id: 'tiny', label: '240p', w: 426, h: 240 },
  { id: 'amv', label: 'AMV 160×120', w: 160, h: 120 },
];

export const SCALE_MODES = [
  {
    id: 'fit',
    label: '适应留边',
    desc: '等比缩放到完整画面，不足处填充底色',
    icon: '<rect x="4.5" y="5.5" width="39" height="25" rx="2.5" stroke-dasharray="3 3"/><rect x="14" y="11" width="20" height="14" rx="1.5" class="fill"/>',
  },
  {
    id: 'fill',
    label: '填满裁切',
    desc: '等比放大铺满画面，超出部分裁切',
    icon: '<rect x="4.5" y="5.5" width="39" height="25" rx="2.5" stroke-dasharray="3 3"/><path d="M2 3h44v30H2z" class="fill"/><rect x="4.5" y="5.5" width="39" height="25" rx="2.5"/>',
  },
  {
    id: 'stretch',
    label: '强制拉伸',
    desc: '忽略原始比例，拉伸到目标尺寸',
    icon: '<rect x="4.5" y="5.5" width="39" height="25" rx="2.5" class="fill"/><path d="M12 10l26 16M38 10L12 26" stroke-dasharray="3 2"/>',
  },
  {
    id: 'width',
    label: '仅限宽度',
    desc: '按目标宽度缩放，高度自动计算',
    icon: '<rect x="4.5" y="13.5" width="39" height="9" rx="2" class="fill"/><path d="M8 18h32" stroke-dasharray="2 2"/><path d="M4.5 3v6M43.5 3v6M4.5 27v6M43.5 27v6"/>',
  },
  {
    id: 'height',
    label: '仅限高度',
    desc: '按目标高度缩放，宽度自动计算',
    icon: '<rect x="18.5" y="3" width="11" height="30" rx="2" class="fill"/><path d="M24 6v24" stroke-dasharray="2 2"/><path d="M6 3.5h6M6 32.5h6M36 3.5h6M36 32.5h6"/>',
  },
  {
    id: 'none',
    label: '不缩放',
    desc: '保持源分辨率，只转封装 / 编码',
    icon: '<rect x="14" y="9" width="20" height="18" rx="2" class="fill"/><path d="M24 3v4M24 29v4M6 3h0"/>',
  },
];

export const SWS_FLAGS = [
  { id: 'lanczos', label: 'Lanczos（锐利，慢）' },
  { id: 'bicubic', label: 'Bicubic（均衡）' },
  { id: 'bilinear', label: 'Bilinear（柔和，快）' },
  { id: 'neighbor', label: 'Nearest（像素风，最快）' },
  { id: 'area', label: 'Area（缩小时最佳）' },
];

export const FPS_PRESETS = [
  { id: 'source', label: '保持原始' },
  { id: '60', label: '60' },
  { id: '50', label: '50' },
  { id: '30', label: '30' },
  { id: '25', label: '25' },
  { id: '24', label: '24' },
  { id: '23.976', label: '23.976' },
  { id: '15', label: '15' },
  { id: '12', label: '12' },
  { id: '10', label: '10' },
  { id: 'custom', label: '自定义' },
];

export const VIDEO_CODECS = [
  { id: 'libx264', label: 'H.264 / AVC', detail: 'libx264 · 兼容性最好', rate: ['crf', 'bitrate'], presets: true },
  { id: 'libvpx', label: 'VP8', detail: 'libvpx · WebM 常用', rate: ['crf', 'bitrate'], presets: false },
  { id: 'libvpx-vp9', label: 'VP9', detail: 'libvpx-vp9 · 高压缩率，较慢', rate: ['crf', 'bitrate'], presets: false },
  { id: 'mpeg4', label: 'MPEG-4 Part 2', detail: 'mpeg4 · 老设备兼容', rate: ['crf', 'bitrate'], presets: false },
  { id: 'mjpeg', label: 'MJPEG', detail: 'mjpeg · 逐帧 JPEG', rate: ['crf', 'bitrate'], presets: false },
  { id: 'amv', label: 'AMV (MJPEG 变体)', detail: 'amv · AMV 容器专用', rate: ['crf'], presets: false },
  { id: 'gif', label: 'GIF', detail: 'gif · 动画图片', rate: ['crf'], presets: false },
];

export const AUDIO_CODECS = [
  { id: 'aac', label: 'AAC', detail: '原生编码器 · 通用', rates: [48000, 44100, 32000, 22050] },
  { id: 'libmp3lame', label: 'MP3', detail: 'libmp3lame · 通用', rates: [48000, 44100, 32000, 22050, 16000, 8000] },
  { id: 'libvorbis', label: 'Vorbis', detail: 'libvorbis · WebM 常用', rates: [48000, 44100, 32000, 22050] },
  { id: 'adpcm_ima_amv', label: 'ADPCM IMA AMV', detail: 'AMV 专用音频（仅 22050Hz）', rates: [22050] },
  { id: 'pcm_s16le', label: 'PCM 16-bit', detail: '未压缩 · WAV', rates: [48000, 44100] },
];

export const X264_PRESETS = [
  { id: 'ultrafast', label: 'ultrafast · 最快' },
  { id: 'superfast', label: 'superfast' },
  { id: 'veryfast', label: 'veryfast' },
  { id: 'faster', label: 'faster' },
  { id: 'fast', label: 'fast · 默认' },
  { id: 'medium', label: 'medium · 均衡' },
  { id: 'slow', label: 'slow · 更小' },
  { id: 'veryslow', label: 'veryslow · 最小' },
];

export const PIX_FMTS = [
  { id: 'yuv420p', label: 'yuv420p · 通用 8bit' },
  { id: 'yuv422p', label: 'yuv422p' },
  { id: 'yuv444p', label: 'yuv444p · 高色彩精度' },
  { id: 'yuvj420p', label: 'yuvj420p · JPEG 全范围' },
];

export const AUDIO_BITRATES = ['64k', '96k', '128k', '160k', '192k', '256k', '320k'];

export const getFormat = (id) => FORMATS.find((f) => f.id === id) || FORMATS[0];

export const videoCodecOptions = (format) => {
  if (!format) return [];
  if (format.id === 'gif') return VIDEO_CODECS.filter((c) => c.id === 'gif');
  if (format.kind !== 'video') return [];
  if (format.id === 'amv') return VIDEO_CODECS.filter((c) => c.id === 'amv');
  if (format.id === 'webm') return VIDEO_CODECS.filter((c) => c.id === 'libvpx' || c.id === 'libvpx-vp9');
  if (format.id === 'avi') return VIDEO_CODECS.filter((c) => c.id === 'mpeg4' || c.id === 'mjpeg');
  return VIDEO_CODECS.filter((c) => c.id !== 'gif');
};

export const audioCodecOptions = (format) => {
  if (!format || format.kind === 'image') return [];
  if (format.id === 'amv') return AUDIO_CODECS.filter((c) => c.id === 'adpcm_ima_amv');
  if (format.id === 'mp3') return AUDIO_CODECS.filter((c) => c.id === 'libmp3lame');
  if (format.id === 'm4a') return AUDIO_CODECS.filter((c) => c.id === 'aac');
  if (format.id === 'wav') return AUDIO_CODECS.filter((c) => c.id === 'pcm_s16le');
  if (format.id === 'webm') return AUDIO_CODECS.filter((c) => c.id === 'libvorbis');
  if (format.id === 'gif') return [];
  return AUDIO_CODECS.filter((c) => !['adpcm_ima_amv', 'pcm_s16le', 'libvorbis'].includes(c.id));
};
