/* 本地存储：所有记录与设置只保存在当前浏览器（localStorage） */

import { MODULE_ORDER, DEFAULT_SETTINGS } from './modules.js';

const ALL_MODULE_IDS = MODULE_ORDER.concat(Object.keys(DEFAULT_SETTINGS.modules));

const KEY_RECORDS = 'ellipse.v1.records';
const KEY_SETTINGS = 'ellipse.v1.settings';
const KEY_META = 'ellipse.v1.meta';

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

function loadSettings() {
    if (settings) return settings;
    const raw = safeParse(localStorage.getItem(KEY_SETTINGS), null) || {};
    const modules = {};
    ALL_MODULE_IDS.forEach(function (id) {
        modules[id] = DEFAULT_SETTINGS.modules[id] === undefined ? true : DEFAULT_SETTINGS.modules[id];
    });
    if (raw.modules && typeof raw.modules === 'object') {
        Object.keys(modules).forEach(function (id) {
            if (typeof raw.modules[id] === 'boolean') modules[id] = raw.modules[id];
        });
    }
    let order = Array.isArray(raw.order) ? raw.order.filter(function (id) {
        return MODULE_ORDER.indexOf(id) >= 0;
    }) : [];
    MODULE_ORDER.forEach(function (id) {
        if (order.indexOf(id) < 0) order.push(id);
    });

    const ai = Object.assign({ baseUrl: '', model: '', apiKey: '' }, raw.ai || {});
    settings = {
        modules: modules,
        order: order,
        ui: Object.assign({}, DEFAULT_SETTINGS.ui, raw.ui || {}),
        ai: ai,
        export: Object.assign({}, DEFAULT_SETTINGS.export, raw.export || {})
    };
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
    } catch (err) {
        console.error('[ellipse] 设置写入失败：', err);
    }
}

export function getSettings() { return loadSettings(); }

export function setSettings(patch) {
    const s = loadSettings();
    if (patch.modules) s.modules = Object.assign({}, s.modules, patch.modules);
    if (patch.order) s.order = patch.order.slice();
    if (patch.ui) s.ui = Object.assign({}, s.ui, patch.ui);
    if (patch.ai) s.ai = Object.assign({}, s.ai, patch.ai);
    if (patch.export) s.export = Object.assign({}, s.export, patch.export);
    persistSettings();
    emit({ type: 'settings' });
    return s;
}

export function resetSettings() {
    settings = null;
    localStorage.removeItem(KEY_SETTINGS);
    loadSettings();
    emit({ type: 'settings' });
    return settings;
}

/** 已启用的模块 id（按用户自定义顺序） */
export function enabledOrder() {
    const s = loadSettings();
    return s.order.filter(function (id) { return s.modules[id] !== false; });
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

/**
 * 细粒度写入：setField('2025-01-01', 'mood', 'morning', 7)
 * value 传 null 表示清除该字段
 */
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

export function patchModule(key, moduleId, patch) {
    if (!isValidKey(key) || !patch) return;
    const all = loadRecords();
    const rec = all[key] || (all[key] = { data: {} });
    if (!rec.data || typeof rec.data !== 'object') rec.data = {};
    rec.data[moduleId] = Object.assign({}, rec.data[moduleId] || {}, patch);
    Object.keys(rec.data[moduleId]).forEach(function (k) {
        const v = rec.data[moduleId][k];
        if (v === null || v === undefined || v === '') delete rec.data[moduleId][k];
    });
    rec.updatedAt = Date.now();
    persistRecords();
    emit({ type: 'record', key: key, module: moduleId });
}

/** 某个模块在最近 keys 上的取值数组，缺记录处为 null */
export function seriesFor(module, metric, keys) {
    return keys.map(function (key) {
        const data = getRecordData(key);
        const m = data[module.id];
        if (!m) return null;
        const v = module.metricValue(metric, m);
        return typeof v === 'number' && Number.isFinite(v) ? v : null;
    });
}

/** 所有有记录的日期（升序） */
export function allRecordKeys() {
    return Object.keys(loadRecords()).sort();
}

export function recordCount() {
    return Object.keys(loadRecords()).length;
}

export function exportAll() {
    return {
        app: 'ellipse',
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: loadSettings(),
        records: loadRecords()
    };
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
        localStorage.setItem(KEY_SETTINGS, JSON.stringify(payload.settings));
        loadSettings();
    }
    emit({ type: 'settings' });
    emit({ type: 'bulk' });
}

export function clearRecords() {
    records = {};
    persistRecords();
    emit({ type: 'bulk' });
}

export function getMeta() { return safeParse(localStorage.getItem(KEY_META), {}) || {}; }

export function setMeta(patch) {
    const meta = Object.assign({}, getMeta(), patch);
    try { localStorage.setItem(KEY_META, JSON.stringify(meta)); } catch (err) { /* 忽略 */ }
    return meta;
}

/* ---------------- 订阅 ---------------- */
export function subscribe(fn) {
    listeners.add(fn);
    return function unsubscribe() { listeners.delete(fn); };
}

function emit(evt) {
    listeners.forEach(function (fn) {
        try { fn(evt); } catch (err) { console.error('[ellipse] 订阅回调出错：', err); }
    });
}
