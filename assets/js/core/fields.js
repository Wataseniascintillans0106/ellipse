import { icon } from '../icons.js';
import { fmtNum, escapeHtml } from '../util.js';

const EMPTY_FORM = '未记录';
const EMPTY_MD = '—';

export const FIELD_TYPES = ['scale', 'slider', 'number', 'enum', 'text', 'textarea'];

export function hasValue(v) {
    return v !== null && v !== undefined && String(v).trim() !== '';
}

export function sameValue(a, b) {
    if (a === b) return true;
    if (a === null || a === undefined || b === null || b === undefined) return false;
    return String(a) === String(b);
}

function esc(text) { return escapeHtml(text); }

function scaleText(v, f) { return v + ' / ' + (f.max === undefined ? 10 : f.max); }

function numberText(v, f) { return fmtNum(v) + (f.unit ? ' ' + f.unit : ''); }

function optionLabel(f, v) {
    const hit = (f.options || []).find(function (o) { return sameValue(o.value, v); });
    return hit ? hit.label : String(v);
}

function previewValue(f, v) {
    if (f.type === 'scale' || f.type === 'slider') return String(v);
    if (f.type === 'number') return numberText(v, f);
    if (f.type === 'enum') return optionLabel(f, v);
    return String(v);
}

function markdownValue(f, v) {
    if (f.type === 'scale' || f.type === 'slider') return scaleText(v, f);
    if (f.type === 'number') return numberText(v, f);
    if (f.type === 'enum') return optionLabel(f, v);
    return String(v);
}

function fieldValueText(f, v) {
    if (!hasValue(v)) return EMPTY_FORM;
    if (f.type === 'scale' || f.type === 'slider' || f.type === 'number') return markdownValue(f, v);
    return '';
}

function textPreview(v) {
    const t = String(v).replace(/\s+/g, ' ').trim();
    return t.length > 46 ? t.slice(0, 46) + '…' : t;
}

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

export function renderFields(fields, data, ctx) {
    const m = data || {};
    const c = ctx || {};
    return (fields || []).map(function (f) { return renderField(f, m, c); }).join('');
}

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
            if (f.type === 'text') return;
            lines.push('- ' + f.label + '：' + EMPTY_MD);
            return;
        }
        lines.push('- ' + f.label + '：' + markdownValue(f, v));
    });
    return lines;
}

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

export function metricValueOf(def, metric, m) {
    if (!m) return null;
    if (typeof metric.value === 'function') {
        const derived = metric.value(m);
        return Number.isFinite(derived) ? derived : null;
    }
    const raw = m[metric.field || metric.key];
    return Number.isFinite(raw) ? raw : null;
}

export function fieldByKey(fields, key) {
    return (fields || []).find(function (f) { return f.key === key; }) || null;
}
