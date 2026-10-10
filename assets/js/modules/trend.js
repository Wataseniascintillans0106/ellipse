function currentRange(api) {
    const conf = api.settings.get('trend');
    if (conf.range) return conf.range;
    return api.settings.global().ui.lastRange || '30d';
}

ellipse.define({
    apiVersion: 1,
    id: 'trend',
    kind: 'page',
    name: '状态波动图',
    icon: 'chart',
    desc: '各模块评分随时间的变化，可切 7 天 / 1 个月 / 3 个月',
    note: '曲线来自各模块已记录的评分；这一页只读，不会改动任何记录',

    actions: {
        'trend-range': function (ctx) {
            ctx.api.settings.set('trend', { range: ctx.target.getAttribute('data-range') });
            ctx.api.refresh();
        }
    },

    mount: function (body, ctx) {
        const api = ctx.api;
        const rangeId = currentRange(api);
        const days = api.charts.rangeById(rangeId).days;

        const row = document.createElement('div');
        row.className = 'range-row';
        api.charts.ranges.forEach(function (r) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'range-btn' + (rangeId === r.id ? ' on' : '');
            b.textContent = r.label;
            b.setAttribute('data-act', 'trend-range');
            b.setAttribute('data-range', r.id);
            row.appendChild(b);
        });
        body.appendChild(row);

        const charts = api.registry.chartModules(api.registry.cardOrder());
        if (!charts.length) {
            const note = document.createElement('p');
            note.className = 'empty-note';
            note.textContent = '当前开启的模块里没有可出图的评分项。';
            body.appendChild(note);
            return;
        }
        charts.forEach(function (module) {
            body.appendChild(api.charts.block(module, {
                days: days,
                dataOf: api.records.dataOf,
                iconHtml: api.icon(module.icon)
            }));
        });
    },

    settingsSections: [{
        id: 'trend',
        title: '显示',
        html: function (ctx) {
            const rangeId = currentRange(ctx.api);
            return '<div class="set-row">' +
                '<span class="set-row-main"><span class="set-row-title">波状图默认区间</span>' +
                '<span class="set-row-desc">打开「状态波动图」栏时先看到的时间范围</span></span>' +
                '<span class="set-row-side">' +
                ctx.api.charts.ranges.map(function (r) {
                    return '<button class="range-btn' + (rangeId === r.id ? ' on' : '') +
                        '" type="button" data-default-range="' + r.id + '">' + r.label + '</button>';
                }).join('') +
                '</span></div>';
        },
        bind: function (root, ctx) {
            root.addEventListener('click', function (evt) {
                const btn = evt.target.closest('[data-default-range]');
                if (!btn) return;
                ctx.api.settings.set('trend', { range: btn.getAttribute('data-default-range') });
                ctx.api.refresh();
                ctx.rerender();
            });
        }
    }]
});
