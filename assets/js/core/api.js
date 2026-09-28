/* 交给 mod 的 API 门面 —— 模块能看到的全部能力都在这里，别的地方不要去碰。

   模块文件统一写成：
       ellipse.define({ apiVersion: 1, id: 'weight', ... });
   这一种写法在「浏览器直接 import」和「退回 new Function」两条装载路径上都是合法代码，
   所以一份模块文件两种环境都能跑，文档和示例也只需要一套。 */

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

/* app.js 装配时补上的一个钩子：数据变了，重画记录页 */
let refreshHook = function () {};

export function install(capabilities) {
    const c = capabilities || {};
    if (typeof c.refresh === 'function') refreshHook = c.refresh;
}

/* ---------------- define 与「先接住、确认无误再注册」 ---------------- */

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

/**
 * 求值一段（可能调用 define 的）代码，先接住它的定义，不直接注册。
 * 装模块前用它：先拿到 id/名字给您确认，再决定要不要真的装。
 */
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

/**
 * 临时切换「来源」上下文（装载器用：内置还是自制、源码是什么）。
 * 在这段代码里发生的 define 调用都带上这份来源信息。
 */
export async function withContext(ctx, run) {
    const prev = context;
    context = Object.assign({ builtin: true }, ctx || {});
    try { return await run(); } finally { context = prev; }
}

/** 注册内置模块时把来源标成内置 */
export function withBuiltinContext(run) {
    return withContext({ builtin: true }, run);
}

/* ---------------- 门面 ---------------- */

function buildFacade() {
    return {
        apiVersion: CORE_API_VERSION,
        define: define,

        /* 通用小工具 */
        icon: icon,
        icons: ICONS,
        escapeHtml: escapeHtml,
        fmtNum: fmtNum,
        debounce: debounce,
        toast: toast,

        /* 数据变了，重画记录页（模块写完自己的数据后调用） */
        refresh: function () { refreshHook(); },

        /* 只读查询：有哪些模块、开了没、按什么顺序 */
        registry: {
            get: registry.get,
            all: registry.all,
            ids: registry.ids,
            has: registry.has,
            isEnabled: registry.isEnabled,
            cardOrder: registry.cardOrder,
            enabledOrder: registry.enabledOrder,
            chartModules: registry.chartModules,
            tools: registry.tools,
            tool: registry.tool,
            settingsSections: registry.settingsSections,
            secretFields: registry.secretFields
        },

        /* 取用别的模块提供的能力，比如 api.services.get('ai') */
        services: {
            get: registry.service,
            names: registry.serviceNames
        },

        /* 记录读写 */
        records: {
            dataOf: getRecordData,
            setField: setField,
            drop: dropModuleData,
            allKeys: allRecordKeys
        },

        /* 这个模块自己的配置（存在 settings.mods[模块id] 下） */
        settings: {
            get: getModuleSettings,
            set: function (modId, patch) {
                const box = {};
                box[modId] = patch || {};
                return setSettings({ mods: box });
            },
            global: getSettings
        },

        /* 底部面板 */
        sheet: {
            open: sheet.open,
            close: sheet.close,
            isOpen: sheet.isOpen,
            onClose: sheet.onClose,
            onStateChange: sheet.onStateChange,
            body: sheet.body,
            foot: sheet.foot
        },

        /* 波状图 */
        charts: {
            block: chartBlock,
            render: renderChart,
            ranges: RANGES,
            rangeById: rangeById
        },

        /* 自己拼表单时用的控件工具包（声明式字段背后就是它们） */
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

        /* 下载与复制 */
        download: downloadMarkdown,
        copy: copyText
    };
}

let facade = null;

/** 把 ellipse 钉到全局，之后内置模块文件才 import 得进来 */
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
        /* 极少数环境不让定义全局属性，退而求其次 */
        globalThis.ellipse = facade;
    }
    return facade;
}

export function getFacade() { return facade; }
