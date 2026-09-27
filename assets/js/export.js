/* md 导出：Obsidian 风格（YAML frontmatter + 每日一文件） */

import { cnKey, weekdayCN, fmtNum, shortDate, recentKeys, escapeHtml } from './util.js';
import { getRecordData, allRecordKeys, enabledOrder, getSettings, exportAll } from './storage.js';
import { getModule } from './modules.js';

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

function num(v) {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
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
        const data = getRecordData(key);
        const m = data[module.id];
        if (!m) return null;
        if (metric.derived && typeof metric.value === 'function') return num(metric.value(m));
        if (typeof module.metricValue === 'function') return num(module.metricValue(metric, m));
        return num(m[metric.field]);
    });
}

function blockBody(module, m) {
    const lines = [];
    if (module.id === 'mood') {
        lines.push('- 醒后：' + (num(m.morning) !== null ? m.morning + ' / 10' : '—'));
        lines.push('- 睡前：' + (num(m.evening) !== null ? m.evening + ' / 10' : '—'));
    } else if (module.id === 'sleep') {
        lines.push('- 睡眠质量：' + (num(m.quality) !== null ? m.quality + ' / 10' : '—'));
        lines.push('- 睡眠时长：' + (num(m.hours) !== null ? fmtNum(m.hours) + ' 小时' : '—'));
    } else if (module.id === 'pain') {
        lines.push('- 疼痛程度：' + (num(m.level) !== null ? m.level + ' / 10' : '—'));
        if (m.note) lines.push('- 部位 / 备注：' + m.note);
    } else if (module.id === 'exercise') {
        lines.push('- 运动时长：' + (num(m.minutes) !== null ? fmtNum(m.minutes) + ' 分钟' : '—'));
        lines.push('- 是否不适：' + (m.discomfort === true ? '有不适' : m.discomfort === false ? '无不适' : '—'));
    } else if (module.id === 'diary') {
        lines.push(String(m.text || '').trim());
    } else {
        Object.keys(m).forEach(function (k) { lines.push('- ' + k + '：' + m[k]); });
    }
    return lines;
}

/** 单日 md */
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
        const module = getModule(id);
        if (!module) return;
        const m = data[id] || {};
        out.push('## ' + module.name);
        out.push('');
        blockBody(module, m).forEach(function (line) { out.push(line); });
        out.push('');
    });

    return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/** 区间汇总 md（含波状图的统计与数据表） */
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
        const module = getModule(id);
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

/** 全部记录：每天的记录拼成一份 md */
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
    return 'ellipse-summary-' + (key || '') + '.md';
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
    } catch (err) { /* 继续用兜底方案 */ }
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

export function backupJson() {
    return JSON.stringify(exportAll(), null, 2);
}
