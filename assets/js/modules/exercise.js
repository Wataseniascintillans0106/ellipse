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
    ],

    /* 运动时长画成柱状图（style: 'bar'）。
       这里刻意不写 max：字段上的 max: 600 只管「输入框最多能填 600」，
       若照抄进指标，纵轴会一路顶到 600，30 分钟的柱子就缩成贴着底的一条细线。
       不写 max，纵轴就跟着数据走 —— 最长的那次运动顶到最上面一条线。
       「是否不适」是二选一，不进图表。 */
    metrics: [
        { key: 'minutes', label: '运动时长', field: 'minutes', unit: '分钟', min: 0, style: 'bar' }
    ]
});
