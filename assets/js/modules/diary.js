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

});
