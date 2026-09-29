/* 波状图：SVG 折线 + 数据点，纵轴为分值、横轴为时间 */

import { recentKeys, shortDate, cnKey, fmtNum, escapeHtml } from './util.js';
import { metricValueOf } from './core/fields.js';

const W = 340;          // viewBox 宽度（随容器等比缩放）
const PAD_L = 26;       // 左侧刻度
const PAD_R = 10;
const PAD_T = 12;
const PAD_B = 24;       // 底部日期

export const CHART_VIEWBOX_WIDTH = W;

export const RANGES = [
    { id: '7d', label: '7 天', days: 7 },
    { id: '30d', label: '1 个月', days: 30 },
    { id: '90d', label: '3 个月', days: 90 }
];

export function rangeById(id) {
    return RANGES.find(function (r) { return r.id === id; }) || RANGES[1];
}

function nice(max) {
    const steps = [5, 10, 15, 20, 30, 60, 120, 180, 300, 600];
    for (let i = 0; i < steps.length; i++) {
        if (max <= steps[i]) return steps[i];
    }
    return Math.ceil(max / 100) * 100;
}

/**
 * 绘制一张波状图
 * @param {object} opts
 *   keys    日期 key 数组（升序，可含缺记录的日子）
 *   values  与 keys 对应的数值数组（null 表示未记录，画在最低处、不画圆点）
 *   metric  {label, unit, min, max}
 *   plotH   绘图区高度（默认 78）
 */
export function renderChart(opts) {
    const keys = opts.keys || [];
    const values = opts.values || [];
    const metric = opts.metric || {};
    const plotH = opts.plotH || 78;
    const H = PAD_T + plotH + PAD_B;
    const plotW = W - PAD_L - PAD_R;

    const present = [];
    values.forEach(function (v, i) {
        if (v !== null && v !== undefined && Number.isFinite(v)) present.push({ i: i, v: v });
    });

    const maxVal = present.length ? Math.max.apply(null, present.map(function (p) { return p.v; })) : 0;
    const lo = metric.min === undefined ? 0 : metric.min;
    const top = Math.max(metric.max === undefined ? nice(maxVal) : metric.max, nice(maxVal), lo + 1);
    const yOf = function (v) { return PAD_T + (1 - (v - lo) / (top - lo)) * plotH; };

    const parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" ' +
        'role="img" aria-label="' + escapeHtml(metric.label || '波状图') + '">');

    /* 横向网格 + 纵轴刻度 */
    [0, 0.5, 1].forEach(function (t) {
        const v = lo + (top - lo) * t;
        const y = yOf(v).toFixed(1);
        parts.push('<line x1="' + PAD_L + '" y1="' + y + '" x2="' + (W - PAD_R) + '" y2="' + y + '" ' +
            'stroke="rgba(43,43,40,0.09)" stroke-width="1"/>');
        parts.push('<text x="' + (PAD_L - 7) + '" y="' + (Number(y) + 3.2).toFixed(1) + '" ' +
            'text-anchor="end" font-size="8.6" fill="#9B968C">' + fmtNum(v) + '</text>');
    });

    /* 基线 */
    parts.push('<line x1="' + PAD_L + '" y1="' + (PAD_T + plotH).toFixed(1) + '" x2="' + (W - PAD_R) +
        '" y2="' + (PAD_T + plotH).toFixed(1) + '" stroke="rgba(43,43,40,0.18)" stroke-width="1"/>');

    /* 日期轴：首、中、尾 */
    const axisPicks = [];
    if (keys.length) {
        axisPicks.push(0);
        if (keys.length > 4) axisPicks.push(Math.round((keys.length - 1) / 2));
        if (keys.length > 1) axisPicks.push(keys.length - 1);
    }
    const axisUniq = axisPicks.filter(function (v, i, a) { return a.indexOf(v) === i; });
    axisUniq.forEach(function (i, n) {
        const x = PAD_L + ((keys.length > 1 ? i / (keys.length - 1) : 0.5) * plotW);
        let anchor = 'middle';
        if (n === 0) anchor = 'start';
        if (n === axisUniq.length - 1 && axisUniq.length > 1) anchor = 'end';
        parts.push('<text x="' + x.toFixed(1) + '" y="' + (H - 7) + '" text-anchor="' + anchor + '" ' +
            'font-size="8.8" fill="#9B968C">' + escapeHtml(shortDate(keys[i])) + '</text>');
    });

    if (!present.length) {
        parts.push('<text x="' + ((PAD_L + W - PAD_R) / 2).toFixed(1) + '" y="' + (PAD_T + plotH / 2 + 3).toFixed(1) +
            '" text-anchor="middle" font-size="10" fill="#9B968C" letter-spacing="1.5">该区间还没有记录</text>');
        parts.push('</svg>');
        return { svg: parts.join(''), points: [] };
    }

    /* 横轴按真实日期均分：没记录的日子同样占一格。
       它们按「最低」参与画线，于是折线在那些天一路贴到底部再抬起来 ——
       整条线是连续的，也能一眼看出哪一段是空着的。 */
    const xOf = function (index) {
        if (keys.length <= 1) return PAD_L + plotW / 2;
        return PAD_L + (index / (keys.length - 1)) * plotW;
    };

    let solid = '';
    let prev = null;
    values.forEach(function (v, i) {
        const recorded = v !== null && v !== undefined && Number.isFinite(v);
        const x = xOf(i).toFixed(1);
        const y = yOf(recorded ? v : lo).toFixed(1);
        if (prev) solid += 'M' + prev.x + ' ' + prev.y + 'L' + x + ' ' + y;
        prev = { x: x, y: y };
    });

    if (solid) {
        parts.push('<path d="' + solid + '" fill="none" stroke="#df9068" stroke-width="1.8" ' +
            'stroke-linecap="round" stroke-linejoin="round"/>');
    }

    /* 数据点：只画真有记录的那几天（没记录的点不出数值，就不画） */
    const points = [];
    present.forEach(function (p, idx) {
        const x = xOf(p.i);
        const y = yOf(p.v);
        const last = idx === present.length - 1;
        points.push({ x: x, y: y, i: p.i, v: p.v });
        parts.push('<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (last ? 3.1 : 2.1) + '" ' +
            'fill="' + (last ? '#de7b49' : '#FBFAED') + '" stroke="' + (last ? '#de7b49' : '#df9068') +
            '" stroke-width="1.4"/>');
    });

    parts.push('</svg>');
    return { svg: parts.join(''), points: points };
}

/** 从记录数据里取某模块某指标的序列（取值规则统一在 core/fields.js） */
export function metricSeries(module, metric, keys, dataOf) {
    return keys.map(function (key) {
        const data = dataOf(key) || {};
        return metricValueOf(module, metric, data[module.id]);
    });
}

/**
 * 生成一个图表区块（含标题、最新值、区间切换、点选查看）
 * opts: { days, dataOf, iconHtml }
 */
export function chartBlock(module, opts) {
    const o = opts || {};
    const days = o.days || 30;
    const keys = recentKeys(days);
    const metrics = module.metrics || [];

    const wrap = document.createElement('section');
    wrap.className = 'chart-block';
    wrap.dataset.module = module.id;

    const head = document.createElement('div');
    head.className = 'chart-head';
    head.innerHTML = '<span class="chart-mark">' + (o.iconHtml || '') + '</span>' +
        '<h3 class="chart-name">' + escapeHtml(module.name) + '</h3>';
    const latest = document.createElement('span');
    latest.className = 'chart-latest';
    head.appendChild(latest);
    wrap.appendChild(head);

    if (!metrics.length) {
        const note = document.createElement('p');
        note.className = 'chart-note';
        note.textContent = o.emptyNote || '该模块为纯文字模块，不生成波状图。';
        wrap.appendChild(note);
        return wrap;
    }

    const latestParts = [];
    let latestUnit = '';

    metrics.forEach(function (metric, mi) {
        const block = document.createElement('div');
        block.style.marginTop = mi === 0 ? '0' : '20px';

        if (metrics.length > 1) {
            const label = document.createElement('p');
            label.className = 'chart-note';
            label.textContent = metric.label + (metric.unit ? '（' + metric.unit + '）' : '');
            block.appendChild(label);
        }

        const values = metricSeries(module, metric, keys, o.dataOf);
        const chart = renderChart({ keys: keys, values: values, metric: metric });

        const host = document.createElement('div');
        host.className = 'chart-slot';
        host.innerHTML = chart.svg;

        const tip = document.createElement('span');
        tip.className = 'chart-tip';
        host.appendChild(tip);

        const dots = host.querySelectorAll('circle');
        chart.points.forEach(function (p, idx) {
            const dot = dots[idx];
            if (!dot) return;
            const show = function (clientX) {
                const rect = host.getBoundingClientRect();
                const scale = rect.width ? rect.width / W : 1;
                const cx = clientX === undefined || clientX === null ? p.x * scale : clientX - rect.left;
                tip.textContent = cnKey(keys[p.i]) + ' · ' + p.v + (metric.unit ? ' ' + metric.unit : '');
                tip.style.left = Math.max(34, Math.min(rect.width - 34, cx)) + 'px';
                tip.style.top = (p.y * scale) + 'px';
                tip.classList.add('on');
                clearTimeout(show.timer);
                show.timer = setTimeout(function () { tip.classList.remove('on'); }, 2400);
            };
            dot.style.cursor = 'pointer';
            dot.addEventListener('click', function (evt) { show(evt.clientX); });
            dot.addEventListener('touchstart', function (evt) {
                if (evt.touches[0]) show(evt.touches[0].clientX);
            }, { passive: true });
        });

        const nonNull = values.filter(function (v) { return v !== null; });
        if (nonNull.length) {
            latestParts.push(nonNull[nonNull.length - 1]);
            if (metric.unit) latestUnit = metric.unit;
        }

        block.appendChild(host);
        wrap.appendChild(block);
    });

    if (latestParts.length) {
        latest.textContent = '最新 ' + latestParts.join(' / ') + (latestUnit ? ' ' + latestUnit : '');
    }

    return wrap;
}
