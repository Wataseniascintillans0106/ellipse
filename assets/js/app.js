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

const api = installGlobal();

const DEFAULT_PAGE_NOTE = '这一页只读，不会改动任何记录';

const state = {
    page: 'home',
    key: todayKey(),
    openModule: null,
    settingsOpen: false,
    installPrompt: null,
    booted: false
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

sheet.onStateChange(syncOverlays);

function syncOverlays() {
    const sheetOpen = sheet.isOpen();
    const panelOpen = el.settingsPanel.classList.contains('open');

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

function hashForPage(page) {
    if (page === 'record' || page === 'home') return '#' + page;
    return '#page/' + page;
}

function pageFromHash(hash) {
    if (hash === '#record') return 'record';
    if (hash.indexOf('#page/') === 0) return hash.slice('#page/'.length);
    return 'home';
}

const startPage = pageFromHash(location.hash);
history.replaceState({ ellipse: startPage }, '', hashForPage(startPage));

window.addEventListener('popstate', function (evt) {
    if (closeTopOverlay()) return;
    const st = evt.state;
    setPage(st && st.ellipse ? st.ellipse : 'home');
});

function renderHead() {
    const key = state.key;
    el.dateNum.textContent = displayKey(key);
    el.dateSub.textContent = weekdayCN(key) + ' · ' + relativeLabel(key);
    el.dateToday.hidden = key === todayKey();
    el.dateNext.disabled = key >= todayKey();
    el.dateInput.value = key;
}

function cardOpen(def) {
    if (def.kind === 'panel') return panelOpen(def);
    return state.openModule === def.id;
}

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

function renderPage() {
    const def = registry.get(state.page);
    if (!def) return;
    el.pageTitle.textContent = def.name;
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

function placeBackBtn() {
    const view = state.page === 'record' ? el.viewRecord : el.viewPage;
    const row = view.querySelector('.head-row');
    if (el.backHomeBtn.parentNode !== row) row.insertBefore(el.backHomeBtn, row.firstChild);
}

function render() {
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
    el.settingsBtn.hidden = !home;

    if (!home) placeBackBtn();

    if (home) {
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

install({
    refresh: function () {
        renderStack();
        renderExport();
        if (state.page !== 'home' && state.page !== 'record') renderPage();
    }
});

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
        void view.offsetWidth;
        view.classList.add('fade-in');
    }
    render();
}

function pushPage(page) {
    history.pushState({ ellipse: page }, '', hashForPage(page));
    setPage(page);
}

function saveText(key, moduleId, field, value) {
    setField(key, moduleId, field, value.trim() ? value : null);
}

const saveDebounced = debounce(function (key, moduleId, field, value) {
    saveText(key, moduleId, field, value);
}, 420);

function dispatchModuleAction(evt, def, card) {
    const actEl = evt.target.closest('[data-act]');
    if (!actEl) return false;

    const name = actEl.getAttribute('data-act');
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

function handleSliderCommit(evt) {
    const target = evt.target;
    if (!target.dataset || target.dataset.type !== 'slider') return;
    const card = target.closest('.module');
    if (!card) return;
    const value = Number(target.value);
    if (!Number.isFinite(value)) return;
    setField(state.key, card.dataset.module, target.dataset.field, value);
}

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

let pendingImport = null;
let pendingMod = null;

function dispatchSheetAction(name, target) {
    const kind = (target && target.getAttribute('data-kind')) || 'day';

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

    const handler = registry.action(name);
    if (typeof handler === 'function') {
        try {
            handler({ api: api, target: target, sheet: sheet });
        } catch (err) {
            console.error('[ellipse] 面板动作「' + name + '」出错：', err);
            toast('操作失败：' + msg(err).slice(0, 40));
        }
    }
}

document.getElementById('sheetClose').addEventListener('click', function () { sheet.close(); });

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

const CUSTOM_BADGE = '<em class="set-badge">自装</em>';
const OFF_BADGE = '<em class="set-badge set-badge--off">已关闭</em>';

function moduleRow(def, first, last) {
    const on = registry.isEnabled(def.id);
    const isCard = registry.isCard(def.id);
    const row = document.createElement('div');
    row.className = 'set-row' + (on ? '' : ' is-off');
    row.dataset.moduleRow = def.id;
    row.innerHTML =
        '<span class="module-mark">' + icon(def.icon) + '</span>' +
        '<span class="set-row-main">' +
        '<span class="set-row-title">' + escapeHtml(def.name) +
        (on ? '' : OFF_BADGE) + (def.builtin ? '' : CUSTOM_BADGE) + '</span>' +
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
        'data-toggle="' + def.id + '">' +
        '<span class="switch-label" aria-hidden="true">' + (on ? '开' : '关') + '</span>' +
        '</button>' +
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

function foldGroup(id, title) {
    const groups = getSettings().ui.groups || {};
    const open = groups[id] !== false;

    const box = document.createElement('section');
    box.className = 'set-group set-group--fold' + (open ? '' : ' is-folded');
    box.dataset.group = id;

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'set-group-head';
    head.setAttribute('data-fold', id);
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    head.innerHTML = '<span class="fold-chev">' + icon('chevron') + '</span>' +
        '<span class="set-group-title">' + escapeHtml(title) + '</span>';

    const body = document.createElement('div');
    body.className = 'set-group-body';
    body.hidden = !open;

    box.appendChild(head);
    box.appendChild(body);
    return { box: box, body: body };
}

function rowsInOrder(ids, box) {
    const isOn = registry.isEnabled;
    const blocks = [
        ids.filter(isOn),
        ids.filter(function (id) { return !isOn(id); })
    ];
    blocks.forEach(function (block) {
        block.forEach(function (id, i) {
            const def = registry.get(id);
            if (def) box.appendChild(moduleRow(def, i === 0, i === block.length - 1));
        });
    });
}

function modulesGroup() {
    const box = group('模块', registry.enabledCount() + ' / ' + registry.all().length + ' 已开启');
    box.appendChild(html(
        '<div class="set-actions">' +
        '<button class="btn primary" type="button" data-set="import-mod">导入模块</button>' +
        '<button class="btn" type="button" data-set="disable-custom">停用全部自装模块</button>' +
        '<input type="file" accept=".js,text/javascript" id="modFile" hidden>' +
        '</div>'));

    const ordered = registry.orderedIds();
    const kindOf = function (id) {
        const def = registry.get(id);
        return def ? def.kind : '';
    };

    const pages = ordered.filter(function (id) { return kindOf(id) === 'page'; });
    if (pages.length) {
        const fold = foldGroup('chart', '数值图');
        rowsInOrder(pages, fold.body);
        box.appendChild(fold.box);
    }

    const cards = ordered.filter(function (id) { return registry.isCard(id); });
    if (cards.length) {
        const fold = foldGroup('record', '状态记录');
        rowsInOrder(cards, fold.body);
        box.appendChild(fold.box);
    }

    ordered.filter(function (id) {
        return !registry.isCard(id) && kindOf(id) !== 'page';
    }).forEach(function (id) {
        box.appendChild(moduleRow(registry.get(id), false, false));
    });

    registry.problems().forEach(function (p) {
        box.appendChild(problemRow(p));
    });

    box.appendChild(html('<p class="sheet-note">关掉模块不会删掉它的数据；' +
        '卸载自装模块只移走代码，记录同样保留。' +
        '装进来的模块是一段能在本机运行的代码，只装你信得过的文件。</p>'));
    return box;
}

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
    const fold = evt.target.closest('[data-fold]');
    if (fold) {
        const id = fold.getAttribute('data-fold');
        const groups = Object.assign({}, getSettings().ui.groups || {});
        groups[id] = groups[id] === false;
        setSettings({ ui: { groups: groups } });
        return;
    }

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
        state.installPrompt = null;
        installEvt.prompt();
        installEvt.userChoice.then(function (choice) {
            if (choice && choice.outcome === 'accepted') toast('已开始安装');
            renderSettings();
        });
    }
}

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

sheet.onAction(dispatchSheetAction);

document.addEventListener('keydown', function (evt) {
    if (evt.key !== 'Escape') return;
    closeTopOverlay();
});

subscribeStorage(function (evt) {
    if (evt && evt.type === 'settings' && el.settingsPanel.classList.contains('open')) {
        renderSettings();
    }
});

registry.subscribe(function () {
    if (el.settingsPanel.classList.contains('open')) renderSettings();
});

function settleOpenModule() {
    if (state.openModule && registry.get(state.openModule)) return;
    const saved = getSettings().ui.openModule;
    if (saved && registry.get(saved)) { state.openModule = saved; return; }
    state.openModule = registry.enabledOrder()[0] || null;
}

el.backHomeBtn.addEventListener('click', function () {
    if (sheet.isOpen()) { sheet.close(); return; }
    const st = history.state;
    if (st && st.ellipse && st.ellipse === state.page && state.page !== 'home') history.back();
    else setPage('home');
});

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

    state.booted = true;
    render();
})();

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

function isStandalone() {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    return window.navigator.standalone === true;
}

function isIos() {
    if (/iPad|iPhone|iPod/.test(navigator.userAgent || '')) return true;
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

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

(function bootServiceWorker() {
    if (document.readyState === 'complete') registerServiceWorker();
    else window.addEventListener('load', registerServiceWorker);
})();
