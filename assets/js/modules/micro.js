/* 微成就：一行一条。不挂任何工具按钮，也没有数值指标。
   鼓励语放在 label（框的上面）—— textarea 在导出时走的是独立分支，不经过 markdownValue，
   所以 label 不会被写进 md；这个模块又自带了 markdown()，更不会漏。 */

ellipse.define({
    apiVersion: 1,
    id: 'micro',
    name: '微成就',
    icon: 'spark',
    desc: '记下今天做到的小事，换行可一行一条',

    fields: [
        {
            key: 'text', type: 'textarea',
            /* label 里的 \n 是一个换行（app.css 给 .field-label 开了 white-space: pre-line） */
            label: '记录一些微小的成就\n哪怕是多吃一口饭 多喝一口水',
            rows: 4, maxlength: 2000,
            placeholder: '一行一条，例如：今天多走了五分钟',
            foot: '一行一条；只保存在这台设备上',
            counter: true
        }
    ],

    /* 一行一条 → md 里一条一个「- 」列表项。空行、只有空格的行丢掉，不留空列表项。 */
    markdown: function (m) {
        const text = m && m.text ? String(m.text).trim() : '';
        if (!text) return [];
        return text.split('\n')
            .map(function (line) { return line.trim(); })
            .filter(Boolean)
            .map(function (line) { return '- ' + line; });
    }

    /* 纯文字模块：不声明 metrics，自动推导出来是空的，所以不会出现在波状图里 */
});
