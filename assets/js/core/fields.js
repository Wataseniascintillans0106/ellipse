/* 声明式字段：一份字段声明，推导出表单 / 收起摘要 / md 导出 / 波状图指标。

   本文件只拼字符串、不碰 DOM —— 这样 Node 里能直接 import，scripts/smoke.mjs 才测得动。

   字段形状：
   { key:'morning', type:'scale', label:'醒后', short:'醒后', min:1, max:10,
     low:'1 低落', high:'10 很好' }
   type 见下面的 renderField；short 是摘要里用的短名（默认取 label，传 '' 表示不要名字）。 */

import { icon } from '../icons.js';
import { fmtNum, escapeHtml } from '../util.js';

const EMPTY_FORM = '未记录';   /* 表单标签行里的空值 */
const EMPTY_MD = '—';          /* md 导出里的空值 */

/** 内置控件类型 */
export const FIELD_TYPES = ['scale', 'slider', 'number', 'enum', 'text', 'textarea'];

/* 有值判断：0 与 false 都算有值，''、null、undefined 算没值 */
export function hasValue(v) {
    return v !== null && v !== undefined && String(v).trim() !== '';
}

/* 宽松比较：DOM 上的 data-value 永远是字符串，记录里可能是数字或布尔 */
export function sameValue(a, b) {
    if (a === b) return true;
    if (a === null || a === undefined || b === null || b === undefined) return false;
    return String(a) === String(b);
}

function esc(text) { return escapeHtml(text); }

/* ---------------- 值的显示形态 ---------------- */

function scaleText(v, f) { return v + ' / ' + (f.max === undefined ? 10 : f.max); }

function numberText(v, f) { return fmtNum(v) + (f.unit ? ' ' + f.unit : ''); }

function optionLabel(f, v) {
    const hit = (f.options || []).find(function (o) { return sameValue(o.value, v); });
    return hit ? hit.label : String(v);
}

/** 摘要里那个值（评分只要数字，不要 "7 / 10"） */
function previewValue(f, v) {
    if (f.type === 'scale' || f.type === 'slider') return String(v);
    if (f.type === 'number') return numberText(v, f);
    if (f.type === 'enum') return optionLabel(f, v);
    return String(v);
}

/** md 里的值 */
function markdownValue(f, v) {
    if (f.type === 'scale' || f.type === 'slider') return scaleText(v, f);
    if (f.type === 'number') return numberText(v, f);
    if (f.type === 'enum') return optionLabel(f, v);
    return String(v);
}

/** 表单里标签行右侧那个值 */
function fieldValueText(f, v) {
    if (!hasValue(v)) return EMPTY_FORM;
    if (f.type === 'scale' || f.type === 'slider' || f.type === 'number') return markdownValue(f, v);
    return '';   /* enum / text / textarea 不在标签行显示值 */
}

function textPreview(v) {
    const t = String(v).replace(/\s+/g, ' ').trim();
    return t.length > 46 ? t.slice(0, 46) + '…' : t;
}

/* ---------------- 表单 HTML ---------------- */

function fieldShell(label, valueText, inner, extra, valueAttr) {
    const head = label
        ? '<div class="field-label"><span>' + label + '</span>' +
          (valueText ? '<span class="field-value"' + (valueAttr || '') + '>' + valueText + '</span>' : '') +
          '</div>'
        : '';
    return '<div class="field">' + head + inner + (extra || '') + '</div>';
}

function hintHtml(f, min, max) {
    return '<div class="scale-hint"><span>' + (f.low || min + ' 分') + '</span>' +
        '<span>' + (f.high || max + ' 分') + '</span></div>';
}

function scaleHtml(f, value) {
    const min = f.min === undefined ? 1 : f.min;
    const max = f.max === undefined ? 10 : f.max;
    const label = f.label || f.key;
    const cells = [];
    for (let v = min; v <= max; v++) {
        const on = sameValue(value, v) ? ' on' : '';
        cells.push('<button class="scale-cell' + on + '" type="button" data-field="' + f.key +
            '" data-type="scale" data-value="' + v + '" aria-label="' + label + ' ' + v + ' 分">' + v + '</button>');
    }
    return '<div class="scale" role="group" aria-label="' + label + '">' + cells.join('') + '</div>' +
        hintHtml(f, min, max);
}

function sliderHtml(f, value) {
    const min = f.min === undefined ? 0 : f.min;
    const max = f.max === undefined ? 10 : f.max;
    const has = typeof value === 'number' && isFinite(value);
    const v = has ? value : min;
    const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
    return '<div class="rheostat" style="--fill:' + pct + '%">' +
        '<input class="rheostat-input" type="range" data-field="' + f.key + '" data-type="slider"' +
        ' min="' + min + '" max="' + max + '" step="1" value="' + v + '"' +
        ' aria-label="' + (f.label || f.key) + '" aria-valuetext="' + v + ' 分">' +
        '</div>' + hintHtml(f, min, max);
}

function numberHtml(f, value) {
    const step = f.step === undefined ? 1 : f.step;
    const min = f.min === undefined ? 0 : f.min;
    const shown = hasValue(value) ? value : '';
    return '<div class="num-row"><input class="num-input" type="number"' +
        ' inputmode="' + (Number.isInteger(step) ? 'numeric' : 'decimal') + '"' +
        ' step="' + step + '" min="' + min + '"' + (f.max === undefined ? '' : ' max="' + f.max + '"') +
        ' data-field="' + f.key + '" data-type="number" placeholder="0" value="' + shown + '">' +
        (f.unit ? '<span class="num-unit">' + f.unit + '</span>' : '') +
        '</div>';
}

function chipsHtml(f) {
    if (!f.chips || !f.chips.length) return '';
    return '<div class="chip-row">' + f.chips.map(function (v) {
        return '<button class="chip" type="button" data-field="' + f.key + '" data-type="chip" ' +
            'data-value="' + v + '">' + v + (f.chipUnit ? ' ' + f.chipUnit : '') + '</button>';
    }).join('') + '</div>';
}

function enumHtml(f, value) {
    return '<div class="seg" role="group" aria-label="' + (f.label || f.key) + '">' +
        (f.options || []).map(function (o) {
            const on = sameValue(value, o.value) ? ' on' : '';
            return '<button class="seg-item' + on + '" type="button" data-field="' + f.key +
                '" data-type="enum" data-value="' + o.value + '">' + o.label + '</button>';
        }).join('') + '</div>';
}

function textHtml(f, value) {
    return '<input class="text-input" type="text" data-field="' + f.key + '" data-type="text"' +
        (f.maxlength ? ' maxlength="' + f.maxlength + '"' : '') +
        ' placeholder="' + esc(f.placeholder || '') + '"' +
        ' value="' + esc(hasValue(value) ? value : '') + '">';
}

/* 工具按钮：只在对应工具真的注册了才出现（比如关掉「AI 助手」模块，整理按钮自己消失） */
function toolRowHtml(f, ctx) {
    const ids = f.tools || [];
    if (!ids.length) return '';
    const lookup = ctx.tool || function () { return null; };
    const buttons = ids.map(function (id) {
        const tool = lookup(id);
        if (!tool) return '';
        return '<button class="tool-btn" type="button" data-act="tool" data-tool="' + id +
            '" data-field="' + f.key + '">' +
            (tool.icon ? icon(tool.icon) : '') + '<span>' + (tool.label || id) + '</span></button>';
    }).join('');
    return buttons ? '<div class="tool-row">' + buttons + '</div>' : '';
}

function footHtml(f, value) {
    if (!f.foot && !f.counter) return '';
    const len = hasValue(value) ? String(value).length : 0;
    return '<div class="field-foot"><span>' + (f.foot || '') + '</span>' +
        (f.counter ? '<span data-count="' + f.key + '">' + len + ' 字</span>' : '') + '</div>';
}

function textareaHtml(f, value, ctx) {
    return '<textarea class="textarea" data-field="' + f.key + '" data-type="textarea"' +
        ' rows="' + (f.rows || 4) + '"' + (f.maxlength ? ' maxlength="' + f.maxlength + '"' : '') +
        ' placeholder="' + esc(f.placeholder || '') + '">' + esc(hasValue(value) ? value : '') + '</textarea>' +
        toolRowHtml(f, ctx) + footHtml(f, value);
}

function innerHtml(f, value, ctx) {
    if (f.type === 'scale') return scaleHtml(f, value);
    if (f.type === 'slider') return sliderHtml(f, value);
    if (f.type === 'number') return numberHtml(f, value);
    if (f.type === 'enum') return enumHtml(f, value);
    if (f.type === 'text') return textHtml(f, value);
    if (f.type === 'textarea') return textareaHtml(f, value, ctx);
    return '';
}

function renderField(f, data, ctx) {
    const value = data[f.key];
    return fieldShell(
        f.label || '',
        fieldValueText(f, value),
        innerHtml(f, value, ctx),
        f.type === 'number' ? chipsHtml(f) : '',
        f.type === 'slider' ? ' data-value-of="' + f.key + '"' : ''
    );
}

/**
 * 渲染一整组字段
 * @param {Array} fields 字段声明
 * @param {object} data  该模块当天的记录
 * @param {object} ctx   { tool: (id) => 工具定义 | null }
 */
export function renderFields(fields, data, ctx) {
    const m = data || {};
    const c = ctx || {};
    return (fields || []).map(function (f) { return renderField(f, m, c); }).join('');
}

/* ---------------- 收起时的摘要 ---------------- */

export function summarize(fields, data) {
    const m = data || {};
    const parts = [];
    (fields || []).forEach(function (f) {
        const v = m[f.key];
        if (!hasValue(v)) return;
        if (f.type === 'textarea') {
            const text = textPreview(v);
            if (text) parts.push(text);
            return;
        }
        if (f.preview === false) return;
        const name = f.short === undefined ? f.label : f.short;
        const val = previewValue(f, v);
        if (!val) return;
        parts.push(name ? name + ' ' + val : val);
    });
    return parts.join(' · ');
}

/* ---------------- md 导出 ---------------- */

/** 一个模块当天的正文行（不含 "## 标题"） */
export function markdownLines(fields, data) {
    const m = data || {};
    const lines = [];
    (fields || []).forEach(function (f) {
        const v = m[f.key];
        if (f.type === 'textarea') {
            const text = hasValue(v) ? String(v).trim() : '';
            if (text) lines.push(text);
            return;
        }
        if (!hasValue(v)) {
            if (f.type === 'text') return;             /* 文本空值：整行不写 */
            lines.push('- ' + f.label + '：' + EMPTY_MD);
            return;
        }
        lines.push('- ' + f.label + '：' + markdownValue(f, v));
    });
    return lines;
}

/* ---------------- 波状图指标 ---------------- */

/** 没自己声明 metrics 时，由数值型字段推导 */
export function metricsFromFields(fields) {
    return (fields || []).filter(function (f) {
        return f.metric !== false && (f.type === 'scale' || f.type === 'slider' || f.type === 'number');
    }).map(function (f) {
        const metric = { key: f.key, label: f.label, field: f.key, min: 0 };
        if (f.max !== undefined) metric.max = f.max;
        if (f.unit) metric.unit = f.unit;
        return metric;
    });
}

/** 取某模块某指标在一条记录里的值（图表与 md 统计共用这一处逻辑） */
export function metricValueOf(def, metric, m) {
    if (!m) return null;
    if (typeof metric.value === 'function') {
        const derived = metric.value(m);
        return Number.isFinite(derived) ? derived : null;
    }
    const raw = m[metric.field || metric.key];
    return Number.isFinite(raw) ? raw : null;
}

/** 按 key 找字段（事件层判断控件类型用） */
export function fieldByKey(fields, key) {
    return (fields || []).find(function (f) { return f.key === key; }) || null;
}
