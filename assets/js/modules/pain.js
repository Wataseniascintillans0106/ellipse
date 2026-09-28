/* 疼痛：当日疼痛程度 0–10，可加一句部位备注 */

ellipse.define({
    apiVersion: 1,
    id: 'pain',
    name: '疼痛',
    icon: 'pain',
    desc: '当日疼痛程度 0–10',

    fields: [
        { key: 'level', type: 'slider', label: '疼痛程度', short: '疼痛', min: 0, max: 10, low: '0 无痛', high: '10 剧烈' },
        { key: 'note', type: 'text', label: '部位 / 备注', short: '', maxlength: 40, placeholder: '例如：左侧膝关节' }
    ]

    /* 指标由上面唯一的数值字段自动推导：疼痛程度，0–10 */
});
