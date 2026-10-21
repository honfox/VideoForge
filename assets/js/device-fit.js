/**
 * 设备屏幕适配
 *
 * 场景：用户拿尺子量出播放器（MP3 / MP4 小屏设备）屏幕的物理长宽，
 * 这里负责反推屏幕比例 → 吸附最接近的标准比例 → 按长边像素推荐输出分辨率
 * → 归一化成横屏基准，交给 UI 让用户选横屏 / 竖屏应用。
 *
 * 全部为纯函数，不依赖 DOM，可单独单测（见 _device_fit_test.mjs）。
 */

/** 常见屏幕比例，一律按横屏（w >= h）记录 */
export const SCREEN_RATIOS = [
  { w: 21, h: 9, label: '21:9' },
  { w: 16, h: 9, label: '16:9' },
  { w: 5, h: 3, label: '5:3' },
  { w: 16, h: 10, label: '16:10' },
  { w: 3, h: 2, label: '3:2' },
  { w: 4, h: 3, label: '4:3' },
  { w: 1, h: 1, label: '1:1' },
];

/** 吸附容差：实测比例与标准比例的相对误差 ≤ 2.5% 即视为该标准比例（尺子量总有误差） */
export const RATIO_TOLERANCE = 0.025;

/** 长边像素候选与默认值（默认 320 覆盖绝大多数廉价播放器屏幕） */
export const LONG_EDGES = [240, 320, 480, 640, 720, 1080];
export const DEFAULT_LONG_EDGE = 320;

/** 用户填写的“已知设备分辨率”与实测比例的允许误差 */
export const KNOWN_RES_TOLERANCE = 0.05;

/** AMV 容器对分辨率的上限（README：建议不超过 224×176，默认 160×120） */
export const AMV_MAX = { w: 160, h: 120 };

/** 物理单位 → mm（换算只用于统一展示，比例与单位无关） */
export const UNIT_TO_MM = { mm: 1, cm: 10, inch: 25.4 };

/** 边长合法范围（按 mm 计，2000mm 以上的“屏幕”一定是单位用错了） */
const MAX_EDGE_MM = 2000;

/** ffmpeg 要求偶数尺寸 */
const even = (n) => Math.max(2, Math.round(Number(n) / 2) * 2);

/** 归一化为横屏基准：长边作为宽 */
export function normalizeSize(w, h) {
  const nw = Math.round(Number(w) || 0);
  const nh = Math.round(Number(h) || 0);
  return nw >= nh ? { w: nw, h: nh } : { w: nh, h: nw };
}

/** 按方向输出尺寸；orientation: 'landscape' | 'portrait' */
export function orientSize(w, h, orientation) {
  const n = normalizeSize(w, h);
  return orientation === 'portrait' ? { w: n.h, h: n.w } : { w: n.w, h: n.h };
}

/** 把浮点比例化成一个最简分数（分母 ≤ 64），用于展示未吸附时的原始比例 */
function ratioToFraction(ratio, maxDen = 64) {
  let best = null;
  for (let d = 1; d <= maxDen; d++) {
    const n = Math.round(ratio * d);
    if (n < 1) continue;
    const err = Math.abs(ratio - n / d);
    if (!best || err < best.err) best = { n, d, err };
  }
  return best || { n: 1, d: 1, err: 1 };
}

/**
 * 把实测比例匹配到最接近的标准比例
 * @param {number} ratio 实测比例（任意方向，w/h）
 * @returns {{ratio:number, label:string, snapped:boolean, error:number,
 *            rawRatio:number, rawLabel:string}|null}
 */
export function matchRatio(ratio) {
  const r = Number(ratio);
  if (!(r > 0) || !Number.isFinite(r)) return null;
  const frac = ratioToFraction(r);
  let best = null;
  for (const s of SCREEN_RATIOS) {
    const sr = s.w / s.h;
    const err = Math.abs(r - sr) / sr;
    if (!best || err < best.error) best = { ratio: sr, label: s.label, error: err };
  }
  return {
    ratio: best.ratio,
    label: best.label,
    snapped: best.error <= RATIO_TOLERANCE,
    error: best.error,
    rawRatio: r,
    rawLabel: `${frac.n}:${frac.d}`,
  };
}

/**
 * 在给定比例下搜索最佳偶数分辨率（长边不超过 longEdge）
 * 规则：与比例误差最小；误差优势不足 0.5% 时优先取尺寸更大者（用满长边预算），
 * 因此 3:2 会得到 320×214 而不是 318×212——误差 0.33% 肉眼不可辨，尺寸更整。
 * @returns {{w:number, h:number}|null}
 */
export function fitResolution(ratio, longEdge = DEFAULT_LONG_EDGE) {
  const raw = Number(ratio);
  if (!(raw > 0) || !Number.isFinite(raw)) return null;
  const r = raw >= 1 ? raw : 1 / raw;
  const edge = LONG_EDGES.includes(Number(longEdge)) ? Number(longEdge) : DEFAULT_LONG_EDGE;
  let best = null;
  for (let w = edge; w >= 2; w -= 2) {
    const h = even(w / r);
    if (h < 2 || h > edge) continue;
    const err = Math.abs(w / h - r) / r;
    if (!best || err < best.err - 0.005) best = { w, h, err };
  }
  return best ? { w: best.w, h: best.h } : null;
}

/** 把尺寸限制在 maxW × maxH 之内，保持比例并取偶（AMV 等容器上限用） */
export function capSize(w, h, maxW, maxH) {
  let nw = even(w);
  let nh = even(h);
  if (nw <= maxW && nh <= maxH) return { w: nw, h: nh };
  const scale = Math.min(maxW / nw, maxH / nh);
  nw = even(nw * scale);
  nh = even(nh * scale);
  return { w: nw, h: nh };
}

/**
 * 校验用户填写的“设备标注分辨率”与实测屏幕比例是否一致
 * @returns {{ok:boolean, error:number}}
 */
export function checkKnownRes(knownW, knownH, ratio) {
  const n = normalizeSize(knownW, knownH);
  if (!(n.w > 0 && n.h > 0) || !(Number(ratio) > 0)) return { ok: false, error: 1 };
  const err = Math.abs(n.w / n.h - ratio) / ratio;
  return { ok: err <= KNOWN_RES_TOLERANCE, error: err };
}

/**
 * 汇总一次适配计算
 * @param {{width:number, height:number, unit?:string, knownRes?:boolean,
 *          knownW?:number, knownH?:number, longEdge?:number}} input
 * @param {{maxW:number, maxH:number}|null} cap 分辨率上限（AMV 等格式传入）
 * @returns {{ok:true, ratio:object, base:{w:number,h:number}, source:'measured'|'known',
 *            capped:boolean, measured:{wMm:number,hMm:number,ratio:number}}
 *          | {ok:false, error:string}}
 */
export function analyzeDevice(input, cap = null) {
  const w = Number(input?.width) || 0;
  const h = Number(input?.height) || 0;
  if (!(w > 0 && h > 0)) return { ok: false, error: '请输入屏幕宽度和高度' };

  const unit = UNIT_TO_MM[input?.unit] ? input.unit : 'mm';
  const wMm = w * UNIT_TO_MM[unit];
  const hMm = h * UNIT_TO_MM[unit];
  if (wMm > MAX_EDGE_MM || hMm > MAX_EDGE_MM) {
    return { ok: false, error: '边长数值过大，请确认单位是否选错' };
  }

  const measuredRatio = wMm / hMm;
  const matched = matchRatio(measuredRatio);
  // 内部一律按横屏基准（>=1）计算，方向由 UI 选择
  const rawLandscape = measuredRatio >= 1 ? measuredRatio : 1 / measuredRatio;

  let base;
  let source = 'measured';
  if (input?.knownRes) {
    const kw = Number(input.knownW) || 0;
    const kh = Number(input.knownH) || 0;
    if (!(kw > 0 && kh > 0)) return { ok: false, error: '请填写完整的设备分辨率（宽 × 高）' };
    const check = checkKnownRes(kw, kh, rawLandscape);
    if (!check.ok) {
      return {
        ok: false,
        error: `设备分辨率 ${kw}×${kh} 的比例与实测屏幕不符（误差 ${(check.error * 100).toFixed(1)}%），请检查输入`,
      };
    }
    base = normalizeSize(kw, kh);
    source = 'known';
  } else {
    const longEdge = LONG_EDGES.includes(Number(input?.longEdge))
      ? Number(input.longEdge)
      : DEFAULT_LONG_EDGE;
    // 吸附成功时用标准比例（量得糙但设备是标准的），否则用实测比例
    const targetRatio = matched.snapped ? matched.ratio : rawLandscape;
    base = fitResolution(targetRatio, longEdge);
    if (!base) return { ok: false, error: '无法为当前比例推荐分辨率，请调整长边像素' };
  }

  let capped = false;
  if (cap && (base.w > cap.maxW || base.h > cap.maxH)) {
    base = capSize(base.w, base.h, cap.maxW, cap.maxH);
    capped = true;
  }

  return {
    ok: true,
    ratio: matched,
    base,
    source,
    capped,
    measured: { wMm, hMm, ratio: measuredRatio },
  };
}
