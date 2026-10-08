/* 模块注册表：核心只知道「契约」，不知道任何具体模块。

   模块的贡献（服务 / 工具 / 设置分区 / 模块内动作）全部写在定义里，注册时自动生效，
   卸载时自动消失 —— 不需要任何手工注销，也不会漏。

   依赖方向单向：registry → storage。storage 不认识 registry。 */

import { validateDefinition, formatErrors } from './validate.js';
import { metricsFromFields } from './fields.js';
import { getSettings, setSettings, ensureModuleSettings, forgetModule } from '../storage.js';

const defs = new Map();        /* id -> 规范化后的定义 */
const problemMap = new Map();  /* 加载失败的模块，设置页要显示并允许删掉 */
const listeners = new Set();

const CARD_KINDS = ['record', 'panel'];   /* 会出现在记录页上的两种 */

/* ---------------- 注册 ---------------- */

function normalize(def, meta) {
    const m = meta || {};
    const out = Object.assign({}, def);
    out.kind = def.kind === undefined ? 'record' : def.kind;
    out.fields = Array.isArray(def.fields) ? def.fields.slice() : [];
    out.metrics = Array.isArray(def.metrics) ? def.metrics.slice() : metricsFromFields(out.fields);
    out.tools = Array.isArray(def.tools) ? def.tools.slice() : [];
    out.settingsSections = Array.isArray(def.settingsSections) ? def.settingsSections.slice() : [];
    out.services = (def.services && typeof def.services === 'object') ? def.services : {};
    out.actions = (def.actions && typeof def.actions === 'object') ? def.actions : {};
    out.icon = def.icon || 'chart';
    out.desc = def.desc || '';
    out.builtin = !!m.builtin;
    out.source = m.source || null;         /* 用户装的模块：源码文本，导出时原样还给他 */
    out.filename = m.filename || null;
    return out;
}

/**
 * 注册一个模块
 * @param {object} def   模块定义（mod 文件里 ellipse.define({...}) 的那个对象）
 * @param {object} meta  { builtin, source, filename }
 */
export function register(def, meta) {
    const check = validateDefinition(def, { taken: ids() });
    if (!check.ok) {
        addProblem(def, meta, formatErrors(check.errors));
        return { ok: false, errors: check.errors };
    }
    const next = normalize(def, meta);
    defs.set(next.id, next);
    ensureModuleSettings(next.id, def.defaultOff !== true);
    notify();
    return { ok: true, id: next.id };
}

export function unregister(id) {
    if (!defs.delete(id)) return false;
    notify();
    return true;
}

/** 连设置与顺序一起忘掉（真的卸载，不是临时关掉） */
export function uninstall(id) {
    unregister(id);
    forgetModule(id);
    notify();
}

/* ---------------- 加载失败的模块 ---------------- */

export function addProblem(def, meta, reason) {
    const m = meta || {};
    const id = (def && def.id) || m.filename || ('未命名-' + (problemMap.size + 1));
    problemMap.set(String(id), {
        id: String(id),
        name: (def && def.name) || m.filename || '未命名模块',
        reason: reason || '未知原因',
        source: m.source || null,
        filename: m.filename || null,
        builtin: !!m.builtin
    });
    notify();
}

export function problems() { return Array.from(problemMap.values()); }

export function dropProblem(id) { if (problemMap.delete(id)) notify(); }

export function clearProblems() { problemMap.clear(); notify(); }

/* ---------------- 查询 ---------------- */

export function get(id) { return defs.get(id) || null; }

export function has(id) { return defs.has(id); }

export function ids() { return Array.from(defs.keys()); }

export function all() { return Array.from(defs.values()); }

export function isCard(id) {
    const def = defs.get(id);
    return !!def && CARD_KINDS.indexOf(def.kind) >= 0;
}

export function isEnabled(id) {
    return !!defs.get(id) && getSettings().modules[id] !== false;
}

/** 注册过的 id，按用户排的顺序；设置里存过但已经卸载的 id 自动跳过 */
export function orderedIds() {
    const known = ids();
    const out = (getSettings().order || []).filter(function (id) { return known.indexOf(id) >= 0; });
    known.forEach(function (id) { if (out.indexOf(id) < 0) out.push(id); });
    return out;
}

/** 已启用的记录型模块 id（顺序）—— 与改造前的 enabledOrder() 语义一致 */
export function enabledOrder() {
    return orderedIds().filter(function (id) {
        const def = defs.get(id);
        return !!def && def.kind === 'record' && isEnabled(id);
    });
}

/** 记录页要渲染的卡片：记录型 + 面板型，按顺序 */
export function cardOrder() {
    return orderedIds().filter(function (id) {
        return isCard(id) && isEnabled(id);
    });
}

/** 主页竖栏里的入口：独立页面型、已启用的模块，按顺序（记录页的入口由外壳自己排在最后） */
export function pageModules() {
    return orderedIds().filter(function (id) {
        const def = defs.get(id);
        return !!def && def.kind === 'page' && isEnabled(id);
    });
}

export function enabledCardCount() {
    return cardOrder().filter(function (id) {
        return defs.get(id).kind === 'record';
    }).length;
}

export function enabledCount() {
    return orderedIds().filter(isEnabled).length;
}

/** 有评分、能出图的模块（默认取记录页卡片，按传入顺序） */
export function chartModules(listOrIds) {
    const list = listOrIds || cardOrder();
    return list.map(function (x) {
        return typeof x === 'string' ? get(x) : x;
    }).filter(function (m) {
        return !!m && m.metrics && m.metrics.length > 0;
    });
}

/* ---------------- 顺序 ---------------- */

/** 在「已启用的卡片」之间上移 / 下移一位；服务型模块没有位置，永远排在最后 */
export function reorder(id, dir) {
    const cards = orderedIds().filter(isCard);
    const enabled = cards.filter(isEnabled);
    const i = enabled.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= enabled.length) return false;
    const tmp = enabled[i];
    enabled[i] = enabled[j];
    enabled[j] = tmp;
    const disabled = cards.filter(function (x) { return !isEnabled(x); });
    const services = orderedIds().filter(function (x) { return !isCard(x); });
    setSettings({ order: enabled.concat(disabled, services) });
    notify();
    return true;
}

/* ---------------- 模块提供的贡献（只取「已启用」的） ---------------- */

/** 模块内动作：data-act="..." 的按钮归谁管 */
export function action(name) {
    const hit = all().find(function (d) {
        return isEnabled(d.id) && typeof d.actions[name] === 'function';
    });
    return hit ? hit.actions[name] : null;
}

/** 工具按钮：某个字段声明 tools:['ai'] 时，界面上那个按钮的定义 */
export function tool(id) {
    const hit = all().find(function (d) {
        return isEnabled(d.id) && d.tools.some(function (t) { return t.id === id; });
    });
    return hit ? hit.tools.find(function (t) { return t.id === id; }) : null;
}

export function tools() {
    const out = [];
    all().forEach(function (d) {
        if (!isEnabled(d.id)) return;
        d.tools.forEach(function (t) { out.push(t); });
    });
    return out;
}

/** 跨模块能力：别的模块通过 api.services.get('ai') 取用 */
export function service(name) {
    const hit = all().find(function (d) {
        return isEnabled(d.id) && d.services[name];
    });
    return hit ? hit.services[name] : null;
}

export function serviceNames() {
    const out = [];
    all().forEach(function (d) {
        if (isEnabled(d.id)) Object.keys(d.services).forEach(function (k) { out.push(k); });
    });
    return out;
}

/** 设置页里由模块贡献的分区 */
export function settingsSections() {
    const out = [];
    all().forEach(function (d) {
        if (isEnabled(d.id)) out.push.apply(out, d.settingsSections);
    });
    return out;
}

/** 模块自己声明的敏感字段（备份默认不带出去） */
export function secretFields(modId) {
    const def = defs.get(modId);
    return def && Array.isArray(def.secrets) ? def.secrets : [];
}

/* ---------------- 订阅 ---------------- */

export function subscribe(fn) {
    listeners.add(fn);
    return function unsubscribe() { listeners.delete(fn); };
}

function notify() {
    listeners.forEach(function (fn) {
        try { fn(); } catch (err) { console.error('[ellipse] 注册表订阅回调出错：', err); }
    });
}
