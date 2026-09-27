/* 通用小工具：日期、DOM、文本 */

export const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function pad2(n) { return String(n).padStart(2, '0'); }

/** Date -> "2025-01-01"（本地时区，不用 toISOString，避免时差偏移） */
export function toKey(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

/** "2025-01-01" -> Date（本地零点） */
export function fromKey(key) {
    const p = String(key).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

export function todayKey() { return toKey(new Date()); }

export function shiftKey(key, days) {
    const d = fromKey(key);
    d.setDate(d.getDate() + days);
    return toKey(d);
}

/** 相对天数差：今天 0，昨天 -1 */
export function diffFromToday(key) {
    const a = fromKey(key); a.setHours(0, 0, 0, 0);
    const b = new Date(); b.setHours(0, 0, 0, 0);
    return Math.round((a - b) / 86400000);
}

/** "2025-01-01" -> "2025.01.01" */
export function displayKey(key) { return String(key).replace(/-/g, '.'); }

/** "2025-01-01" -> "2025年01月01日" */
export function cnKey(key) {
    const p = String(key).split('-');
    return p[0] + '年' + p[1] + '月' + p[2] + '日';
}

export function weekdayCN(key) { return WEEK_CN[fromKey(key).getDay()]; }

export function relativeLabel(key) {
    const d = diffFromToday(key);
    if (d === 0) return '今天';
    if (d === -1) return '昨天';
    if (d === -2) return '前天';
    if (d === 1) return '明天';
    return weekdayCN(key);
}

export function yearOf(key) { return Number(String(key).slice(0, 4)); }

/** 最近 n 天的日期 key（升序，含今天） */
export function recentKeys(n) {
    const out = [];
    const base = new Date();
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
        out.push(toKey(d));
    }
    return out;
}

/** 短日期：跨年时带年份 */
export function shortDate(key, withYear) {
    const p = String(key).split('-');
    if (withYear || yearOf(key) !== new Date().getFullYear()) {
        return p[1] + '.' + p[2];
    }
    return Number(p[1]) + '/' + Number(p[2]);
}

export function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

/** 保留一位小数，去掉多余的 .0 */
export function fmtNum(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return '';
    const r = Math.round(n * 10) / 10;
    return String(r);
}

export function escapeHtml(str) {
    return String(str === null || str === undefined ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function debounce(fn, wait) {
    let t = 0;
    return function debounced() {
        const args = arguments;
        const self = this;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
}

export function $(sel, root) { return (root || document).querySelector(sel); }
export function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

/** 把 "7.5"、"１２" 这类输入清洗成数字或 null */
export function readNumber(value) {
    if (value === null || value === undefined) return null;
    const s = String(value).replace(/[０-９]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }).replace(/[^\d.\-]/g, '');
    if (s === '' || s === '-' || s === '.') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

let toastTimer = 0;
export function toast(message, ms) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('on'); }, ms || 1900);
}
