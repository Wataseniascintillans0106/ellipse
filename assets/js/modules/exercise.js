/* 运动：时长（可手填或用快捷按钮）+ 有没有不适 */

ellipse.define({
    apiVersion: 1,
    id: 'exercise',
    name: '运动',
    icon: 'exercise',
    desc: '运动时长与是否出现不适',

    fields: [
        {
            key: 'minutes', type: 'number', label: '运动时长', short: '', unit: '分钟',
            step: 5, min: 0, max: 600, chips: [10, 20, 30, 45, 60], chipUnit: '分'
        },
        {
            key: 'discomfort', type: 'enum', label: '是否不适', short: '',
            options: [
                { value: false, label: '无不适' },
                { value: true, label: '有不适' }
            ]
        }
    ]

    /* 指标自动推导：运动时长（分钟）。「是否不适」是二选一，不进图表 */
});
