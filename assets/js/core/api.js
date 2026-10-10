import { CORE_API_VERSION } from './validate.js';
import * as registry from './registry.js';
import {
    renderFields, summarize, markdownLines, metricsFromFields,
    hasValue, sameValue, fieldByKey, FIELD_TYPES
} from './fields.js';
import { ICONS, icon } from '../icons.js';
import { escapeHtml, fmtNum, debounce, toast } from '../util.js';
import {
    getSettings, setSettings, getModuleSettings,
    getRecordData, setField, dropModuleData, allRecordKeys
} from '../storage.js';
import * as sheet from './sheet.js';
import { renderChart, chartBlock, RANGES, rangeById } from '../charts.js';
import { downloadMarkdown, copyText } from '../export.js';

let refreshHook = function () {};

export function install(capabilities) {
    const c = capabilities || {};
    if (typeof c.refresh === 'function') refreshHook = c.refresh;
}

let capture = null;
let context = { builtin: true };

export function define(def) {
    if (capture) { capture(def); return def; }
    registry.register(def, {
        builtin: context.builtin,
        source: context.source || null,
        filename: context.filename || null
    });
    return def;
}

export async function captureDefine(run, ctx) {
    const prevCapture = capture;
    const prevContext = context;
    let got = null;
    let error = null;
    capture = function (def) { if (!got) got = def; };
    context = Object.assign({ builtin: false }, ctx || {});
    try {
        await run();
    } catch (err) {
        error = err;
    } finally {
        capture = prevCapture;
        context = prevContext;
    }
    return { def: got, error: error };
}

export async function withContext(ctx, run) {
    const prev = context;
    context = Object.assign({ builtin: true }, ctx || {});
    try { return await run(); } finally { context = prev; }
}

export function withBuiltinContext(run) {
    return withContext({ builtin: true }, run);
}

function buildFacade() {
    return {
        apiVersion: CORE_API_VERSION,
        define: define,

        icon: icon,
        icons: ICONS,
        escapeHtml: escapeHtml,
        fmtNum: fmtNum,
        debounce: debounce,
        toast: toast,

        refresh: function () { refreshHook(); },

        registry: {
            get: registry.get,
            all: registry.all,
            ids: registry.ids,
            has: registry.has,
            isEnabled: registry.isEnabled,
            cardOrder: registry.cardOrder,
            pageModules: registry.pageModules,
            enabledOrder: registry.enabledOrder,
            chartModules: registry.chartModules,
            tools: registry.tools,
            tool: registry.tool,
            settingsSections: registry.settingsSections,
            secretFields: registry.secretFields
        },

        services: {
            get: registry.service,
            names: registry.serviceNames
        },

        records: {
            dataOf: getRecordData,
            setField: setField,
            drop: dropModuleData,
            allKeys: allRecordKeys
        },

        settings: {
            get: getModuleSettings,
            set: function (modId, patch) {
                const box = {};
                box[modId] = patch || {};
                return setSettings({ mods: box });
            },
            global: getSettings
        },

        sheet: {
            open: sheet.open,
            close: sheet.close,
            isOpen: sheet.isOpen,
            onClose: sheet.onClose,
            onStateChange: sheet.onStateChange,
            body: sheet.body,
            foot: sheet.foot
        },

        charts: {
            block: chartBlock,
            render: renderChart,
            ranges: RANGES,
            rangeById: rangeById
        },

        ui: {
            renderFields: renderFields,
            summarize: summarize,
            markdownLines: markdownLines,
            metricsFromFields: metricsFromFields,
            hasValue: hasValue,
            sameValue: sameValue,
            fieldByKey: fieldByKey,
            fieldTypes: FIELD_TYPES
        },

        download: downloadMarkdown,
        copy: copyText
    };
}

let facade = null;

export function installGlobal() {
    facade = buildFacade();
    try {
        Object.defineProperty(globalThis, 'ellipse', {
            value: facade,
            writable: false,
            configurable: false,
            enumerable: false
        });
    } catch (err) {
        globalThis.ellipse = facade;
    }
    return facade;
}

export function getFacade() { return facade; }
