/* ellipse · 日常状态记录 —— 主逻辑 */

import { icon } from './icons.js';
import { getModule, MODULES, CHART_ENTRY, chartModules } from './modules.js';
import {
    getSettings, setSettings, resetSettings, enabledOrder,
    getRecordData, setField, subscribe, allRecordKeys,
    importAll, clearRecords
} from './storage.js';
import {
    todayKey, shiftKey, displayKey, relativeLabel, weekdayCN, cnKey, toast, debounce
} from './util.js';
import { RANGES, rangeById, chartBlock } from './charts.js';
import {
    dayMarkdown, rangeMarkdown, allMarkdown, downloadMarkdown,
    copyText, backupJson, suggestFilename
} from './export.js';
import { openVoiceFlow } from './voice.js';
import { isConfigured, polishText, getAiConfig, isTrustedEndpoint } from './ai.js';

/* ---------------- 状态 ---------------- */
const state = {
    page: 'home',                 // 'home' | 'record'
    key: todayKey(),
    openModule: null,             // 展开的那条记录模块（同时只开一条）
    trendOpen: true,              // 波状图栏单独记，默认展开
    range: (getSettings().ui.lastRange || '30d'),
    settingsOpen: false
};

const el = {
    viewHome: document.getElementById('viewHome'),
    viewRecord: document.getElementById('viewRecord'),
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
    settingsBody: document.getElementById('settingsBody'),
    sheet: document.getElementById('sheet'),
    sheetTitle: document.getElementById('sheetTitle'),
    sheetBody: document.getElementById('sheetBody'),
    sheetFoot: document.getElementById('sheetFoot'),
    sheetClose: document.getElementById('sheetClose')
};

/* ---------------- 底部面板 ---------------- */
let sheetOnClose = null;

const sheetCtx = {
    body: el.sheetBody,
    foot: el.sheetFoot,
    close: closeSheet,
    onClose: function (fn) { sheetOnClose = fn; }
};

function openSheet(title, bodyHtml, footHtml) {
    el.sheetTitle.textContent = title;
    el.sheetBody.innerHTML = bodyHtml || '';
    el.sheetFoot.innerHTML = footHtml || '';
    el.sheet.classList.add('open');
    el.sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-locked');
    updateBackButton();
}

/** 右上角按钮：平时是「返回主页」；面板打开时收起，
    避免浮在面板之上挡住面板自己的关闭按钮 */
function updateBackButton() {
    const sheetOpen = el.sheet.classList.contains('open');
    el.backHomeBtn.hidden = sheetOpen || state.page !== 'record';
    el.backHomeBtn.setAttribute('aria-label', '返回主页');
    el.backHomeBtn.setAttribute('title', '返回主页');
    el.backHomeBtn.innerHTML = icon('back');
}

function closeSheet() {
    el.sheet.classList.remove('open');
    el.sheet.setAttribute('aria-hidden', 'true');
    if (!el.settingsPanel.classList.contains('open')) document.body.classList.remove('is-locked');
    updateBackButton();
    if (sheetOnClose) {
        const fn = sheetOnClose;
        sheetOnClose = null;
        try { fn(); } catch (err) { console.warn(err); }
    }
}

/* ---------------- 系统返回键 / Esc ---------------- */
function closeTopOverlay() {
    if (el.sheet.classList.contains('open')) { closeSheet(); return true; }
    if (el.settingsPanel.classList.contains('open')) { closeSettings(); return true; }
    return false;
}

history.replaceState({ ellipse: 'home' }, '', '#home');
window.addEventListener('popstate', function (evt) {
    if (closeTopOverlay()) return;
    const st = evt.state;
    if (!st || st.ellipse !== 'record') {
        if (state.page === 'record') setPage('home');
    }
});

/* ---------------- 渲染：日期 ---------------- */
function renderHead() {
    const key = state.key;
    el.dateNum.textContent = displayKey(key);
    el.dateSub.textContent = weekdayCN(key) + ' · ' + relativeLabel(key);
    const isToday = key === todayKey();
    el.dateToday.hidden = isToday;
    el.dateNext.disabled = key >= todayKey();
    el.dateInput.value = key;
}

/* ---------------- 渲染：模块栏 ---------------- */
function moduleCard(module) {
    const data = (getRecordData(state.key)[module.id]) || {};
    const open = state.openModule === module.id;

    const card = document.createElement('article');
    card.className = 'module' + (open ? ' is-open' : '');
    card.dataset.module = module.id;

    const preview = module.preview(data);
    card.innerHTML =
        '<header class="module-head" data-act="toggle">' +
        '<span class="module-mark">' + icon(module.icon) + '</span>' +
        '<h2 class="module-name">' + module.name + '</h2>' +
        '<span class="module-spacer"></span>' +
        '<button class="module-toggle" type="button" data-act="toggle" aria-label="展开或收起' + module.name + '">' +
        icon('chevron') + '</button>' +
        '</header>' +
        (open ? '' : '<p class="module-preview">' + (preview || module.desc) + '</p>') +
        '<div class="module-body">' + module.template(data) + '</div>';

    return card;
}

function renderStack() {
    const ids = enabledOrder();
    el.stack.innerHTML = '';

    ids.forEach(function (id) {
        const module = getModule(id);
        if (module) el.stack.appendChild(moduleCard(module));
    });

    /* 状态波动图：作为最后一条栏，和「情绪」「睡眠」同一种形态 */
    if (getSettings().modules.trend !== false) {
        el.stack.appendChild(trendCard());
    }

    if (!el.stack.children.length) {
        el.stack.innerHTML = '<p class="empty-note">所有模块都已关闭，去「设置 · 自定义功能区」重新打开。</p>';
    }
}

/* 波状图栏：默认保持展开，点标题栏可收起；区间切换与点选查看数值都在这里 */
function trendCard() {
    /* 没主动收起过就是展开的 */
    const open = state.trendOpen !== false;
    const ids = enabledOrder();
    const charts = chartModules(ids);
    const days = rangeById(state.range).days;

    const card = document.createElement('article');
    card.className = 'module module--trend' + (open ? ' is-open' : '');
    card.dataset.module = CHART_ENTRY.id;

    card.innerHTML =
        '<header class="module-head" data-act="toggle">' +
        '<span class="module-mark">' + icon(CHART_ENTRY.icon) + '</span>' +
        '<h2 class="module-name">' + CHART_ENTRY.name + '</h2>' +
        '<span class="module-spacer"></span>' +
        '<button class="module-toggle" type="button" data-act="toggle" aria-expanded="' + (open ? 'true' : 'false') + '" ' +
        'aria-label="展开或收起' + CHART_ENTRY.name + '">' + icon('chevron') + '</button>' +
        '</header>' +
        (open ? '' : '<p class="module-preview">' + CHART_ENTRY.desc + '</p>');

    const body = document.createElement('div');
    body.className = 'module-body';

    const rangeRow = document.createElement('div');
    rangeRow.className = 'range-row';
    RANGES.forEach(function (r) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'range-btn' + (state.range === r.id ? ' on' : '');
        b.textContent = r.label;
        b.dataset.range = r.id;
        rangeRow.appendChild(b);
    });
    body.appendChild(rangeRow);

    if (!charts.length) {
        const p = document.createElement('p');
        p.className = 'empty-note';
        p.textContent = '当前开启的模块里没有可出图的评分项。';
        body.appendChild(p);
    } else {
        charts.forEach(function (module) {
            body.appendChild(chartBlock(module, {
                days: days,
                dataOf: getRecordData,
                iconHtml: icon(module.icon)
            }));
        });
    }

    card.appendChild(body);
    return card;
}

function renderExport() {
    const md = dayMarkdown(state.key);
    const chars = md.length;
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

/* ---------------- 渲染：右侧栏（只有主页有） ---------------- */
function renderRail() {
    el.rail.className = 'rail rail--home';
    el.rail.hidden = state.page === 'record';
    el.rail.innerHTML =
        '<button class="rail-item" type="button" data-act="record" ' +
        'aria-label="状态记录" title="状态记录">' + icon('log') + '</button>';
}

function render() {
    const home = state.page !== 'record';

    el.viewHome.hidden = !home;
    el.viewRecord.hidden = home;
    /* 设置只在主页 */
    el.settingsBtn.hidden = !home;

    if (home) {
        /* 回到主页时收掉导出面板，避免盖住主页 */
        if (el.sheet.classList.contains('open')) closeSheet();
    } else {
        renderHead();
        renderStack();
        renderExport();
    }
    renderRail();
    updateBackButton();
}

/* ---------------- 两层页面切换 ---------------- */
function setPage(page) {
    const next = page === 'record' ? 'record' : 'home';
    const changed = next !== state.page;
    state.page = next;

    const view = next === 'record' ? el.viewRecord : el.viewHome;
    if (changed) {
        view.classList.remove('fade-in');
        void view.offsetWidth;            /* 重排一次，让动画能重复触发 */
        view.classList.add('fade-in');
    }
    render();
}

/** 打开一层页面并留下一条历史记录，浏览器 / 系统返回键即可退回上一层 */
function pushPage(page) {
    history.pushState({ ellipse: page }, '', page === 'record' ? '#record' : '#home');
    setPage(page);
}

/* ---------------- 模块交互 ---------------- */
function saveText(key, moduleId, field, value) {
    setField(key, moduleId, field, value.trim() ? value : null);
}

const saveDebounced = debounce(function (key, moduleId, field, value) {
    saveText(key, moduleId, field, value);
}, 420);

function handleStackClick(evt) {
    const card = evt.target.closest('.module');
    if (!card) return;
    const moduleId = card.dataset.module;

    const act = evt.target.closest('[data-act]');
    if (act && act.getAttribute('data-act') === 'toggle') {
        /* 以卡片当前实际展开状态为准：点一次翻一次 */
        const wasOpen = card.classList.contains('is-open');
        if (moduleId === CHART_ENTRY.id) {
            /* 波状图栏默认展开，收起与否单独记，不受记录模块影响 */
            state.trendOpen = !wasOpen;
            setSettings({ ui: { trendOpen: state.trendOpen } });
        } else {
            /* 记录模块默认收起，同时只开一条 */
            state.openModule = wasOpen ? null : moduleId;
            setSettings({ ui: { openModule: state.openModule } });
        }
        renderStack();
        return;
    }

    /* 波状图栏：切换观察区间 */
    const rangeBtn = evt.target.closest('[data-range]');
    if (rangeBtn) {
        state.range = rangeBtn.getAttribute('data-range');
        setSettings({ ui: { lastRange: state.range } });
        renderStack();
        return;
    }

    const module = getModule(moduleId);
    if (!module) return;

    const cell = evt.target.closest('.scale-cell');
    if (cell) {
        const field = cell.dataset.field;
        const value = Number(cell.dataset.value);
        const current = getRecordData(state.key)[moduleId] || {};
        setField(state.key, moduleId, field, current[field] === value ? null : value);
        renderStack();
        return;
    }

    const segBtn = evt.target.closest('.seg-item');
    if (segBtn) {
        const field = segBtn.dataset.field;
        const value = segBtn.dataset.value === 'true';
        const current = getRecordData(state.key)[moduleId] || {};
        setField(state.key, moduleId, field, current[field] === value ? null : value);
        renderStack();
        return;
    }

    const chip = evt.target.closest('.chip');
    if (chip) {
        const field = chip.dataset.field;
        const value = Number(chip.dataset.value);
        setField(state.key, moduleId, field, value);
        renderStack();
        return;
    }

    const tool = evt.target.closest('.tool-btn');
    if (tool) {
        const act2 = tool.dataset.act;
        if (act2 === 'voice') openVoiceSheet(moduleId, tool.dataset.field);
        else if (act2 === 'ai') openAiSheet(moduleId, tool.dataset.field);
        return;
    }
}

/* 滑动变阻器：拖动中只改滑片位置与数值文字。
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
    const shown = card.querySelector('[data-value-of="' + input.dataset.field + '"]');
    if (shown) shown.textContent = value + ' / ' + max;
}

function handleStackInput(evt) {
    const target = evt.target;
    if (!target.dataset || !target.dataset.field) return;
    const card = target.closest('.module');
    if (!card) return;
    const moduleId = card.dataset.module;
    const field = target.dataset.field;

    if (target.classList.contains('rheostat-input')) {
        sliderVisual(card, target);
        return;
    }
    if (target.classList.contains('textarea') || target.classList.contains('text-input')) {
        saveDebounced(state.key, moduleId, field, target.value);
        const counter = card.querySelector('[data-count="' + field + '"]');
        if (counter) counter.textContent = target.value.length + ' 字';
        return;
    }
    if (target.classList.contains('num-input')) {
        const raw = target.value.trim();
        const value = raw === '' ? null : Number(raw);
        if (value !== null && !Number.isFinite(value)) return;
        setField(state.key, moduleId, field, value);
    }
}

/* ---------------- 底部面板内容 ---------------- */
function openExportSheet() {
    const md = dayMarkdown(state.key);
    openSheet('导出为 Markdown',
        '<pre class="md-preview">' + escapeForPre(md) + '</pre>' +
        '<p class="sheet-note">文件名 <b>' + suggestFilename('day', state.key) + '</b>，' +
        '可直接放入 Obsidian 库。</p>',
        '<button class="btn" type="button" data-action="copy" data-kind="day">复制</button>' +
        '<button class="btn primary" type="button" data-action="download" data-kind="day">下载 md</button>' +
        '<button class="btn" type="button" data-action="all">全部记录</button>');
}

function openExportAllSheet() {
    const md = allMarkdown();
    openSheet('全部记录',
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

function openAiSheet(moduleId, field) {
    const data = getRecordData(state.key)[moduleId] || {};
    const existing = String(data[field] || '');
    openSheet('整理成日记',
        '<textarea class="textarea" id="aiInput" rows="5" placeholder="把今天的经过简单写几句，交给 AI 整理成日记">' +
        escapeForPre(existing) + '</textarea>' +
        '<p class="sheet-note" id="aiNote">' +
        (isConfigured()
            ? '内容会发送到你配置的接口（' + getAiConfig().baseUrl + '）。'
            : '还没有配置 AI 接口，请先到「设置 · AI 辅助」填写 API Key。') +
        '</p>',
        '<button class="btn" type="button" data-action="ai-cancel">取消</button>' +
        '<button class="btn primary" type="button" data-action="ai-run"' +
        (isConfigured() ? '' : ' disabled') + '>整理</button>');
    sheetCtx.pending = { moduleId: moduleId, field: field };
}

function openVoiceSheet(moduleId, field) {
    sheetCtx.pending = { moduleId: moduleId, field: field };
    openVoiceFlow(sheetCtx, function (text) {
        setField(state.key, moduleId, field, text);
        renderStack();
    });
}

function openDateSheet() {
    const keys = allRecordKeys();
    const recent = keys.slice(-14).reverse();
    const list = recent.length
        ? recent.map(function (k) {
            return '<button class="pick-item" type="button" data-pick="' + k + '">' +
                '<span>' + cnKey(k) + '</span><span class="pick-meta">' + weekdayCN(k) + '</span></button>';
        }).join('')
        : '<p class="empty-note">还没有任何记录</p>';
    openSheet('跳到有记录的日期', '<div class="pick-list">' + list + '</div>', '');
}

/* ---------------- 面板事件 ---------------- */
el.sheet.addEventListener('click', function (evt) {
    const action = evt.target.closest('[data-action]');
    if (action) {
        const name = action.getAttribute('data-action');
        const kind = action.getAttribute('data-kind') || 'day';

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
        if (name === 'all') {
            openExportAllSheet();
            return;
        }
        if (name === 'ai-cancel') {
            closeSheet();
            return;
        }
        if (name === 'ai-run') {
            const input = el.sheetBody.querySelector('#aiInput');
            const note = el.sheetBody.querySelector('#aiNote');
            const raw = input ? input.value.trim() : '';
            if (!raw) { toast('先写几句内容'); return; }
            action.disabled = true;
            action.textContent = '整理中…';
            const pending = sheetCtx.pending;
            polishText(raw).then(function (out) {
                const target = getRecordData(state.key)[pending.moduleId] || {};
                const merged = (String(target[pending.field] || '') + '\n\n' + out).trim();
                setField(state.key, pending.moduleId, pending.field, merged);
                closeSheet();
                renderStack();
                toast('已写入日记');
            }).catch(function (err) {
                action.disabled = false;
                action.textContent = '整理';
                if (note) note.textContent = '整理失败：' + String(err.message || err);
            });
            return;
        }

        /* 清空记录二次确认 */
        if (name === 'wipe-cancel') { closeSheet(); return; }
        if (name === 'wipe-confirm') {
            clearRecords();
            closeSheet();
            renderSettings();
            render();
            toast('已清空本机记录');
            return;
        }

        /* 导入备份 */
        if (name === 'import-merge' || name === 'import-replace') {
            try {
                importAll(sheetCtx.pendingImport, name === 'import-replace' ? 'replace' : 'merge');
                sheetCtx.pendingImport = null;
                closeSheet();
                renderSettings();
                render();
                toast('导入完成');
            } catch (err) {
                toast('导入失败：' + String(err.message || err).slice(0, 30));
            }
            return;
        }
    }

    const pick = evt.target.closest('[data-pick]');
    if (pick) {
        state.key = pick.getAttribute('data-pick');
        closeSheet();
        render();
    }
});

/* 面板右上角的关闭按钮：关掉面板，回到下层界面 */
el.sheetClose.addEventListener('click', closeSheet);

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
document.getElementById('dateCurrent').addEventListener('click', function () {
    openDateSheet();
});

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

/* ---------------- 右侧栏交互（只有主页的「状态记录」入口） ---------------- */
el.rail.addEventListener('click', function (evt) {
    const btn = evt.target.closest('[data-act]');
    if (!btn) return;
    if (btn.getAttribute('data-act') === 'record') pushPage('record');
});

/* ---------------- 导出区 ---------------- */
el.exportZone.addEventListener('click', function (evt) {
    if (evt.target.closest('[data-act="export-day"]')) openExportSheet();
});
el.stack.addEventListener('click', handleStackClick);
el.stack.addEventListener('input', handleStackInput);
/* 滑动变阻器松手时才写入，一次拖动只落盘一次 */
el.stack.addEventListener('change', handleSliderCommit);

function handleSliderCommit(evt) {
    const target = evt.target;
    if (!target.classList || !target.classList.contains('rheostat-input')) return;
    if (!target.dataset || !target.dataset.field) return;
    const card = target.closest('.module');
    if (!card) return;
    const value = Number(target.value);
    if (!Number.isFinite(value)) return;
    setField(state.key, card.dataset.module, target.dataset.field, value);
}

/* ---------------- 设置面板 ---------------- */
function openSettings() {
    renderSettings();
    el.settingsPanel.classList.add('open');
    el.settingsPanel.setAttribute('aria-hidden', 'false');
    el.settingsBtn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('is-locked');
    state.settingsOpen = true;
}

function closeSettings() {
    el.settingsPanel.classList.remove('open');
    el.settingsPanel.setAttribute('aria-hidden', 'true');
    el.settingsBtn.setAttribute('aria-expanded', 'false');
    state.settingsOpen = false;
    if (!el.sheet.classList.contains('open')) document.body.classList.remove('is-locked');
    render();
}

el.settingsBtn.addEventListener('click', function () {
    if (el.settingsPanel.classList.contains('open')) closeSettings();
    else openSettings();
});
el.settingsClose.addEventListener('click', closeSettings);
el.settingsScrim.addEventListener('click', closeSettings);

function settingsOrder() {
    const s = getSettings();
    const enabled = s.order.filter(function (id) { return s.modules[id] !== false; });
    const disabled = s.order.filter(function (id) { return s.modules[id] === false; });
    return enabled.concat(disabled);
}

function renderSettings() {
    const s = getSettings();
    const order = settingsOrder();
    const enabledCount = order.filter(function (id) { return s.modules[id] !== false; }).length;

    const moduleRows = order.map(function (id, i) {
        const module = getModule(id);
        const on = s.modules[id] !== false;
        const firstEnabled = i === 0;
        const lastEnabled = i === enabledCount - 1;
        return '<div class="set-row" data-module-row="' + id + '">' +
            '<span class="module-mark">' + icon(module.icon) + '</span>' +
            '<span class="set-row-main">' +
            '<span class="set-row-title">' + module.name + '</span>' +
            '<span class="set-row-desc">' + module.desc + '</span>' +
            '</span>' +
            '<span class="set-row-side">' +
            '<button class="order-btn" type="button" data-order="' + id + '" data-dir="-1" ' +
            'aria-label="上移' + module.name + '"' + (firstEnabled ? ' disabled' : '') + '>' + icon('up') + '</button>' +
            '<button class="order-btn" type="button" data-order="' + id + '" data-dir="1" ' +
            'aria-label="下移' + module.name + '"' + (lastEnabled ? ' disabled' : '') + '>' + icon('down') + '</button>' +
            '<button class="switch' + (on ? ' on' : '') + '" type="button" role="switch" ' +
            'aria-checked="' + (on ? 'true' : 'false') + '" aria-label="开启或关闭' + module.name + '" ' +
            'data-toggle="' + id + '"></button>' +
            '</span>' +
            '</div>';
    }).join('');

    const trendOn = s.modules.trend !== false;
    const trendRow =
        '<div class="set-row" data-module-row="' + CHART_ENTRY.id + '">' +
        '<span class="module-mark">' + icon(CHART_ENTRY.icon) + '</span>' +
        '<span class="set-row-main">' +
        '<span class="set-row-title">' + CHART_ENTRY.name + '</span>' +
        '<span class="set-row-desc">' + CHART_ENTRY.desc + '；固定排在记录页最后一条，不参与排序</span>' +
        '</span>' +
        '<span class="set-row-side">' +
        '<button class="switch' + (trendOn ? ' on' : '') + '" type="button" role="switch" ' +
        'aria-checked="' + (trendOn ? 'true' : 'false') + '" aria-label="开启或关闭' + CHART_ENTRY.name + '" ' +
        'data-toggle="' + CHART_ENTRY.id + '"></button>' +
        '</span>' +
        '</div>';

    const ai = s.ai || {};
    const cfg = getAiConfig();

    el.settingsBody.innerHTML =
        /* 自定义功能区 */
        '<section class="set-group">' +
        '<div class="set-group-head">' +
        '<h3 class="set-group-title">自定义功能区</h3>' +
        '<span class="set-group-note">' + enabledCount + ' / ' + (MODULES.length + 1) + ' 已开启</span>' +
        '</div>' +
        moduleRows +
        trendRow +
        '<p class="sheet-note">关闭的模块不会出现在记录页；已记录的数据仍保留在本机。</p>' +
        '</section>' +

        /* 显示 */
        '<section class="set-group">' +
        '<div class="set-group-head"><h3 class="set-group-title">显示</h3></div>' +
        '<div class="set-row">' +
        '<span class="set-row-main"><span class="set-row-title">波状图默认区间</span>' +
        '<span class="set-row-desc">打开「状态波动图」栏时先看到的时间范围</span></span>' +
        '<span class="set-row-side">' +
        RANGES.map(function (r) {
            return '<button class="range-btn' + (state.range === r.id ? ' on' : '') + '" type="button" ' +
                'data-default-range="' + r.id + '">' + r.label + '</button>';
        }).join('') +
        '</span>' +
        '</div>' +
        '</section>' +

        /* AI */
        '<section class="set-group">' +
        '<div class="set-group-head"><h3 class="set-group-title">AI 辅助</h3>' +
        '<span class="set-group-note">可选，密钥只存在本机</span></div>' +
        '<div class="set-row">' +
        '<span class="set-row-main">' +
        '<span class="set-row-title">接口地址</span>' +
        '<span class="set-row-desc">兼容 OpenAI 的服务地址，例如 https://api.deepseek.com 或 https://api.openai.com/v1</span>' +
        '<input class="set-input" type="url" data-ai="baseUrl" placeholder="' + cfg.baseUrl + '" value="' +
        escapeAttr(ai.baseUrl || '') + '">' +
        '</span>' +
        '</div>' +
        '<div class="set-row">' +
        '<span class="set-row-main">' +
        '<span class="set-row-title">API Key</span>' +
        '<span class="set-row-desc">仅保存在浏览器 localStorage，不会上传到别处</span>' +
        '<input class="set-input" type="password" data-ai="apiKey" autocomplete="off" ' +
        'placeholder="sk-…" value="' + escapeAttr(ai.apiKey || '') + '">' +
        '</span>' +
        '</div>' +
        '<div class="set-row">' +
        '<span class="set-row-main">' +
        '<span class="set-row-title">模型</span>' +
        '<span class="set-row-desc">用于整理文段，默认 gpt-4o-mini</span>' +
        '<input class="set-input" type="text" data-ai="model" placeholder="gpt-4o-mini" value="' +
        escapeAttr(ai.model || '') + '">' +
        '</span>' +
        '</div>' +
        '<div class="set-row">' +
        '<span class="set-row-main">' +
        '<span class="set-row-title">转写模型</span>' +
        '<span class="set-row-desc">用于语音转写，需要 /audio/transcriptions 接口</span>' +
        '<input class="set-input" type="text" data-ai="transcribeModel" placeholder="whisper-1" value="' +
        escapeAttr(ai.transcribeModel || '') + '">' +
        '</span>' +
        '</div>' +
        '<div class="set-actions">' +
        '<button class="btn" type="button" data-set="ai-test">测试连接</button>' +
        '<button class="btn" type="button" data-set="ai-clear">清除密钥</button>' +
        '</div>' +
        '<p class="sheet-note" id="aiStatus">' +
        (isConfigured() ? '当前状态：已配置（' + cfg.baseUrl + '）' : '当前状态：未配置，语音将使用浏览器内置识别。') +
        '</p>' +
        '</section>' +

        /* 数据 */
        '<section class="set-group">' +
        '<div class="set-group-head"><h3 class="set-group-title">数据</h3>' +
        '<span class="set-group-note">' + allRecordKeys().length + ' 天记录</span></div>' +
        '<div class="set-actions">' +
        '<button class="btn" type="button" data-set="export-day">导出今天 md</button>' +
        '<button class="btn" type="button" data-set="export-all">导出全部 md</button>' +
        '<button class="btn" type="button" data-set="export-range">导出区间汇总 md</button>' +
        '<button class="btn" type="button" data-set="backup">备份 JSON</button>' +
        '<button class="btn" type="button" data-set="import">导入备份</button>' +
        '<input type="file" accept="application/json,.json" id="importFile" hidden>' +
        '</div>' +
        '<div class="set-actions">' +
        '<button class="btn danger" type="button" data-set="wipe">清空全部记录</button>' +
        '</div>' +
        '<p class="sheet-note">记录保存在本机浏览器；清理浏览器数据会一并清空，建议定期备份。</p>' +
        '</section>';
}

function escapeAttr(text) {
    return String(text === null || text === undefined ? '' : text)
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function readAiInputs() {
    const patch = {};
    el.settingsBody.querySelectorAll('[data-ai]').forEach(function (input) {
        patch[input.dataset.ai] = input.value.trim();
    });
    return patch;
}

el.settingsBody.addEventListener('click', function (evt) {
    const toggle = evt.target.closest('[data-toggle]');
    if (toggle) {
        const id = toggle.getAttribute('data-toggle');
        const s = getSettings();
        const next = s.modules[id] === false;
        /* 记录模块至少要留一个（趋势栏不算记录模块） */
        if (!next && id !== CHART_ENTRY.id && enabledOrder().length <= 1) {
            toast('至少保留一个记录模块');
            return;
        }
        setSettings({ modules: (function () { const m = {}; m[id] = next; return m; })() });
        renderSettings();
        render();
        return;
    }

    const orderBtn = evt.target.closest('[data-order]');
    if (orderBtn) {
        const id = orderBtn.getAttribute('data-order');
        const dir = Number(orderBtn.getAttribute('data-dir'));
        moveEnabled(id, dir);
        return;
    }

    const rangeBtn = evt.target.closest('[data-default-range]');
    if (rangeBtn) {
        state.range = rangeBtn.getAttribute('data-default-range');
        setSettings({ ui: { lastRange: state.range } });
        renderSettings();
        return;
    }

    const setBtn = evt.target.closest('[data-set]');
    if (setBtn) {
        handleSettingAction(setBtn.getAttribute('data-set'), setBtn);
    }
});

el.settingsBody.addEventListener('change', function (evt) {
    const input = evt.target.closest('[data-ai]');
    if (input) {
        const patch = readAiInputs();
        setSettings({ ai: patch });
        updateAiStatus();
    }
});

el.settingsBody.addEventListener('input', debounce(function () {
    const patch = readAiInputs();
    setSettings({ ai: patch });
}, 600));

function updateAiStatus() {
    const status = el.settingsBody.querySelector('#aiStatus');
    if (!status) return;
    const cfg = getAiConfig();
    if (!isConfigured()) {
        status.textContent = '当前状态：未配置，语音将使用浏览器内置识别。';
        return;
    }
    if (!isTrustedEndpoint()) {
        status.textContent = '当前状态：已填写密钥，但接口地址不在可信列表内，浏览器可能拒绝请求。';
        return;
    }
    status.textContent = '当前状态：已配置（' + cfg.baseUrl + '）。';
}

function moveEnabled(id, dir) {
    const s = getSettings();
    const enabled = s.order.filter(function (x) { return s.modules[x] !== false; });
    const disabled = s.order.filter(function (x) { return s.modules[x] === false; });
    const i = enabled.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= enabled.length) return;
    const tmp = enabled[i];
    enabled[i] = enabled[j];
    enabled[j] = tmp;
    setSettings({ order: enabled.concat(disabled) });
    renderSettings();
    render();
}

function handleSettingAction(name, btn) {
    if (name === 'ai-test') {
        if (!isConfigured()) { toast('先填写 API Key'); return; }
        btn.disabled = true;
        btn.textContent = '测试中…';
        polishText('测试连接：请回复「连接正常」。', '你是连接测试助手，只回复四个字：连接正常').then(function (out) {
            toast('连接正常：' + out.slice(0, 20));
        }).catch(function (err) {
            toast('连接失败：' + String(err.message || err).slice(0, 40));
        }).then(function () {
            btn.disabled = false;
            btn.textContent = '测试连接';
            updateAiStatus();
        });
        return;
    }

    if (name === 'ai-clear') {
        setSettings({ ai: { apiKey: '', baseUrl: '', model: '', transcribeModel: '' } });
        renderSettings();
        toast('已清除 AI 配置');
        return;
    }

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
        const to = keys[keys.length - 1];
        const from = keys[0];
        downloadMarkdown(rangeMarkdown(from, to), 'ellipse-summary-' + from + '_' + to + '.md');
        toast('已导出区间汇总');
        return;
    }

    if (name === 'backup') {
        downloadMarkdown(backupJson(), 'ellipse-backup-' + todayKey() + '.json');
        toast('已导出备份');
        return;
    }

    if (name === 'import') {
        const input = el.settingsBody.querySelector('#importFile');
        if (input) input.click();
        return;
    }

    if (name === 'wipe') {
        openSheet('清空全部记录',
            '<p class="sheet-note">将删除本机保存的全部状态记录与设置，操作无法撤销。建议先导出备份。</p>',
            '<button class="btn" type="button" data-action="wipe-cancel">取消</button>' +
            '<button class="btn danger" type="button" data-action="wipe-confirm">确认清空</button>');
    }
}

el.settingsBody.addEventListener('change', function (evt) {
    if (evt.target.id !== 'importFile') return;
    const file = evt.target.files && evt.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
        let payload = null;
        try { payload = JSON.parse(String(reader.result)); } catch (err) { payload = null; }
        if (!payload || !payload.records) { toast('文件格式不正确'); return; }
        const days = Object.keys(payload.records).length;
        openSheet('导入备份',
            '<p class="sheet-note">文件中包含 ' + days + ' 天记录。选择合并会保留本机已有数据，选择覆盖会先清空本机数据。</p>',
            '<button class="btn" type="button" data-action="import-merge">合并</button>' +
            '<button class="btn danger" type="button" data-action="import-replace">覆盖</button>');
        sheetCtx.pendingImport = payload;
    };
    reader.readAsText(file);
    evt.target.value = '';
});

/* ---------------- 键盘 ---------------- */
document.addEventListener('keydown', function (evt) {
    if (evt.key !== 'Escape') return;
    openSettingsGuard();
});

function openSettingsGuard() {
    if (el.sheet.classList.contains('open')) { closeSheet(); return; }
    if (el.settingsPanel.classList.contains('open')) { closeSettings(); }
}

/* ---------------- 启动 ---------------- */
subscribe(function (evt) {
    if (evt && evt.type === 'settings' && el.settingsPanel.classList.contains('open')) {
        renderSettings();
    }
});

const savedOpen = getSettings().ui.openModule;
if (savedOpen && getModule(savedOpen)) {
    state.openModule = savedOpen;
} else {
    /* 首次打开：默认展开第一个已开启模块 */
    const first = enabledOrder()[0];
    state.openModule = first || null;
}
/* 波状图栏独立记自己的展开状态 */
state.trendOpen = getSettings().ui.trendOpen !== false;

const startPage = location.hash === '#record' ? 'record' : 'home';
if (startPage === 'record') history.replaceState({ ellipse: 'record' }, '', '#record');
setPage(startPage);

/* 右上角按钮：返回主页（面板打开时它会收起，面板用自己的关闭按钮） */
el.backHomeBtn.addEventListener('click', function () {
    if (el.sheet.classList.contains('open')) { closeSheet(); return; }
    if (history.state && history.state.ellipse === 'record') history.back();
    else setPage('home');
});

/* ---------------- 本地预览钩子：?panel=settings|export|record、?scroll=像素 ---------------- */
(function applyPreviewPanel() {
    const q = new URLSearchParams(location.search);
    const panel = q.get('panel');
    if (panel === 'record' || panel === 'trend') pushPage('record');
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
