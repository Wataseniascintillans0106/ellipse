import { fromKey, toKey, pad2, todayKey, WEEK_CN, escapeHtml } from '../util.js';

const REMIND_KEY = 'ellipse.v1.calRemind';
const DAYS_IN_LIST = 60;
const SWEEP_MS = 30000;

const MEAL_OPTIONS = [
    { value: 'before', label: '饭前' },
    { value: 'with', label: '饭中' },
    { value: 'after', label: '饭后' },
    { value: 'any', label: '不固定' }
];

const UNITS = ['片', '粒', '袋', 'mg', 'ml', '滴', '喷', '单位'];

const WEEK_FROM = ['日', '一', '二', '三', '四', '五', '六'];

const TYPE_ICONS = ['calendar', 'pill', 'hospital', 'revisit', 'checkup', 'clock', 'bell', 'spark', 'diary', 'pain'];

const TYPE_COLORS = ['#de7b49', '#6f8fbf', '#b98aa8', '#7fae8f', '#c9a227', '#8d8378'];

const FIELD_CATALOG = [
    { key: 'place', type: 'text', label: '地点 / 医院', placeholder: '例如：市立医院 心理科' },
    { key: 'doctor', type: 'text', label: '医生 / 陪同人', placeholder: '可不填' },
    { key: 'dose', type: 'dose', label: '剂量（数量 + 单位）' },
    { key: 'meal', type: 'choice', label: '饭前 / 饭中 / 饭后', options: MEAL_OPTIONS },
    { key: 'note', type: 'textarea', label: '备注', rows: 2, placeholder: '要带的东西、想问的问题…' }
];

const REPEAT_KINDS = [
    { key: 'once', label: '只这一次' },
    { key: 'daily', label: '每天' },
    { key: 'hourly', label: '每几小时' },
    { key: 'interval', label: '隔几天' }
];

const INTERVAL_UNITS = [
    { key: 'day', label: '天' },
    { key: 'week', label: '周' },
    { key: 'month', label: '月' }
];

const NOTE_TEXT = {
    once: '',
    daily: '每天都会出现在日历上',
    hourly: '从第一次的时间往后数',
    interval: '到那天才会出现'
};

const BUILTIN_TYPES = [
    {
        id: 'med',
        name: '服药',
        icon: 'pill',
        color: '#de7b49',
        desc: '吃什么药、吃多少、什么时候吃',
        form: [
            { key: 'drug', type: 'text', label: '药物名称', placeholder: '例如：舍曲林', required: true },
            { key: 'brand', type: 'text', label: '药品公司', placeholder: '可不填' },
            { key: 'dose', type: 'dose', label: '每次剂量' },
            { key: 'meal', type: 'choice', label: '和饭的关系', options: MEAL_OPTIONS }
        ],
        tail: [
            { key: 'note', type: 'textarea', label: '备注', rows: 2, placeholder: '医生叮嘱、副作用、想记的话…' }
        ],
        schedule: { time: true, repeats: ['hourly', 'daily', 'interval', 'once'], defaultKind: 'daily' }
    },
    {
        id: 'visit',
        name: '就医',
        icon: 'hospital',
        color: '#6f8fbf',
        desc: '去医院看诊',
        form: [
            { key: 'place', type: 'text', label: '医院 / 科室', placeholder: '例如：市立医院 心理科', required: true },
            { key: 'doctor', type: 'text', label: '医生', placeholder: '可不填' }
        ],
        tail: [
            { key: 'note', type: 'textarea', label: '要带的东西 / 想说的话', rows: 2 }
        ],
        schedule: { time: true, repeats: ['once', 'interval'], defaultKind: 'once' }
    },
    {
        id: 'revisit',
        name: '复诊',
        icon: 'revisit',
        color: '#b98aa8',
        desc: '按周期回去复诊',
        form: [
            { key: 'place', type: 'text', label: '医院 / 科室', placeholder: '例如：市立医院 心理科' },
            { key: 'doctor', type: 'text', label: '医生', placeholder: '可不填' }
        ],
        tail: [
            { key: 'note', type: 'textarea', label: '这次要问的事', rows: 2 }
        ],
        schedule: { time: true, repeats: ['interval', 'once'], defaultKind: 'interval' }
    },
    {
        id: 'checkup',
        name: '体检',
        icon: 'checkup',
        color: '#7fae8f',
        desc: '体检、化验、复查指标',
        form: [
            { key: 'place', type: 'text', label: '体检机构 / 项目', placeholder: '例如：社区医院 血常规' }
        ],
        tail: [
            { key: 'note', type: 'textarea', label: '备注', rows: 2, placeholder: '空腹、别吃早饭…' }
        ],
        schedule: { time: true, repeats: ['once', 'interval'], defaultKind: 'once' }
    }
];

function api() { return globalThis.ellipse; }

function shiftKey(key, days) {
    const d = fromKey(key);
    d.setDate(d.getDate() + days);
    return toKey(d);
}

function monthStart(key) { return String(key).slice(0, 7) + '-01'; }

function shiftMonth(key, n) {
    const p = String(key).split('-').map(Number);
    return toKey(new Date(p[0], p[1] - 1 + n, 1));
}

function daysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }

function dayDiff(a, b) { return Math.round((fromKey(a) - fromKey(b)) / 86400000); }

function monthLabel(key) {
    const p = String(key).split('-');
    return p[0] + '年' + Number(p[1]) + '月';
}

function dayLabel(key) {
    const p = String(key).split('-');
    const t = todayKey();
    let rel = '';
    if (key === t) rel = ' · 今天';
    else if (key === shiftKey(t, -1)) rel = ' · 昨天';
    else if (key === shiftKey(t, 1)) rel = ' · 明天';
    return Number(p[1]) + '月' + Number(p[2]) + '日 ' + WEEK_CN[fromKey(key).getDay()] + rel;
}

function toMinutes(hhmm) {
    const p = String(hhmm || '').split(':');
    const h = Number(p[0]);
    const m = Number(p[1]);
    if (!Number.isFinite(h)) return 0;
    return h * 60 + (Number.isFinite(m) ? m : 0);
}

function fromMinutes(total) {
    const m = ((Math.round(total) % 1440) + 1440) % 1440;
    return pad2(Math.floor(m / 60)) + ':' + pad2(m % 60);
}

function nowMinutes() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
}

function uid() {
    return 'e' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
}

function weekStart() {
    return conf().weekStart === 1 ? 1 : 0;
}

function conf() { return api().settings.get('calendar'); }

function types() {
    const reg = api().registry;
    return reg.eventModules().map(function (id) { return reg.get(id); }).filter(Boolean);
}

function typeById(id) {
    const def = api().registry.get(id);
    return def && def.kind === 'event' ? def : null;
}

function eventsOf(id) {
    const list = api().settings.get(id).events;
    return Array.isArray(list) ? list : [];
}

function saveEvents(id, list) {
    const patch = {};
    patch[id] = { events: list };
    api().settings.set(id, patch[id]);
}

function repeatOf(entry) {
    const r = entry && entry.repeat;
    return r && typeof r === 'object' ? r : { kind: 'once' };
}

function occursOn(entry, key, r) {
    const kind = r.kind || 'once';
    const start = entry.date;
    if (!start || key < start) return false;
    if (kind === 'once') return key === start;
    if (kind === 'daily' || kind === 'hourly') return true;
    if (kind !== 'interval') return false;

    const every = Math.max(1, Number(r.every) || 1);
    const unit = r.unit || 'day';
    if (unit === 'week') return dayDiff(key, start) % (every * 7) === 0;
    if (unit === 'day') return dayDiff(key, start) % every === 0;

    const step = every * (unit === 'year' ? 12 : 1);
    const a = fromKey(key);
    const b = fromKey(start);
    const months = (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
    if (months < 0 || months % step !== 0) return false;
    const sameDay = Math.min(b.getDate(), daysInMonth(a.getFullYear(), a.getMonth()));
    return a.getDate() === sameDay;
}

function timesOn(entry, key) {
    const r = repeatOf(entry);
    if (r.kind !== 'hourly') {
        const t = entry.time ? String(entry.time) : '';
        return t ? [t] : [];
    }
    const every = Math.max(1, Number(r.every) || 8);
    const span = every * 3600000;
    const anchor = fromKey(entry.date).getTime() + toMinutes(entry.time || '08:00') * 60000;
    const dayStart = fromKey(key).getTime();
    const out = [];
    const first = anchor + Math.ceil((dayStart - anchor) / span) * span;
    for (let t = first; t < dayStart + 86400000 && out.length < 24; t += span) {
        if (t < anchor) continue;
        out.push(fromMinutes((t - dayStart) / 60000));
    }
    return out;
}

function expandDates(entry, from, to) {
    const out = [];
    const start = entry && entry.date;
    if (!start || !from || !to || to < from) return out;
    const r = repeatOf(entry);
    let key = start > from ? start : from;
    let guard = 0;
    while (key <= to && guard++ < 4000) {
        if (occursOn(entry, key, r)) out.push(key);
        key = shiftKey(key, 1);
    }
    return out;
}

function itemsOf(type, key) {
    const out = [];
    eventsOf(type.id).forEach(function (entry) {
        if (!occursOn(entry, key, repeatOf(entry))) return;
        const times = timesOn(entry, key);
        if (!times.length) {
            out.push({ type: type, entry: entry, date: key, time: '' });
            return;
        }
        times.forEach(function (t) {
            out.push({ type: type, entry: entry, date: key, time: t });
        });
    });
    return out;
}

function itemsOn(key) {
    const out = [];
    types().forEach(function (type) {
        out.push.apply(out, itemsOf(type, key));
    });
    return out.sort(function (a, b) {
        return toMinutes(a.time) - toMinutes(b.time);
    });
}

function dotsOn(key, typeList) {
    const used = [];
    typeList.forEach(function (type) {
        if (itemsOf(type, key).length) used.push(type.color || '#de7b49');
    });
    return used.slice(0, 4);
}

function valueText(type, entry) {
    const v = entry.values || {};
    const parts = [];
    (type.form || []).concat(type.tail || []).forEach(function (f) {
        const raw = v[f.key];
        if (raw === undefined || raw === null || String(raw).trim() === '') return;
        if (f.type === 'choice') {
            const hit = (f.options || []).filter(function (o) { return o.value === raw; })[0];
            parts.push(hit ? hit.label : String(raw));
            return;
        }
        if (f.type === 'dose') {
            parts.push(String(raw) + (v.doseUnit ? v.doseUnit : ''));
            return;
        }
        parts.push(String(raw));
    });
    return parts;
}

function itemTitle(type, entry) {
    const v = entry.values || {};
    return v.drug || v.title || v.place || type.name;
}

function repeatText(entry) {
    const r = repeatOf(entry);
    if (r.kind === 'daily') return '每天';
    if (r.kind === 'hourly') return '每 ' + (Number(r.every) || 8) + ' 小时';
    if (r.kind === 'interval') {
        const unit = r.unit === 'week' ? '周' : r.unit === 'month' ? '个月' : r.unit === 'year' ? '年' : '天';
        return '隔 ' + (Number(r.every) || 1) + ' ' + unit;
    }
    return '';
}

function itemMeta(type, entry) {
    const parts = valueText(type, entry);
    const rep = repeatText(entry);
    if (rep) parts.push(rep);
    else if (entry.date) parts.push('只这一次');
    return parts.join(' · ');
}

function gridDays(monthKey) {
    const start = weekStart();
    const first = fromKey(monthKey);
    const lead = (first.getDay() - start + 7) % 7;
    const total = lead + daysInMonth(first.getFullYear(), first.getMonth());
    const rows = Math.ceil(total / 7);
    const cells = [];
    const base = shiftKey(monthKey, -lead);
    for (let i = 0; i < rows * 7; i++) cells.push(shiftKey(base, i));
    return cells;
}

function el(tag, className, htmlText) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (htmlText !== undefined) node.innerHTML = htmlText;
    return node;
}

function itemHtml(item) {
    const type = item.type;
    const entry = item.entry;
    const color = type.color || '#de7b49';
    return '<button class="cal-item" type="button" data-cal="item" data-type="' + escapeHtml(type.id) +
        '" data-id="' + escapeHtml(entry.id) + '" data-date="' + escapeHtml(item.date) + '">' +
        '<span class="cal-bar" style="background:' + escapeHtml(color) + '"></span>' +
        '<span class="cal-time">' + escapeHtml(item.time) + '</span>' +
        '<span class="cal-item-main">' +
        '<span class="cal-item-name">' + escapeHtml(itemTitle(type, entry)) + '</span>' +
        '<span class="cal-item-meta">' + escapeHtml(type.name + (itemMeta(type, entry) ? ' · ' + itemMeta(type, entry) : '')) + '</span>' +
        '</span>' +
        '</button>';
}

function emptyHtml(text) {
    return '<p class="empty-note">' + escapeHtml(text) + '</p>';
}

function emptyEl(text) {
    const p = document.createElement('p');
    p.className = 'empty-note';
    p.textContent = text;
    return p;
}

function buildMonth(body, cursor, selected) {
    const list = types();
    const cells = gridDays(cursor);
    const month = cursor.slice(0, 7);

    const head = el('div', 'cal-week');
    const start = weekStart();
    for (let i = 0; i < 7; i++) {
        head.appendChild(el('span', 'cal-week-day', WEEK_FROM[(start + i) % 7]));
    }
    body.appendChild(head);

    const grid = el('div', 'cal-grid');
    cells.forEach(function (key) {
        const out = key.slice(0, 7) !== month;
        const dots = list.length ? dotsOn(key, list) : [];
        const cls = 'cal-cell' + (out ? ' is-out' : '') +
            (key === todayKey() ? ' is-today' : '') + (key === selected ? ' is-sel' : '');
        const dotHtml = '<span class="cal-dots">' + dots.map(function (c) {
            return '<i class="cal-dot" style="background:' + escapeHtml(c) + '"></i>';
        }).join('') + '</span>';
        const btn = el('button', cls,
            '<span class="cal-num">' + Number(key.slice(8)) + '</span>' + dotHtml);
        btn.type = 'button';
        btn.setAttribute('data-cal', 'pick');
        btn.setAttribute('data-key', key);
        btn.setAttribute('aria-label', dayLabel(key) + (dots.length ? '，有 ' + dots.length + ' 项安排' : ''));
        grid.appendChild(btn);
    });
    body.appendChild(grid);

    const day = el('section', 'cal-day');
    day.appendChild(el('h3', 'cal-day-title', escapeHtml(dayLabel(selected)) +
        '<button class="cal-today-mini" type="button" data-cal="today">今天</button>'));

    const items = itemsOn(selected);
    if (!items.length) {
        day.appendChild(emptyEl(list.length ? '这天没有安排' : '这块日历还是空的'));
    } else {
        items.forEach(function (item) { day.appendChild(el('div', 'cal-row', itemHtml(item))); });
    }
    day.appendChild(el('button', 'cal-add-day', api().icon('plus') + '<span>在这天加一项</span>'));
    day.querySelector('.cal-add-day').setAttribute('data-cal', 'add');
    day.querySelector('.cal-add-day').setAttribute('data-date', selected);
    body.appendChild(day);
}

function buildList(body, cursor, selected) {
    const from = todayKey();
    const to = shiftKey(from, DAYS_IN_LIST);
    const list = types();
    const rows = [];

    list.forEach(function (type) {
        eventsOf(type.id).forEach(function (entry) {
            expandDates(entry, from, to).forEach(function (date) {
                const times = timesOn(entry, date);
                if (!times.length) {
                    rows.push({ type: type, entry: entry, date: date, time: '' });
                    return;
                }
                times.forEach(function (t) {
                    rows.push({ type: type, entry: entry, date: date, time: t });
                });
            });
        });
    });

    rows.sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return toMinutes(a.time) - toMinutes(b.time);
    });

    body.appendChild(el('p', 'cal-list-note',
        '从今天起 ' + DAYS_IN_LIST + ' 天，共 ' + rows.length + ' 项'));

    if (!rows.length) {
        body.appendChild(emptyEl(list.length ? '接下来没有安排' : '这块日历还是空的'));
        return;
    }

    let last = '';
    rows.forEach(function (item) {
        if (item.date !== last) {
            last = item.date;
            body.appendChild(el('h3', 'cal-day-title', escapeHtml(dayLabel(item.date))));
        }
        body.appendChild(el('div', 'cal-row', itemHtml(item)));
    });
    body.appendChild(el('button', 'cal-add-day', api().icon('plus') + '<span>加一项</span>'));
    body.querySelector('.cal-add-day').setAttribute('data-cal', 'add');
    body.querySelector('.cal-add-day').setAttribute('data-date', cursor);
}

function fieldWrap(label, inner, note) {
    return '<div class="ev-field"><div class="field-label"><span>' + escapeHtml(label) + '</span></div>' +
        inner + (note ? '<p class="ev-note">' + escapeHtml(note) + '</p>' : '') + '</div>';
}

function oneField(f, draft) {
    const v = draft.values[f.key];
    const has = v !== undefined && v !== null && String(v) !== '';

    if (f.type === 'choice') {
        return fieldWrap(f.label,
            '<div class="chip-row">' + (f.options || []).map(function (o) {
                return '<button class="chip' + (v === o.value ? ' on' : '') + '" type="button" ' +
                    'data-cal="choice" data-key="' + f.key + '" data-value="' + o.value + '">' + o.label + '</button>';
            }).join('') + '</div>');
    }
    if (f.type === 'dose') {
        return fieldWrap(f.label,
            '<div class="ev-dose">' +
            '<input class="num-input" type="text" inputmode="decimal" data-cal="val" data-key="' + f.key + '" ' +
            'placeholder="1" value="' + escapeHtml(has ? v : '') + '">' +
            '<input class="ev-unit" type="text" list="calUnits" data-cal="val" data-key="doseUnit" ' +
            'placeholder="片" value="' + escapeHtml(draft.values.doseUnit || '') + '">' +
            '</div>' +
            '<datalist id="calUnits">' + UNITS.map(function (u) {
                return '<option value="' + u + '"></option>';
            }).join('') + '</datalist>');
    }
    if (f.type === 'textarea') {
        return fieldWrap(f.label,
            '<textarea class="textarea" rows="' + (f.rows || 2) + '" data-cal="val" data-key="' + f.key + '" ' +
            'placeholder="' + escapeHtml(f.placeholder || '') + '">' + escapeHtml(has ? v : '') + '</textarea>');
    }
    return fieldWrap(f.label,
        '<input class="text-input" type="text" data-cal="val" data-key="' + f.key + '" ' +
        'placeholder="' + escapeHtml(f.placeholder || '') + '" value="' + escapeHtml(has ? v : '') + '">');
}

function repeatHtml(type, draft) {
    const sched = type.schedule || {};
    const kinds = sched.repeats && sched.repeats.length ? sched.repeats : ['once'];
    const r = draft.repeat || { kind: 'once' };

    const chips = kinds.map(function (k) {
        const hit = REPEAT_KINDS.filter(function (x) { return x.key === k; })[0];
        if (!hit) return '';
        return '<button class="chip' + (r.kind === k ? ' on' : '') + '" type="button" ' +
            'data-cal="rep-kind" data-value="' + k + '">' + hit.label + '</button>';
    }).join('');

    let extra = '';
    if (r.kind === 'hourly') {
        extra = '<div class="ev-sub">每 <input class="num-input ev-n" type="text" inputmode="numeric" ' +
            'data-cal="rep-n" value="' + escapeHtml(String(Number(r.every) || 8)) + '"> 小时一次' +
            '<span class="ev-note-inline">' + escapeHtml(NOTE_TEXT.hourly) + '</span></div>';
    } else if (r.kind === 'interval') {
        extra = '<div class="ev-sub">每 <input class="num-input ev-n" type="text" inputmode="numeric" ' +
            'data-cal="rep-n" value="' + escapeHtml(String(Number(r.every) || 1)) + '"> ' +
            INTERVAL_UNITS.map(function (u) {
                return '<button class="seg-mini' + ((r.unit || 'day') === u.key ? ' on' : '') + '" type="button" ' +
                    'data-cal="rep-unit" data-value="' + u.key + '">' + u.label + '</button>';
            }).join('') + '一次' +
            '<span class="ev-note-inline">' + escapeHtml(NOTE_TEXT.interval) + '</span></div>';
    } else if (NOTE_TEXT[r.kind]) {
        extra = '<p class="ev-note">' + escapeHtml(NOTE_TEXT[r.kind]) + '</p>';
    }

    return fieldWrap('频率', '<div class="chip-row">' + chips + '</div>' + extra);
}

function formHtml(type, draft) {
    const sched = type.schedule || {};
    const out = [];
    out.push(fieldWrap('开始日期',
        '<input class="text-input" type="date" data-cal="set" data-key="date" value="' + escapeHtml(draft.date) + '">'));
    (type.form || []).forEach(function (f) { out.push(oneField(f, draft)); });
    if (sched.time !== false) {
        out.push(fieldWrap('时间',
            '<input class="text-input ev-time" type="time" data-cal="set" data-key="time" ' +
            'value="' + escapeHtml(draft.time || '') + '">',
            '留空就是不指定具体时间'));
    }
    out.push(repeatHtml(type, draft));
    (type.tail || []).forEach(function (f) { out.push(oneField(f, draft)); });
    return out.join('');
}

let draft = null;

function closeSheet() { api().sheet.close(); }

function openForm(typeId, entry, date) {
    const type = typeById(typeId);
    if (!type) return;
    const sched = type.schedule || {};
    if (entry) {
        draft = JSON.parse(JSON.stringify(entry));
        draft._type = type.id;
        draft.values = draft.values || {};
        draft.repeat = repeatOf(draft);
    } else {
        draft = {
            id: uid(),
            _type: type.id,
            date: date || todayKey(),
            time: sched.defaultKind === 'hourly' ? '08:00' : (sched.time === false ? '' : '08:00'),
            values: {},
            repeat: {
                kind: sched.defaultKind || 'once',
                every: sched.defaultKind === 'hourly' ? 8 : 1,
                unit: 'day'
            }
        };
    }
    drawForm(type, entry ? '编辑' : '添加');
}

function drawForm(type, verb) {
    api().sheet.open(verb + ' · ' + type.name,
        '<div class="cal-form">' + formHtml(type, draft) + '</div>' +
        '<p class="sheet-note">日程只保存在这台设备上，不会上传。</p>',
        '<button class="btn" type="button" data-action="cal-cancel">取消</button>' +
        '<button class="btn primary" type="button" data-action="cal-save" data-type="' + escapeHtml(type.id) + '">保存</button>');
}

function redrawForm() {
    if (!draft) return;
    const body = api().sheet.body();
    const box = body ? body.querySelector('.cal-form') : null;
    const type = typeById(draft._type);
    if (!box || !type) return;
    box.innerHTML = formHtml(type, draft);
}

function setField(key, value) {
    if (!draft) return;
    if (key === 'date' || key === 'time') { draft[key] = value; return; }
    draft.values[key] = value;
}

function saveDraft(typeId) {
    const type = typeById(typeId);
    if (!type || !draft) return;

    const required = (type.form || []).filter(function (f) { return f.required; });
    const missing = required.filter(function (f) {
        const v = draft.values[f.key];
        return v === undefined || v === null || String(v).trim() === '';
    });
    if (missing.length) {
        api().toast('还差：' + missing.map(function (f) { return f.label; }).join('、'));
        return;
    }
    if (!draft.date) {
        api().toast('先选一个开始日期');
        return;
    }
    if (draft.repeat.kind === 'hourly' && !draft.time) {
        api().toast('「每几小时」要填第一次的时间');
        return;
    }

    const clean = {
        id: draft.id,
        date: draft.date,
        time: draft.time || '',
        values: {},
        repeat: {
            kind: draft.repeat.kind,
            every: Math.max(1, Number(draft.repeat.every) || 1),
            unit: draft.repeat.unit || 'day'
        },
        updatedAt: Date.now()
    };
    Object.keys(draft.values || {}).forEach(function (k) {
        const v = draft.values[k];
        if (v === undefined || v === null || String(v).trim() === '') return;
        clean.values[k] = String(v).trim();
    });

    const list = eventsOf(typeId).filter(function (e) { return e.id !== clean.id; });
    list.push(clean);
    saveEvents(typeId, list);
    draft = null;
    api().sheet.close();
    api().toast('已记到 ' + clean.date);
    selected = clean.date;
    cursor = monthStart(clean.date);
    paint();
}

function openTypeSheet(date) {
    const list = types();
    if (!list.length) {
        api().toast('先到设置 · 模块 · 日历及健康 里打开一个日程类型');
        return;
    }
    const rows = list.map(function (type) {
        return '<button class="pick-item" type="button" data-cal="new" data-type="' + escapeHtml(type.id) +
            '" data-date="' + escapeHtml(date || todayKey()) + '">' +
            '<span class="cal-pick"><span class="module-mark">' + api().icon(type.icon) + '</span>' +
            escapeHtml(type.name) + '</span>' +
            '<span class="pick-meta">' + escapeHtml(type.desc || '') + '</span></button>';
    }).join('');
    api().sheet.open('添加日程', '<div class="pick-list">' + rows + '</div>',
        '<button class="btn" type="button" data-action="cal-cancel">取消</button>');
}

function openDetail(typeId, entryId) {
    const type = typeById(typeId);
    if (!type) return;
    const entry = eventsOf(typeId).filter(function (e) { return e.id === entryId; })[0];
    if (!entry) return;

    const rows = [];
    rows.push(['开始', dayLabel(entry.date)]);
    if (entry.time) rows.push(['时间', entry.time]);
    const rep = repeatText(entry);
    if (rep) rows.push(['频率', rep]);
    (type.form || []).concat(type.tail || []).forEach(function (f) {
        const v = entry.values ? entry.values[f.key] : null;
        if (v === undefined || v === null || String(v).trim() === '') return;
        if (f.type === 'choice') {
            const hit = (f.options || []).filter(function (o) { return o.value === v; })[0];
            rows.push([f.label, hit ? hit.label : String(v)]);
            return;
        }
        if (f.type === 'dose') {
            rows.push([f.label, String(v) + (entry.values.doseUnit || '')]);
            return;
        }
        rows.push([f.label, String(v)]);
    });

    api().sheet.open(type.name,
        '<div class="cal-detail">' + rows.map(function (r) {
            return '<div class="cal-detail-row"><span class="cal-detail-key">' + escapeHtml(r[0]) +
                '</span><span class="cal-detail-val">' + escapeHtml(r[1]) + '</span></div>';
        }).join('') + '</div>',
        '<button class="btn" type="button" data-action="cal-ask-delete" data-type="' + escapeHtml(typeId) +
        '" data-id="' + escapeHtml(entryId) + '">删除</button>' +
        '<button class="btn primary" type="button" data-action="cal-edit" data-type="' + escapeHtml(typeId) +
        '" data-id="' + escapeHtml(entryId) + '">编辑</button>');
}

function searchRows(needle) {
    const q = String(needle || '').trim().toLowerCase();
    const out = [];
    if (!q) return out;
    const from = todayKey();

    types().forEach(function (type) {
        eventsOf(type.id).forEach(function (entry) {
            const hay = [type.name, entry.date, entry.time]
                .concat(valueText(type, entry))
                .join(' ').toLowerCase();
            if (hay.indexOf(q) < 0) return;
            const dates = expandDates(entry, entry.date < from ? from : entry.date, shiftKey(from, 400));
            out.push({ type: type, entry: entry, next: dates[0] || null });
        });
    });

    return out.sort(function (a, b) {
        const x = a.next || a.entry.date;
        const y = b.next || b.entry.date;
        return x < y ? 1 : x > y ? -1 : 0;
    }).reverse();
}

function openSearch() {
    api().sheet.open('搜索日程',
        '<input class="text-input cal-search" type="search" data-cal="searchbox" ' +
        'placeholder="药物名、医院、备注里的词…" autocomplete="off">' +
        '<div class="cal-results" id="calResults"></div>',
        '<button class="btn" type="button" data-action="cal-cancel">关闭</button>');
    const input = api().sheet.body().querySelector('.cal-search');
    if (input) input.focus();
}

function drawResults(needle) {
    const box = api().sheet.body().querySelector('#calResults');
    if (!box) return;
    const rows = searchRows(needle);
    if (!String(needle).trim()) {
        box.innerHTML = '<p class="sheet-note">输入几个字，比如药的名字或医院的名字。</p>';
        return;
    }
    if (!rows.length) {
        box.innerHTML = emptyHtml('没有找到');
        return;
    }
    box.innerHTML = rows.map(function (item) {
        const when = item.next ? dayLabel(item.next) : dayLabel(item.entry.date) + '（已过去）';
        return '<button class="pick-item" type="button" data-cal="jump" data-date="' + escapeHtml(item.next || item.entry.date) + '">' +
            '<span>' + escapeHtml(itemTitle(item.type, item.entry)) + '</span>' +
            '<span class="pick-meta">' + escapeHtml(item.type.name + ' · ' + when) + '</span></button>';
    }).join('');
}

function typeFormDef(spec) {
    return {
        key: spec.key,
        type: spec.type,
        label: spec.label,
        options: spec.options,
        rows: spec.rows,
        placeholder: spec.placeholder,
        required: spec.key === 'title'
    };
}

let typeDraft = null;

function openTypeBuilder(existing) {
    const stored = (conf().types || []).filter(function (t) { return t.id === (existing || ''); })[0];
    typeDraft = stored
        ? JSON.parse(JSON.stringify(stored))
        : { id: 'ev_' + Date.now().toString(36), name: '', icon: 'calendar', color: TYPE_COLORS[0], keys: [], time: true, repeats: ['once'] };
    typeDraft.editing = !!stored;
    typeDraft.keys = typeDraft.keys || [];
    typeDraft.repeats = typeDraft.repeats && typeDraft.repeats.length ? typeDraft.repeats : ['once'];
    api().sheet.open(typeDraft.editing ? '编辑日程类型' : '新增日程类型',
        '<div class="cal-form">' + typeFormHtml() + '</div>' +
        '<p class="sheet-note">自己加的类型也会出现在「设置 · 模块 · 日历及健康」里，可以随时关掉。</p>',
        '<button class="btn" type="button" data-action="cal-cancel">取消</button>' +
        '<button class="btn primary" type="button" data-action="cal-type-save">保存</button>');
}

function redrawTypeForm() {
    const body = api().sheet.body();
    const box = body ? body.querySelector('.cal-form') : null;
    if (box) box.innerHTML = typeFormHtml();
}

function typeFormHtml() {
    const d = typeDraft;
    const body =
        fieldWrap('类型名字',
            '<input class="text-input" type="text" data-calt="name" placeholder="例如：血压" value="' +
            escapeHtml(d.name) + '">') +
        fieldWrap('图标',
            '<div class="chip-row">' + TYPE_ICONS.map(function (ic) {
                return '<button class="cal-icon-chip' + (d.icon === ic ? ' on' : '') + '" type="button" ' +
                    'data-calt="icon" data-value="' + ic + '">' + api().icon(ic) + '</button>';
            }).join('') + '</div>') +
        fieldWrap('颜色',
            '<div class="chip-row">' + TYPE_COLORS.map(function (c) {
                return '<button class="cal-color-chip' + (d.color === c ? ' on' : '') + '" type="button" ' +
                    'data-calt="color" data-value="' + c + '" style="--c:' + c + '" aria-label="颜色 ' + c + '"></button>';
            }).join('') + '</div>') +
        fieldWrap('要哪些栏',
            '<div class="cal-check-list">' + FIELD_CATALOG.map(function (f) {
                return '<label class="set-check"><input type="checkbox" data-calt="key" value="' + f.key + '"' +
                    (d.keys.indexOf(f.key) >= 0 ? ' checked' : '') + '>' + escapeHtml(f.label) + '</label>';
            }).join('') + '</div>',
            '「名称」已经固定有了，这里勾的是额外的栏') +
        fieldWrap('时间',
            '<label class="set-check"><input type="checkbox" data-calt="time"' + (d.time === false ? '' : ' checked') +
            '>安排里能填具体几点</label>') +
        fieldWrap('频率',
            '<div class="cal-check-list">' + REPEAT_KINDS.map(function (k) {
                return '<label class="set-check"><input type="checkbox" data-calt="repeat" value="' + k.key + '"' +
                    (d.repeats.indexOf(k.key) >= 0 ? ' checked' : '') + '>' + k.label + '</label>';
            }).join('') + '</div>');

    return body;
}

function customDef(spec) {
    const form = [{ key: 'title', type: 'text', label: '名称', placeholder: '写一句这是干什么的', required: true }];
    const tail = [];
    FIELD_CATALOG.forEach(function (f) {
        if ((spec.keys || []).indexOf(f.key) < 0) return;
        const copy = typeFormDef(f);
        if (f.key === 'note') tail.push(copy);
        else form.push(copy);
    });
    return {
        apiVersion: 1,
        id: spec.id,
        kind: 'event',
        name: spec.name,
        icon: spec.icon || 'calendar',
        color: spec.color || TYPE_COLORS[0],
        desc: '自己加的日程类型',
        group: 'calendar',
        custom: true,
        form: form,
        tail: tail,
        schedule: {
            time: spec.time !== false,
            repeats: (spec.repeats && spec.repeats.length ? spec.repeats : ['once']).slice(),
            defaultKind: (spec.repeats || [])[0] || 'once'
        },
        rowActions: [
            { label: '编辑', act: 'cal-type-edit' },
            { label: '删除', act: 'cal-type-drop', danger: true }
        ]
    };
}

function saveTypeDraft() {
    const d = typeDraft;
    if (!d) return;
    const name = String(d.name || '').trim();
    if (!name) { api().toast('先起个名字'); return; }
    if (!d.repeats.length) { api().toast('频率至少留一个'); return; }

    const spec = {
        id: d.id,
        name: name,
        icon: d.icon,
        color: d.color,
        keys: d.keys,
        time: d.time !== false,
        repeats: d.repeats
    };
    const stored = (conf().types || []).filter(function (t) { return t.id !== spec.id; });
    stored.push(spec);
    api().settings.set('calendar', { types: stored });

    const reg = api().registry;
    if (reg.get(spec.id)) reg.unregister(spec.id);
    ellipse.define(customDef(spec));

    typeDraft = null;
    api().sheet.close();
    api().toast('已保存「' + name + '」');
    api().refresh();
}

function dropType(id) {
    const def = typeById(id);
    if (!def || !def.custom) return;
    const stored = (conf().types || []).filter(function (t) { return t.id !== id; });
    api().settings.set('calendar', { types: stored });
    api().registry.uninstall(id);
    api().toast('已删除「' + def.name + '」');
    api().refresh();
}

function remindState() {
    try {
        const raw = JSON.parse(localStorage.getItem(REMIND_KEY) || 'null');
        if (raw && raw.date === todayKey() && raw.sigs && typeof raw.sigs === 'object') return raw;
    } catch (err) {}
    return { date: todayKey(), sigs: {} };
}

let remind = remindState();

function markReminded(sig) {
    remind.sigs[sig] = 1;
    try { localStorage.setItem(REMIND_KEY, JSON.stringify(remind)); } catch (err) {}
}

function sigOf(item) {
    return item.date + '|' + item.type.id + '|' + item.entry.id + '|' + item.time;
}

function notify(title, body) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
    const opts = { body: body, icon: 'icon-192.png' };
    try {
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
            navigator.serviceWorker.ready
                .then(function (reg) { return reg.showNotification(title, opts); })
                .catch(function () {});
            return true;
        }
    } catch (err) {}
    try { new Notification(title, opts); return true; } catch (err) { return false; }
}

function describe(item) {
    const extra = valueText(item.type, item.entry).join(' · ');
    return (item.time ? item.time + ' ' : '') + item.type.name +
        (itemTitle(item.type, item.entry) !== item.type.name ? ' · ' + itemTitle(item.type, item.entry) : '') +
        (extra ? '（' + extra + '）' : '');
}

function sweep(boot) {
    if (typeof document === 'undefined' || !document.getElementById || !document.getElementById('toast')) return;
    const a = api();
    if (!a || !a.registry || !a.registry.isEnabled('calendar')) return;
    if (!conf().remind) return;
    if (document.hidden) return;

    if (remind.date !== todayKey()) remind = { date: todayKey(), sigs: {} };

    const mins = nowMinutes();
    const due = itemsOn(todayKey()).filter(function (item) {
        if (!item.time) return false;
        if (toMinutes(item.time) > mins) return false;
        return !remind.sigs[sigOf(item)];
    });
    if (!due.length) return;

    due.forEach(function (item) { markReminded(sigOf(item)); });

    if (boot || due.length > 1) {
        const head = due.length + ' 项没做：' + describe(due[0]);
        notify('今天的日程', due.slice(0, 4).map(describe).join('；'));
        a.toast(head);
        return;
    }
    const one = due[0];
    notify(one.type.name, describe(one));
    a.toast('该做：' + describe(one));
}

function handleClick(evt) {
    const raw = evt.target;
    if (raw && raw.closest && raw.closest('input, textarea, select')) return;
    const node = raw && raw.closest ? raw.closest('[data-cal],[data-calt]') : null;
    if (!node) return;
    const calt = node.getAttribute('data-calt');
    if (calt) { onTypeClick(calt, node); return; }

    const act = node.getAttribute('data-cal');
    const date = node.getAttribute('data-date');

    if (act === 'pick') { selectDay(node.getAttribute('data-key')); return; }
    if (act === 'today') { selectDay(todayKey()); return; }
    if (act === 'month') { cursor = shiftMonth(cursor, Number(node.getAttribute('data-dir')) || 1); paint(); return; }
    if (act === 'view') { setView(node.getAttribute('data-value')); return; }
    if (act === 'add') { openTypeSheet(date || selected); return; }
    if (act === 'new') { openForm(node.getAttribute('data-type'), null, date); return; }
    if (act === 'search') { openSearch(); return; }
    if (act === 'item') { openDetail(node.getAttribute('data-type'), node.getAttribute('data-id')); return; }
    if (act === 'jump') { jumpTo(date); return; }
    if (act === 'choice') {
        const key = node.getAttribute('data-key');
        setField(key, node.getAttribute('data-value'));
        redrawForm();
        return;
    }
    if (act === 'rep-kind') {
        draft.repeat.kind = node.getAttribute('data-value');
        redrawForm();
        return;
    }
    if (act === 'rep-unit') {
        draft.repeat.unit = node.getAttribute('data-value');
        redrawForm();
        return;
    }
}

function onTypeClick(kind, node) {
    if (!typeDraft) return;
    const value = node.getAttribute('data-value');
    if (kind === 'icon') typeDraft.icon = value;
    if (kind === 'color') typeDraft.color = value;
    redrawTypeForm();
}

function handleInput(evt) {
    const node = evt.target;
    if (!node || !node.getAttribute) return;
    const calt = node.getAttribute('data-calt');
    if (calt) {
        if (!typeDraft) return;
        if (calt === 'name') typeDraft.name = node.value;
        else if (calt === 'time') typeDraft.time = node.checked;
        else if (calt === 'key') toggleIn(typeDraft.keys, node.value, node.checked);
        else if (calt === 'repeat') toggleIn(typeDraft.repeats, node.value, node.checked);
        return;
    }
    const act = node.getAttribute('data-cal');
    if (act === 'set' || act === 'val') { setField(node.getAttribute('data-key'), node.value); return; }
    if (act === 'rep-n') {
        if (draft) draft.repeat.every = Math.max(1, Number(String(node.value).replace(/[^\d]/g, '')) || 1);
        return;
    }
    if (act === 'searchbox') { drawResults(node.value); return; }
}

function toggleIn(list, value, on) {
    const at = list.indexOf(value);
    if (on && at < 0) list.push(value);
    if (!on && at >= 0) list.splice(at, 1);
}

let view = 'month';
let cursor = monthStart(todayKey());
let selected = todayKey();
let bound = false;

function currentBody() {
    const body = document.getElementById('pageBody');
    if (!body || body.dataset.module !== 'calendar') return null;
    return body;
}

function paint() {
    const body = currentBody();
    if (!body) return;

    body.innerHTML = '';
    const head = el('div', 'cal-head');
    head.innerHTML =
        '<button class="date-nav" type="button" data-cal="month" data-dir="-1" aria-label="上一个月">' +
        api().icon('back') + '</button>' +
        '<span class="cal-month">' + escapeHtml(monthLabel(cursor)) + '</span>' +
        '<button class="date-nav cal-next" type="button" data-cal="month" data-dir="1" aria-label="下一个月">' +
        api().icon('back') + '</button>' +
        '<span class="cal-views">' +
        '<button class="seg-mini' + (view === 'month' ? ' on' : '') + '" type="button" data-cal="view" data-value="month">月</button>' +
        '<button class="seg-mini' + (view === 'list' ? ' on' : '') + '" type="button" data-cal="view" data-value="list">列表</button>' +
        '</span>';
    body.appendChild(head);

    if (view === 'month') buildMonth(body, cursor, selected);
    else buildList(body, cursor, selected);

    const add = el('button', 'cal-add', api().icon('plus'));
    add.type = 'button';
    add.setAttribute('data-cal', 'add');
    add.setAttribute('data-date', view === 'month' ? selected : todayKey());
    add.setAttribute('aria-label', '添加日程');
    body.appendChild(add);
}

function selectDay(key) {
    selected = key;
    if (key.slice(0, 7) !== cursor.slice(0, 7)) cursor = monthStart(key);
    paint();
}

function setView(next) {
    view = next === 'list' ? 'list' : 'month';
    api().settings.set('calendar', { lastView: view });
    paint();
}

function jumpTo(date) {
    if (!date) return;
    selected = date;
    cursor = monthStart(date);
    view = 'month';
    api().sheet.close();
    paint();
}

function bindOnce() {
    if (bound) return;
    bound = true;
    document.addEventListener('click', handleClick);
    document.addEventListener('input', handleInput);
}

function startWatch() {
    if (typeof document === 'undefined' || !document.getElementById || !document.getElementById('sheet')) return;
    bindOnce();
    setTimeout(function () { sweep(true); }, 1200);
    setInterval(function () { sweep(false); }, SWEEP_MS);
}

BUILTIN_TYPES.forEach(function (spec) {
    const def = Object.assign({
        apiVersion: 1,
        kind: 'event',
        group: 'calendar',
        rowActions: [{ label: '添加一项', act: 'cal-add-for' }]
    }, spec);
    ellipse.define(def);
});

(function (conf0) {
    const list = conf0.types;
    if (!Array.isArray(list)) return;
    list.forEach(function (spec) {
        if (!spec || !spec.id || !spec.name) return;
        ellipse.define(customDef(spec));
    });
})(api().settings.get('calendar'));

startWatch();

ellipse.define({
    apiVersion: 1,
    id: 'calendar',
    kind: 'page',
    name: '日历及健康',
    icon: 'calendar',
    color: '#de7b49',
    desc: '把吃药、就医、复诊、体检安排进日历',
    note: '日程只保存在这台设备上',

    group: 'calendar',
    groupTitle: '日历及健康',
    groupAction: { label: '新增日程类型', act: 'cal-type-new' },

    expandDates: expandDates,
    timesOn: timesOn,
    occursOn: occursOn,

    actions: {
        'cal-add-for': function (ctx) {
            const id = ctx.target && ctx.target.getAttribute('data-id');
            if (id) openForm(id, null, todayKey());
        },
        'cal-type-new': function (ctx) { openTypeBuilder(null); },
        'cal-type-edit': function (ctx) {
            const id = ctx.target && ctx.target.getAttribute('data-id');
            if (id) { typeDraft = null; openTypeBuilder(id); }
        },
        'cal-type-drop': function (ctx) {
            const id = ctx.target && ctx.target.getAttribute('data-id');
            const def = id ? typeById(id) : null;
            if (!def) return;
            api().sheet.open('删除「' + def.name + '」',
                '<p class="sheet-note">这个类型下面记的日程会一起消失，删掉就找不回来了。' +
                '只是想先不用它，可以把上面的开关关掉 —— 数据还在。</p>',
                '<button class="btn" type="button" data-action="cal-cancel">取消</button>' +
                '<button class="btn danger" type="button" data-action="cal-type-drop-ok" data-id="' +
                escapeHtml(id) + '">删除</button>');
        },
        'cal-type-drop-ok': function (ctx) {
            dropType(ctx.target.getAttribute('data-id'));
            api().sheet.close();
            if (ctx.rerender) ctx.rerender();
        },
        'cal-type-save': function () { saveTypeDraft(); },
        'cal-cancel': function () { draft = null; typeDraft = null; api().sheet.close(); },
        'cal-save': function (ctx) { saveDraft(ctx.target.getAttribute('data-type')); },
        'cal-ask-delete': function (ctx) {
            const typeId = ctx.target.getAttribute('data-type');
            const id = ctx.target.getAttribute('data-id');
            api().sheet.open('删除这一项',
                '<p class="sheet-note">删掉就找不回来了。</p>',
                '<button class="btn" type="button" data-action="cal-back" data-type="' + escapeHtml(typeId) +
                '" data-id="' + escapeHtml(id) + '">再想想</button>' +
                '<button class="btn danger" type="button" data-action="cal-delete-ok" data-type="' + escapeHtml(typeId) +
                '" data-id="' + escapeHtml(id) + '">删除</button>');
        },
        'cal-back': function (ctx) {
            openDetail(ctx.target.getAttribute('data-type'), ctx.target.getAttribute('data-id'));
        },
        'cal-delete-ok': function (ctx) {
            const typeId = ctx.target.getAttribute('data-type');
            const id = ctx.target.getAttribute('data-id');
            saveEvents(typeId, eventsOf(typeId).filter(function (e) { return e.id !== id; }));
            api().sheet.close();
            api().toast('已删除');
            paint();
        },
        'cal-edit': function (ctx) {
            openForm(ctx.target.getAttribute('data-type'), eventsOf(ctx.target.getAttribute('data-type'))
                .filter(function (e) { return e.id === ctx.target.getAttribute('data-id'); })[0] || null, null);
        }
    },

    mount: function (body, ctx) {
        const a = ctx.api;
        view = a.settings.get('calendar').lastView === 'list' ? 'list' : 'month';
        cursor = monthStart(ctx.date || todayKey());
        selected = ctx.date || todayKey();

        if (ctx.head) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'page-back cal-search-btn';
            btn.setAttribute('data-head-extra', '');
            btn.setAttribute('data-cal', 'search');
            btn.setAttribute('aria-label', '搜索日程');
            btn.setAttribute('title', '搜索日程');
            btn.innerHTML = a.icon('search');
            ctx.head.appendChild(btn);
        }

        paint();
    },

    settingsSections: [{
        id: 'calendar',
        title: '日历',
        note: '打开先看哪个、每周从哪天开始、要不要到点提醒',
        html: function (ctx) {
            const c = ctx.api.settings.get('calendar');
            const viewId = c.lastView === 'list' ? 'list' : 'month';
            const start = c.weekStart === 1 ? 1 : 0;
            const granted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
            const canNotify = typeof Notification !== 'undefined';

            return '<div class="set-row">' +
                '<span class="set-row-main"><span class="set-row-title">打开时先看</span>' +
                '<span class="set-row-desc">点开「日历及健康」时先落在哪个界面</span></span>' +
                '<span class="set-row-side"><span class="seg">' +
                '<button class="seg-item' + (viewId === 'month' ? ' on' : '') +
                '" type="button" data-cal-set="view" data-value="month">月</button>' +
                '<button class="seg-item' + (viewId === 'list' ? ' on' : '') +
                '" type="button" data-cal-set="view" data-value="list">列表</button>' +
                '</span></span></div>' +

                '<div class="set-row">' +
                '<span class="set-row-main"><span class="set-row-title">本周从哪天开始</span>' +
                '<span class="set-row-desc">月历每一行的第一天</span></span>' +
                '<span class="set-row-side"><span class="seg">' +
                '<button class="seg-item' + (start === 0 ? ' on' : '') +
                '" type="button" data-cal-set="week" data-value="0">周日</button>' +
                '<button class="seg-item' + (start === 1 ? ' on' : '') +
                '" type="button" data-cal-set="week" data-value="1">周一</button>' +
                '</span></span></div>' +

                '<div class="set-row' + (c.remind ? '' : ' is-off') + '">' +
                '<span class="set-row-main"><span class="set-row-title">到点提醒' +
                (granted ? '' : '<em class="set-badge set-badge--off">未授权</em>') + '</span>' +
                '<span class="set-row-desc">打开这个页面就会把今天该做的事列出来；' +
                '装到主屏并允许通知后，到点会弹系统通知（手机上要 iOS 16.4 以上）。</span></span>' +
                '<span class="set-row-side"><button class="switch' + (c.remind ? ' on' : '') +
                '" type="button" role="switch" aria-checked="' + (c.remind ? 'true' : 'false') +
                '" data-cal-set="remind"><span class="switch-label" aria-hidden="true">' +
                (c.remind ? '开' : '关') + '</span></button></span></div>' +

                '<p class="sheet-note">' + (canNotify ? '' :
                    '这个浏览器不支持通知，只能靠打开 App 时提醒。') + '</p>' +
                '<div class="set-actions">' +
                '<button class="btn" type="button" data-cal-set="test">试一条提醒</button>' +
                '</div>';
        },
        bind: function (root, ctx) {
            root.addEventListener('click', function (evt) {
                const btn = evt.target.closest('[data-cal-set]');
                if (!btn) return;
                const what = btn.getAttribute('data-cal-set');
                const value = btn.getAttribute('data-value');

                if (what === 'view') ctx.api.settings.set('calendar', { lastView: value });
                else if (what === 'week') ctx.api.settings.set('calendar', { weekStart: Number(value) });
                else if (what === 'remind') toggleRemind(btn);
                else if (what === 'test') {
                    const ok = notify('测试提醒', '看到这条就说明通知能用。');
                    ctx.api.toast(ok ? '已发出，看通知栏' : '这个浏览器发不出通知，改用打开 App 时提醒');
                }
                ctx.rerender();
            });
        }
    }]
});

function toggleRemind(btn) {
    const on = btn.classList.contains('on');
    if (on) {
        api().settings.set('calendar', { remind: false });
        api().toast('已关掉提醒');
        return;
    }
    api().settings.set('calendar', { remind: true });
    if (typeof Notification === 'undefined') {
        api().toast('这个浏览器不支持系统通知，改成打开 App 时提醒');
        return;
    }
    if (Notification.permission === 'granted') {
        api().toast('提醒已打开');
        return;
    }
    Notification.requestPermission().then(function (res) {
        api().toast(res === 'granted' ? '提醒已打开，到点会弹通知' : '没有允许通知，只能在打开 App 时提醒');
    });
}
