export const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function pad2(n) { return String(n).padStart(2, '0'); }

export function toKey(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

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

export function diffFromToday(key) {
    const a = fromKey(key); a.setHours(0, 0, 0, 0);
    const b = new Date(); b.setHours(0, 0, 0, 0);
    return Math.round((a - b) / 86400000);
}

export function displayKey(key) { return String(key).replace(/-/g, '.'); }

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

export function recentKeys(n) {
    const out = [];
    const base = new Date();
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
        out.push(toKey(d));
    }
    return out;
}

export function shortDate(key, withYear) {
    const p = String(key).split('-');
    if (withYear || yearOf(key) !== new Date().getFullYear()) {
        return p[1] + '.' + p[2];
    }
    return Number(p[1]) + '/' + Number(p[2]);
}

export function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

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
