/* ellipse · 日常状态记录 —— 入口与编排

   这一层只做「外壳」该做的事：页面与日期、卡片骨架、设置面板骨架、键盘与手势、PWA。
   它不认识「情绪」「睡眠」「AI 助手」——那些全在 assets/js/modules/ 里，
   和用户自己导入的模块走同一套契约（core/registry.js）。

   启动顺序是刻意的：外壳先渲染出来，模块的求值推迟到首屏之后。
   这样即使某个模块坏掉，设置页在你需要它的时候也一定打得开。 */

import { icon } from './icons.js';
import {
    todayKey, shiftKey, displayKey, relativeLabel, weekdayCN, cnKey,
    toast, debounce, escapeHtml
} from './util.js';
import {
    getSettings, setSettings, getRecordData, setField,
    subscribe as subscribeStorage, allRecordKeys, importAll, clearRecords,
    exportAll
} from './storage.js';
import {
    dayMarkdown, rangeMarkdown, allMarkdown, downloadMarkdown,
    copyText, suggestFilename
} from './export.js';
import { renderFields, summarize, fieldByKey } from './core/fields.js';
import * as registry from './core/registry.js';
import * as sheet from './core/sheet.js';
import { installGlobal, install } from './core/api.js';
import {
    loadBuiltins, loadInstalled, previewSource, installSource,
    uninstallMod, exportSource, disableAllCustom
} from './core/loader.js';

/* mod 契约的唯一入口：装到全局的 ellipse，也是模块拿到的那份 api */
const api = installGlobal();

/* 整页模块没自己写底注时，用这一句兜底（模块写了 def.note 就用它的） */
const DEFAULT_PAGE_NOTE = '这一页只读，不会改动任何记录';

/* ---------------- 状态 ---------------- */

const state = {
    page: 'home',                 // 'home' | 'record' | 页面型模块的 id（如 'trend'）
    key: todayKey(),
    openModule: null,             // 展开的那条记录型模块（同时只开一条）
    settingsOpen: false,
    installPrompt: null,          // 浏览器给的安装事件，只在本次会话有效，用完即弃
    booted: false                 // 模块装载完之前，别把地址里的深链接当成失效
};

const el = {
    viewHome: document.getElementById('viewHome'),
    viewRecord: document.getElementById('viewRecord'),
    viewPage: document.getElementById('viewPage'),
    pageTitle: document.getElementById('pageTitle'),
    pageBody: document.getElementById('pageBody'),
    pageNote: document.getElementById('pageNote'),
    stack: document.getElementById('moduleStack'),
    exportZone: document.getElementById('exportZone'),
    rail: document.getElementById('rail'),
    backHomeBtn: document.getElementById('backHomeBtn'),
    dateNum: document.getElementById('dateNum'),
    dateSub: document.getElementById('dateSub'),
    datePrev: document.getElementById('datePrev'),
    dateNext: document.getElementById('dateNext'),
    dateToday: document.getElementById('dateToday'),
    dateInput: document.getElementById('dateInput'),
    settingsBtn: document.getElementById('settingsBtn'),
    settingsPanel: document.getElementById('settingsPanel'),
    settingsScrim: document.getElementById('settingsScrim'),
    settingsClose: document.getElementById('settingsClose'),
    settingsBody: document.getElementById('settingsBody')
};

function msg(err) { return String((err && err.message) || err); }

/* ---------------- 面板与设置的开关状态 ---------------- */

/* 底部面板由 core/sheet.js 管；这里只在它开关时同步页面上的按钮与滚动锁。
   面板里按钮的派发器在文件下方接上（dispatchSheetAction）。 */
sheet.onStateChange(syncOverlays);

function syncOverlays() {
    const sheetOpen = sheet.isOpen();
    const panelOpen = el.settingsPanel.classList.contains('open');

    /* 右上角按钮：平时是「返回主页」；面板打开时收起，免得挡住面板自己的关闭按钮 */
    el.backHomeBtn.hidden = sheetOpen || state.page === 'home';
    el.backHomeBtn.setAttribute('aria-label', '返回主页');
    el.backHomeBtn.setAttribute('title', '返回主页');
    el.backHomeBtn.innerHTML = icon('back');

    if (sheetOpen || panelOpen) document.body.classList.add('is-locked');
    else document.body.classList.remove('is-locked');
}

function closeTopOverlay() {
    if (sheet.isOpen()) { sheet.close(); return true; }
    if (el.settingsPanel.classList.contains('open')) { closeSettings(); return true; }
    return false;
}

/* ---------------- 地址里的页面 ----------------
   主页 #home、记录页 #record、模块自己的页面 #page/<模块 id>。
   #page/ 这层前缀是必要的：模块 id 允许叫 record 或 home（见 validate.js 的 ID_RE），
   裸写成 #<id> 会和这两种页面撞名。 */
function hashForPage(page) {
    if (page === 'record' || page === 'home') return '#' + page;
    return '#page/' + page;
}

function pageFromHash(hash) {
    if (hash === '#record') return 'record';
    if (hash.indexOf('#page/') === 0) return hash.slice('#page/'.length);
    return 'home';
}

/* 先读地址、再规范化 —— 这个先后顺序是必须的。
   旧版把 replaceState('#home') 写在读 hash 之前，于是等后面读到的时候
   地址早被冲成 #home 了，index.html#record 从来就进不去记录页。 */
const startPage = pageFromHash(location.hash);
history.replaceState({ ellipse: startPage }, '', hashForPage(startPage));

window.addEventListener('popstate', function (evt) {
    if (closeTopOverlay()) return;
    const st = evt.state;
    setPage(st && st.ellipse ? st.ellipse : 'home');
});

/* ---------------- 渲染：日期 ---------------- */

function renderHead() {
    const key = state.key;
    el.dateNum.textContent = displayKey(key);
    el.dateSub.textContent = weekdayCN(key) + ' · ' + relativeLabel(key);
    el.dateToday.hidden = key === todayKey();
    el.dateNext.disabled = key >= todayKey();
    el.dateInput.value = key;
}

/* ---------------- 渲染：模块卡片 ----------------
   卡片长什么样由模块的定义决定：记录型用 fields 自动生成表单，
   面板型自己 mount 一整块内容。这里只负责骨架与容错。 */

function cardOpen(def) {
    if (def.kind === 'panel') return panelOpen(def);
    return state.openModule === def.id;
}

/** 面板型的展开状态各记各的（波状图栏默认展开，不受记录模块影响） */
function panelOpen(def) {
    const panels = getSettings().ui.panels || {};
    if (panels[def.id] !== undefined) return panels[def.id] !== false;
    return def.defaultOpen !== false;
}

function setPanelOpen(def, open) {
    const panels = Object.assign({}, getSettings().ui.panels || {});
    panels[def.id] = open;
    setSettings({ ui: { panels: panels } });
}

function cardHead(def, open) {
    return '<header class="module-head" data-act="toggle">' +
        '<span class="module-mark">' + icon(def.icon) + '</span>' +
        '<h2 class="module-name">' + escapeHtml(def.name) + '</h2>' +
        '<span class="module-spacer"></span>' +
        '<button class="module-toggle" type="button" data-act="toggle" aria-expanded="' + (open ? 'true' : 'false') + '" ' +
        'aria-label="展开或收起' + escapeHtml(def.name) + '">' + icon('chevron') + '</button>' +
        '</header>';
}

/** 出错时的那一张卡：只坏这一栏，别的模块照常 */
function errorCard(def, reason) {
    const card = document.createElement('article');
    card.className = 'module module--error';
    card.dataset.module = def.id;
    card.innerHTML = cardHead(def, true) +
        '<div class="module-body">' +
        '<p class="empty-note">这一栏没能画出来：' + escapeHtml(reason) + '</p>' +
        '</div>';
    return card;
}

function moduleCard(def) {
    let open = false;
    let preview = '';
    let bodyHtml = '';
    try {
        open = cardOpen(def);
        preview = def.kind === 'panel'
            ? (def.desc || '')
            : (summarize(def.fields, getRecordData(state.key)[def.id] || {}) || def.desc || '');
        if (def.kind !== 'panel') {
            bodyHtml = renderFields(def.fields, getRecordData(state.key)[def.id] || {}, { tool: registry.tool });
        }
    } catch (err) {
        console.error('[ellipse] 模块「' + def.id + '」渲染出错：', err);
        return errorCard(def, msg(err));
    }

    const card = document.createElement('article');
    card.className = 'module' + (open ? ' is-open' : '');
    card.dataset.module = def.id;
    card.dataset.kind = def.kind;
    card.innerHTML = cardHead(def, open) +
        (open ? '' : '<p class="module-preview">' + escapeHtml(preview) + '</p>') +
        '<div class="module-body"></div>';

    const body = card.querySelector('.module-body');
    if (def.kind === 'panel' && typeof def.mount === 'function') {
        try {
            def.mount(body, { api: api, date: state.key, module: def });
        } catch (err) {
            console.error('[ellipse] 模块「' + def.id + '」的画布渲染出错：', err);
            body.innerHTML = '<p class="empty-note">这一栏画不出来：' + escapeHtml(msg(err)) + '</p>';
            card.classList.add('module--error');
        }
    } else {
        body.innerHTML = bodyHtml;
    }
    return card;
}

function renderStack() {
    el.stack.innerHTML = '';
    registry.cardOrder().forEach(function (id) {
        const def = registry.get(id);
        if (def) el.stack.appendChild(moduleCard(def));
    });
    if (!el.stack.children.length) {
        el.stack.innerHTML = '<p class="empty-note">所有模块都已关闭，去「设置 · 模块」重新打开。</p>';
    }
}

function renderExport() {
    const chars = dayMarkdown(state.key).length;
    const signature = state.key + '|' + chars;
    /* 内容没变就不重建节点：否则输入 / 点击触发的重渲染会把正在按的按钮换掉 */
    if (el.exportZone.dataset.signature === signature) return;
    el.exportZone.dataset.signature = signature;
    el.exportZone.innerHTML =
        '<button class="export-card" type="button" data-act="export-day">' +
        '<span class="export-mark">' + icon('download') + '</span>' +
        '<span class="export-text">' +
        '<span class="export-title">导出今天的记录</span>' +
        '<span class="export-sub">' + suggestFilename('day', state.key) + ' · 约 ' + chars + ' 字</span>' +
        '</span>' +
        '</button>';
}

/* 竖栏：上面是每个「页面型」模块自己的入口，最底下永远是「状态记录」。
   .rail 是 bottom 锚定的纵向 flex，所以先写进去的排在更上面 —— 顺序就是这里决定的。
   一个页面型模块都没开时，竖栏只剩「状态记录」，和以前一样。 */
function renderRail() {
    el.rail.className = 'rail rail--home';
    el.rail.hidden = state.page !== 'home';

    let htmlText = '';
    registry.pageModules().forEach(function (id) {
        const def = registry.get(id);
        if (!def) return;
        htmlText += '<button class="rail-item" type="button" data-rail-page="' + escapeHtml(id) + '" ' +
            'aria-label="' + escapeHtml(def.name) + '" title="' + escapeHtml(def.name) + '">' +
            icon(def.icon) + '</button>';
    });
    htmlText += '<button class="rail-item" type="button" data-act="record" ' +
        'aria-label="状态记录" title="状态记录">' + icon('log') + '</button>';
    el.rail.innerHTML = htmlText;
}

/* 整页模块：内容来源与记录页的卡片一样，都是模块自己 mount 一整块。
   只是这里没有卡片外壳，也不需要展开/收起。 */
function renderPage() {
    const def = registry.get(state.page);
    if (!def) return;
    el.pageTitle.textContent = def.name;
    /* 底注由模块自己写（def.note），没写就用外壳的默认句 */
    el.pageNote.textContent = def.note || DEFAULT_PAGE_NOTE;
    el.pageBody.dataset.module = def.id;
    el.pageBody.innerHTML = '';
    if (typeof def.mount !== 'function') return;
    try {
        def.mount(el.pageBody, { api: api, date: state.key, module: def });
    } catch (err) {
        console.error('[ellipse] 模块页「' + def.id + '」渲染出错：', err);
        el.pageBody.innerHTML = '<p class="empty-note">这个页面画不出来：' + escapeHtml(msg(err)) + '</p>';
    }
}

function render() {
    /* 站在某个模块页上，而它被关掉或卸载了：退回主页。
       模块装载完之前（state.booted 还是 false）先不判，免得把深链接当成失效。 */
    if (state.booted && state.page !== 'home' && state.page !== 'record') {
        const def = registry.get(state.page);
        if (!def || def.kind !== 'page' || !registry.isEnabled(state.page)) {
            history.replaceState({ ellipse: 'home' }, '', '#home');
            state.page = 'home';
        }
    }

    const page = state.page;
    const home = page === 'home';
    const record = page === 'record';

    el.viewHome.hidden = !home;
    el.viewRecord.hidden = !record;
    el.viewPage.hidden = home || record;
    el.settingsBtn.hidden = !home;       /* 设置只在主页 */

    if (home) {
        /* 回到主页时收掉导出面板，避免盖住主页 */
        if (sheet.isOpen()) sheet.close();
    } else if (record) {
        renderHead();
        renderStack();
        renderExport();
    } else {
        renderPage();
    }
    renderRail();
    syncOverlays();
}

/* 模块写完自己的数据后调 api.refresh()，走的就是这里 */
install({
    refresh: function () {
        renderStack();
        renderExport();
        if (state.page !== 'home' && state.page !== 'record') renderPage();
    }
});

/* ---------------- 页面切换：主页 / 记录页 / 模块自己的页面 ---------------- */

function viewForPage(page) {
    if (page === 'record') return el.viewRecord;
    if (page === 'home') return el.viewHome;
    return el.viewPage;
}

function setPage(page) {
    const next = page || 'home';
    const changed = next !== state.page;
    state.page = next;

    const view = viewForPage(next);
    if (changed) {
        view.classList.remove('fade-in');
        void view.offsetWidth;            /* 重排一次，让动画能重复触发 */
        view.classList.add('fade-in');
    }
    render();
}

function pushPage(page) {
    history.pushState({ ellipse: page }, '', hashForPage(page));
    setPage(page);
}

/* ---------------- 卡片交互 ---------------- */

function saveText(key, moduleId, field, value) {
    setField(key, moduleId, field, value.trim() ? value : null);
}

const saveDebounced = debounce(function (key, moduleId, field, value) {
    saveText(key, moduleId, field, value);
}, 420);

/** 把一个 data-act 按钮派发给认领它的模块。记录页的卡片与整页模块共用这一段。 */
function dispatchModuleAction(evt, def, card) {
    const actEl = evt.target.closest('[data-act]');
    if (!actEl) return false;

    const name = actEl.getAttribute('data-act');
    /* 展开 / 收起和字段旁的小工具按钮都是记录页卡片才有的东西。
       整页模块里没有卡片可翻，写错了就当没写 —— 否则会去动背后那张隐藏的卡片 */
    if (name === 'toggle') { if (registry.isCard(def.id)) toggleCard(def); return true; }
    if (name === 'tool') { if (registry.isCard(def.id)) runTool(def, actEl); return true; }

    const handler = registry.action(name);
    if (typeof handler === 'function') {
        try {
            handler({ api: api, def: def, date: state.key, target: actEl, card: card });
        } catch (err) {
            console.error('[ellipse] 动作「' + name + '」出错：', err);
            toast('操作失败：' + msg(err).slice(0, 40));
        }
        return true;
    }
    console.warn('[ellipse] 没有模块认领这个按钮：' + name);
    return true;
}

function handleStackClick(evt) {
    const card = evt.target.closest('.module');
    if (!card) return;
    const def = registry.get(card.dataset.module);
    if (!def) return;

    if (dispatchModuleAction(evt, def, card)) return;

    const ctrl = evt.target.closest('[data-field]');
    if (ctrl) handleValueClick(def, ctrl);
}

/* 整页模块里没有 .module 外壳，模块 id 直接从 state.page 拿。
   card 只是为了让 ctx 的形状与卡片那条完全一致。 */
function handlePageClick(evt) {
    const def = registry.get(state.page);
    if (!def) return;
    dispatchModuleAction(evt, def, el.pageBody);
}

function toggleCard(def) {
    const open = cardOpen(def);
    if (def.kind === 'panel') {
        setPanelOpen(def, !open);
    } else {
        state.openModule = open ? null : def.id;
        setSettings({ ui: { openModule: state.openModule } });
    }
    renderStack();
}

/** 点一下就存的值控件。规则与改造前逐条一致：
    评分格与二选一点第二次取消，快捷数字按钮只写不清。 */
function handleValueClick(def, ctrl) {
    const field = ctrl.getAttribute('data-field');
    const type = ctrl.getAttribute('data-type');
    const current = getRecordData(state.key)[def.id] || {};
    const raw = ctrl.getAttribute('data-value');

    if (type === 'scale') {
        const value = Number(raw);
        setField(state.key, def.id, field, current[field] === value ? null : value);
        renderStack();
        return;
    }
    if (type === 'chip') {
        setField(state.key, def.id, field, Number(raw));
        renderStack();
        return;
    }
    if (type === 'enum') {
        const value = raw === 'true' ? true : raw === 'false' ? false : raw;
        const same = String(current[field]) === String(value);
        setField(state.key, def.id, field, same ? null : value);
        renderStack();
    }
}

/** 滑动变阻器：拖动中只改滑片位置与数值文字。
    这里不能 renderStack：重建卡片会把正在拖的那个 input 换掉，手势随即中断 */
function sliderVisual(card, input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const value = Number(input.value);
    if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return;
    const wrap = input.closest('.rheostat');
    if (wrap && max > min) {
        wrap.style.setProperty('--fill', ((value - min) / (max - min)) * 100 + '%');
    }
    input.setAttribute('aria-valuetext', value + ' 分');
    const shown = findByAttr(card, '[data-value-of]', 'valueOf', input.dataset.field);
    if (shown) shown.textContent = value + ' / ' + max;
}

/* 字段 key 是模块作者起的，直接拼进选择器会被引号之类的字符弄坏，所以按属性逐个比对 */
function findByAttr(root, selector, prop, value) {
    const list = root.querySelectorAll(selector);
    for (let i = 0; i < list.length; i++) {
        if (list[i].dataset[prop] === value) return list[i];
    }
    return null;
}

function handleStackInput(evt) {
    const target = evt.target;
    if (!target.dataset || !target.dataset.field) return;
    const card = target.closest('.module');
    if (!card) return;
    const def = registry.get(card.dataset.module);
    if (!def) return;
    const field = target.dataset.field;
    const type = target.dataset.type;

    if (type === 'slider') { sliderVisual(card, target); return; }

    if (type === 'textarea' || type === 'text') {
        saveDebounced(state.key, def.id, field, target.value);
        const counter = findByAttr(card, '[data-count]', 'count', field);
        if (counter) counter.textContent = target.value.length + ' 字';
        return;
    }
    if (type === 'number') {
        const raw = target.value.trim();
        const value = raw === '' ? null : Number(raw);
        if (value !== null && !Number.isFinite(value)) return;
        setField(state.key, def.id, field, value);
    }
}

/* 滑动变阻器松手时才写入，一次拖动只落盘一次 */
function handleSliderCommit(evt) {
    const target = evt.target;
    if (!target.dataset || target.dataset.type !== 'slider') return;
    const card = target.closest('.module');
    if (!card) return;
    const value = Number(target.value);
    if (!Number.isFinite(value)) return;
    setField(state.key, card.dataset.module, target.dataset.field, value);
}

/** 字段旁边的工具按钮（如「整理成日记」）：功能由提供它的模块实现 */
function runTool(def, btn) {
    const toolId = btn.getAttribute('data-tool');
    const field = btn.getAttribute('data-field');
    const tool = registry.tool(toolId);
    if (!tool || typeof tool.run !== 'function') return;

    const data = getRecordData(state.key)[def.id] || {};
    tool.run({
        api: api,
        date: state.key,
        moduleId: def.id,
        module: def,
        field: field,
        fieldDef: fieldByKey(def.fields, field),
        value: data[field],
        target: btn,
        setValue: function (text) {
            saveText(state.key, def.id, field, String(text === null || text === undefined ? '' : text));
            renderStack();
        }
    });
}

/* ---------------- 底部面板内容 ---------------- */

function openExportSheet() {
    const md = dayMarkdown(state.key);
    sheet.open('导出为 Markdown',
        '<pre class="md-preview">' + escapeForPre(md) + '</pre>' +
        '<p class="sheet-note">文件名 <b>' + escapeHtml(suggestFilename('day', state.key)) + '</b>，' +
        '可直接放入 Obsidian 库。</p>',
        '<button class="btn" type="button" data-action="copy" data-kind="day">复制</button>' +
        '<button class="btn primary" type="button" data-action="download" data-kind="day">下载 md</button>' +
        '<button class="btn" type="button" data-action="all">全部记录</button>');
}

function openExportAllSheet() {
    const md = allMarkdown();
    sheet.open('全部记录',
        '<pre class="md-preview">' + escapeForPre(md) + '</pre>' +
        '<p class="sheet-note">共 ' + allRecordKeys().length + ' 天记录，导出为一份 md。</p>',
        '<button class="btn" type="button" data-action="copy" data-kind="all">复制</button>' +
        '<button class="btn primary" type="button" data-action="download" data-kind="all">下载 md</button>');
}

function escapeForPre(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function currentSheetMarkdown(kind) {
    return kind === 'all' ? allMarkdown() : dayMarkdown(state.key);
}

function openDateSheet() {
    const keys = allRecordKeys();
    const recent = keys.slice(-14).reverse();
    const list = recent.length
        ? recent.map(function (k) {
            return '<button class="pick-item" type="button" data-action="pick" data-date="' + k + '">' +
                '<span>' + cnKey(k) + '</span><span class="pick-meta">' + weekdayCN(k) + '</span></button>';
        }).join('')
        : '<p class="empty-note">还没有任何记录</p>';
    sheet.open('跳到有记录的日期', '<div class="pick-list">' + list + '</div>', '');
}

/* ---------------- 面板里的按钮：总派发 ---------------- */

let pendingImport = null;     /* 已解析、等用户选合并还是覆盖的备份 */
let pendingMod = null;        /* 已试求值、等用户确认的模块源码 */

function dispatchSheetAction(name, target) {
    const kind = (target && target.getAttribute('data-kind')) || 'day';

    /* 核心自己认得的动作 */
    if (name === 'copy') {
        copyText(currentSheetMarkdown(kind)).then(function (ok) {
            toast(ok ? '已复制到剪贴板' : '复制失败，可长按选择');
        });
        return;
    }
    if (name === 'download') {
        downloadMarkdown(currentSheetMarkdown(kind), suggestFilename(kind, state.key));
        toast('已开始下载');
        return;
    }
    if (name === 'all') { openExportAllSheet(); return; }
    if (name === 'pick') {
        state.key = target.getAttribute('data-date');
        sheet.close();
        render();
        return;
    }
    if (name === 'wipe-cancel' || name === 'mod-cancel') { sheet.close(); return; }

    if (name === 'wipe-confirm') {
        clearRecords();
        sheet.close();
        renderSettings();
        render();
        toast('已清空本机记录');
        return;
    }

    if (name === 'import-merge' || name === 'import-replace') {
        try {
            importAll(pendingImport, name === 'import-replace' ? 'replace' : 'merge');
            pendingImport = null;
            sheet.close();
            renderSettings();
            render();
            toast('导入完成');
        } catch (err) {
            toast('导入失败：' + msg(err).slice(0, 30));
        }
        return;
    }

    if (name === 'mod-install') { confirmInstallMod(target); return; }

    if (name === 'uninstall-keep') { finishUninstall(target.getAttribute('data-id'), false); return; }
    if (name === 'uninstall-drop') { finishUninstall(target.getAttribute('data-id'), true); return; }

    /* 剩下的交给模块注册的动作（比如 AI 助手的 ai-run） */
    const handler = registry.action(name);
    if (typeof handler === 'function') {
        try {
            handler({ api: api, target: target, sheet: sheet });
        } catch (err) {
            console.error('[ellipse] 面板动作「' + name + '」出错：', err);
            toast('操作失败：' + msg(err).slice(0, 40));
        }
    }
    /* 没人认领就安静放过：面板里的输入控件自己挂着自己的监听 */
}

document.getElementById('sheetClose').addEventListener('click', function () { sheet.close(); });

/* ---------------- 日期交互 ---------------- */

el.datePrev.addEventListener('click', function () { goDate(shiftKey(state.key, -1)); });
el.dateNext.addEventListener('click', function () {
    const next = shiftKey(state.key, 1);
    if (next > todayKey()) return;
    goDate(next);
});
el.dateToday.addEventListener('click', function () { goDate(todayKey()); });
el.dateInput.addEventListener('change', function () {
    if (el.dateInput.value) goDate(el.dateInput.value);
});
document.getElementById('dateCurrent').addEventListener('click', openDateSheet);

function goDate(key) {
    state.key = key > todayKey() ? todayKey() : key;
    render();
}

/* 左右滑动切换日期 */
(function attachSwipe() {
    let sx = 0, sy = 0, active = false;
    el.viewRecord.addEventListener('touchstart', function (evt) {
        if (evt.touches.length !== 1) return;
        if (evt.target.closest('input, textarea, .scale, .seg')) { active = false; return; }
        sx = evt.touches[0].clientX;
        sy = evt.touches[0].clientY;
        active = true;
    }, { passive: true });
    el.viewRecord.addEventListener('touchend', function (evt) {
        if (!active) return;
        active = false;
        const t = evt.changedTouches[0];
        const dx = t.clientX - sx;
        const dy = t.clientY - sy;
        if (Math.abs(dx) < 62 || Math.abs(dy) > 52) return;
        goDate(shiftKey(state.key, dx < 0 ? 1 : -1));
    }, { passive: true });
})();

/* ---------------- 右侧栏与导出区 ---------------- */

el.rail.addEventListener('click', function (evt) {
    const btn = evt.target.closest('button');
    if (!btn) return;
    if (btn.getAttribute('data-act') === 'record') { pushPage('record'); return; }
    const page = btn.getAttribute('data-rail-page');
    if (page) pushPage(page);
});

el.pageBody.addEventListener('click', handlePageClick);

el.exportZone.addEventListener('click', function (evt) {
    if (evt.target.closest('[data-act="export-day"]')) openExportSheet();
});
el.stack.addEventListener('click', handleStackClick);
el.stack.addEventListener('input', handleStackInput);
el.stack.addEventListener('change', handleSliderCommit);

/* ---------------- 设置面板 ---------------- */

function openSettings() {
    renderSettings();
    el.settingsPanel.classList.add('open');
    el.settingsPanel.setAttribute('aria-hidden', 'false');
    el.settingsBtn.setAttribute('aria-expanded', 'true');
    state.settingsOpen = true;
    syncOverlays();
}

function closeSettings() {
    el.settingsPanel.classList.remove('open');
    el.settingsPanel.setAttribute('aria-hidden', 'true');
    el.settingsBtn.setAttribute('aria-expanded', 'false');
    state.settingsOpen = false;
    syncOverlays();
    render();
}

el.settingsBtn.addEventListener('click', function () {
    if (el.settingsPanel.classList.contains('open')) closeSettings();
    else openSettings();
});
el.settingsClose.addEventListener('click', closeSettings);
el.settingsScrim.addEventListener('click', closeSettings);

/* ---------------- 设置面板：分组骨架 ---------------- */

function group(title, note) {
    const box = document.createElement('section');
    box.className = 'set-group';
    const head = document.createElement('div');
    head.className = 'set-group-head';
    head.innerHTML = '<h3 class="set-group-title">' + escapeHtml(title) + '</h3>' +
        (note ? '<span class="set-group-note">' + escapeHtml(note) + '</span>' : '');
    box.appendChild(head);
    return box;
}

function html(htmlText) {
    const box = document.createElement('div');
    box.innerHTML = htmlText;
    return box;
}

/**
 * 由模块贡献的设置分区。模块自己给 HTML，自己挂事件，
 * 核心只负责把它放进列表里 —— 关掉模块，分区跟着消失。
 */
function moduleSection(sec) {
    const box = group(sec.title, sec.note);
    box.dataset.section = sec.id;
    const root = document.createElement('div');
    try {
        root.innerHTML = typeof sec.html === 'function'
            ? String(sec.html({ api: api, rerender: renderSettings }) || '')
            : '';
    } catch (err) {
        console.error('[ellipse] 设置分区「' + sec.id + '」渲染出错：', err);
        root.innerHTML = '<p class="empty-note">这个分区没能画出来：' + escapeHtml(msg(err)) + '</p>';
    }
    box.appendChild(root);
    if (typeof sec.bind === 'function') {
        try {
            sec.bind(root, { api: api, rerender: renderSettings });
        } catch (err) {
            console.error('[ellipse] 设置分区「' + sec.id + '」绑定出错：', err);
        }
    }
    return box;
}

/* ---------------- 设置面板：模块分组 ---------------- */

const CUSTOM_BADGE = '<em class="set-badge">自装</em>';

function moduleRow(def, first, last) {
    const on = registry.isEnabled(def.id);
    const isCard = registry.isCard(def.id);
    const row = document.createElement('div');
    row.className = 'set-row';
    row.dataset.moduleRow = def.id;
    row.innerHTML =
        '<span class="module-mark">' + icon(def.icon) + '</span>' +
        '<span class="set-row-main">' +
        '<span class="set-row-title">' + escapeHtml(def.name) + (def.builtin ? '' : CUSTOM_BADGE) + '</span>' +
        '<span class="set-row-desc">' + escapeHtml(def.desc || '') +
        (isCard ? '' : (def.kind === 'page' ? '；入口在主页右侧栏' : '；不占记录页的位置')) + '</span>' +
        '<span class="set-row-tools">' +
        '<button class="btn" type="button" data-export-mod="' + def.id + '">导出源码</button>' +
        (def.builtin ? '' : '<button class="btn danger" type="button" data-uninstall="' + def.id + '">卸载</button>') +
        '</span>' +
        '</span>' +
        '<span class="set-row-side">' +
        (isCard
            ? '<button class="order-btn" type="button" data-order="' + def.id + '" data-dir="-1" ' +
              'aria-label="上移' + escapeHtml(def.name) + '"' + (first ? ' disabled' : '') + '>' + icon('up') + '</button>' +
              '<button class="order-btn" type="button" data-order="' + def.id + '" data-dir="1" ' +
              'aria-label="下移' + escapeHtml(def.name) + '"' + (last ? ' disabled' : '') + '>' + icon('down') + '</button>'
            : '') +
        '<button class="switch' + (on ? ' on' : '') + '" type="button" role="switch" ' +
        'aria-checked="' + (on ? 'true' : 'false') + '" aria-label="开启或关闭' + escapeHtml(def.name) + '" ' +
        'data-toggle="' + def.id + '"></button>' +
        '</span>';
    return row;
}

function problemRow(p) {
    const row = document.createElement('div');
    row.className = 'set-row';
    row.dataset.problemRow = p.id;
    row.innerHTML =
        '<span class="module-mark">' + icon('chart') + '</span>' +
        '<span class="set-row-main">' +
        '<span class="set-row-title">' + escapeHtml(p.name) + CUSTOM_BADGE + '</span>' +
        '<span class="set-row-desc">装载失败：' + escapeHtml(p.reason) + '</span>' +
        '</span>' +
        '<span class="set-row-side">' +
        '<button class="btn danger" type="button" data-drop-problem="' + escapeHtml(p.id) + '">移除</button>' +
        '</span>';
    return row;
}

function modulesGroup() {
    const cards = registry.orderedIds().filter(function (id) { return registry.isCard(id); });
    const enabled = cards.filter(registry.isEnabled);
    const firstId = enabled[0] || null;
    const lastId = enabled[enabled.length - 1] || null;

    const box = group('模块', registry.enabledCount() + ' / ' + registry.all().length + ' 已开启');
    box.appendChild(html(
        '<div class="set-actions">' +
        '<button class="btn primary" type="button" data-set="import-mod">导入模块</button>' +
        '<button class="btn" type="button" data-set="disable-custom">停用全部自装模块</button>' +
        '<input type="file" accept=".js,text/javascript" id="modFile" hidden>' +
        '</div>'));

    registry.manageList().forEach(function (def) {
        box.appendChild(moduleRow(def, def.id === firstId, def.id === lastId));
    });

    registry.problems().forEach(function (p) {
        box.appendChild(problemRow(p));
    });

    box.appendChild(html('<p class="sheet-note">关掉模块不会删掉它的数据；' +
        '卸载自装模块只移走代码，记录同样保留。' +
        '装进来的模块是一段能在本机运行的代码，只装你信得过的文件。</p>'));
    return box;
}

/* ---------------- 设置面板：数据分组 ---------------- */

function dataGroup() {
    const box = group('数据', allRecordKeys().length + ' 天记录');
    box.appendChild(html(
        '<div class="set-actions">' +
        '<button class="btn" type="button" data-set="export-day">导出今天 md</button>' +
        '<button class="btn" type="button" data-set="export-all">导出全部 md</button>' +
        '<button class="btn" type="button" data-set="export-range">导出区间汇总 md</button>' +
        '<button class="btn" type="button" data-set="backup">备份 JSON</button>' +
        '<button class="btn" type="button" data-set="import">导入备份</button>' +
        '<input type="file" accept="application/json,.json" id="importFile" hidden>' +
        '</div>' +
        '<label class="set-check"><input type="checkbox" id="backupSecrets">' +
        '备份里带上 AI 密钥（默认不带，免得把备份发给别人时一起泄露）</label>' +
        '<div class="set-actions">' +
        '<button class="btn danger" type="button" data-set="wipe">清空全部记录</button>' +
        '</div>' +
        '<p class="sheet-note">记录保存在本机浏览器；清理浏览器数据会一并清空，建议定期备份。</p>'));
    return box;
}

/* ---------------- 设置面板：安装分组 ---------------- */

function installGroup() {
    const box = group('安装到主屏', isStandalone() ? '已装到主屏' : '未安装');
    box.appendChild(html(
        '<div class="set-row">' +
        '<span class="set-row-main">' +
        '<span class="set-row-title">当成一个 App 用</span>' +
        '<span class="set-row-desc">装到主屏后全屏打开、断网也能用</span>' +
        '</span>' +
        '</div>' +
        '<div class="set-actions">' +
        '<button class="btn primary" type="button" data-set="install"' +
        (state.installPrompt ? '' : ' disabled') + '>安装到主屏</button>' +
        '</div>' +
        '<p class="sheet-note" id="installNote">' + escapeHtml(installHintText()) + '</p>'));
    return box;
}

/* ---------------- 设置面板：组装 ---------------- */

function renderSettings() {
    el.settingsBody.innerHTML = '';
    el.settingsBody.appendChild(modulesGroup());
    registry.settingsSections().forEach(function (sec) {
        el.settingsBody.appendChild(moduleSection(sec));
    });
    el.settingsBody.appendChild(dataGroup());
    el.settingsBody.appendChild(installGroup());
}

el.settingsBody.addEventListener('click', function (evt) {
    const toggle = evt.target.closest('[data-toggle]');
    if (toggle) { toggleModule(toggle.getAttribute('data-toggle')); return; }

    const orderBtn = evt.target.closest('[data-order]');
    if (orderBtn) {
        registry.reorder(orderBtn.getAttribute('data-order'), Number(orderBtn.getAttribute('data-dir')));
        renderSettings();
        render();
        return;
    }

    const exportBtn = evt.target.closest('[data-export-mod]');
    if (exportBtn) { exportModule(exportBtn.getAttribute('data-export-mod'), exportBtn); return; }

    const uninstallBtn = evt.target.closest('[data-uninstall]');
    if (uninstallBtn) { askUninstall(uninstallBtn.getAttribute('data-uninstall')); return; }

    const dropBtn = evt.target.closest('[data-drop-problem]');
    if (dropBtn) {
        registry.dropProblem(dropBtn.getAttribute('data-drop-problem'));
        renderSettings();
        return;
    }

    const setBtn = evt.target.closest('[data-set]');
    if (setBtn) handleSettingAction(setBtn.getAttribute('data-set'), setBtn);
});

function toggleModule(id) {
    const def = registry.get(id);
    if (!def) return;
    const turningOn = !registry.isEnabled(id);
    /* 记录型模块至少要留一个（面板型与服务型不算） */
    if (!turningOn && def.kind === 'record' && registry.enabledOrder().length <= 1) {
        toast('至少保留一个记录模块');
        return;
    }
    const patch = {};
    patch[id] = turningOn;
    setSettings({ modules: patch });
    renderSettings();
    render();
}

/* ---------------- 模块文件：导入 / 导出 / 卸载 ---------------- */

el.settingsBody.addEventListener('change', function (evt) {
    if (evt.target.id === 'importFile') { readBackupFile(evt.target); return; }
    if (evt.target.id === 'modFile') { readModFile(evt.target); return; }
});

async function readModFile(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;

    let text = '';
    try {
        text = await file.text();
    } catch (err) {
        toast('读不出这个文件：' + msg(err).slice(0, 30));
        return;
    }

    const preview = await previewSource(text, file.name);
    if (!preview.ok) { toast('这个文件装不了：' + preview.error.slice(0, 60)); return; }

    const def = preview.def;
    pendingMod = { text: text, filename: file.name, def: def };

    sheet.open('导入模块',
        '<p class="sheet-note">' +
        '<b>' + escapeHtml(def.name) + '</b>（id <code>' + escapeHtml(def.id) + '</code>，' +
        '接口版本 ' + escapeHtml(String(def.apiVersion)) + '）' +
        '　来自 ' + escapeHtml(file.name) + '</p>' +
        '<p class="sheet-note">' + escapeHtml(def.desc || '（这个模块没有写说明）') + '</p>' +
        '<p class="sheet-note"><b>模块就是一段能在你浏览器里运行的代码</b>，' +
        '它能读到本机保存的全部记录，也能读到设置里的 AI 密钥。只装你自己写的、或者信得过来路的文件。</p>',
        '<button class="btn" type="button" data-action="mod-cancel">取消</button>' +
        '<button class="btn primary" type="button" data-action="mod-install">确认安装</button>');
}

async function confirmInstallMod() {
    const pending = pendingMod;
    if (!pending) return;
    pendingMod = null;
    sheet.close();

    const res = await installSource(pending.text, pending.filename, pending.def);
    if (!res.ok) { toast('装不上：' + res.error.slice(0, 50)); return; }
    renderSettings();
    render();
    toast('已装上「' + (pending.def.name || res.id) + '」');
}

async function exportModule(id, btn) {
    btn.disabled = true;
    const res = await exportSource(id);
    btn.disabled = false;
    if (!res.ok) { toast(res.error.slice(0, 50)); return; }
    downloadFile(res.text, res.filename, 'text/javascript');
    toast('已导出 ' + res.filename);
}

function askUninstall(id) {
    const def = registry.get(id);
    if (!def) return;
    sheet.open('卸载模块',
        '<p class="sheet-note">将从本机移走「' + escapeHtml(def.name) + '」的代码。' +
        '它记录的数据默认保留；下次装回同一个模块，顺序和开关也还在。</p>',
        '<button class="btn" type="button" data-action="uninstall-keep" data-id="' + escapeHtml(id) + '">只卸载</button>' +
        '<button class="btn danger" type="button" data-action="uninstall-drop" data-id="' + escapeHtml(id) + '">连数据一起删</button>');
}

function downloadFile(text, filename, mime) {
    const blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}

/* ---------------- 设置面板：按钮动作 ---------------- */

function handleSettingAction(name, btn) {
    if (name === 'export-day') {
        downloadMarkdown(dayMarkdown(state.key), suggestFilename('day', state.key));
        toast('已导出 ' + suggestFilename('day', state.key));
        return;
    }
    if (name === 'export-all') {
        downloadMarkdown(allMarkdown(), suggestFilename('all'));
        toast('已导出全部记录');
        return;
    }
    if (name === 'export-range') {
        const keys = allRecordKeys();
        if (!keys.length) { toast('还没有记录'); return; }
        const from = keys[0];
        const to = keys[keys.length - 1];
        downloadMarkdown(rangeMarkdown(from, to), 'ellipse-summary-' + from + '_' + to + '.md');
        toast('已导出区间汇总');
        return;
    }
    if (name === 'backup') {
        downloadFile(backupJson(), 'ellipse-backup-' + todayKey() + '.json', 'application/json');
        toast('已导出备份');
        return;
    }
    if (name === 'import') {
        const input = el.settingsBody.querySelector('#importFile');
        if (input) input.click();
        return;
    }
    if (name === 'import-mod') {
        const input = el.settingsBody.querySelector('#modFile');
        if (input) input.click();
        return;
    }
    if (name === 'disable-custom') {
        const n = disableAllCustom();
        renderSettings();
        render();
        toast(n ? '已停用 ' + n + ' 个自装模块' : '没有开着的自装模块');
        return;
    }
    if (name === 'wipe') {
        sheet.open('清空全部记录',
            '<p class="sheet-note">将删除本机保存的全部状态记录与设置，操作无法撤销。建议先导出备份。</p>',
            '<button class="btn" type="button" data-action="wipe-cancel">取消</button>' +
            '<button class="btn danger" type="button" data-action="wipe-confirm">确认清空</button>');
        return;
    }
    if (name === 'install') {
        const installEvt = state.installPrompt;
        if (!installEvt) { toast('这个浏览器请按下面的说明手动添加'); return; }
        state.installPrompt = null;   /* 同一个事件只能问一次，留着会重复触发 */
        installEvt.prompt();
        installEvt.userChoice.then(function (choice) {
            if (choice && choice.outcome === 'accepted') toast('已开始安装');
            renderSettings();
        });
    }
}

/* 备份 JSON。默认把模块声明的敏感字段摘掉（AI 密钥首当其冲）。 */
function backupJson() {
    const withSecrets = !!el.settingsBody.querySelector('#backupSecrets') &&
        el.settingsBody.querySelector('#backupSecrets').checked;
    const payload = exportAll({ includeMods: true });
    if (!withSecrets && payload.settings) {
        const mods = payload.settings.mods || {};
        registry.all().forEach(function (def) {
            const fields = registry.secretFields(def.id);
            if (!fields.length || !mods[def.id]) return;
            fields.forEach(function (key) { delete mods[def.id][key]; });
        });
        /* 老版本把 AI 配置放在顶层 ai 键里，一并摘掉 */
        if (payload.settings.ai && typeof payload.settings.ai === 'object') {
            delete payload.settings.ai.apiKey;
            delete payload.settings.ai.baseUrl;
        }
    }
    return JSON.stringify(payload, null, 2);
}

function readBackupFile(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
        let payload = null;
        try { payload = JSON.parse(String(reader.result)); } catch (err) { payload = null; }
        if (!payload || !payload.records) { toast('文件格式不正确'); return; }
        const days = Object.keys(payload.records).length;
        const mods = payload.mods ? Object.keys(payload.mods).length : 0;
        pendingImport = payload;
        sheet.open('导入备份',
            '<p class="sheet-note">文件中包含 ' + days + ' 天记录' +
            (mods ? '、' + mods + ' 个模块' : '') +
            '。选择合并会保留本机已有数据，选择覆盖会先清空本机数据。</p>' +
            (mods ? '<p class="sheet-note">导入的模块要重新打开页面才会装载。</p>' : ''),
            '<button class="btn" type="button" data-action="import-merge">合并</button>' +
            '<button class="btn danger" type="button" data-action="import-replace">覆盖</button>');
    };
    reader.readAsText(file);
}

function finishUninstall(id, dropData) {
    const name = (registry.get(id) || {}).name || id;
    sheet.close();
    if (!uninstallMod(id, dropData)) { toast('卸载失败'); return; }
    renderSettings();
    render();
    toast(dropData ? '已卸载「' + name + '」并删除它的数据' : '已卸载「' + name + '」，数据保留');
}

/* dispatchSheetAction 是函数声明，会先于这里的调用被提升，所以可以放心地在这里接上 */
sheet.onAction(dispatchSheetAction);

/* ---------------- 键盘 ---------------- */

document.addEventListener('keydown', function (evt) {
    if (evt.key !== 'Escape') return;
    closeTopOverlay();
});

/* ---------------- 启动 ---------------- */

subscribeStorage(function (evt) {
    if (evt && evt.type === 'settings' && el.settingsPanel.classList.contains('open')) {
        renderSettings();
    }
});

registry.subscribe(function () {
    if (el.settingsPanel.classList.contains('open')) renderSettings();
});

/* 默认展开哪一条：上次开着的那条，否则第一条记录型模块 */
function settleOpenModule() {
    if (state.openModule && registry.get(state.openModule)) return;
    const saved = getSettings().ui.openModule;
    if (saved && registry.get(saved)) { state.openModule = saved; return; }
    state.openModule = registry.enabledOrder()[0] || null;
}

el.backHomeBtn.addEventListener('click', function () {
    if (sheet.isOpen()) { sheet.close(); return; }
    /* 是「进」来的（不是直接敲的地址）就退回去，否则直接回主页 */
    const st = history.state;
    if (st && st.ellipse && st.ellipse === state.page && state.page !== 'home') history.back();
    else setPage('home');
});

/* 首屏先出来，模块随后再装载 —— 坏模块不该让整个应用打不开 */
setPage(startPage);

const skipMods = new URLSearchParams(location.search).get('nomods') === '1';

(async function boot() {
    try {
        await loadBuiltins();
    } catch (err) {
        console.error('[ellipse] 内置模块装载失败：', err);
        registry.addProblem({ id: 'builtin', name: '内置模块' }, {}, msg(err));
    }
    settleOpenModule();
    render();

    if (!skipMods) {
        try {
            await loadInstalled();
        } catch (err) {
            console.error('[ellipse] 自装模块装载失败：', err);
        }
        render();
    }

    /* 模块全装完了，这时才谈得上判断地址里那个 #page/<id> 到底认不认、开没开 */
    state.booted = true;
    render();
})();

/* ---------------- 本地预览钩子：?panel=settings|export|record|trend、?scroll=像素 ---------------- */
(function applyPreviewPanel() {
    const q = new URLSearchParams(location.search);
    const panel = q.get('panel');
    if (panel === 'record') pushPage('record');
    else if (panel === 'trend') pushPage('trend');
    if (panel === 'settings') openSettings();
    else if (panel === 'export') openExportSheet();

    const scroll = Number(q.get('scroll') || 0);
    if (scroll > 0 && panel === 'settings') {
        const target = el.settingsBody;
        let tries = 0;
        const apply = function () {
            target.scrollTop = scroll;
            if (++tries < 4 && target.scrollTop < scroll) setTimeout(apply, 80);
        };
        apply();
    }
})();

/* ---------------- 本地调试：?debug=1 输出关键尺寸（便于在真机上核对布局） ---------------- */
(function debugLayout() {
    if (new URLSearchParams(location.search).get('debug') !== '1') return;
    const rows = [];
    const push = function (label, node) {
        if (!node) return;
        const r = node.getBoundingClientRect();
        rows.push(label + '  x=' + Math.round(r.left) + ' w=' + Math.round(r.width) +
            ' right=' + Math.round(r.right));
    };
    push('viewport w=' + window.innerWidth, { getBoundingClientRect: function () { return { left: 0, width: window.innerWidth, right: window.innerWidth }; } });
    push('page=' + state.page, el.viewRecord);
    push('stack', el.stack);
    push('rail', el.rail);
    push('module[0]', document.querySelector('.module'));
    push('scale', document.querySelector('.scale'));
    push('scale-cell-last', document.querySelectorAll('.scale-cell')[9]);
    push('body.scrollWidth', { getBoundingClientRect: function () { return { left: 0, width: document.body.scrollWidth, right: document.body.scrollWidth }; } });

    const pre = document.createElement('pre');
    pre.style.cssText = 'position:fixed;left:0;top:0;z-index:999;background:#fff;color:#000;' +
        'font:10px/1.5 monospace;padding:6px;margin:0;max-width:100vw;white-space:pre-wrap';
    pre.textContent = rows.join('\n');
    document.body.appendChild(pre);
})();

/* ---------------- PWA：装到主屏与离线缓存 ---------------- */
function isStandalone() {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    return window.navigator.standalone === true;   /* iOS Safari 自己的一套写法 */
}

function isIos() {
    if (/iPad|iPhone|iPod/.test(navigator.userAgent || '')) return true;
    /* iPadOS 13 起 Safari 把自己报成 Mac，只能靠触点数认出来 */
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/* 设置页底部那行说明：按当前平台给不同的安装步骤 */
function installHintText() {
    if (isStandalone()) return '当前已经以 App 形式运行。';
    if (location.protocol === 'file:') {
        return '从文件管理器直接双击打开时无法安装。部署到 HTTPS 后即可，步骤见 docs/PWA部署与安装.md。';
    }
    if (state.installPrompt) return '点上面的「安装到主屏」，确认即可。';
    if (isIos()) return '点 Safari 底部的「分享」按钮 →「添加到主屏幕」。';
    return '点地址栏右侧的安装图标，或浏览器菜单 →「安装 ellipse」。';
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    /* 只有 HTTPS 与 localhost 算安全来源；file:// 双击打开时注册会失败，干脆不试 */
    const host = location.hostname;
    if (location.protocol !== 'https:' && host !== 'localhost' && host !== '127.0.0.1') return;
    navigator.serviceWorker.register('sw.js').catch(function () {});
}

window.addEventListener('beforeinstallprompt', function (evt) {
    evt.preventDefault();
    state.installPrompt = evt;
    if (el.settingsPanel.classList.contains('open')) renderSettings();
});

window.addEventListener('appinstalled', function () {
    state.installPrompt = null;
    toast('已装到主屏');
    if (el.settingsPanel.classList.contains('open')) renderSettings();
});

/* 放最后：注册 Service Worker 不参与首屏渲染，等页面加载完再说 */
(function bootServiceWorker() {
    if (document.readyState === 'complete') registerServiceWorker();
    else window.addEventListener('load', registerServiceWorker);
})();
