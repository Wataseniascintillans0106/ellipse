/* 图表：SVG 折线 + 数据点（波状图），或一根根竖条（柱状图）。
   纵轴为数值、横轴为时间。模块在 metrics 里写 style: 'bar' 就画成柱状图，
   不写就是原来的折线。两种图共用同一套网格、刻度与日期轴。 */

import { recentKeys, shortDate, cnKey, fmtNum, escapeHtml } from './util.js';
import { metricValueOf } from './core/fields.js';

const W = 340;          // viewBox 宽度（随容器等比缩放）
const PAD_L = 26;       // 左侧刻度
const PAD_R = 10;
const PAD_T = 12;
const PAD_B = 24;       // 底部日期

const LINE = '#df9068';       // 折线
const LINE_DOT = '#de7b49';   // 折线最新的那个点
const BAR = '#de7b49';        // 柱子
const BAR_MAX_W = 20;         // 柱子最宽多少
const BAR_RATIO = 0.62;       // 柱子占自己那一格的比例，剩下的就是两根之间的空隙
const BAR_MIN_H = 1.6;        // 记成 0 的那天也留一道细线，跟「没记录」区分开

export const CHART_VIEWBOX_WIDTH = W;

export const RANGES = [
    { id: '7d', label: '7 天', days: 7 },
    { id: '30d', label: '1 个月', days: 30 },
    { id: '90d', label: '3 个月', days: 90 }
];

export function rangeById(id) {
    return RANGES.find(function (r) { return r.id === id; }) || RANGES[1];
}

/* 纵轴上限：取一个比最大值大一点（或正好相等）的「整数档」，
   这样刻度读起来是 30 / 60 这种数，而不是 47.3。
   表格里的 45 是给运动时长这类「一节课」准备的档位。 */
function nice(max) {
    const steps = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300, 600];
    for (let i = 0; i < steps.length; i++) {
        if (max <= steps[i]) return steps[i];
    }
    return Math.ceil(max / 100) * 100;
}

/* 一根柱子的形状：上面两个角是圆的（半径最多 4），底下贴着基线。
   写成 path 而不是 rect，是为了只圆上边 —— rect 的 rx 会把四个角都圆掉。 */
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

/* 两种图共用的「画布」：算好坐标换算，先铺网格、基线与日期轴。
   返回的对象里带着 yOf / xOf，后面的折线或柱子直接拿来用。 */
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
    /* 上限只看两样东西：模块有没有自己声明 max，以及数据里最大的那个值。
       取大者，保证任何一根柱子都不会顶出画框。 */
    const top = Math.max(metric.max === undefined ? nice(maxVal) : metric.max, nice(maxVal), lo + 1);
    const yOf = function (v) { return PAD_T + (1 - (v - lo) / (top - lo)) * plotH; };

    /* 横轴：折线按「首尾贴边」均分（第 0 天在左端、最后一天在右端）；
       柱子按「一天一格」居中 —— 柱子有宽度，贴边会有一半露在画框外。 */
    const xOf = function (i) {
        if (isBar) return PAD_L + ((i + 0.5) / Math.max(keys.length, 1)) * plotW;
        if (keys.length <= 1) return PAD_L + plotW / 2;
        return PAD_L + (i / (keys.length - 1)) * plotW;
    };

    const parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" ' +
        'role="img" aria-label="' + escapeHtml(metric.label || '图表') + '">');

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
    parts.push('<line x1="' + PAD_L + '" y1="' + base.toFixed(1) + '" x2="' + (W - PAD_R) +
        '" y2="' + base.toFixed(1) + '" stroke="rgba(43,43,40,0.18)" stroke-width="1"/>');

    /* 日期轴：首、中、尾 */
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
        /* 折线的首尾贴在画框边上，标签往外收一收才不会被切掉；
           柱子是居中的，一直用 middle 最准 */
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

/* 折线：一条连续的路 + 只给真有记录的日子画圆点 */
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

/* 柱状图：一天一根，没记录的日子空着。
   每根柱子下面垫一块透明的「命中区」，占满自己那一格 ——
   柱子本身很窄，手指点起来费劲；透明块不挡视线，只负责接住点击与悬停。 */
function drawBars(f) {
    const slot = f.plotW / Math.max(f.keys.length, 1);
    const bw = Math.max(1.4, Math.min(slot * BAR_RATIO, BAR_MAX_W));
    const out = [];
    const points = [];

    f.present.forEach(function (p) {
        const cx = f.xOf(p.i);
        const y = f.yOf(p.v);
        const h = Math.max(BAR_MIN_H, f.base - y);
        out.push('<rect data-point="' + p.i + '" x="' + (cx - slot / 2).toFixed(2) + '" y="' + PAD_T +
            '" width="' + slot.toFixed(2) + '" height="' + f.plotH + '" fill="transparent"/>');
        out.push('<path d="' + barPath(cx - bw / 2, y, bw, h) + '" fill="' + BAR + '" pointer-events="none"/>');
        points.push({ x: cx, y: y, i: p.i, v: p.v });
    });

    return { marks: out, points: points };
}

/**
 * 绘制一张图
 * @param {object} opts
 *   keys    日期 key 数组（升序，可含缺记录的日子）
 *   values  与 keys 对应的数值数组（null 表示未记录）
 *   metric  {label, unit, min, max, style}
 *   style   'line'（默认）或 'bar'；metric.style 也能指定
 *   plotH   绘图区高度（默认 78）
 */
export function renderChart(opts) {
    const f = buildFrame(opts);
    const parts = f.parts;

    if (!f.present.length) {
        parts.push('<text x="' + ((PAD_L + W - PAD_R) / 2).toFixed(1) + '" y="' + (PAD_T + f.plotH / 2 + 3).toFixed(1) +
            '" text-anchor="middle" font-size="10" fill="#9B968C" letter-spacing="1.5">该区间还没有记录</text>');
        parts.push('</svg>');
        return { svg: parts.join(''), points: [], style: f.style };
    }

    /* 横轴按真实日期均分：没记录的日子同样占一格。
       折线在那些天按「最低」画过去（整条线不断），柱子则直接空着不画。 */
    const drawn = f.isBar ? drawBars(f) : drawLine(f);
    Array.prototype.push.apply(parts, drawn.marks);
    parts.push('</svg>');
    return { svg: parts.join(''), points: drawn.points, style: f.style };
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
                    /* 卡片比折线图那个小药丸高：柱子很高时把它往下压一点，
                       让它停在图里，而不是飘到标题上面去 */
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
            /* 鼠标在柱子上时可以一直看，移开才收起来 */
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
