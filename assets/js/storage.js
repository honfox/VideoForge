/**
 * 参数持久化：把转换参数写入 localStorage，刷新 / 重开浏览器后自动恢复
 * - key 带 schema 版本号，结构不兼容时整体丢弃，回退默认值
 * - 读写全部 try/catch：隐私模式、配额满、localStorage 被禁用时静默降级
 */

const STORAGE_KEY = 'videoforge.settings';
const SCHEMA_VERSION = 1;

/** 读取已保存的参数（原始对象，未做校验）；没有 / 损坏 / 版本不兼容时返回 null */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (data.version !== SCHEMA_VERSION) return null;
    const s = data.state;
    return s && typeof s === 'object' && !Array.isArray(s) ? s : null;
  } catch {
    return null;
  }
}

/** 保存参数；返回是否写入成功 */
export function saveSettings(state) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: SCHEMA_VERSION, savedAt: Date.now(), state })
    );
    return true;
  } catch {
    return false;
  }
}

/** 清除已保存的参数（恢复默认时调用） */
export function clearSettings() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 忽略：清不掉也不影响使用 */
  }
}
