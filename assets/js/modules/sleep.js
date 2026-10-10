ellipse.define({
    apiVersion: 1,
    id: 'sleep',
    name: '睡眠',
    icon: 'sleep',
    desc: '睡眠质量评分，可补记时长',

    fields: [
        { key: 'quality', type: 'scale', label: '睡眠质量', short: '质量', min: 1, max: 10, low: '1 很差', high: '10 很好' },
        {
            key: 'hours', type: 'number', label: '睡眠时长', short: '', unit: '小时',
            step: 0.5, min: 0, max: 24, chips: [6, 7, 7.5, 8, 9], chipUnit: 'h'
        }
    ],

    metrics: [
        { key: 'quality', label: '睡眠质量', field: 'quality', min: 0, max: 10 },
        { key: 'hours', label: '睡眠时长', field: 'hours', min: 0 }
    ]
});
