ellipse.define({
    apiVersion: 1,
    id: 'micro',
    name: '微成就',
    icon: 'spark',
    desc: '记下今天做到的小事，换行可一行一条',

    fields: [
        {
            key: 'text', type: 'textarea',
            label: '记录一些微小的成就\n哪怕是多吃一口饭 多喝一口水',
            rows: 4, maxlength: 2000,
            placeholder: '一行一条，例如：今天多走了五分钟',
            foot: '一行一条；只保存在这台设备上',
            counter: true
        }
    ],

    markdown: function (m) {
        const text = m && m.text ? String(m.text).trim() : '';
        if (!text) return [];
        return text.split('\n')
            .map(function (line) { return line.trim(); })
            .filter(Boolean)
            .map(function (line) { return '- ' + line; });
    }

});
