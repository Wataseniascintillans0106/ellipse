/* 日记：纯文本。不挂任何工具按钮 —— AI 一侧的框架还没接进来，
   等接上了再在这里声明 tools 即可（按钮由提供它的模块实现）。 */

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
            foot: '纯文本，保存在本机',
            counter: true
        }
    ]

    /* 纯文字模块，自动推导出来没有任何数值指标，所以不会出现在波状图里 */
});
