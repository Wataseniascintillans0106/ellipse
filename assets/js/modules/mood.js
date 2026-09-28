/* 情绪：醒后与睡前各记一次。这份文件本身就是一份完整的模块，可以原样导出再装回去。 */

ellipse.define({
    apiVersion: 1,
    id: 'mood',
    name: '情绪',
    icon: 'mood',
    desc: '醒后与睡前各记一次心情状态',

    fields: [
        { key: 'morning', type: 'scale', label: '醒后', min: 1, max: 10, low: '1 低落', high: '10 很好' },
        { key: 'evening', type: 'scale', label: '睡前', min: 1, max: 10, low: '1 低落', high: '10 很好' }
    ],

    /* 出图的指标要自己声明：字段名与图表上的名字不一样，还多一条算出来的「日内变化」 */
    metrics: [
        { key: 'morning', label: '醒后心情', field: 'morning', min: 0, max: 10 },
        { key: 'evening', label: '睡前心情', field: 'evening', min: 0, max: 10 },
        {
            key: 'day_change', label: '日内变化（睡前 − 醒后）', unit: '分', min: -10, max: 10,
            value: function (m) {
                if (typeof m.morning !== 'number' || typeof m.evening !== 'number') return null;
                return m.evening - m.morning;
            }
        }
    ]
});
