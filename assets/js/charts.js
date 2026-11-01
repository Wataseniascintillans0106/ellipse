import { recentKeys, shortDate, cnKey, fmtNum, escapeHtml } from './util.js';
import { metricValueOf } from './core/fields.js';

const W = 340;
const PAD_L = 26;
const PAD_R = 10;
const PAD_T = 12;
const PAD_B = 24;

const LINE = '#df9068';
const LINE_DOT = '#de7b49';
const BAR = '#de7b49';
const BAR_MAX_W = 20;
const BAR_RATIO = 0.62;
const BAR_MIN_H = 1.6;

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
    const steps = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300, 600];
    for (let i = 0; i < steps.length; i++) {
        if (max <= steps[i]) return steps[i];
    }
    return Math.ceil(max / 100) * 100;
}

function barPath(x, yTop, w, h) {
    const n = function (v) { return Number(v.toFixed(2)); };
    const r = Math.min(4, w / 2, h);
    const x2 = x + w;
    const y2 = yTop + h;
    return 'M' + n(x) + ' ' + n(y2) +
        'L' + n(x) + ' ' + n(yTop + r) +
        'Q' + n(x) + ' ' + n(yTop) + ' ' + n(x + r) + ' ' + n(yTop) +
        'L' + n(x2 - r) + ' ' + n(yTop) +
        'Q' + n(x2) + ' ' + n(yTop) + ' ' + n(x2) + ' ' + n(yTop + r) +
        'L' + n(x2) + ' ' + n(y2) + 'Z';
}

function buildFrame(opts) {
    const keys = opts.keys || [];
    const values = opts.values || [];
    const metric = opts.metric || {};
    const style = opts.style || metric.style || 'line';
    const isBar = style === 'bar';
    const plotH = opts.plotH || 78;
    const H = PAD_T + plotH + PAD_B;
    const plotW = W - PAD_L - PAD_R;
    const base = PAD_T + plotH;

    const present = [];
    values.forEach(function (v, i) {
        if (v !== null && v !== undefined && Number.isFinite(v)) present.push({ i: i, v: v });
    });

    const maxVal = present.length ? Math.max.apply(null, present.map(function (p) { return p.v; })) : 0;
    const lo = metric.min === undefined ? 0 : metric.min;
    const top = Math.max(metric.max === undefined ? nice(maxVal) : metric.max, nice(maxVal), lo + 1);
    const yOf = function (v) { return PAD_T + (1 - (v - lo) / (top - lo)) * plotH; };

    const xOf = function (i) {
        if (isBar) return PAD_L + ((i + 0.5) / Math.max(keys.length, 1)) * plotW;
        if (keys.length <= 1) return PAD_L + plotW / 2;
        return PAD_L + (i / (keys.length - 1)) * plotW;
    };

    const parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" ' +
        'role="img" aria-label="' + escapeHtml(metric.label || '图表') + '">');

    [0, 0.5, 1].forEach(function (t) {
        const v = lo + (top - lo) * t;
        const y = yOf(v).toFixed(1);
        parts.push('<line x1="' + PAD_L + '" y1="' + y + '" x2="' + (W - PAD_R) + '" y2="' + y + '" ' +
            'stroke="rgba(43,43,40,0.09)" stroke-width="1"/>');
        parts.push('<text x="' + (PAD_L - 7) + '" y="' + (Number(y) + 3.2).toFixed(1) + '" ' +
            'text-anchor="end" font-size="8.6" fill="#9B968C">' + fmtNum(v) + '</text>');
    });

    parts.push('<line x1="' + PAD_L + '" y1="' + base.toFixed(1) + '" x2="' + (W - PAD_R) +
        '" y2="' + base.toFixed(1) + '" stroke="rgba(43,43,40,0.18)" stroke-width="1"/>');

    const axisPicks = [];
    if (keys.length) {
        axisPicks.push(0);
        if (keys.length > 4) axisPicks.push(Math.round((keys.length - 1) / 2));
        if (keys.length > 1) axisPicks.push(keys.length - 1);
    }
    const axisUniq = axisPicks.filter(function (v, i, a) { return a.indexOf(v) === i; });
    axisUniq.forEach(function (i, n) {
        const x = xOf(i);
        let anchor = 'middle';
        if (!isBar) {
            if (n === 0) anchor = 'start';
            if (n === axisUniq.length - 1 && axisUniq.length > 1) anchor = 'end';
        }
        parts.push('<text x="' + x.toFixed(1) + '" y="' + (H - 7) + '" text-anchor="' + anchor + '" ' +
            'font-size="8.8" fill="#9B968C">' + escapeHtml(shortDate(keys[i])) + '</text>');
    });

    return {
        keys: keys, values: values, metric: metric, style: style, isBar: isBar,
        plotH: plotH, plotW: plotW, base: base, lo: lo, top: top,
        yOf: yOf, xOf: xOf, present: present, parts: parts
    };
}

function drawLine(f) {
    const out = [];
    const points = [];
    let solid = '';
    let prev = null;
    f.values.forEach(function (v, i) {
        const recorded = v !== null && v !== undefined && Number.isFinite(v);
        const x = f.xOf(i).toFixed(1);
        const y = f.yOf(recorded ? v : f.lo).toFixed(1);
        if (prev) solid += 'M' + prev.x + ' ' + prev.y + 'L' + x + ' ' + y;
        prev = { x: x, y: y };
    });

    if (solid) {
        out.push('<path d="' + solid + '" fill="none" stroke="' + LINE + '" stroke-width="1.8" ' +
            'stroke-linecap="round" stroke-linejoin="round"/>');
    }

    f.present.forEach(function (p, idx) {
        const x = f.xOf(p.i);
        const y = f.yOf(p.v);
        const last = idx === f.present.length - 1;
        points.push({ x: x, y: y, i: p.i, v: p.v });
        out.push('<circle data-point="' + p.i + '" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) +
            '" r="' + (last ? 3.1 : 2.1) + '" ' +
            'fill="' + (last ? LINE_DOT : '#FBFAED') + '" stroke="' + (last ? LINE_DOT : LINE) +
            '" stroke-width="1.4"/>');
    });

    return { marks: out, points: points };
}

function drawBars(f) {
    const slot = f.plotW / Math.max(f.keys.length, 1);
    const bw = Math.max(1.4, Math.min(slot * BAR_RATIO, BAR_MAX_W));
    const out = [];
    const points = [];
    const zero = Math.min(Math.max(0, f.lo), f.top);
    const zeroY = f.yOf(zero);

    f.present.forEach(function (p) {
        const cx = f.xOf(p.i);
        const y = f.yOf(p.v);
        const h = Math.max(BAR_MIN_H, Math.abs(y - zeroY));
        const top = p.v >= 0 ? zeroY - h : zeroY;
        out.push('<rect data-point="' + p.i + '" x="' + (cx - slot / 2).toFixed(2) + '" y="' + PAD_T +
            '" width="' + slot.toFixed(2) + '" height="' + f.plotH + '" fill="transparent"/>');
        out.push('<path d="' + barPath(cx - bw / 2, top, bw, h) + '" fill="' + BAR + '" pointer-events="none"/>');
        points.push({ x: cx, y: y, i: p.i, v: p.v });
    });

    return { marks: out, points: points };
}

export function renderChart(opts) {
    const f = buildFrame(opts);
    const parts = f.parts;

    if (!f.present.length) {
        parts.push('<text x="' + ((PAD_L + W - PAD_R) / 2).toFixed(1) + '" y="' + (PAD_T + f.plotH / 2 + 3).toFixed(1) +
            '" text-anchor="middle" font-size="10" fill="#9B968C" letter-spacing="1.5">该区间还没有记录</text>');
        parts.push('</svg>');
        return { svg: parts.join(''), points: [], style: f.style };
    }

    const drawn = f.isBar ? drawBars(f) : drawLine(f);
    Array.prototype.push.apply(parts, drawn.marks);
    parts.push('</svg>');
    return { svg: parts.join(''), points: drawn.points, style: f.style };
}

export function metricSeries(module, metric, keys, dataOf) {
    return keys.map(function (key) {
        const data = dataOf(key) || {};
        return metricValueOf(module, metric, data[module.id]);
    });
}

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
        const isBar = chart.style === 'bar';

        const host = document.createElement('div');
        host.className = 'chart-slot';
        host.innerHTML = chart.svg;

        const tip = document.createElement('span');
        tip.className = isBar ? 'chart-tip chart-tip--card' : 'chart-tip';
        host.appendChild(tip);

        const unit = metric.unit ? ' ' + metric.unit : '';
        const marks = host.querySelectorAll('[data-point]');
        chart.points.forEach(function (p, idx) {
            const mark = marks[idx];
            if (!mark) return;
            const show = function (clientX) {
                const rect = host.getBoundingClientRect();
                const scale = rect.width ? rect.width / W : 1;
                const cx = clientX === undefined || clientX === null ? p.x * scale : clientX - rect.left;
                tip.style.left = Math.max(34, Math.min(rect.width - 34, cx)) + 'px';
                if (isBar) {
                    tip.style.top = Math.max(58, p.y * scale) + 'px';
                    tip.innerHTML = '<span class="chart-tip-row">' +
                        '<span class="chart-tip-date">' + escapeHtml(cnKey(keys[p.i])) + '</span>' +
                        '<span class="chart-tip-num">' + escapeHtml(fmtNum(p.v) + unit) + '</span></span>' +
                        '<span class="chart-tip-row chart-tip-series">' +
                        '<span class="chart-tip-swatch"></span>' +
                        '<span class="chart-tip-name">' + escapeHtml(metric.label || '') + '</span>' +
                        '<span class="chart-tip-num">' + escapeHtml(fmtNum(p.v) + unit) + '</span></span>';
                } else {
                    tip.textContent = cnKey(keys[p.i]) + ' · ' + p.v + unit;
                    tip.style.top = (p.y * scale) + 'px';
                }
                tip.classList.add('on');
                clearTimeout(show.timer);
                show.timer = setTimeout(function () { tip.classList.remove('on'); }, 2400);
            };
            mark.style.cursor = 'pointer';
            mark.addEventListener('click', function (evt) { show(evt.clientX); });
            mark.addEventListener('touchstart', function (evt) {
                if (evt.touches[0]) show(evt.touches[0].clientX);
            }, { passive: true });
            if (isBar) {
                mark.addEventListener('mouseenter', function (evt) { show(evt.clientX); });
                mark.addEventListener('mouseleave', function () {
                    clearTimeout(show.timer);
                    tip.classList.remove('on');
                });
            }
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
