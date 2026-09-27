/* 图标：沿用 demo.html 的线性描边风格（viewBox 24，stroke 1.5，圆头圆角） */

const ATTR = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

function wrap(inner) { return '<svg ' + ATTR + '>' + inner + '</svg>'; }

export const ICONS = {
    /* 状态记录：纸 + 笔（与原 demo 同款逻辑） */
    log: wrap(
        '<rect x="3" y="5.5" width="11.5" height="14.5" rx="1.6"></rect>' +
        '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" ' +
        'transform="translate(9.2 1.2) scale(0.58)" vector-effect="non-scaling-stroke"></path>'
    ),

    /* 情绪：日出 / 日落（醒后与睡前） */
    mood: wrap(
        '<path d="M3 18h18"></path>' +
        '<path d="M6.5 18a5.5 5.5 0 0 1 11 0"></path>' +
        '<path d="M12 4.6v2.2M5.6 7.1l1.5 1.5M18.4 7.1l-1.5 1.5"></path>' +
        '<path d="M2.6 21.4h18.8"></path>'
    ),

    /* 睡眠：月与星 */
    sleep: wrap(
        '<path d="M20.6 14.3A8.6 8.6 0 1 1 9.7 3.4a6.9 6.9 0 0 0 10.9 10.9z"></path>' +
        '<path d="M17.4 4.2v2.6M16.1 5.5h2.6"></path>'
    ),

    /* 疼痛：脉冲波形 */
    pain: wrap(
        '<path d="M2.4 12.4h3.4l2-5.4 3.1 9.6 2.3-6.6 1.6 2.4h6.8"></path>'
    ),

    /* 运动：行走的人 */
    exercise: wrap(
        '<circle cx="13.2" cy="4.4" r="1.9"></circle>' +
        '<path d="M12.4 8.2 9.1 10.6l1.5 3.6-1.9 5.4"></path>' +
        '<path d="M10.6 14.2 15 16l1.1 3.6"></path>' +
        '<path d="M12.4 8.2l4 1.5 2.2-1.4"></path>'
    ),

    /* 日记：横线本 + 书签 */
    diary: wrap(
        '<path d="M5 3.5h11.5a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5z"></path>' +
        '<path d="M5 3.5v17"></path>' +
        '<path d="M8.6 8h6.4M8.6 12h6.4M8.6 16h4"></path>'
    ),

    /* 导出：向下的箭头 + 托盘 */
    download: wrap(
        '<path d="M12 3.6v11"></path>' +
        '<path d="M7.6 10.4 12 14.8l4.4-4.4"></path>' +
        '<path d="M4.4 17.4v1.6a1.6 1.6 0 0 0 1.6 1.6h12a1.6 1.6 0 0 0 1.6-1.6v-1.6"></path>'
    ),

    /* 语音 */
    mic: wrap(
        '<rect x="9.2" y="2.6" width="5.6" height="11" rx="2.8"></rect>' +
        '<path d="M5.6 11.4a6.4 6.4 0 0 0 12.8 0"></path>' +
        '<path d="M12 17.8v3.6M9 21.4h6"></path>'
    ),

    /* AI 处理 */
    spark: wrap(
        '<path d="M12 3.2l1.5 4.4 4.4 1.5-4.4 1.5L12 15l-1.5-4.4L6.1 9.1l4.4-1.5z"></path>' +
        '<path d="M18.4 15.4l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"></path>'
    ),

    /* 下拉箭头 */
    chevron: wrap('<polyline points="6 9 12 15 18 9"></polyline>'),

    /* 上移 / 下移 */
    up: wrap('<polyline points="6 14 12 8 18 14"></polyline>'),
    down: wrap('<polyline points="6 10 12 16 18 10"></polyline>'),

    /* 图表 */
    chart: wrap(
        '<path d="M3.4 3.4v17.2h17.2"></path>' +
        '<path d="M7 15.2l3.4-4.6 3 2.6 4.6-6.2"></path>'
    ),

    /* 返回主页（箭头朝左） */
    back: wrap(
        '<polyline points="14.5 18.5 8 12 14.5 5.5"></polyline>' +
        '<line x1="18.5" y1="12" x2="8.5" y2="12"></line>'
    )
};

export function icon(name) { return ICONS[name] || ICONS.chart; }
