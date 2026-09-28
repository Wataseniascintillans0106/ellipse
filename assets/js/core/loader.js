/* 已装模块的装载器：源码存哪、怎么求值、出错怎么兜底。

   两条求值路线，启动时先探测再决定（不是「失败才降级」——
   否则一个语法写错的模块会让后面所有模块都拿到更差的报错）：
     1) import(Blob URL)  —— 真实的 ES module 语义，优先
     2) new Function      —— 兜底，能启动的浏览器就一定能装模块

   模块文件统一写 ellipse.define({...})：这一种写法两条路上都是合法代码。 */

import { getModsRaw, setModsRaw, dropModuleData, setSettings } from '../storage.js';
import * as registry from './registry.js';
import { captureDefine, withContext } from './api.js';
import { validateDefinition, formatErrors } from './validate.js';

/** 单个模块源码的上限：localStorage 总共只有几 MB，超了就该拦下来 */
export const MAX_SOURCE = 200 * 1024;

/* 内置模块源文件的存放约定（「导出模块」按这个路径去取） */
const BUILTIN_DIR = 'assets/js/modules/';

const PROBE_SRC = 'export default 1;';

let mode = null;      /* null=还没探测；'module' | 'function' */

/** 探测浏览器支不支持 import(Blob URL)：只在第一次真正要装模块时跑一次 */
export async function evaluateMode() {
    if (mode) return mode;
    mode = 'function';
    if (typeof Blob === 'undefined' || typeof URL === 'undefined' ||
        typeof URL.createObjectURL !== 'function') {
        return mode;
    }
    let url = null;
    try {
        url = URL.createObjectURL(new Blob([PROBE_SRC], { type: 'text/javascript' }));
        const mod = await import(url);
        if (mod && mod.default === 1) mode = 'module';
    } catch (err) {
        /* 探测失败就退回 new Function，这本身就是这条分支存在的意义 */
    } finally {
        if (url) revokeLater(url);
    }
    return mode;
}

function revokeLater(url) {
    /* 立刻 revoke 会让还在解析的模块取不到内容，等一会儿再回收 */
    setTimeout(function () {
        try { URL.revokeObjectURL(url); } catch (err) { /* 忽略 */ }
    }, 8000);
}

/** 求值一段模块源码；它内部对 ellipse.define 的调用由调用方决定怎么接 */
async function evaluate(source, label) {
    const how = await evaluateMode();
    if (how === 'module') {
        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        try {
            await import(url);
        } finally {
            revokeLater(url);
        }
        return;
    }
    /* new Function 里拿不到 ES module 的顶层作用域，所以把 ellipse 当参数传进去；
       sourceURL 让浏览器报错信息里能看到是哪个模块出的问题 */
    const fn = new Function('ellipse', String(source) + '\n//# sourceURL=ellipse-mod-' + label);
    fn(globalThis.ellipse);
}

/* ---------------- 只求值、不注册（导入前给用户看一眼） ---------------- */

/**
 * 试求值一个模块文件，先拿到它自称的 id / 名字 / 说明。
 * @returns {{ ok: boolean, def?: object, error?: string }}
 */
export async function previewSource(source, filename) {
    const text = String(source === null || source === undefined ? '' : source);
    if (!text.trim()) return { ok: false, error: '文件是空的' };
    if (text.length > MAX_SOURCE) {
        return { ok: false, error: '文件太大了（' + Math.round(text.length / 1024) + ' KB，上限 ' + (MAX_SOURCE / 1024) + ' KB）' };
    }

    const label = filename || 'mod.js';
    const res = await captureDefine(function () {
        return evaluate(text, label);
    }, { builtin: false, source: text, filename: label });

    if (res.error) return { ok: false, error: '代码执行出错：' + String(res.error.message || res.error) };
    if (!res.def) return { ok: false, error: '文件里没有调用 ellipse.define({...})' };

    /* 先做一次干跑校验，让用户在确认框之前就看到问题 */
    const check = validateDefinition(res.def, { taken: [] });
    if (!check.ok) return { ok: false, error: formatErrors(check.errors), def: res.def };
    return { ok: true, def: res.def };
}

/* ---------------- 安装 / 卸载 ---------------- */

/**
 * 安装一个模块：注册 + 把源码存进 ellipse.v1.mods（下次启动自动重新装载）
 * @param {string} source   模块源码
 * @param {string} filename 文件名（显示与导出时用）
 * @param {object} knownDef previewSource 已经拿到的定义，可省一次求值
 */
export async function installSource(source, filename, knownDef) {
    const text = String(source === null || source === undefined ? '' : source);
    const label = filename || 'mod.js';
    let def = knownDef || null;

    if (!def) {
        const preview = await previewSource(text, label);
        if (!preview.ok) return { ok: false, error: preview.error };
        def = preview.def;
    }

    const id = def && def.id;

    /* 内置模块的 id 不许被顶掉；同名的自制模块则视为「更新」，先让它腾位置 */
    if (typeof id === 'string' && registry.has(id)) {
        const prev = registry.get(id);
        if (prev && prev.builtin) {
            return { ok: false, error: '「' + id + '」是内置模块的 id，请换一个' };
        }
        registry.unregister(id);
    }

    const reg = registry.register(def, { builtin: false, source: text, filename: label });
    if (!reg.ok) return { ok: false, error: formatErrors(reg.errors), def: def };

    const all = getModsRaw();
    all[reg.id] = { source: text, filename: label, installedAt: Date.now() };
    if (!setModsRaw(all)) {
        /* 源码没落盘就撤销注册，免得这次能用、下次启动却凭空消失 */
        registry.unregister(reg.id);
        return { ok: false, error: '本机存储写不进去，可能是空间不够了', def: def };
    }
    return { ok: true, id: reg.id, def: def };
}

/**
 * 卸载一个模块
 * @param {string} id
 * @param {boolean} dropData 是否连它记录的数据一起删掉（默认保留）
 */
export function uninstallMod(id, dropData) {
    const def = registry.get(id);
    if (!def || def.builtin) return false;
    registry.unregister(id);
    if (dropData) dropModuleData(id);
    const all = getModsRaw();
    delete all[id];
    setModsRaw(all);
    return true;
}

/** 已装（自制）模块的 id 列表 */
export function installedIds() { return Object.keys(getModsRaw()); }

/** 把全部自制模块关掉 —— 装了个不听话的模块时的自救开关 */
export function disableAllCustom() {
    const patch = {};
    let n = 0;
    registry.all().forEach(function (def) {
        if (def.builtin || !registry.isEnabled(def.id)) return;
        patch[def.id] = false;
        n++;
    });
    if (n) setSettings({ modules: patch });
    return n;
}

/**
 * 取一个模块的源码，用来导出
 * 自制模块原样还给它自己；内置模块把源文件抓回来（要经 http/https 打开才取得到）
 */
export async function exportSource(id) {
    const def = registry.get(id);
    if (!def) return { ok: false, error: '没有这个模块' };

    if (def.source) {
        return { ok: true, filename: def.filename || (id + '.js'), text: def.source };
    }
    if (!def.builtin) return { ok: false, error: '找不到这个模块的源码' };

    try {
        const res = await fetch(BUILTIN_DIR + id + '.js', { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return { ok: true, filename: id + '.js', text: await res.text() };
    } catch (err) {
        return {
            ok: false,
            error: '取不到内置模块的源文件。需要经 http 打开页面（双击本地文件或已断网时取不到）'
        };
    }
}

/* ---------------- 启动时装载 ---------------- */

async function loadOne(id, item) {
    const rec = typeof item === 'string' ? { source: item } : (item || {});
    const label = rec.filename || (id + '.js');
    const meta = { builtin: false, source: rec.source, filename: label };

    let res;
    try {
        res = await captureDefine(function () {
            return evaluate(rec.source, id);
        }, meta);
    } catch (err) {
        registry.addProblem({ id: id, name: label }, meta, '装载失败：' + String(err.message || err));
        return;
    }

    if (res.error) {
        registry.addProblem({ id: id, name: label }, meta, '执行出错：' + String(res.error.message || res.error));
        return;
    }
    if (!res.def) {
        registry.addProblem({ id: id, name: label }, meta, '文件里没有调用 ellipse.define({...})');
        return;
    }
    /* 失败会被 register 自己登记成一条可删的错误条目 */
    registry.register(res.def, meta);
}

/** 装载全部已装模块。任何一个出错都只影响它自己。 */
export async function loadInstalled() {
    const all = getModsRaw();
    const ids = Object.keys(all);
    for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const item = all[id];
        const src = typeof item === 'string' ? item : (item && item.source);
        if (!src) continue;
        await loadOne(id, item);
    }
    return ids.length;
}

/** 注册内置模块：把来源标成内置，并把它们的定义从 index.js 里拉进来 */
export async function loadBuiltins() {
    await withContext({ builtin: true }, function () {
        return import('../modules/index.js');
    });
}
