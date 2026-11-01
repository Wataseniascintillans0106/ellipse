const store = new Map();
globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); }
};
globalThis.document = {
    createElement: () => ({
        className: '', dataset: {}, style: {}, innerHTML: '',
        appendChild() {}, querySelectorAll: () => [], addEventListener() {}, querySelector: () => null
    }),
    getElementById: () => null,
    querySelector: () => null,
    addEventListener() {}
};
globalThis.window = globalThis;

const { setField, getRecordData, getSettings, getModuleSettings } = await import('../assets/js/storage.js');
const { renderChart, metricSeries, RANGES, rangeById } = await import('../assets/js/charts.js');
const { dayMarkdown, rangeMarkdown, allMarkdown, suggestFilename } = await import('../assets/js/export.js');
const { toKey, todayKey, shiftKey } = await import('../assets/js/util.js');
const { renderFields } = await import('../assets/js/core/fields.js');
const { validateDefinition } = await import('../assets/js/core/validate.js');

const { readFileSync, existsSync, statSync, readdirSync } = await import('node:fs');
const path = await import('node:path');
const root = path.resolve(import.meta.dirname, '..');
const at = (rel) => path.join(root, rel);

const { installGlobal } = await import('../assets/js/core/api.js');
const registry = await import('../assets/js/core/registry.js');
const loader = await import('../assets/js/core/loader.js');

installGlobal();
await loader.loadBuiltins();

const getModule = registry.get;
const enabledOrder = registry.enabledOrder;
const MODULES = registry.all().filter((m) => m.kind === 'record');

let fails = 0;
function ok(label, cond, extra) {
    if (cond) { console.log('  ok   ' + label); }
    else { fails++; console.log('  FAIL ' + label + (extra ? ' -> ' + extra : '')); }
}

const today = todayKey();
const yesterday = shiftKey(today, -1);

console.log('\n[1] 记录读写');
setField(today, 'mood', 'morning', 7);
setField(today, 'mood', 'evening', 4);
setField(today, 'sleep', 'quality', 6);
setField(today, 'sleep', 'hours', 7.5);
setField(today, 'pain', 'level', 0);
setField(today, 'pain', 'note', '左侧膝关节');
setField(today, 'exercise', 'minutes', 30);
setField(today, 'exercise', 'discomfort', false);
setField(today, 'diary', 'text', '今天去公园走了两圈，膝盖没有明显不适。');
setField(today, 'micro', 'text', '今天多走了五分钟\n\n   \n今天把药按时吃完了');
setField(yesterday, 'mood', 'morning', 5);
setField(yesterday, 'pain', 'level', 3);

const d = getRecordData(today);
ok('情绪/醒后 = 7', d.mood.morning === 7);
ok('疼痛 0 分没有被当成空值丢弃', d.pain.level === 0, JSON.stringify(d.pain));
ok('运动不适 = false 被保留', d.exercise.discomfort === false);
ok('睡眠时长 = 7.5', d.sleep.hours === 7.5);

setField(today, 'mood', 'morning', null);
ok('清空字段后键被删除', getRecordData(today).mood.morning === undefined);
setField(today, 'mood', 'morning', 7);

console.log('\n[2] 模块定义');
ok('默认六个记录模块', MODULES.length === 6, MODULES.map((m) => m.id).join(','));
ok('默认顺序 情绪/睡眠/疼痛/运动/微成就/日记',
    enabledOrder().join(',') === 'mood,sleep,pain,exercise,micro,diary', enabledOrder().join(','));
ok('每个模块都有图标与说明', MODULES.every((m) => m.icon && m.desc));
ok('四个模块有波状图指标', MODULES.filter((m) => m.metrics.length > 0).length === 4);
ok('日记没有数值指标', getModule('diary').metrics.length === 0);
ok('微成就是记录型模块，排在日记上面', getModule('micro').kind === 'record'
    && enabledOrder().indexOf('micro') === enabledOrder().indexOf('diary') - 1);
ok('微成就没有数值指标（纯文字，不进波状图）', getModule('micro').metrics.length === 0,
    JSON.stringify(getModule('micro').metrics));

const ranges = RANGES.map((r) => r.id).join(',');
ok('区间为 7d/30d/90d', ranges === '7d,30d,90d', ranges);
ok('rangeById 回退到 1 个月', rangeById('nope').id === '30d');

console.log('\n[3] 波状图');
const mood = getModule('mood');
const keys = [yesterday, today];
const series = metricSeries(mood, mood.metrics[0], keys, getRecordData);
ok('醒后心情序列 = [5,7]', JSON.stringify(series) === '[5,7]', JSON.stringify(series));

const painSeries = metricSeries(getModule('pain'), getModule('pain').metrics[0], keys, getRecordData);
ok('疼痛序列保留 0 分 = [3,0]', JSON.stringify(painSeries) === '[3,0]', JSON.stringify(painSeries));

const chart = renderChart({ keys, values: series, metric: mood.metrics[0] });
ok('生成 svg', chart.svg.startsWith('<svg') && chart.svg.endsWith('</svg>'));
ok('两个数据点', chart.points.length === 2, String(chart.points.length));
ok('曲线路径存在', chart.svg.indexOf('<path d="M') > 0);
ok('纵轴刻度按 0–10 上限', chart.svg.indexOf('>10<') > 0);
ok('横轴有日期标签', chart.svg.indexOf('text-anchor') > 0);

const empty = renderChart({ keys: keys, values: [null, null], metric: mood.metrics[0] });
ok('无记录时给出空态文案', empty.svg.indexOf('该区间还没有记录') > 0);
ok('无记录时没有数据点', empty.points.length === 0);

const one = renderChart({ keys: keys, values: [null, 8], metric: mood.metrics[0] });
ok('单点也能画', one.points.length === 1);

const gapKeys = [shiftKey(today, -2), shiftKey(today, -1), today];
const gap = renderChart({ keys: gapKeys, values: [7, null, 3], metric: mood.metrics[0] });
const gapD = (gap.svg.match(/<path d="([^"]*)"/) || [])[1] || '';
const gapYs = [];
gapD.replace(/[ML]([\d.]+) ([\d.]+)/g, function (all, x, y) { gapYs.push(Number(y)); return all; });
ok('没记录的日子也在时间轴上占一格（折线连起来）', gapYs.length === 4, gapD);
ok('没记录的日子画在最低处', gapYs.length === 4 && gapYs[1] === Math.max.apply(null, gapYs),
    JSON.stringify(gapYs));
ok('没记录的日子不画圆点', gap.points.length === 2, String(gap.points.length));
const zero = renderChart({ keys: gapKeys, values: [0, null, 0], metric: getModule('pain').metrics[0] });
ok('记成 0 分的那天照画圆点', zero.points.length === 2, String(zero.points.length));

const full = renderChart({ keys: gapKeys, values: [7, 5, 3], metric: mood.metrics[0] });
ok('某天在横轴上的位置，不受邻居有没有记录影响',
    full.points[0].x === gap.points[0].x && full.points[2].x === gap.points[1].x,
    JSON.stringify([full.points.map((p) => p.x), gap.points.map((p) => p.x)]));

console.log('\n[3b] 柱状图');
const exercise = getModule('exercise');
ok('运动时长声明成柱状图', exercise.metrics.length === 1 && exercise.metrics[0].style === 'bar',
    JSON.stringify(exercise.metrics));

const exKeys = [shiftKey(today, -2), shiftKey(today, -1), today];
const exMetric = exercise.metrics[0];
const exChart = renderChart({ keys: exKeys, values: [30, 45, null], metric: exMetric });
ok('柱状图也生成 svg', exChart.svg.startsWith('<svg') && exChart.svg.endsWith('</svg>'));
ok('返回值里带着图的样子', exChart.style === 'bar', String(exChart.style));
ok('纵轴顶到「最长的那次 45 分钟」，不再是输入框上限 600',
    exChart.svg.indexOf('>45<') > 0 && exChart.svg.indexOf('>600<') < 0);
ok('最长的那根柱子顶到最上面一条线', exChart.points[1].y === 12, String(exChart.points[1].y));
ok('矮的那根比它低', exChart.points[0].y > exChart.points[1].y);
ok('柱子是填充色的路径', exChart.svg.indexOf('fill="#de7b49"') > 0);
ok('每根柱子都垫了一块透明的命中区（手指好点）',
    (exChart.svg.match(/data-point="/g) || []).length === 2);
ok('没记录的日子不出柱子', exChart.points.length === 2, String(exChart.points.length));

const exZero = renderChart({ keys: exKeys, values: [0, 30, null], metric: exMetric });
ok('记成 0 分钟的那天照样出一根（跟「没记录」区分开）', exZero.points.length === 2,
    String(exZero.points.length));

const exEmpty = renderChart({ keys: exKeys, values: [null, null, null], metric: exMetric });
ok('柱状图没记录时也是空态文案',
    exEmpty.svg.indexOf('该区间还没有记录') > 0 && exEmpty.points.length === 0);

const lineStill = renderChart({ keys: exKeys, values: [30, 45, null], metric: { label: '对照', min: 0 } });
ok('不声明 style 就还是折线图', lineStill.style === 'line' && lineStill.svg.indexOf('<circle') > 0);

console.log('\n[4] md 导出');
const md = dayMarkdown(today);
ok('含 frontmatter', md.startsWith('---\ndate: ' + today));
ok('frontmatter 列出模块', md.indexOf('modules: [mood, sleep, pain, exercise, micro, diary]') > 0,
    md.split('\n').find((l) => l.startsWith('modules')));
ok('标题为中文日期 + 星期', /^# \d{4}年\d{2}月\d{2}日 周./m.test(md));
ok('情绪段落', md.indexOf('## 情绪') > 0 && md.indexOf('- 醒后：7 / 10') > 0);
ok('睡眠段落', md.indexOf('- 睡眠质量：6 / 10') > 0 && md.indexOf('- 睡眠时长：7.5 小时') > 0);
ok('疼痛 0 分照实写出', md.indexOf('- 疼痛程度：0 / 10') > 0);
ok('运动写出无不适', md.indexOf('- 是否不适：无不适') > 0);
ok('日记正文', md.indexOf('今天去公园走了两圈') > 0);
ok('没有 emoji', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(md));

const emptyMd = dayMarkdown(shiftKey(today, -30));
ok('空白日期给出提示', emptyMd.indexOf('还没有记录内容') > 0);

const noFm = dayMarkdown(today, { frontmatter: false });
ok('可关闭 frontmatter', !noFm.startsWith('---'));

const range = rangeMarkdown(yesterday, today);
ok('区间汇总含统计', range.indexOf('最低 5') > 0 && range.indexOf('平均 6') > 0, range.split('\n').filter((l) => l.indexOf('最低') > 0).join('|'));
ok('区间汇总含表格', range.indexOf('| 日期 |') > 0 && range.indexOf('| ' + today + ' |') > 0);

const all = allMarkdown();
ok('全部记录包含两天', all.indexOf(yesterday) > 0 && all.indexOf(today) > 0);
ok('文件名按日期', suggestFilename('day', today) === today + '.md');

console.log('\n[4b] 微成就');
const microMd = dayMarkdown(today);
const microLines = microMd.split('\n');
const microStart = microLines.indexOf('## 微成就');
ok('导出里有「微成就」一节', microStart > 0);
const microBody = microLines.slice(microStart + 1, microLines.indexOf('## 日记', microStart) > 0
    ? microLines.indexOf('## 日记', microStart) : undefined);
ok('两行各自成一条 md 列表项',
    microBody.filter((l) => l.trim() === '- 今天多走了五分钟').length === 1
    && microBody.filter((l) => l.trim() === '- 今天把药按时吃完了').length === 1,
    JSON.stringify(microBody));
ok('中间的空行 / 只有空格的行不留空列表项',
    microBody.filter((l) => l.trim() === '-').length === 0
    && microBody.filter((l) => l.trim().startsWith('- ')).length === 2,
    JSON.stringify(microBody));
ok('鼓励语没有被写进 md', microMd.indexOf('记录一些微小的成就') < 0);
ok('微成就正文不是裸文本（日记那种）', microBody.every((l) => !l.trim() || l.trim().startsWith('- ')),
    JSON.stringify(microBody));

ok('导出顺序里微成就排在日记前面', microStart < microLines.indexOf('## 日记'));

const everything = allMarkdown();
const blankDay = shiftKey(today, -30);
ok('那天没写微成就，当天 md 里就没有这一节',
    dayMarkdown(blankDay).indexOf('## 微成就') < 0);
ok('但写过的那天在全部 md 里有', everything.indexOf('## 微成就') > 0);

const microDef = getModule('micro');
const microHtml = renderFields(microDef.fields, { text: '今天多走了五分钟' }, {});
const labelAt = microHtml.indexOf('记录一些微小的成就');
const boxAt = microHtml.indexOf('<textarea');
ok('框上面有那句鼓励语', labelAt > 0 && labelAt < boxAt,
    '鼓励语在 ' + labelAt + '，文本框在 ' + boxAt);
ok('鼓励语是字段标题（.field-label）',
    microHtml.indexOf('<div class="field-label"><span>记录一些微小的成就') > 0);
ok('鼓励语分两行（label 里有换行）',
    microHtml.indexOf('<span>记录一些微小的成就\n哪怕是多吃一口饭 多喝一口水</span>') > 0,
    JSON.stringify(microDef.fields[0].label));
const cssSrc = readFileSync(at('assets/app.css'), 'utf8');
const fontRef = (cssSrc.match(/url\("([^"]+\.woff2)"\)/) || [])[1] || '';
const fontFile = fontRef ? path.resolve(at('assets'), fontRef) : '';
ok('字体路径从 css 所在目录算，正好落在 fonts/ 里（GitHub Pages 子目录也能找到）',
    !!fontRef && fontRef.charAt(0) !== '/' && fontRef.indexOf('../../') < 0 &&
    existsSync(fontFile), fontRef || '（没找到 woff2）');
const labelRule = cssSrc.slice(cssSrc.indexOf('.field-label {'),
    cssSrc.indexOf('}', cssSrc.indexOf('.field-label {')));
ok('.field-label 开了换行（写在 label 里的换行符才真的断行）',
    labelRule.indexOf('white-space: pre-line') >= 0, labelRule.replace(/\s+/g, ' '));
ok('是个多行文本框', microHtml.indexOf('<textarea class="textarea"') > 0);
ok('框里有今天写的内容', microHtml.indexOf('今天多走了五分钟</textarea>') > 0);
ok('框下面有一行一条的说明', microHtml.indexOf('一行一条；只保存在这台设备上') > boxAt);

ok('空内容返回空数组', microDef.markdown({}).length === 0
    && microDef.markdown({ text: '   \n\n  ' }).length === 0);
ok('单行也带列表符号', JSON.stringify(microDef.markdown({ text: ' 今天多走了五分钟 ' }))
    === JSON.stringify(['- 今天多走了五分钟']), JSON.stringify(microDef.markdown({ text: ' 今天多走了五分钟 ' })));

console.log('\n[5] 设置');
const s = getSettings();
ok('默认全部开启', Object.keys(s.modules).every((k) => s.modules[k] === true));
ok('状态波动图默认开启', s.modules.trend === true);
ok('状态波动图不算记录模块（不进 md 导出、不占卡片位）',
    enabledOrder().indexOf('trend') < 0 && registry.cardOrder().indexOf('trend') < 0);
ok('AI 默认未配置', !getModuleSettings('assistant').apiKey && !getModuleSettings('assistant').baseUrl);
ok('AI 密钥被声明成敏感字段（备份默认不带出去）',
    registry.secretFields('assistant').indexOf('apiKey') >= 0);

console.log('\n[6] 面板型 / 页面型 / 服务型模块');
const trend = getModule('trend');
ok('波状图是个页面型模块', !!trend && trend.kind === 'page' && !!trend.name);
ok('页面型模块要 mount（校验器拦得住没 mount 的）',
    validateDefinition({ apiVersion: 1, id: 'x', name: 'X', kind: 'page' }).ok === false);
ok('页面型模块不占记录页的卡片位', registry.cardOrder().indexOf('trend') < 0,
    registry.cardOrder().join(','));
ok('它是主页竖栏里的一个入口', registry.pageModules().join(',') === 'trend,calendar,assistant',
    registry.pageModules().join(','));
ok('弦音也是个页面型模块', getModule('assistant').kind === 'page');
ok('服务型模块不占记录页的位置', registry.cardOrder().indexOf('assistant') < 0);
ok('出图模块为 4 个（日记除外）', registry.chartModules(enabledOrder()).length === 4,
    registry.chartModules(enabledOrder()).map((m) => m.id).join(','));
ok('关闭情绪后少一个', registry.chartModules(enabledOrder().filter((id) => id !== 'mood')).length === 3);
ok('关掉 AI 模块，它的工具按钮就查不到了',
    registry.tool('ai') !== null && registry.tool('nope') === null);
ok('语音转写的工具已经删掉了', registry.tool('voice') === null);
ok('日记不再挂任何工具按钮', !getModule('diary').fields.some((f) => f.tools));

console.log('\n[6b] 日历及健康');
const cal = getModule('calendar');
const { setSettings } = await import('../assets/js/storage.js');

ok('日历是个页面型模块', !!cal && cal.kind === 'page' && cal.name === '日历及健康');
ok('日历排在波状图后面、弦音前面',
    registry.pageModules().join(',') === 'trend,calendar,assistant',
    registry.pageModules().join(','));
ok('日历不占记录页的卡片位', registry.cardOrder().indexOf('calendar') < 0);
ok('四个日程类型都注册上了', registry.eventModules().join(',') === 'med,visit,revisit,checkup',
    registry.eventModules().join(','));
ok('日程类型不是卡片，也不进 md 导出',
    registry.eventModules().every((id) => registry.isCard(id) === false) &&
    registry.eventModules().every((id) => enabledOrder().indexOf(id) < 0));
ok('日程类型和日历归在同一栏里',
    registry.eventModules().every((id) => getModule(id).group === 'calendar'));
ok('关掉一个日程类型，它就不在日历里了',
    (setSettings({ modules: { med: false } }), registry.eventModules().join(',') === 'visit,revisit,checkup',
        registry.eventModules().join(',')) &&
    (setSettings({ modules: { med: true } }), registry.eventModules().join(',') === 'med,visit,revisit,checkup',
        registry.eventModules().join(',')));

const on = (o, from, to) => cal.expandDates(o, from, to);
const once = { date: '2026-03-05', time: '09:00', repeat: { kind: 'once' } };
ok('「只这一次」只在当天出现', JSON.stringify(on(once, '2026-03-01', '2026-03-31'))
    === JSON.stringify(['2026-03-05']), JSON.stringify(on(once, '2026-03-01', '2026-03-31')));
ok('开始日期之前不出现', on(once, '2026-01-01', '2026-03-04').length === 0);

const daily = { date: '2026-03-05', time: '08:00', repeat: { kind: 'daily' } };
const daily31 = on(daily, '2026-03-01', '2026-03-31');
ok('「每天」从开始那天起天天有', daily31.length === 27 && daily31[0] === '2026-03-05'
    && daily31[daily31.length - 1] === '2026-03-31', String(daily31.length));

const every3 = { date: '2026-03-05', repeat: { kind: 'interval', every: 3, unit: 'day' } };
ok('「隔 3 天」数得对', JSON.stringify(on(every3, '2026-03-05', '2026-03-20'))
    === JSON.stringify(['2026-03-05', '2026-03-08', '2026-03-11', '2026-03-14', '2026-03-17', '2026-03-20']),
    JSON.stringify(on(every3, '2026-03-05', '2026-03-20')));

const every2w = { date: '2026-03-05', repeat: { kind: 'interval', every: 2, unit: 'week' } };
ok('「隔 2 周」按 14 天数', JSON.stringify(on(every2w, '2026-03-01', '2026-03-31'))
    === JSON.stringify(['2026-03-05', '2026-03-19']), JSON.stringify(on(every2w, '2026-03-01', '2026-03-31')));

const monthly = { date: '2026-01-31', repeat: { kind: 'interval', every: 1, unit: 'month' } };
ok('每月 31 号遇到短月份就落到月尾',
    JSON.stringify(on(monthly, '2026-01-01', '2026-04-30'))
    === JSON.stringify(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']),
    JSON.stringify(on(monthly, '2026-01-01', '2026-04-30')));

const q = { date: '2026-03-05', repeat: { kind: 'interval', every: 3, unit: 'month' } };
ok('「隔 3 个月」按季度算', JSON.stringify(on(q, '2026-01-01', '2026-12-31'))
    === JSON.stringify(['2026-03-05', '2026-06-05', '2026-09-05', '2026-12-05']),
    JSON.stringify(on(q, '2026-01-01', '2026-12-31')));

const hourly = { date: '2026-05-01', time: '08:00', repeat: { kind: 'hourly', every: 8 } };
ok('「每 8 小时」当天从第一次开始数',
    JSON.stringify(cal.timesOn(hourly, '2026-05-01')) === JSON.stringify(['08:00', '16:00']),
    JSON.stringify(cal.timesOn(hourly, '2026-05-01')));
ok('「每 8 小时」跨过午夜接着数',
    JSON.stringify(cal.timesOn(hourly, '2026-05-02')) === JSON.stringify(['00:00', '08:00', '16:00']),
    JSON.stringify(cal.timesOn(hourly, '2026-05-02')));
ok('「每几小时」天天都在', on(hourly, '2026-05-01', '2026-05-03').length === 3);

const noTime = { date: '2026-03-05', repeat: { kind: 'once' } };
ok('不填时间的日程也算一天一条', cal.timesOn(noTime, '2026-03-05').length === 0
    && on(noTime, '2026-03-05', '2026-03-05').length === 1);

console.log('\n[7] PWA 资源');

let manifest = null;
try {
    manifest = JSON.parse(readFileSync(at('manifest.webmanifest'), 'utf8'));
} catch (err) {
    manifest = null;
}
ok('manifest 能解析', !!manifest);
if (manifest) {
    ok('manifest 有 name 与 short_name', !!manifest.name && !!manifest.short_name);
    ok('manifest 以 standalone 全屏运行', manifest.display === 'standalone');
    ok('manifest 从 ./ 启动', manifest.start_url === './' && manifest.scope === './');
    ok('manifest 声明了图标', Array.isArray(manifest.icons) && manifest.icons.length >= 2);

    const missing = (manifest.icons || [])
        .map((i) => String(i.src || '').replace(/^\.\//, ''))
        .filter((rel) => !existsSync(at(rel)));
    ok('manifest 里的图标都真的存在', missing.length === 0, missing.join(','));

    const sizes = (manifest.icons || []).map((i) => i.sizes);
    ok('图标含 192 与 512 两档', sizes.includes('192x192') && sizes.includes('512x512'), sizes.join(','));
}

ok('sw.js 存在且非空', existsSync(at('sw.js')) && statSync(at('sw.js')).size > 0);

const swSrc = readFileSync(at('sw.js'), 'utf8');
const shellBlock = (swSrc.match(/const SHELL = \[([\s\S]*?)\];/) || [])[1] || '';
const shell = (shellBlock.match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
ok('sw.js 有预缓存清单', shell.length > 0, String(shell.length));

const assetFiles = readdirSync(at('assets'), { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => path.relative(at('assets'), path.join(d.parentPath, d.name)).replace(/\\/g, '/'));
const notCached = assetFiles.filter((rel) => shell.indexOf('./assets/' + rel) < 0);
ok('预缓存覆盖 assets/ 下每个文件', notCached.length === 0, notCached.join(','));

const shellMissing = shell.filter((rel) => !existsSync(at(rel.replace(/^\.\//, ''))));
ok('预缓存清单里的文件都真实存在', shellMissing.length === 0, shellMissing.join(','));

console.log('\n[8] mod 系统');
const { previewSource, installSource, uninstallMod, exportSource } = loader;

const WEIGHT = [
    'ellipse.define({',
    "    apiVersion: 1, id: 'weight', name: '体重', icon: 'chart', desc: '每天同一时间称一次',",
    '    fields: [',
    "        { key: 'kg', type: 'number', label: '体重', unit: 'kg', step: 0.1, chips: [55, 60, 65] }",
    '    ]',
    '});'
].join('\n');

const pv = await previewSource(WEIGHT, 'weight.js');
ok('导入前先试读出自称的 id / 名字', pv.ok && pv.def.id === 'weight' && pv.def.name === '体重', pv.error);

const tooNew = await previewSource("ellipse.define({ apiVersion: 99, id: 'x', name: 'x' });", 'x.js');
ok('要求更高接口版本的模块被拒绝', !tooNew.ok && /更新的 ellipse/.test(tooNew.error), tooNew.error);

const noDefine = await previewSource('var nothing = 1;', 'x.js');
ok('没调用 define 的文件被拒绝', !noDefine.ok, noDefine.error);

const badId = await previewSource("ellipse.define({ apiVersion: 1, id: 'Weight!', name: 'x' });", 'x.js');
ok('id 不合规的模块被拒绝', !badId.ok, badId.error);

const inst = await installSource(WEIGHT, 'weight.js', pv.def);
ok('装上后出现在注册表里', inst.ok && registry.has('weight'), inst.error);
ok('字段声明被读进来', getModule('weight').fields.length === 1);
ok('新模块排在记录页最后', registry.cardOrder()[registry.cardOrder().length - 1] === 'weight');

setField(today, 'weight', 'kg', 63.5);
const wMd = dayMarkdown(today);
ok('新模块自动出现在 md 导出里',
    wMd.indexOf('## 体重') > 0 && wMd.indexOf('- 体重：63.5 kg') > 0,
    wMd.split('\n').filter((l) => l.indexOf('体重') >= 0).join('|'));
ok('新模块自动进区间汇总', rangeMarkdown(today, today).indexOf('### 体重') > 0);
ok('新模块自动进波状图',
    registry.chartModules(registry.cardOrder()).some((m) => m.id === 'weight'));

const ex = await exportSource('weight');
ok('导出模块拿回原样的源码', ex.ok && ex.text === WEIGHT, ex.error);
const exBuiltin = await exportSource('mood');
ok('内置模块导出在没有网络地址时给出可读提示', !exBuiltin.ok && /http/.test(exBuiltin.error), exBuiltin.error);

uninstallMod('weight', false);
ok('卸载后从注册表消失', !registry.has('weight'));
ok('卸载后数据仍在本机', !!(getRecordData(today).weight && getRecordData(today).weight.kg === 63.5));
ok('卸载后顺序位置留着', getSettings().order.indexOf('weight') >= 0);

const again = await installSource(WEIGHT, 'weight.js');
ok('重新装回同一个模块', again.ok && registry.has('weight'), again.error);
ok('重装后顺序回到原位', registry.cardOrder()[registry.cardOrder().length - 1] === 'weight');

const clash = await installSource("ellipse.define({ apiVersion: 1, id: 'mood', name: '假情绪' });", 'mood.js');
ok('抢内置 id 的模块被拦下', !clash.ok, clash.error);
ok('内置模块没有被顶掉', getModule('mood').name === '情绪');

uninstallMod('weight', true);
ok('可以连数据一起删干净', !getRecordData(today).weight);

const html = readFileSync(at('index.html'), 'utf8');
ok('index.html 挂了 manifest', /rel="manifest"/.test(html));
ok('index.html 有 apple-touch-icon', /rel="apple-touch-icon"/.test(html));
ok('index.html 有 apple-mobile-web-app-capable', /apple-mobile-web-app-capable/.test(html));
ok('index.html 有整页模块的容器',
    /id="viewPage"/.test(html) && /id="pageBody"/.test(html) && /id="pageTitle"/.test(html));

console.log('\n[9] 启动预览.bat');

const batPath = at('启动预览.bat');
ok('启动预览.bat 在（给不写命令行的人双击用的）', existsSync(batPath));
if (existsSync(batPath)) {
    const bat = readFileSync(batPath);
    let lf = 0, crlf = 0;
    for (let i = 0; i < bat.length; i++) {
        if (bat[i] === 0x0a) { lf++; if (i > 0 && bat[i - 1] === 0x0d) crlf++; }
    }
    ok('是 CRLF 换行（纯 LF 会让 goto 与括号块解析错乱）', lf > 0 && lf === crlf,
        (lf - crlf) + ' 个裸 LF');

    const decodesAsUtf8 = Buffer.compare(Buffer.from(bat.toString('utf8'), 'utf8'), bat) === 0;
    ok('没有存成 UTF-8（cmd 按 GBK 读，UTF-8 会把命令切成碎片）', !decodesAsUtf8);

    ok('没有 chcp 65001（中途换编码正是解析错乱的元凶）',
        bat.toString('binary').indexOf('chcp') < 0);

    const attrs = readFileSync(at('.gitattributes'), 'utf8');
    ok('.gitattributes 给 *.bat 破例保留 CRLF', /\*\.bat\s+text\s+eol=crlf/.test(attrs));
}

console.log('\n[10] 版本日志.txt');

const VERSION = 'v0.5.8';   // 发新版时改这里，和 版本日志.txt 最上面那条对齐
const logPath = at('版本日志.txt');
ok('版本日志.txt 在', existsSync(logPath));
if (existsSync(logPath)) {
    const log = readFileSync(logPath);
    ok('是 UTF-8 带 BOM（记事本因此不会猜错编码）',
        log.length > 3 && log[0] === 0xef && log[1] === 0xbb && log[2] === 0xbf);
    let decodes = true;
    try { new TextDecoder('utf-8', { fatal: true }).decode(log); } catch (err) { decodes = false; }
    ok('内容是真 UTF-8（存成 ANSI 的话别人的记事本会乱码）', decodes,
        '在记事本里"另存为"时编码选 UTF-8');
    const logText = log.toString('utf8').replace(/^﻿/, '');
    const newest = (logText.match(/^  (v\d+\.\d+\.\d+)/m) || [])[1];
    ok('最新那一版记在最上面（不是塞到了开头或末尾）', newest === VERSION, newest || '(没找到)');
}

console.log('\n[11] 弦音的脑子（chat.js 纯函数）');

const chat = await import('../assets/js/chat.js');

const cut1 = chat.splitReply('好的，记下了。\n\n```ellipse\n{"do":[]}\n```');
ok('切得出说的话', cut1.found && cut1.closed && cut1.prose.indexOf('记下了') >= 0);
ok('切得出指令块', cut1.block === '\n{"do":[]}\n');
const cut2 = chat.splitReply('正在想 ```ellipse{"do"');
ok('指令块没写完时不许执行', cut2.found && !cut2.closed && cut2.block === null);
ok('半截的围栏不露出来',
    chat.proseSoFar('正在想 ```ell').indexOf('`') < 0);
const line = '今天出去走了走，膝盖还行，没什么特别的';
ok('打字机留一手，不把最后几个字先吐出来',
    chat.proseSoFar(line) === line.slice(0, line.length - 9) &&
    line.length - chat.proseSoFar(line).length === 9);
ok('话太短就先什么都不显示', chat.proseSoFar('今天') === '');

ok('坏 JSON 认得出', chat.parseActions('{oops').error !== null);
ok('不认识的形状也认得出', chat.parseActions('[1,2]').error !== null &&
    chat.parseActions('[1,2]').acts.length === 0);
ok('混进来一条不是对象的也认得出',
    chat.parseActions('[{"act":"read-records"}, 7]').error !== null);
ok('空的 do 数组不算错', chat.parseActions('{"do":[]}').error === null);
ok('裸数组也收', chat.parseActions('[{"act":"read-records"}]').acts.length === 1);

ok('自伤的词拦得住', chat.crisisHit('我不想活了'));
ok('自伤的词没误伤', !chat.crisisHit('今天心情不错'));
const crisis = chat.crisisReply();
ok('求助卡有热线号码', crisis.lines.some((l) => l.value.indexOf('12356') >= 0));
ok('求助卡也提了医生和急救', crisis.lines.some((l) => l.label.indexOf('医生') >= 0) &&
    crisis.lines.some((l) => l.value.indexOf('120') >= 0));

const fieldSleep = { key: 'hours', label: '睡了多久', type: 'scale', min: 1, max: 12 };
ok('量表的正常值收得下', chat.normalizeFieldValue(fieldSleep, 6).value === 6);
ok('量表超范围拦得住', chat.normalizeFieldValue(fieldSleep, 40).ok === false);
ok('量表下面的范围也拦得住', chat.normalizeFieldValue(fieldSleep, 0).ok === false);
ok('全角数字认得', chat.normalizeFieldValue(fieldSleep, '６').value === 6);
ok('量表不收小数', chat.normalizeFieldValue(fieldSleep, 6.5).ok === false);
ok('清空是合法的', chat.normalizeFieldValue(fieldSleep, '').value === null);
ok('没填的也当清空', chat.normalizeFieldValue(fieldSleep, null).value === null);

const fieldMood = {
    key: 'morning', label: '早间心情', type: 'enum',
    options: [{ value: 'true', label: '好' }, { value: 'false', label: '差' }]
};
ok('选项按值收', chat.normalizeFieldValue(fieldMood, 'true').value === 'true');
ok('选项按标签收', chat.normalizeFieldValue(fieldMood, '好').value === 'true');
ok('选项收成布尔也不算错', chat.normalizeFieldValue(fieldMood, '好').value === true ||
    chat.normalizeFieldValue(fieldMood, '好').value === 'true');
ok('不存在的选项拦得住', chat.normalizeFieldValue(fieldMood, '一般').ok === false);

const fieldText = { key: 'text', label: '备注', type: 'textarea', maxlength: 10 };
ok('超长文本拦得住', chat.normalizeFieldValue(fieldText, '一二三四五六七八九十十一').ok === false);
ok('没超长的文本收得下', chat.normalizeFieldValue(fieldText, '膝盖不疼').value === '膝盖不疼');

const fieldNum = { key: 'v', label: '数值', type: 'number', min: 0, unit: '次' };
ok('数字型不收小数限制', chat.normalizeFieldValue(fieldNum, 2.5).value === 2.5);
ok('数字型没有上限就不设上限', chat.normalizeFieldValue(fieldNum, 999).ok === true);

const world = {
    today: '2026-10-10',
    records: [
        { id: 'sleep', name: '睡眠', fields: [{ key: 'hours', label: '睡了多久', type: 'number', min: 0 }] },
        { id: 'mood', name: '情绪', fields: [
            { key: 'morning', label: '早间心情', type: 'scale', min: 1, max: 10 }
        ] }
    ],
    events: [
        {
            id: 'med', name: '用药', fields: [{ key: 'drug', label: '药名', type: 'text', required: true }],
            repeats: ['once', 'daily'], events: [
                { id: 'e1', date: '2026-10-10', time: '08:00', values: { drug: '舍曲林' }, repeat: { kind: 'daily', every: 1, unit: 'day' } }
            ]
        }
    ]
};

const setSpec = chat.validateAction(
    { act: 'set-field', date: '2026-10-10', module: 'sleep', field: 'hours', value: 6.5 }, world);
ok('填记录：正常的一条能过', setSpec.ok && setSpec.spec.value === 6.5);
ok('填记录：模块用中文名也认',
    chat.validateAction({ act: 'set-field', date: '2026-10-10', module: '睡眠', field: '睡了多久', value: 7 }, world).ok);
ok('填记录：不存在的模块拦得住',
    chat.validateAction({ act: 'set-field', date: '2026-10-10', module: 'nope', field: 'x', value: 1 }, world).ok === false);
ok('填记录：不存在的字段拦得住',
    chat.validateAction({ act: 'set-field', date: '2026-10-10', module: 'sleep', field: 'nope', value: 1 }, world).ok === false);
ok('填记录：明天的日子拦得住',
    chat.validateAction({ act: 'set-field', date: '2026-10-11', module: 'sleep', field: 'hours', value: 6 }, world).ok === false);
ok('填记录：不存在的日期拦得住',
    chat.validateAction({ act: 'set-field', date: '2026-02-30', module: 'sleep', field: 'hours', value: 6 }, world).ok === false);
ok('填记录：不认识的指令拦得住', chat.validateAction({ act: 'drop-db' }, world).ok === false);

const addSpec = chat.validateAction(
    { act: 'add-event', type: 'med', date: '2026-10-12', time: '08:00', values: { drug: '奥氮平' } }, world);
ok('加日程：能过', addSpec.ok && addSpec.spec.date === '2026-10-12');
ok('加日程：必填项空着拦得住',
    chat.validateAction({ act: 'add-event', type: 'med', date: '2026-10-12', values: {} }, world).ok === false);
ok('加日程：时间写成乱码拦得住',
    chat.validateAction({ act: 'add-event', type: 'med', date: '2026-10-12', time: '25:99', values: { drug: 'x' } }, world).ok === false);
ok('加日程：不支持的频率拦得住',
    chat.validateAction({ act: 'add-event', type: 'med', date: '2026-10-12', values: { drug: 'x' }, repeat: { kind: 'weekly' } }, world).ok === false);
ok('加日程：卡上会写清楚要加什么',
    chat.describeAction(addSpec.spec).items.some((l) => l.indexOf('奥氮平') >= 0));

ok('认日程：认得出那一条',
    chat.resolveEventRef({ type: 'med', match: '舍曲林' }, world).status === 'ok');
ok('认日程：认不出就是没有',
    chat.resolveEventRef({ type: 'med', match: '阿司匹林' }, world).status === 'none');
ok('认日程：日子对不上也认不出',
    chat.resolveEventRef({ type: 'med', date: '2026-09-01', match: '舍曲林' }, world).status === 'none');

const many = {
    today: '2026-10-10',
    records: [],
    events: [{
        id: 'med', name: '用药', fields: [], repeats: ['once'], events: [
            { id: 'a', date: '2026-10-10', values: { drug: 'A' }, repeat: { kind: 'once' } },
            { id: 'b', date: '2026-10-10', values: { drug: 'B' }, repeat: { kind: 'once' } }
        ]
    }]
};
ok('认日程：两条就是说不清',
    chat.resolveEventRef({ type: 'med', date: '2026-10-10' }, many).status === 'many');
const delSpec = chat.validateAction({ act: 'delete-event', type: 'med', date: '2026-10-10' }, many);
ok('删日程：说不清时也先摆出来，由人挑', delSpec.ok && delSpec.spec.matches.length === 2);

const readSpec = chat.validateAction(
    { act: 'read-records', from: '2026-10-01', to: '2026-10-10', modules: ['sleep'] }, world);
ok('读记录：正常的一条能过', readSpec.ok && readSpec.spec.days === 10);
ok('读记录：超过 31 天拦得住',
    chat.validateAction({ act: 'read-records', from: '2026-01-01', to: '2026-10-10' }, world).ok === false);
ok('读记录：起止反了拦得住',
    chat.validateAction({ act: 'read-records', from: '2026-10-10', to: '2026-10-01' }, world).ok === false);
ok('读记录：不存在的模块拦得住',
    chat.validateAction({ act: 'read-records', from: '2026-10-01', to: '2026-10-10', modules: ['nope'] }, world).ok === false);
ok('读记录的卡会写清楚看哪几天哪几个模块',
    chat.describeAction(readSpec.spec).items.some((l) => l.indexOf('睡眠') >= 0) &&
    chat.describeAction(readSpec.spec).items.some((l) => l.indexOf('10 天') >= 0));
ok('读记录：不写模块就是全部',
    chat.validateAction({ act: 'read-records', from: '2026-10-09', to: '2026-10-10' }, world).spec.modules.length === 2);

const sys = chat.buildSystemPrompt(world);
ok('系统提示词带上今天几号', sys.indexOf('2026-10-10') >= 0);
ok('系统提示词带上模块的字段名', sys.indexOf('hours') >= 0 && sys.indexOf('morning') >= 0);
ok('系统提示词写死了不做医疗建议', sys.indexOf('不建议加药') >= 0 && sys.indexOf('不做任何诊断') >= 0);
ok('系统提示词交代了指令怎么发', sys.indexOf('```ellipse') >= 0);
ok('没开模块时提示词也说得明白',
    chat.buildSystemPrompt({ today: '2026-10-10', records: [], events: [] }).indexOf('一个都没开') >= 0);

const chordMd = chat.chatMarkdown([
    { role: 'user', text: '昨晚睡了 6 小时', at: '2026-10-10T09:12:00' },
    {
        role: 'ai', text: '记下了。', at: '2026-10-10T09:12:20',
        acts: [{ title: '填一条状态记录', items: ['昨天 · 睡眠 · 时长 = 6 小时'], decision: 'ok' }]
    },
    { role: 'crisis', text: '求助卡', at: '2026-10-10T10:00:00' }
]);
ok('md 有头信息', chordMd.indexOf('tags: [ellipse, 弦音]') >= 0);
ok('md 按天分段', chordMd.indexOf('## 2026-10-10 周') >= 0);
ok('md 分得清谁说的', chordMd.indexOf('**我**') >= 0 && chordMd.indexOf('**弦音**') >= 0);
ok('md 记下了哪条执行了', chordMd.indexOf('> 已执行：填一条状态记录') >= 0);
ok('md 给求助卡单独一节', chordMd.indexOf('### 10:00 求助卡') >= 0);
ok('空的聊天记录也导得出来', chat.chatMarkdown([]).indexOf('还没有聊过') >= 0);

console.log('\n[12] 弦音：独立页面与导出提醒');

const chordDef = registry.get('assistant');
ok('弦音是独立的一页', chordDef.kind === 'page');
ok('页面得能画出来', chordDef.mount instanceof Function);
ok('聊天页有自己的整屏样式', chordDef.pageClass === 'page--chat');
ok('它在设置里占一折，标题带 AI 前缀',
    chordDef.group === 'assistant' && chordDef.groupTitle === 'AI——弦音');
ok('设置里只留开关，填接口这些不再占一节',
    chordDef.settingsSections.length === 0);

const trendDef = registry.get('trend');
ok('波状图那块设置声明了要挂进「数值图」这一折',
    trendDef.settingsSections.some((s) => s.id === 'trend' && s.group === 'chart'));
ok('别处没被顺手搬走：挂折子的，挂的都是自己那一折（波状图归「数值图」那折）',
    registry.all().every((d) => d.settingsSections.every(
        (s) => !s.group || s.group === d.group || (d.id === 'trend' && s.group === 'chart'))));
ok('关掉的模块不进竖栏',
    registry.pageModules().every((id) => registry.isEnabled(id)));

console.log('');
ok('竖栏顺序：没存过就按现有的排',
    registry.mergeOrder(null, ['trend', 'calendar', 'assistant', 'record']).join(',') ===
    'trend,calendar,assistant,record');
ok('竖栏顺序：存过的顺序说了算',
    registry.mergeOrder(['assistant', 'record', 'trend', 'calendar'],
        ['trend', 'calendar', 'assistant', 'record']).join(',') ===
    'assistant,record,trend,calendar');
ok('竖栏顺序：新冒出来的入口补在后面',
    registry.mergeOrder(['record'], ['trend', 'calendar', 'assistant', 'record']).join(',') ===
    'record,trend,calendar,assistant');
ok('竖栏顺序：关掉的入口自动消失',
    registry.mergeOrder(['trend', 'calendar', 'assistant', 'record'],
        ['trend', 'calendar', 'assistant']).join(',') === 'trend,calendar,assistant');
ok('竖栏顺序：存了个空的就当没存',
    registry.mergeOrder([], ['trend', 'record']).join(',') === 'trend,record');

const { remindDue } = await import('../assets/js/export.js');
ok('刚记完不提醒',
    remindDue({
        today: '2026-10-10', oldestRecordKey: '2026-10-09', newestRecordKey: '2026-10-10',
        remind: {}
    }) === null);
ok('满 21 天没导就提醒',
    remindDue({
        today: '2026-10-20', oldestRecordKey: '2026-09-01', newestRecordKey: '2026-10-20',
        remind: {}
    }) !== null);
ok('没满 21 天不提醒',
    remindDue({
        today: '2026-10-20', oldestRecordKey: '2026-09-01', newestRecordKey: '2026-10-20',
        remind: { records: '2026-10-01' }
    }) === null);
ok('提醒里写清了隔了多少天',
    remindDue({
        today: '2026-10-20', oldestRecordKey: '2026-09-01', newestRecordKey: '2026-10-20',
        remind: { records: '2026-09-25' }
    }).records.days === 25);
ok('导过之后就不再提醒',
    remindDue({
        today: '2026-10-20', oldestRecordKey: '2026-09-01', newestRecordKey: '2026-10-05',
        remind: { records: '2026-10-20' }
    }) === null);
ok('导出之后又没有新东西，不提醒',
    remindDue({
        today: '2026-10-20', oldestRecordKey: '2026-09-01', newestRecordKey: '2026-10-01',
        remind: { records: '2026-10-01' }
    }) === null);
ok('说了先不用提醒，就不提醒',
    remindDue({
        today: '2026-10-20', oldestRecordKey: '2026-09-01', newestRecordKey: '2026-10-20',
        remind: { snoozeUntil: '2026-10-30' }
    }) === null);
ok('免打扰过了期，照提醒',
    remindDue({
        today: '2026-11-02', oldestRecordKey: '2026-09-01', newestRecordKey: '2026-10-30',
        remind: { snoozeUntil: '2026-10-30' }
    }) !== null);
ok('聊天那边单独算',
    (remindDue({
        today: '2026-10-20', oldestChatAt: '2026-09-01', newestChatAt: '2026-10-20',
        remind: {}
    }) || {}).chat !== null);
ok('一键备份的文件名认得出是备份', suggestFilename('chat').indexOf('ellipse-chord-') === 0);

console.log('\n[13] 发照片：缩图、存本机、拼给 AI');

const chord = await import('../assets/js/modules/assistant.js');

ok('横着的大图按长边缩（4000×3000 → 1568×1176）',
    JSON.stringify(chord.fitSize(4000, 3000, 1568)) === JSON.stringify({ w: 1568, h: 1176 }),
    JSON.stringify(chord.fitSize(4000, 3000, 1568)));
ok('竖着的大图也按长边缩（1200×4000 → 470×1568）',
    JSON.stringify(chord.fitSize(1200, 4000, 1568)) === JSON.stringify({ w: 470, h: 1568 }),
    JSON.stringify(chord.fitSize(1200, 4000, 1568)));
ok('方图按边长缩', JSON.stringify(chord.fitSize(2000, 2000, 480)) ===
    JSON.stringify({ w: 480, h: 480 }), JSON.stringify(chord.fitSize(2000, 2000, 480)));
ok('本来就小的图原样不动，绝不放大',
    JSON.stringify(chord.fitSize(100, 80, 480)) === JSON.stringify({ w: 100, h: 80 }),
    JSON.stringify(chord.fitSize(100, 80, 480)));
ok('刚好卡在顶上的也不动',
    JSON.stringify(chord.fitSize(480, 480, 480)) === JSON.stringify({ w: 480, h: 480 }));
ok('宽窄极端的长条也不会缩成 0',
    chord.fitSize(9000, 3, 480).h === 1 && chord.fitSize(9000, 3, 480).w === 480,
    JSON.stringify(chord.fitSize(9000, 3, 480)));
ok('尺寸填了怪东西也不崩', chord.fitSize(0, 0, 480).w === 1);

const pic = (n) => ({ id: 'm' + n, role: 'user', text: '', photo: 'x'.repeat(100) });
ok('没照片的聊天一点照片字节都不算',
    chord.photoBytes([{ id: 'a', text: '在' }, { id: 'b', text: '好' }]) === 0);
ok('算得准照片占了多少字节', chord.photoBytes([pic(1), { id: 'z' }, pic(2)]) === 200);

const smallLog = [pic(1), pic(2)];
ok('没超预算就一张都不动',
    chord.trimPhotos(smallLog, 1000000).dropped === 0 &&
    chord.trimPhotos(smallLog, 1000000).list[0].photo === smallLog[0].photo);
ok('超了预算就从最旧的开始丢', (function () {
    const r = chord.trimPhotos([pic(1), pic(2), pic(3)], 250);
    return r.dropped === 1 && r.list[0].photo === null &&
        r.list[1].photo && r.list[2].photo;
})(), JSON.stringify(chord.trimPhotos([pic(1), pic(2), pic(3)], 250).list.map((m) => !!m.photo)));
ok('丢得狠一点就把旧的都丢掉、最新的保住', (function () {
    const r = chord.trimPhotos([pic(1), pic(2), pic(3)], 100);
    return r.dropped === 2 && !!r.list[2].photo;
})(), JSON.stringify(chord.trimPhotos([pic(1), pic(2), pic(3)], 100).list.map((m) => !!m.photo)));
ok('丢的时候只丢照片、文字留着',
    chord.trimPhotos([{ id: 'm1', role: 'user', text: '昨晚睡得不好', photo: 'x'.repeat(100) }], 10)
        .list[0].text === '昨晚睡得不好');
ok('丢过的照片留个记号，界面上好写「没有留底」',
    chord.trimPhotos([pic(1)], 10).list[0].photoDropped === true);
ok('没照片的消息原样不动',
    chord.trimPhotos([{ id: 'a', text: '在' }], 0).list[0].text === '在');

ok('只打字：给 AI 的还是普通字符串',
    JSON.stringify(chat.toApiMessage({ role: 'user', raw: '睡得好' })) ===
    JSON.stringify({ role: 'user', content: '睡得好' }),
    JSON.stringify(chat.toApiMessage({ role: 'user', raw: '睡得好' })));
ok('弦音的回话也是字符串',
    chat.toApiMessage({ role: 'ai', text: '嗯' }).content === '嗯' &&
    chat.toApiMessage({ role: 'ai', text: '嗯' }).role === 'assistant');
ok('带照片时 content 变成数组', Array.isArray(
    chat.toApiMessage({ role: 'user', raw: '看看', photo: 'data:image/jpeg;base64,AAA' }).content));
ok('先说字、再给图（顺序不能反）', (function () {
    const c = chat.toApiMessage({ role: 'user', raw: '看看这个', photo: 'D' }).content;
    return c.length === 2 && c[0].type === 'text' && c[0].text === '看看这个' &&
        c[1].type === 'image_url' && c[1].image_url.url === 'D';
})(), JSON.stringify(chat.toApiMessage({ role: 'user', raw: '看看这个', photo: 'D' }).content));
ok('只发照片不打字：不给空的文字段（有些接口会顶回来）', (function () {
    const c = chat.toApiMessage({ role: 'user', raw: '', photo: 'D' }).content;
    return c.length === 1 && c[0].type === 'image_url';
})(), JSON.stringify(chat.toApiMessage({ role: 'user', raw: '', photo: 'D' }).content));
ok('发给 AI 用清楚那张、存本机用小的那张', (function () {
    const c = chat.toApiMessage({ role: 'user', raw: 'x', photo: 'SMALL', photoSend: 'BIG' }).content;
    return c[c.length - 1].image_url.url === 'BIG';
})(), JSON.stringify(chat.toApiMessage({ role: 'user', raw: 'x', photo: 'S', photoSend: 'B' }).content));
ok('临时那张没了就退回本机那张', (function () {
    const c = chat.toApiMessage({ role: 'user', raw: 'x', photo: 'SMALL' }).content;
    return c[c.length - 1].image_url.url === 'SMALL';
})(), JSON.stringify(chat.toApiMessage({ role: 'user', raw: 'x', photo: 'SMALL' }).content));
ok('照片被清理过的消息，还是按纯文字发出去',
    chat.toApiMessage({ role: 'user', raw: '看看', photo: null, photoDropped: true }).content === '看看');
ok('导出 md 时带照片的消息标一下，别留个空格子',
    chat.chatMarkdown([{ id: 'm1', role: 'user', at: '2026-10-10T09:00:00', text: '看看',
        photo: 'D' }]).indexOf('［照片］') >= 0);
ok('没留底的照片导出时也说得明白',
    chat.chatMarkdown([{ id: 'm1', role: 'user', at: '2026-10-10T09:00:00', text: '',
        photoDropped: true }]).indexOf('没留底') >= 0);

console.log('\n' + (fails ? '有 ' + fails + ' 项未通过' : '全部通过'));
process.exit(fails ? 1 : 0);
