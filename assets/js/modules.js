/* 模块定义：新增一个模块 = 在这里加一条，其余（记录页 / 波状图 / md 导出）自动生效 */

import { icon } from './icons.js';
import { fmtNum, escapeHtml } from './util.js';

const TONE = 'range-10';

/* 评分格：1–10 或 0–10；value 传当前值，命中的格子加 .on（选中变深） */
function scale(field, opts) {
    const o = opts || {};
    const min = o.min === undefined ? 1 : o.min;
    const max = o.max === undefined ? 10 : o.max;
    const current = o.value;
    const cells = [];
    for (let v = min; v <= max; v++) {
        const on = String(current) === String(v) ? ' on' : '';
        cells.push('<button class="scale-cell' + on + '" type="button" data-field="' + field +
            '" data-value="' + v + '" aria-label="' + (o.label || '') + ' ' + v + ' 分">' + v + '</button>');
    }
    return '<div class="scale" role="group" aria-label="' + (o.label || field) + '">' + cells.join('') + '</div>' +
        '<div class="scale-hint"><span>' + (o.low || min + ' 分') + '</span><span>' + (o.high || max + ' 分') + '</span></div>';
}

/* 滑动变阻器：拖动取值（疼痛程度用），样式见 app.css 的 .rheostat */
function slider(field, opts) {
    const o = opts || {};
    const min = o.min === undefined ? 0 : o.min;
    const max = o.max === undefined ? 10 : o.max;
    const has = typeof o.value === 'number' && isFinite(o.value);
    const v = has ? o.value : min;
    const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
    return '<div class="rheostat" style="--fill:' + pct + '%">' +
        '<input class="rheostat-input" type="range" data-field="' + field + '"' +
        ' min="' + min + '" max="' + max + '" step="1" value="' + v + '"' +
        ' aria-label="' + (o.label || field) + '" aria-valuetext="' + v + ' 分">' +
        '</div>' +
        '<div class="scale-hint"><span>' + (o.low || min + ' 分') + '</span><span>' + (o.high || max + ' 分') + '</span></div>';
}

/* valueAttr：给数值文字加标记，拖动时可以就地更新（见 app.js 的 sliderVisual） */
function field(label, valueText, inner, extra, valueAttr) {
    return '<div class="field">' +
        '<div class="field-label"><span>' + label + '</span>' +
        (valueText ? '<span class="field-value"' + (valueAttr || '') + '>' + valueText + '</span>' : '') + '</div>' +
        inner + (extra || '') + '</div>';
}

function seg(field, items, current) {
    return '<div class="seg" role="group" aria-label="' + field + '">' + items.map(function (it) {
        const on = String(it.v) === String(current) ? ' on' : '';
        return '<button class="seg-item' + on + '" type="button" data-field="' + field +
            '" data-value="' + it.v + '">' + it.t + '</button>';
    }).join('') + '</div>';
}

/* 一句话摘要，用于模块收起时的预览 */
function textPreview(m) {
    if (!m || !m.text) return '';
    const t = String(m.text).replace(/\s+/g, ' ').trim();
    return t.length > 46 ? t.slice(0, 46) + '…' : t;
}

export const MODULES = [
    {
        id: 'mood',
        name: '情绪',
        icon: 'mood',
        desc: '醒后与睡前各记一次心情状态',
        template: function (m) {
            m = m || {};
            return field('醒后', m.morning ? m.morning + ' / 10' : '未记录',
                    scale('morning', { label: '醒后心情', min: 1, max: 10, low: '1 低落', high: '10 很好', value: m.morning })) +
                field('睡前', m.evening ? m.evening + ' / 10' : '未记录',
                    scale('evening', { label: '睡前心情', min: 1, max: 10, low: '1 低落', high: '10 很好', value: m.evening }));
        },
        preview: function (m) {
            if (!m || (!m.morning && !m.evening)) return '';
            const parts = [];
            if (m.morning) parts.push('醒后 ' + m.morning);
            if (m.evening) parts.push('睡前 ' + m.evening);
            return parts.join(' · ');
        },
        metrics: [
            { key: 'morning', label: '醒后心情', field: 'morning', min: 0, max: 10 },
            { key: 'evening', label: '睡前心情', field: 'evening', min: 0, max: 10 },
            {
                key: 'day_change', label: '日内变化（睡前 − 醒后）', unit: '分', min: -10, max: 10, derived: true,
                value: function (m) {
                    if (typeof m.morning !== 'number' || typeof m.evening !== 'number') return null;
                    return m.evening - m.morning;
                }
            }
        ],
        metricValue: function (metric, m) { return m[metric.field]; },
        summary: function (m) { return this.preview(m); }
    },

    {
        id: 'sleep',
        name: '睡眠',
        icon: 'sleep',
        desc: '睡眠质量评分，可补记时长',
        template: function (m) {
            m = m || {};
            return field('睡眠质量', m.quality ? m.quality + ' / 10' : '未记录',
                    scale('quality', { label: '睡眠质量', min: 1, max: 10, low: '1 很差', high: '10 很好', value: m.quality })) +
                field('睡眠时长', m.hours ? m.hours + ' 小时' : '未记录',
                    '<div class="num-row"><input class="num-input" type="number" inputmode="decimal" step="0.5" min="0" max="24" ' +
                    'data-field="hours" placeholder="0" value="' + (m.hours === undefined || m.hours === null ? '' : m.hours) + '">' +
                    '<span class="num-unit">小时</span></div>',
                    '<div class="chip-row">' +
                    [6, 7, 7.5, 8, 9].map(function (v) {
                        return '<button class="chip" type="button" data-field="hours" data-value="' + v + '">' + v + ' h</button>';
                    }).join('') + '</div>');
        },
        preview: function (m) {
            if (!m || (!m.quality && !m.hours)) return '';
            const parts = [];
            if (m.quality) parts.push('质量 ' + m.quality);
            if (m.hours) parts.push(m.hours + ' 小时');
            return parts.join(' · ');
        },
        metrics: [
            { key: 'quality', label: '睡眠质量', field: 'quality', min: 0, max: 10 },
            { key: 'hours', label: '睡眠时长', field: 'hours', min: 0 }
        ],
        metricValue: function (metric, m) { return m[metric.field]; },
        summary: function (m) { return this.preview(m); }
    },

    {
        id: 'pain',
        name: '疼痛',
        icon: 'pain',
        desc: '当日疼痛程度 0–10',
        template: function (m) {
            m = m || {};
            return field('疼痛程度', (m.level === 0 || m.level) ? m.level + ' / 10' : '未记录',
                    slider('level', {
                        label: '疼痛程度', min: 0, max: 10,
                        low: '0 无痛', high: '10 剧烈', value: m.level
                    }), '', ' data-value-of="level"') +
                field('部位 / 备注', '', '<input class="text-input" type="text" data-field="note" maxlength="40" ' +
                    'placeholder="例如：左侧膝关节" value="' + escapeHtml(m.note || '') + '">');
        },
        preview: function (m) {
            if (!m || (m.level === undefined && !m.note)) return '';
            const parts = [];
            if (m.level === 0 || m.level) parts.push('疼痛 ' + m.level);
            if (m.note) parts.push(m.note);
            return parts.join(' · ');
        },
        metrics: [{ key: 'level', label: '疼痛程度', field: 'level', min: 0, max: 10 }],
        metricValue: function (metric, m) {
            return typeof m.level === 'number' ? m.level : null;
        },
        summary: function (m) { return this.preview(m); }
    },

    {
        id: 'exercise',
        name: '运动',
        icon: 'exercise',
        desc: '运动时长与是否出现不适',
        template: function (m) {
            m = m || {};
            const discomfort = m.discomfort;
            return field('运动时长', m.minutes ? m.minutes + ' 分钟' : '未记录',
                    '<div class="num-row"><input class="num-input" type="number" inputmode="numeric" step="5" min="0" max="600" ' +
                    'data-field="minutes" placeholder="0" value="' + (m.minutes === undefined || m.minutes === null ? '' : m.minutes) + '">' +
                    '<span class="num-unit">分钟</span></div>',
                    '<div class="chip-row">' +
                    [10, 20, 30, 45, 60].map(function (v) {
                        return '<button class="chip" type="button" data-field="minutes" data-value="' + v + '">' + v + ' 分</button>';
                    }).join('') + '</div>') +
                field('是否不适', '', seg('discomfort', [
                    { v: 'false', t: '无不适' },
                    { v: 'true', t: '有不适' }
                ], discomfort));
        },
        preview: function (m) {
            if (!m || (!m.minutes && m.discomfort === undefined)) return '';
            const parts = [];
            if (m.minutes) parts.push(m.minutes + ' 分钟');
            if (m.discomfort === true) parts.push('有不适');
            else if (m.discomfort === false) parts.push('无不适');
            return parts.join(' · ');
        },
        metrics: [{ key: 'minutes', label: '运动时长', field: 'minutes', min: 0, unit: '分钟' }],
        metricValue: function (metric, m) {
            return typeof m.minutes === 'number' ? m.minutes : null;
        },
        summary: function (m) { return this.preview(m); }
    },

    {
        id: 'diary',
        name: '日记',
        icon: 'diary',
        desc: '记录今天的经过、感受与变化',
        template: function (m) {
            m = m || {};
            return '<div class="field">' +
                '<textarea class="textarea" data-field="text" rows="4" maxlength="2000" ' +
                'placeholder="今天发生了什么，身体和心情有哪些变化…">' + escapeHtml(m.text || '') + '</textarea>' +
                '<div class="tool-row">' +
                '<button class="tool-btn" type="button" data-act="voice" data-field="text">' + icon('mic') + '<span>语音转写</span></button>' +
                '<button class="tool-btn" type="button" data-act="ai" data-field="text">' + icon('spark') + '<span>整理成日记</span></button>' +
                '</div>' +
                '<div class="field-foot"><span>纯文本，保存在本机</span><span data-count="text">' +
                (m.text ? String(m.text).length : 0) + ' 字</span></div>' +
                '</div>';
        },
        preview: function (m) { return textPreview(m); },
        metrics: [],
        metricValue: function () { return null; },
        summary: function (m) { return textPreview(m); }
    }
];

export const MODULE_ORDER = MODULES.map(function (m) { return m.id; });

/**
 * 界面内的「状态波动图」栏：不是记录模块，而是把各模块评分汇成波状图。
 * 位置固定在记录页最后一条（不参与排序），可在设置里开关。
 */
export const CHART_ENTRY = {
    id: 'trend',
    name: '状态波动图',
    icon: 'chart',
    desc: '各模块评分随时间的变化，可切 7 天 / 1 个月 / 3 个月'
};

/** 有评分、能出图的模块（按传入顺序） */
export function chartModules(ids) {
    return ids.map(getModule).filter(function (m) {
        return !!m && m.metrics && m.metrics.length > 0;
    });
}

export const DEFAULT_SETTINGS = {
    modules: { trend: true },
    ui: { expandAll: true, lastRange: '30d', openModule: null, trendOpen: true },
    ai: { baseUrl: '', model: '', apiKey: '' },
    export: { frontmatter: true, includeSummary: true }
};

export function getModule(id) {
    return MODULES.find(function (m) { return m.id === id; }) || null;
}

export function moduleName(id) {
    const m = getModule(id);
    return m ? m.name : id;
}

/** 给模块补充一个默认的字符串化数值显示 */
export function metricText(metric, value) {
    if (value === null || value === undefined) return '—';
    return fmtNum(value) + (metric.unit ? ' ' + metric.unit : '');
}

export { TONE };
