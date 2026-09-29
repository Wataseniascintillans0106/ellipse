/* 逻辑冒烟测试：在 Node 里跑数据层 / 波状图 / md 导出（不需要浏览器） */

/* ---------- 最小环境替身 ---------- */
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

/* 模块系统：装好全局的 ellipse，再像浏览器那样把内置模块拉进来 */
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

/* ---------- 1. 记录读写 ---------- */
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

/* ---------- 2. 模块与默认顺序 ---------- */
console.log('\n[2] 模块定义');
ok('默认五个记录模块', MODULES.length === 5, MODULES.map((m) => m.id).join(','));
ok('默认顺序 情绪/睡眠/疼痛/运动/日记',
    enabledOrder().join(',') === 'mood,sleep,pain,exercise,diary', enabledOrder().join(','));
ok('每个模块都有图标与说明', MODULES.every((m) => m.icon && m.desc));
ok('四个模块有波状图指标', MODULES.filter((m) => m.metrics.length > 0).length === 4);
ok('日记没有数值指标', getModule('diary').metrics.length === 0);

const ranges = RANGES.map((r) => r.id).join(',');
ok('区间为 7d/30d/90d', ranges === '7d,30d,90d', ranges);
ok('rangeById 回退到 1 个月', rangeById('nope').id === '30d');

/* ---------- 3. 波状图 ---------- */
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

/* 没记录的日子：照样占一格、按最低值画、但不画圆点 */
const gapKeys = [shiftKey(today, -2), shiftKey(today, -1), today];
const gap = renderChart({ keys: gapKeys, values: [7, null, 3], metric: mood.metrics[0] });
const gapD = (gap.svg.match(/<path d="([^"]*)"/) || [])[1] || '';
const gapYs = [];
gapD.replace(/[ML]([\d.]+) ([\d.]+)/g, function (all, x, y) { gapYs.push(Number(y)); return all; });
ok('没记录的日子也在时间轴上占一格（折线连起来）', gapYs.length === 4, gapD);
ok('没记录的日子画在最低处', gapYs.length === 4 && gapYs[1] === Math.max.apply(null, gapYs),
    JSON.stringify(gapYs));
ok('没记录的日子不画圆点', gap.points.length === 2, String(gap.points.length));
/* 0 分和「没记录」都贴在最底下，靠圆点区分：真有记录的 0 分照样画点 */
const zero = renderChart({ keys: gapKeys, values: [0, null, 0], metric: getModule('pain').metrics[0] });
ok('记成 0 分的那天照画圆点', zero.points.length === 2, String(zero.points.length));

const full = renderChart({ keys: gapKeys, values: [7, 5, 3], metric: mood.metrics[0] });
ok('某天在横轴上的位置，不受邻居有没有记录影响',
    full.points[0].x === gap.points[0].x && full.points[2].x === gap.points[1].x,
    JSON.stringify([full.points.map((p) => p.x), gap.points.map((p) => p.x)]));

/* ---------- 4. md 导出 ---------- */
console.log('\n[4] md 导出');
const md = dayMarkdown(today);
ok('含 frontmatter', md.startsWith('---\ndate: ' + today));
ok('frontmatter 列出模块', md.indexOf('modules: [mood, sleep, pain, exercise, diary]') > 0,
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

/* ---------- 5. 设置 ---------- */
console.log('\n[5] 设置');
const s = getSettings();
ok('默认全部开启', Object.keys(s.modules).every((k) => s.modules[k] === true));
ok('状态波动图栏默认开启', s.modules.trend === true);
ok('状态波动图不算记录模块', enabledOrder().indexOf('trend') < 0, enabledOrder().join(','));
ok('AI 默认未配置', !getModuleSettings('assistant').apiKey && !getModuleSettings('assistant').baseUrl);
ok('AI 密钥被声明成敏感字段（备份默认不带出去）',
    registry.secretFields('assistant').indexOf('apiKey') >= 0);

/* ---------- 6. 面板型与服务型模块 ---------- */
console.log('\n[6] 面板型与服务型模块');
const trend = getModule('trend');
ok('波状图栏是个面板型模块', !!trend && trend.kind === 'panel' && !!trend.name);
ok('AI 助手是个服务型模块', getModule('assistant').kind === 'service');
ok('服务型模块不占记录页的位置', registry.cardOrder().indexOf('assistant') < 0);
ok('出图模块为 4 个（日记除外）', registry.chartModules(enabledOrder()).length === 4,
    registry.chartModules(enabledOrder()).map((m) => m.id).join(','));
ok('关闭情绪后少一个', registry.chartModules(enabledOrder().filter((id) => id !== 'mood')).length === 3);
ok('关掉 AI 模块，它的工具按钮就查不到了',
    registry.tool('ai') !== null && registry.tool('nope') === null);
ok('语音转写的工具已经删掉了', registry.tool('voice') === null);
ok('日记不再挂任何工具按钮', !getModule('diary').fields.some((f) => f.tools));

/* ---------- 7. PWA 资源 ---------- */
console.log('\n[7] PWA 资源');
const { readFileSync, existsSync, statSync, readdirSync } = await import('node:fs');
const path = await import('node:path');
const root = path.resolve(import.meta.dirname, '..');
const at = (rel) => path.join(root, rel);

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

    /* 最容易犯的错：改了图标文件名却忘了同步 manifest */
    const missing = (manifest.icons || [])
        .map((i) => String(i.src || '').replace(/^\.\//, ''))
        .filter((rel) => !existsSync(at(rel)));
    ok('manifest 里的图标都真的存在', missing.length === 0, missing.join(','));

    /* 安卓的「安装应用」提示要求有 192 与 512 两档 */
    const sizes = (manifest.icons || []).map((i) => i.sizes);
    ok('图标含 192 与 512 两档', sizes.includes('192x192') && sizes.includes('512x512'), sizes.join(','));
}

ok('sw.js 存在且非空', existsSync(at('sw.js')) && statSync(at('sw.js')).size > 0);

/* 预缓存清单是最容易腐烂的地方：加了新模块忘了写进去，
   线上就会悄悄退回「第二次打开才有离线」，而这种问题在浏览器里很难看出来 */
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

/* ---------- 8. mod 系统：校验 / 安装 / 卸载 / 导出 ---------- */
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

/* 装上就自动接上：记录、md、区间汇总、波状图 —— 一行代码都不用改别处 */
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

/* 卸载：代码走，数据留，顺序留 */
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

/* ---------- 9. 启动预览.bat ---------- */
/* 这是唯一一个"坏了不报错、只是双击后一声不响"的文件：cmd 按 GBK 读、按 CR 定位行，
   存成 UTF-8 或 LF 都会让它整份失效。编辑器保存时很容易悄悄改掉，所以在这里守着。 */
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

    /* 文件里有中文，所以"是合法 UTF-8"就等于"被存成了 UTF-8"，那会被 cmd 读成乱码 */
    const decodesAsUtf8 = Buffer.compare(Buffer.from(bat.toString('utf8'), 'utf8'), bat) === 0;
    ok('没有存成 UTF-8（cmd 按 GBK 读，UTF-8 会把命令切成碎片）', !decodesAsUtf8);

    ok('没有 chcp 65001（中途换编码正是解析错乱的元凶）',
        bat.toString('binary').indexOf('chcp') < 0);

    /* 光文件本身对还不够：eol=lf 的默认规则会在 checkout 时把 CRLF 又抹掉 */
    const attrs = readFileSync(at('.gitattributes'), 'utf8');
    ok('.gitattributes 给 *.bat 破例保留 CRLF', /\*\.bat\s+text\s+eol=crlf/.test(attrs));
}

/* ---------- 10. 版本日志.txt ---------- */
/* 同类的坑：这是给人双击打开看的 txt，在记事本里"另存为"很容易存成 ANSI(GBK)，
   那样别人打开就是乱码。带上 BOM 的 UTF-8 记事本一定认得。 */
console.log('\n[10] 版本日志.txt');

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
    ok('记了最新那一版', log.toString('utf8').indexOf('v0.2') >= 0);
}

console.log('\n' + (fails ? '有 ' + fails + ' 项未通过' : '全部通过'));
process.exit(fails ? 1 : 0);
