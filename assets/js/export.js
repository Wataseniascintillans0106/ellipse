import { cnKey, weekdayCN, fmtNum, shortDate, recentKeys, escapeHtml, fromKey, todayKey } from './util.js';
import { getRecordData, allRecordKeys, getSettings } from './storage.js';
import { get, enabledOrder } from './core/registry.js';
import { markdownLines, metricValueOf } from './core/fields.js';

function fmValue(v) {
    if (Array.isArray(v)) return '[' + v.join(', ') + ']';
    if (typeof v === 'boolean') return String(v);
    return String(v);
}

function frontmatter(rows) {
    const lines = ['---'];
    rows.forEach(function (row) {
        if (row[1] === null || row[1] === undefined || row[1] === '') return;
        lines.push(row[0] + ': ' + fmValue(row[1]));
    });
    lines.push('---');
    return lines.join('\n');
}

function statLine(values) {
    const v = values.filter(function (x) { return x !== null; });
    if (!v.length) return '';
    const sum = v.reduce(function (a, b) { return a + b; }, 0);
    return '最低 ' + fmtNum(Math.min.apply(null, v)) +
        ' · 最高 ' + fmtNum(Math.max.apply(null, v)) +
        ' · 平均 ' + fmtNum(sum / v.length) +
        ' · 记录 ' + v.length + ' 天';
}

function valuesOf(module, metric, keys) {
    return keys.map(function (key) {
        return metricValueOf(module, metric, getRecordData(key)[module.id]);
    });
}

function blockBody(module, m) {
    if (typeof module.markdown === 'function') {
        const lines = module.markdown(m);
        return Array.isArray(lines) ? lines : String(lines || '').split('\n');
    }
    return markdownLines(module.fields, m);
}

export function dayMarkdown(key, opts) {
    const o = opts || {};
    const settings = getSettings();
    const withFm = o.frontmatter === undefined ? settings.export.frontmatter !== false : !!o.frontmatter;
    const order = o.order || enabledOrder();
    const data = getRecordData(key);

    const activeIds = order.filter(function (id) {
        const m = data[id];
        if (!m) return false;
        return Object.keys(m).some(function (k) {
            const v = m[k];
            return v !== undefined && v !== null && String(v).trim() !== '';
        });
    });

    const out = [];
    if (withFm) {
        out.push(frontmatter([
            ['date', key],
            ['weekday', weekdayCN(key)],
            ['tags', ['ellipse', '状态记录']],
            ['modules', activeIds]
        ]));
        out.push('');
    }
    out.push('# ' + cnKey(key) + ' ' + weekdayCN(key));
    out.push('');

    if (!activeIds.length) {
        out.push('> 今天还没有记录内容。');
        out.push('');
        return out.join('\n');
    }

    activeIds.forEach(function (id) {
        const module = get(id);
        if (!module) return;
        const m = data[id] || {};
        out.push('## ' + module.name);
        out.push('');
        let lines;
        try {
            lines = blockBody(module, m);
        } catch (err) {
            console.warn('[ellipse] 模块「' + module.name + '」导出出错：', err);
            lines = ['> 导出这个模块的内容时出错：' + String(err.message || err)];
        }
        lines.forEach(function (line) { out.push(line); });
        out.push('');
    });

    return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

export function rangeMarkdown(fromKey, toKey, opts) {
    const o = opts || {};
    const order = o.order || enabledOrder();
    const keys = [];
    const all = allRecordKeys();
    const start = fromKey || (all[0] || '');
    const end = toKey || new Date().toISOString().slice(0, 10);
    const span = recentKeys(3650).filter(function (k) { return k >= start && k <= end; });
    const used = span.length ? span : all;
    used.forEach(function (k) { keys.push(k); });

    const out = [];
    out.push(frontmatter([
        ['title', '状态记录汇总'],
        ['from', start],
        ['to', end],
        ['tags', ['ellipse', '状态记录', '汇总']]
    ]));
    out.push('');
    out.push('# 状态记录汇总 ' + shortDate(start, true) + ' – ' + shortDate(end, true));
    out.push('');

    order.forEach(function (id) {
        const module = get(id);
        if (!module) return;
        out.push('## ' + module.name);
        out.push('');
        if (!module.metrics.length) {
            out.push('> 纯文字模块，不生成波状图。');
            out.push('');
            return;
        }
        module.metrics.forEach(function (metric) {
            const values = valuesOf(module, metric, keys);
            const line = statLine(values);
            out.push('### ' + metric.label + (metric.unit ? '（' + metric.unit + '）' : ''));
            out.push('');
            out.push(line || '该区间没有记录。');
            out.push('');
            const rows = [];
            rows.push('| 日期 | ' + metric.label + ' |');
            rows.push('| --- | --- |');
            keys.forEach(function (key, i) {
                if (values[i] === null) return;
                rows.push('| ' + key + ' | ' + fmtNum(values[i]) + ' |');
            });
            if (rows.length > 2) {
                out.push(rows.join('\n'));
                out.push('');
            }
        });
    });

    return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

export function allMarkdown() {
    const keys = allRecordKeys();
    if (!keys.length) return '# 状态记录\n\n> 还没有任何记录。\n';
    const out = ['# 状态记录 · 全部', ''];
    out.push('共 ' + keys.length + ' 天：' + keys[0] + ' 至 ' + keys[keys.length - 1]);
    out.push('');
    keys.forEach(function (key) {
        out.push(dayMarkdown(key, { frontmatter: false }));
        out.push('');
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

export function suggestFilename(kind, key) {
    if (kind === 'day') return (key || 'record') + '.md';
    if (kind === 'all') return 'ellipse-records-' + new Date().toISOString().slice(0, 10) + '.md';
    if (kind === 'chat') return 'ellipse-chord-' + new Date().toISOString().slice(0, 10) + '.md';
    return 'ellipse-summary-' + (key || '') + '.md';
}

const REMIND_DAYS = 14;

function daysSince(from, today) {
    if (!from) return null;
    return Math.round((fromKey(today) - fromKey(from)) / 86400000);
}

export function remindDue(state) {
    const s = state || {};
    const today = s.today || todayKey();
    const remind = s.remind || {};
    if (remind.snoozeUntil && remind.snoozeUntil > today) return null;

    const out = { records: null, chat: null };

    const newestRecord = String(s.newestRecordKey || '');
    const recordSince = String(remind.records || s.oldestRecordKey || '');
    const recDays = daysSince(recordSince, today);
    if (newestRecord && newestRecord > recordSince && recDays !== null && recDays >= REMIND_DAYS) {
        out.records = { days: recDays, since: recordSince, newest: newestRecord };
    }

    const newestChat = String(s.newestChatAt || '').slice(0, 10);
    const chatSince = String(remind.chat || s.oldestChatAt || '');
    const chatDays = daysSince(chatSince, today);
    if (newestChat && newestChat > chatSince && chatDays !== null && chatDays >= REMIND_DAYS) {
        out.chat = { days: chatDays, since: chatSince, newest: newestChat };
    }

    if (!out.records && !out.chat) return null;
    return out;
}

export function downloadMarkdown(text, filename) {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}

export async function copyText(text) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (err) {  }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch (err) {
        return false;
    }
}
