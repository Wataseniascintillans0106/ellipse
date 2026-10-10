import { getModsRaw, setModsRaw, dropModuleData, setSettings } from '../storage.js';
import * as registry from './registry.js';
import { captureDefine, withContext } from './api.js';
import { validateDefinition, formatErrors } from './validate.js';

export const MAX_SOURCE = 200 * 1024;

const BUILTIN_DIR = 'assets/js/modules/';

const PROBE_SRC = 'export default 1;';

let mode = null;

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
    } finally {
        if (url) revokeLater(url);
    }
    return mode;
}

function revokeLater(url) {
    setTimeout(function () {
        try { URL.revokeObjectURL(url); } catch (err) {  }
    }, 8000);
}

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
    const fn = new Function('ellipse', String(source) + '\n//# sourceURL=ellipse-mod-' + label);
    fn(globalThis.ellipse);
}

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

    const check = validateDefinition(res.def, { taken: [] });
    if (!check.ok) return { ok: false, error: formatErrors(check.errors), def: res.def };
    return { ok: true, def: res.def };
}

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
        registry.unregister(reg.id);
        return { ok: false, error: '本机存储写不进去，可能是空间不够了', def: def };
    }
    return { ok: true, id: reg.id, def: def };
}

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

export function installedIds() { return Object.keys(getModsRaw()); }

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
    registry.register(res.def, meta);
}

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

export async function loadBuiltins() {
    await withContext({ builtin: true }, function () {
        return import('../modules/index.js');
    });
}
