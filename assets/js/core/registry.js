import { validateDefinition, formatErrors } from './validate.js';
import { metricsFromFields } from './fields.js';
import { getSettings, setSettings, ensureModuleSettings, forgetModule } from '../storage.js';

const defs = new Map();
const problemMap = new Map();
const listeners = new Set();

const CARD_KINDS = ['record', 'panel'];

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
    out.source = m.source || null;
    out.filename = m.filename || null;
    return out;
}

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

export function uninstall(id) {
    unregister(id);
    forgetModule(id);
    notify();
}

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

export function orderedIds() {
    const known = ids();
    const out = (getSettings().order || []).filter(function (id) { return known.indexOf(id) >= 0; });
    known.forEach(function (id) { if (out.indexOf(id) < 0) out.push(id); });
    return out;
}

export function enabledOrder() {
    return orderedIds().filter(function (id) {
        const def = defs.get(id);
        return !!def && def.kind === 'record' && isEnabled(id);
    });
}

export function cardOrder() {
    return orderedIds().filter(function (id) {
        return isCard(id) && isEnabled(id);
    });
}

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

export function chartModules(listOrIds) {
    const list = listOrIds || cardOrder();
    return list.map(function (x) {
        return typeof x === 'string' ? get(x) : x;
    }).filter(function (m) {
        return !!m && m.metrics && m.metrics.length > 0;
    });
}

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

export function action(name) {
    const hit = all().find(function (d) {
        return isEnabled(d.id) && typeof d.actions[name] === 'function';
    });
    return hit ? hit.actions[name] : null;
}

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

export function settingsSections() {
    const out = [];
    all().forEach(function (d) {
        if (isEnabled(d.id)) out.push.apply(out, d.settingsSections);
    });
    return out;
}

export function secretFields(modId) {
    const def = defs.get(modId);
    return def && Array.isArray(def.secrets) ? def.secrets : [];
}

export function subscribe(fn) {
    listeners.add(fn);
    return function unsubscribe() { listeners.delete(fn); };
}

function notify() {
    listeners.forEach(function (fn) {
        try { fn(); } catch (err) { console.error('[ellipse] 注册表订阅回调出错：', err); }
    });
}
