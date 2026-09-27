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

const { setField, getRecordData, enabledOrder, getSettings } = await import('../assets/js/storage.js');
const { MODULES, getModule } = await import('../assets/js/modules.js');
const { renderChart, metricSeries, RANGES, rangeById } = await import('../assets/js/charts.js');
const { dayMarkdown, rangeMarkdown, allMarkdown, suggestFilename } = await import('../assets/js/export.js');
const { toKey, todayKey, shiftKey } = await import('../assets/js/util.js');

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
ok('默认五个模块', MODULES.length === 5);
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
ok('AI 默认未配置', !s.ai.apiKey && !s.ai.baseUrl);

/* ---------- 6. 波状图栏 ---------- */
console.log('\n[6] 波状图栏');
const { CHART_ENTRY, chartModules } = await import('../assets/js/modules.js');
ok('栏定义存在', CHART_ENTRY.id === 'trend' && !!CHART_ENTRY.name);
ok('出图模块为 4 个（日记除外）', chartModules(enabledOrder()).length === 4,
    chartModules(enabledOrder()).map((m) => m.id).join(','));
ok('关闭情绪后少一个', chartModules(enabledOrder().filter((id) => id !== 'mood')).length === 3);

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

const html = readFileSync(at('index.html'), 'utf8');
ok('index.html 挂了 manifest', /rel="manifest"/.test(html));
ok('index.html 有 apple-touch-icon', /rel="apple-touch-icon"/.test(html));
ok('index.html 有 apple-mobile-web-app-capable', /apple-mobile-web-app-capable/.test(html));

console.log('\n' + (fails ? '有 ' + fails + ' 项未通过' : '全部通过'));
process.exit(fails ? 1 : 0);
