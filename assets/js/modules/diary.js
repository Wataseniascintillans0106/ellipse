/* 日记：纯文本。语音转写与 AI 整理两个按钮由「AI 助手」模块提供 ——
   那个模块被关掉时，这里的按钮会自己消失。 */

ellipse.define({
    apiVersion: 1,
    id: 'diary',
    name: '日记',
    icon: 'diary',
    desc: '记录今天的经过、感受与变化',

    fields: [
        {
            key: 'text', type: 'textarea', label: '', rows: 4, maxlength: 2000,
            placeholder: '今天发生了什么，身体和心情有哪些变化…',
            tools: ['voice', 'ai'],
            foot: '纯文本，保存在本机',
            counter: true
        }
    ]

    /* 纯文字模块，自动推导出来没有任何数值指标，所以不会出现在波状图里 */
});
