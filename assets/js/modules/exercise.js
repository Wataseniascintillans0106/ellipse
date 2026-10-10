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

    metrics: [
        { key: 'minutes', label: '运动时长', field: 'minutes', unit: '分钟', min: 0, style: 'bar' }
    ]
});
