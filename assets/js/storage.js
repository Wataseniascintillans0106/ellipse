const KEY_RECORDS = 'ellipse.v1.records';
const KEY_SETTINGS = 'ellipse.v1.settings';
const KEY_MODS = 'ellipse.v1.mods';

const SETTINGS_VERSION = 2;

const DEFAULT_SETTINGS = {
    ui: { expandAll: true, openModule: null, panels: {}, groups: {}, railRecordFirst: false },
    export: { frontmatter: true, includeSummary: true }
};

const KNOWN_KEYS = ['version', 'modules', 'order', 'ui', 'export', 'mods'];

let records = null;
let settings = null;
const listeners = new Set();

function safeParse(text, fallback) {
    if (!text) return fallback;
    try {
        const v = JSON.parse(text);
        return v === null || v === undefined ? fallback : v;
    } catch (err) {
        console.warn('[ellipse] 本地数据解析失败，已忽略：', err);
        return fallback;
    }
}

function loadRecords() {
    if (records) return records;
    const raw = safeParse(localStorage.getItem(KEY_RECORDS), null);
    records = raw && typeof raw === 'object' ? raw : {};
    return records;
}

function migrate(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = {
        version: SETTINGS_VERSION,
        modules: (src.modules && typeof src.modules === 'object') ? Object.assign({}, src.modules) : {},
        order: Array.isArray(src.order) ? src.order.slice() : [],
        ui: Object.assign({}, DEFAULT_SETTINGS.ui, src.ui || {}, {
            panels: Object.assign({}, (src.ui && src.ui.panels) || {}),
            groups: Object.assign({}, (src.ui && src.ui.groups) || {})
        }),
        export: Object.assign({}, DEFAULT_SETTINGS.export, src.export || {}),
        mods: (src.mods && typeof src.mods === 'object') ? Object.assign({}, src.mods) : {}
    };
    if (!out.mods.assistant && src.ai && typeof src.ai === 'object') {
        out.mods.assistant = Object.assign({}, src.ai);
    }
    if (src.ui && typeof src.ui === 'object') {
        if (src.ui.trendOpen !== undefined && out.ui.panels.trend === undefined) {
            out.ui.panels.trend = src.ui.trendOpen !== false;
        }
        if (src.ui.lastRange && !out.mods.trend) {
            out.mods.trend = { range: src.ui.lastRange };
        }
    }
    KNOWN_KEYS.forEach(function (k) { delete src[k]; });
    Object.keys(src).forEach(function (k) { out[k] = src[k]; });
    return out;
}

function loadSettings() {
    if (settings) return settings;
    settings = migrate(safeParse(localStorage.getItem(KEY_SETTINGS), null));
    return settings;
}

function persistRecords() {
    try {
        localStorage.setItem(KEY_RECORDS, JSON.stringify(records));
    } catch (err) {
        console.error('[ellipse] 记录写入失败：', err);
        throw err;
    }
}

function persistSettings() {
    try {
        localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings));
        return true;
    } catch (err) {
        console.error('[ellipse] 设置写入失败：', err);
        return false;
    }
}

export function getSettings() { return loadSettings(); }

export function setSettings(patch) {
    const s = loadSettings();
    if (patch.modules) s.modules = Object.assign({}, s.modules, patch.modules);
    if (patch.order) s.order = patch.order.slice();
    if (patch.ui) s.ui = Object.assign({}, s.ui, patch.ui);
    if (patch.export) s.export = Object.assign({}, s.export, patch.export);
    if (patch.mods) {
        const next = Object.assign({}, s.mods);
        Object.keys(patch.mods).forEach(function (id) {
            next[id] = Object.assign({}, next[id] || {}, patch.mods[id]);
        });
        s.mods = next;
    }
    persistSettings();
    emit({ type: 'settings' });
    return s;
}

export function getModuleSettings(id) { return loadSettings().mods[id] || {}; }

export function resetSettings() {
    settings = null;
    localStorage.removeItem(KEY_SETTINGS);
    loadSettings();
    emit({ type: 'settings' });
    return settings;
}

export function ensureModuleSettings(id, enabledByDefault) {
    const s = loadSettings();
    let changed = false;
    if (s.modules[id] === undefined) {
        s.modules[id] = enabledByDefault !== false;
        changed = true;
    }
    if (s.order.indexOf(id) < 0) {
        s.order.push(id);
        changed = true;
    }
    if (changed) {
        persistSettings();
        emit({ type: 'settings' });
    }
    return changed;
}

export function forgetModule(id) {
    const s = loadSettings();
    const at = s.order.indexOf(id);
    if (at >= 0) s.order.splice(at, 1);
    delete s.modules[id];
    delete s.mods[id];
    persistSettings();
    emit({ type: 'settings' });
}

export function isValidKey(key) { return /^\d{4}-\d{2}-\d{2}$/.test(String(key)); }

export function getRecord(key) {
    if (!isValidKey(key)) return null;
    return loadRecords()[key] || null;
}

export function getRecordData(key) {
    const rec = getRecord(key);
    return rec && rec.data && typeof rec.data === 'object' ? rec.data : {};
}

export function setField(key, moduleId, field, value) {
    if (!isValidKey(key)) return;
    const all = loadRecords();
    const rec = all[key] || (all[key] = { data: {} });
    if (!rec.data || typeof rec.data !== 'object') rec.data = {};
    const m = rec.data[moduleId] || (rec.data[moduleId] = {});
    if (value === null || value === undefined || value === '') {
        delete m[field];
    } else {
        m[field] = value;
    }
    rec.updatedAt = Date.now();
    persistRecords();
    emit({ type: 'record', key: key, module: moduleId, field: field });
}

export function dropModuleData(moduleId) {
    const all = loadRecords();
    let touched = 0;
    Object.keys(all).forEach(function (key) {
        const rec = all[key];
        if (rec && rec.data && rec.data[moduleId] !== undefined) {
            delete rec.data[moduleId];
            touched++;
        }
    });
    if (touched) {
        persistRecords();
        emit({ type: 'bulk' });
    }
    return touched;
}

export function allRecordKeys() {
    return Object.keys(loadRecords()).sort();
}

export function getModsRaw() { return safeParse(localStorage.getItem(KEY_MODS), null) || {}; }

export function setModsRaw(all) {
    try {
        localStorage.setItem(KEY_MODS, JSON.stringify(all));
        return true;
    } catch (err) {
        console.error('[ellipse] 模块源码写入失败：', err);
        return false;
    }
}

export function exportAll(opts) {
    const o = opts || {};
    const payload = {
        app: 'ellipse',
        version: 2,
        exportedAt: new Date().toISOString(),
        settings: loadSettings(),
        records: loadRecords()
    };
    if (o.includeMods) payload.mods = getModsRaw();
    return payload;
}

export function importAll(payload, mode) {
    if (!payload || typeof payload !== 'object' || !payload.records) {
        throw new Error('文件内容不是有效的 ellipse 备份');
    }
    const incoming = payload.records;
    const all = mode === 'replace' ? {} : loadRecords();
    Object.keys(incoming).forEach(function (key) {
        if (!isValidKey(key)) return;
        all[key] = incoming[key];
    });
    records = all;
    persistRecords();

    if (payload.settings) {
        settings = null;
        try {
            localStorage.setItem(KEY_SETTINGS, JSON.stringify(payload.settings));
        } catch (err) {  }
        loadSettings();
    }

    let mods = 0;
    if (payload.mods && typeof payload.mods === 'object') {
        const merged = mode === 'replace' ? {} : getModsRaw();
        Object.keys(payload.mods).forEach(function (id) {
            merged[id] = payload.mods[id];
            mods++;
        });
        setModsRaw(merged);
    }

    emit({ type: 'settings' });
    emit({ type: 'bulk' });
    return { records: Object.keys(incoming).length, mods: mods };
}

export function clearRecords() {
    records = {};
    persistRecords();
    emit({ type: 'bulk' });
}

export function subscribe(fn) {
    listeners.add(fn);
    return function unsubscribe() { listeners.delete(fn); };
}

function emit(evt) {
    listeners.forEach(function (fn) {
        try { fn(evt); } catch (err) { console.error('[ellipse] 订阅回调出错：', err); }
    });
}

export { DEFAULT_SETTINGS, SETTINGS_VERSION, KEY_RECORDS, KEY_SETTINGS, KEY_MODS };
