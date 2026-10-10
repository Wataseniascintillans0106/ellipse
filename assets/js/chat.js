import { readNumber, toKey, fromKey, todayKey } from './util.js';

const FENCE = '```ellipse';
const MAX_READ_DAYS = 31;
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

const CRISIS_WORDS = [
    '不想活', '活不下去', '想死', '去死', '死了算了', '不如死', '自杀', '轻生',
    '结束生命', '了结自己', '活着没意思', '活着没意义', '生无可恋', '想不开',
    '跳楼', '割腕', '吞药', '吃安眠药', '没人在乎我'
];

export function crisisHit(text) {
    const s = String(text === null || text === undefined ? '' : text);
    if (!s.trim()) return false;
    return CRISIS_WORDS.some(function (w) { return s.indexOf(w) >= 0; });
}

export function crisisReply() {
    return {
        lead: '你说的这些我记下了。',
        body: '我不是医生，跟你说不上话的那些事，我想请你交给一个真能帮上忙的人。',
        lines: [
            { label: '心理援助热线', value: '12356', note: '全国统一，免费' },
            { label: '你的主治医生', value: '联系他／她', note: '或者去最近的医院' },
            { label: '现在就撑不住了', value: '120 / 110', note: '别自己扛' }
        ],
        tail: '我会一直在这儿。'
    };
}

export function splitReply(raw) {
    const s = String(raw === null || raw === undefined ? '' : raw);
    const at = s.indexOf(FENCE);
    if (at < 0) return { prose: s, block: null, found: false, closed: false };
    const rest = s.slice(at);
    const close = rest.indexOf('```', FENCE.length);
    if (close < 0) return { prose: s.slice(0, at), block: null, found: true, closed: false };
    return { prose: s.slice(0, at), block: rest.slice(FENCE.length, close), found: true, closed: true };
}

export function proseSoFar(raw) {
    const s = String(raw === null || raw === undefined ? '' : raw);
    const at = s.indexOf(FENCE);
    if (at >= 0) return s.slice(0, at);
    const keep = FENCE.length - 1;
    return s.length > keep ? s.slice(0, s.length - keep) : '';
}

export function parseActions(block) {
    let data = null;
    try { data = JSON.parse(String(block === null || block === undefined ? '' : block).trim()); } catch (err) {
        return { acts: [], error: '看不懂这段指令' };
    }
    const list = Array.isArray(data) ? data : (data && Array.isArray(data.do) ? data.do : null);
    if (!list) return { acts: [], error: '看不懂这段指令' };
    const bad = list.filter(function (a) {
        return !a || typeof a !== 'object' || Array.isArray(a);
    });
    if (bad.length) return { acts: [], error: '这段指令里有读不懂的一条' };
    if (!list.length) return { acts: [], error: null };
    return { acts: list, error: null };
}

function isKey(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }

function realDay(s) {
    if (!isKey(s)) return null;
    const back = toKey(fromKey(String(s)));
    return back === String(s) ? String(s) : null;
}

function isTime(s) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || '')); }

function daysBetween(from, to) {
    return Math.round((fromKey(to) - fromKey(from)) / 86400000) + 1;
}

function eachDay(from, to) {
    const out = [];
    const n = daysBetween(from, to);
    for (let i = 0; i < n; i++) {
        const d = fromKey(from);
        d.setDate(d.getDate() + i);
        out.push(toKey(d));
    }
    return out;
}

function blank(v) { return v === null || v === undefined || String(v).trim() === ''; }

function fmtDay(key) {
    const parts = String(key).split('-');
    return Number(parts[1]) + ' 月 ' + Number(parts[2]) + ' 日（周' + WEEK[fromKey(key).getDay()] + '）';
}

export function normalizeFieldValue(field, raw) {
    const f = field || {};
    const type = f.type || 'text';
    if (blank(raw)) return { ok: true, value: null };

    if (type === 'scale' || type === 'slider' || type === 'number') {
        const min = f.min === undefined ? (type === 'scale' ? 1 : 0) : f.min;
        const max = f.max === undefined ? (type === 'number' ? null : 10) : f.max;
        const n = readNumber(raw);
        if (n === null) return { ok: false, reason: '要填数字' };
        if (type !== 'number' && !Number.isInteger(n)) return { ok: false, reason: '要填整数' };
        if (n < min) return { ok: false, reason: '不能小于 ' + min };
        if (max !== null && n > max) return { ok: false, reason: '不能大于 ' + max };
        return { ok: true, value: n };
    }

    if (type === 'enum') {
        const opts = f.options || [];
        const t = String(raw).trim();
        let hit = null;
        opts.forEach(function (o) { if (!hit && String(o.value) === t) hit = o; });
        if (!hit) opts.forEach(function (o) { if (!hit && String(o.label).trim() === t) hit = o; });
        if (!hit) {
            const loose = opts.filter(function (o) { return String(o.label).indexOf(t) >= 0; });
            if (loose.length === 1) hit = loose[0];
        }
        if (!hit) {
            return { ok: false, reason: '只能填：' + opts.map(function (o) { return o.label; }).join(' / ') };
        }
        return { ok: true, value: hit.value };
    }

    const text = type === 'textarea' ? String(raw) : String(raw).trim();
    if (f.maxlength && text.length > f.maxlength) {
        return { ok: false, reason: '太长了，最多 ' + f.maxlength + ' 字' };
    }
    return { ok: true, value: text };
}

export function valueText(field, value) {
    if (value === null || value === undefined) return '清空';
    const f = field || {};
    if ((f.type === 'enum') && f.options) {
        const hit = f.options.filter(function (o) { return String(o.value) === String(value); })[0];
        if (hit) return String(hit.label);
    }
    return String(value) + (f.unit ? ' ' + f.unit : '');
}

function typeFields(type) {
    if (!type) return [];
    if (Array.isArray(type.fields)) return type.fields;
    return (type.form || []).concat(type.tail || []);
}

function typeKinds(type) {
    const kinds = (type && type.repeats) || (type && type.schedule && type.schedule.repeats);
    return kinds && kinds.length ? kinds : ['once'];
}

export function normalizeEventValues(type, values) {
    const t = type || {};
    const fields = typeFields(t);
    const given = values && typeof values === 'object' ? values : {};
    const known = {};
    fields.forEach(function (f) { known[f.key] = f; });
    const out = {};
    const bad = [];

    Object.keys(given).forEach(function (key) {
        if (blank(given[key])) return;
        if (key === 'doseUnit') {
            if (fields.some(function (f) { return f.type === 'dose'; })) out[key] = String(given[key]).trim();
            return;
        }
        const f = known[key];
        if (!f) { bad.push('这种日程里没有「' + key + '」这一项'); return; }
        const use = f.type === 'dose' ? { type: 'number', min: 0 } : f;
        const got = normalizeFieldValue(use, given[key]);
        if (!got.ok) { bad.push(f.label + '：' + got.reason); return; }
        if (got.value === null) return;
        out[key] = String(got.value);
    });

    const missing = fields.filter(function (f) {
        return f.type !== 'doseUnit' && f.required && blank(out[f.key]);
    });
    if (missing.length) bad.push('还差：' + missing.map(function (f) { return f.label; }).join('、'));

    if (bad.length) return { ok: false, reason: bad[0] };
    return { ok: true, values: out };
}

export function normalizeRepeat(type, raw) {
    const sched = (type && type.schedule) || {};
    const kinds = typeKinds(type);
    const r = (raw && typeof raw === 'object') ? raw : {};
    let kind = String(r.kind || sched.defaultKind || kinds[0] || 'once').trim();
    if (kinds.indexOf(kind) < 0) {
        return { ok: false, reason: '「' + kind + '」这种频率这个日程类型不支持' };
    }
    const unit = ['day', 'week', 'month', 'year'].indexOf(r.unit) >= 0 ? r.unit : 'day';
    return {
        ok: true,
        repeat: { kind: kind, every: Math.max(1, Number(r.every) || 1), unit: unit }
    };
}

export function repeatLabel(repeat) {
    const r = repeat || { kind: 'once' };
    if (r.kind === 'daily') return '每天';
    if (r.kind === 'hourly') return '每 ' + (Number(r.every) || 1) + ' 小时';
    if (r.kind === 'interval') {
        const unit = r.unit === 'week' ? '周' : r.unit === 'month' ? '个月' : r.unit === 'year' ? '年' : '天';
        return '隔 ' + (Number(r.every) || 1) + ' ' + unit;
    }
    return '';
}

function recordsOf(world) { return (world && world.records) || []; }

function eventsOf(world) { return (world && world.events) || []; }

function findRecord(world, ref) {
    const s = String(ref === null || ref === undefined ? '' : ref).trim().toLowerCase();
    if (!s) return null;
    return recordsOf(world).filter(function (m) {
        return m.id.toLowerCase() === s || String(m.name).trim().toLowerCase() === s;
    })[0] || null;
}

function findField(record, ref) {
    const s = String(ref === null || ref === undefined ? '' : ref).trim().toLowerCase();
    if (!s) return null;
    return (record.fields || []).filter(function (f) {
        return f.key.toLowerCase() === s || String(f.label).trim().toLowerCase() === s;
    })[0] || null;
}

function findEventType(world, ref) {
    const s = String(ref === null || ref === undefined ? '' : ref).trim().toLowerCase();
    if (!s) return null;
    return eventsOf(world).filter(function (t) {
        return t.id.toLowerCase() === s || String(t.name).trim().toLowerCase() === s;
    })[0] || null;
}

function entryValueLines(type, values) {
    const fields = typeFields(type);
    const v = values || {};
    const out = [];
    fields.forEach(function (f) {
        const raw = v[f.key];
        if (blank(raw)) return;
        if (f.type === 'dose') {
            out.push(f.label + ' ' + String(raw) + (v.doseUnit ? v.doseUnit : ''));
            return;
        }
        if (f.type === 'choice') {
            const hit = (f.options || []).filter(function (o) { return String(o.value) === String(raw); })[0];
            out.push(f.label + ' ' + (hit ? hit.label : String(raw)));
            return;
        }
        out.push(f.label + ' ' + String(raw));
    });
    return out;
}

export function entryLabel(type, entry) {
    const name = typeof type.title === 'function' ? String(type.title(entry) || '') : '';
    const parts = [];
    parts.push(type.name + (name ? '·' + name : ''));
    parts.push(fmtDay(entry.date) + (entry.time ? ' ' + entry.time : ''));
    const rep = repeatLabel(entry.repeat);
    if (rep) parts.push(rep + '（这一整条）');
    return parts.join(' · ');
}

export function resolveEventRef(ref, world) {
    const types = eventsOf(world);
    const r = ref || {};
    const byType = r.type ? findEventType(world, r.type) : null;
    if (r.type && !byType) {
        return { status: 'none', matches: [], reason: '没有「' + r.type + '」这种日程' };
    }
    const pool = byType ? [byType] : types;

    if (r.id) {
        const hits = [];
        pool.forEach(function (t) {
            (t.events || []).forEach(function (entry) {
                if (entry.id === r.id) hits.push({ type: t, entry: entry });
            });
        });
        if (hits.length === 1) return { status: 'ok', matches: hits };
        return { status: hits.length ? 'many' : 'none', matches: hits };
    }

    const matches = [];
    pool.forEach(function (t) {
        (t.events || []).forEach(function (entry) {
            if (r.date) {
                const same = entry.date === r.date;
                const hit = typeof t.occurs === 'function' ? t.occurs(entry, r.date) : false;
                if (!same && !hit) return;
            }
            if (r.time && String(entry.time || '') !== String(r.time)) return;
            if (r.match) {
                const hay = [t.name, typeof t.title === 'function' ? t.title(entry) : '',
                    typeof t.values === 'function' ? t.values(entry) : '',
                    entry.values ? Object.keys(entry.values).map(function (k) {
                        return entry.values[k];
                    }).join(' ') : ''
                ].join(' ').toLowerCase();
                if (hay.indexOf(String(r.match).trim().toLowerCase()) < 0) return;
            }
            matches.push({ type: t, entry: entry });
        });
    });

    if (!matches.length) return { status: 'none', matches: [] };
    if (matches.length > 1) return { status: 'many', matches: matches };
    return { status: 'ok', matches: matches };
}

export function validateAction(act, world) {
    const a = act && typeof act === 'object' ? act : null;
    if (!a) return { ok: false, reason: '有一条指令看不懂' };
    const kind = String(a.act || '').trim();
    const today = (world && world.today) || todayKey();

    if (kind === 'set-field') {
        const date = realDay(a.date);
        if (!date) return { ok: false, reason: '日期「' + a.date + '」不对' };
        if (date < '2000-01-01') return { ok: false, reason: '日期太早了' };
        if (date > today) return { ok: false, reason: '还没到 ' + fmtDay(date) + '，记不了' };
        const record = findRecord(world, a.module);
        if (!record) return { ok: false, reason: '没有「' + a.module + '」这个记录模块' };
        const field = findField(record, a.field);
        if (!field) return { ok: false, reason: record.name + '里没有「' + a.field + '」这一项' };
        const got = normalizeFieldValue(field, a.value);
        if (!got.ok) return { ok: false, reason: field.label + '：' + got.reason };
        const spec = {
            kind: 'set-field',
            date: date,
            moduleId: record.id,
            moduleName: record.name,
            fieldKey: field.key,
            fieldDef: field,
            value: got.value
        };
        if (got.value === null) return { ok: false, reason: field.label + '想清空，得先有值' };
        return { ok: true, spec: spec };
    }

    if (kind === 'add-event') {
        const type = findEventType(world, a.type);
        if (!type) return { ok: false, reason: '没有「' + a.type + '」这种日程' };
        const date = realDay(a.date);
        if (!date) return { ok: false, reason: '日期「' + a.date + '」不对' };
        if (date < '2000-01-01') return { ok: false, reason: '日期太早了' };
        const time = blank(a.time) ? '' : String(a.time).trim();
        if (time && !isTime(time)) return { ok: false, reason: '时间「' + a.time + '」不对' };
        const rep = normalizeRepeat(type, a.repeat);
        if (!rep.ok) return { ok: false, reason: rep.reason };
        if (rep.repeat.kind === 'hourly' && !time) {
            return { ok: false, reason: '「每几小时」要一起说第一次是几点' };
        }
        const got = normalizeEventValues(type, a.values);
        if (!got.ok) return { ok: false, reason: got.reason };
        return {
            ok: true,
            spec: {
                kind: 'add-event',
                typeId: type.id,
                typeName: type.name,
                date: date,
                time: time,
                values: got.values,
                repeat: rep.repeat,
                title: typeof type.title === 'function' ? String(type.title({ values: got.values }) || '') : '',
                valueLines: entryValueLines(type, got.values)
            }
        };
    }

    if (kind === 'update-event' || kind === 'delete-event') {
        const hit = resolveEventRef(a, world);
        if (hit.status === 'none') {
            return { ok: false, reason: hit.reason || '没有找到符合这一条的日程' };
        }
        const spec = {
            kind: kind,
            matches: hit.matches.map(function (m) {
                return {
                    typeId: m.type.id,
                    typeName: m.type.name,
                    eventId: m.entry.id,
                    label: entryLabel(m.type, m.entry)
                };
            })
        };
        if (kind === 'delete-event') return { ok: true, spec: spec };

        const set = a.set && typeof a.set === 'object' ? a.set : {};
        const target = hit.matches[0].type;
        const next = {};
        if (!blank(set.date)) {
            const d = realDay(set.date);
            if (!d) return { ok: false, reason: '改成「' + set.date + '」这个日期不对' };
            next.date = d;
        }
        if (set.time !== undefined) {
            const t = blank(set.time) ? '' : String(set.time).trim();
            if (t && !isTime(t)) return { ok: false, reason: '时间「' + set.time + '」不对' };
            next.time = t;
        }
        if (set.repeat) {
            const rep = normalizeRepeat(target, set.repeat);
            if (!rep.ok) return { ok: false, reason: rep.reason };
            next.repeat = rep.repeat;
        }
        if (set.values) {
            const got = normalizeEventValues(target, set.values);
            if (!got.ok) return { ok: false, reason: got.reason };
            next.values = got.values;
            spec.setLines = entryValueLines(target, got.values);
        }
        if (!Object.keys(next).length) return { ok: false, reason: '没说要改成什么' };
        spec.set = next;
        return { ok: true, spec: spec };
    }

    if (kind === 'read-records') {
        const got = readSpec(a, world);
        if (!got.ok) return { ok: false, reason: got.reason };
        return { ok: true, spec: got };
    }

    return { ok: false, reason: '不认识「' + kind + '」这种指令' };
}

export function readSpec(act, world) {
    const a = act || {};
    const from = realDay(a.from);
    const to = realDay(a.to);
    if (!from || !to) return { ok: false, reason: '要看的日子没写对' };
    if (from > to) return { ok: false, reason: '要看的日子起止反了' };
    if (daysBetween(from, to) > MAX_READ_DAYS) {
        return { ok: false, reason: '一次最多看 ' + MAX_READ_DAYS + ' 天' };
    }
    const pool = recordsOf(world);
    let ids = Array.isArray(a.modules) ? a.modules.filter(function (x) { return !blank(x); }) : [];
    const picked = [];
    if (!ids.length) {
        pool.forEach(function (m) { picked.push(m.id); });
    } else {
        const missing = [];
        ids.forEach(function (ref) {
            const hit = findRecord(world, ref);
            if (!hit) { missing.push(String(ref)); return; }
            if (picked.indexOf(hit.id) < 0) picked.push(hit.id);
        });
        if (missing.length) return { ok: false, reason: '没有这些记录模块：' + missing.join('、') };
    }
    if (!picked.length) return { ok: false, reason: '没有可读的记录模块' };
    return {
        ok: true,
        kind: 'read-records',
        from: from,
        to: to,
        modules: picked,
        names: picked.map(function (id) {
            const hit = pool.filter(function (m) { return m.id === id; })[0];
            return hit ? hit.name : id;
        }),
        days: daysBetween(from, to)
    };
}

function rowLine(fields, data) {
    const parts = [];
    (fields || []).forEach(function (f) {
        const v = data ? data[f.key] : undefined;
        if (blank(v)) return;
        parts.push(f.label + ' ' + valueText(f, v));
    });
    return parts.join('；');
}

export function readDigest(spec, world, dataOf) {
    const out = ['【用户已同意你查看的记录】' + spec.from + ' 至 ' + spec.to];
    spec.modules.forEach(function (id) {
        const record = recordsOf(world).filter(function (m) { return m.id === id; })[0];
        if (!record) return;
        out.push('');
        out.push('## ' + record.name);
        let any = false;
        eachDay(spec.from, spec.to).forEach(function (key) {
            const line = rowLine(record.fields, dataOf(key)[id]);
            if (!line) return;
            any = true;
            out.push(key + '：' + line);
        });
        if (!any) out.push('（这段时间没有记过）');
    });
    return out.join('\n');
}

export function describeAction(spec) {
    if (spec.kind === 'set-field') {
        return {
            title: '填一条状态记录',
            items: [fmtDay(spec.date) + ' · ' + spec.moduleName + ' · ' +
                spec.fieldDef.label + ' = ' + valueText(spec.fieldDef, spec.value)]
        };
    }
    if (spec.kind === 'add-event') {
        const items = [fmtDay(spec.date) + (spec.time ? ' ' + spec.time : ' 不限时刻') +
            ' · ' + spec.typeName + (spec.title ? '·' + spec.title : '')];
        const rep = repeatLabel(spec.repeat);
        items.push(rep ? '重复：' + rep : '只这一次');
        (spec.valueLines || []).forEach(function (line) { items.push(line); });
        return { title: '加一条日程', items: items };
    }
    if (spec.kind === 'update-event') {
        const items = spec.matches.map(function (m) { return '原来：' + m.label; });
        if (spec.set.date) items.push('日期改成：' + fmtDay(spec.set.date));
        if (spec.set.time !== undefined) items.push('时间改成：' + (spec.set.time || '不设时刻'));
        if (spec.set.repeat) items.push('重复改成：' + repeatLabel(spec.set.repeat));
        (spec.setLines || []).forEach(function (line) { items.push('改成：' + line); });
        items.push('改的是这一整条，不是其中一次');
        return { title: '改一条日程', items: items };
    }
    if (spec.kind === 'delete-event') {
        const items = spec.matches.map(function (m) { return m.label; });
        items.push('删掉的是这一整条，不是其中一次');
        return { title: '删一条日程', items: items };
    }
    if (spec.kind === 'read-records') {
        return {
            title: '弦音想看你的记录',
            items: [
                '时间：' + fmtDay(spec.from) + ' 到 ' + fmtDay(spec.to) + '，共 ' + spec.days + ' 天',
                '内容：' + (spec.names || spec.modules).join('、')
            ]
        };
    }
    return { title: '一条指令', items: [] };
}

function fieldHow(f) {
    const type = f.type || 'text';
    if (type === 'scale') {
        return (f.min === undefined ? 1 : f.min) + '-' + (f.max === undefined ? 10 : f.max) + ' 分的整数';
    }
    if (type === 'slider') {
        return (f.min === undefined ? 0 : f.min) + '-' + (f.max === undefined ? 10 : f.max) + ' 分的整数';
    }
    if (type === 'number') {
        const bits = ['数字'];
        if (f.unit) bits.push('单位 ' + f.unit);
        if (f.min !== undefined) bits.push('不小于 ' + f.min);
        if (f.max !== undefined) bits.push('不大于 ' + f.max);
        return bits.join('，');
    }
    if (type === 'enum') {
        return '只能填这些：' + (f.options || []).map(function (o) {
            return o.label + '（' + o.value + '）';
        }).join(' / ');
    }
    if (type === 'dose') return '数字';
    if (type === 'choice') {
        return '只能填这些：' + (f.options || []).map(function (o) {
            return o.label + '（' + o.value + '）';
        }).join(' / ');
    }
    if (type === 'textarea') return '多行文字' + (f.maxlength ? '，最多 ' + f.maxlength + ' 字' : '');
    return '文字' + (f.maxlength ? '，最多 ' + f.maxlength + ' 字' : '');
}

function fieldLines(fields) {
    return (fields || []).map(function (f) {
        return '  - ' + f.key + '：' + f.label + '（' + fieldHow(f) + (f.required ? '，必填' : '') + '）';
    });
}

export function buildSystemPrompt(world) {
    const w = world || {};
    const today = w.today || todayKey();
    const out = [];

    out.push('你是「弦音」，一个陪人记录日常状态的助手。你唯一的职责是陪聊、帮忙记录、帮忙整理。');
    out.push('你面对的人可能正在和精神科的病相处。语气要平实、温和、不评判。');
    out.push('');
    out.push('【今天】' + fmtDay(today) + '，也就是 ' + today + '。用户说「今天」「昨天」「上周」时，按这一天来算。');
    out.push('');
    out.push('【你能做的】');
    out.push('1. 正常聊天。不说教、不喊口号、不说「加油」「你可以的」「想开点」这类空话，不用 emoji，不安慰式地敷衍。');
    out.push('2. 帮用户把「状态记录」填上。');
    out.push('3. 帮用户往日历里加、改、删日程。');
    out.push('4. 用户同意后，读他这段时间的记录，帮他看看。');
    out.push('');
    out.push('【绝对不能做的】');
    out.push('- 不做任何诊断，不说病情是好转还是恶化，不评价用药对不对。');
    out.push('- 不建议加药、减药、停药、换药。');
    out.push('- 不预测病情以后会怎样。');
    out.push('- 不用「正常人」「不正常」这类词。');
    out.push('- 用户问到医学问题时，说明你只是记录助手，请他问主治医生。');
    out.push('');
    out.push('【怎么动手】');
    out.push('用中文回答。如果用户的话里有需要记录或改动数据的信息，在回答的最后附一段指令：');
    out.push('');
    out.push(FENCE);
    out.push('{"do":[ ... ]}');
    out.push('```');
    out.push('');
    out.push('整段回答里只能有这一种代码块，最多一个，放在最末尾。不要在别的代码块里写代码。');
    out.push('不要编造用户没说过的数字。拿不准就先问清楚。');
    out.push('');
    out.push('可用的指令：');
    out.push('{"act":"set-field","date":"2026-10-10","module":"sleep","field":"hours","value":6.5}');
    out.push('{"act":"add-event","type":"med","date":"2026-10-10","time":"08:00","values":{"drug":"舍曲林","dose":"1","doseUnit":"片"},"repeat":{"kind":"daily","every":1,"unit":"day"}}');
    out.push('{"act":"update-event","type":"med","date":"2026-10-10","time":"08:00","match":"舍曲林","set":{"time":"09:00"}}');
    out.push('{"act":"delete-event","type":"visit","date":"2026-10-12","match":"市立医院"}');
    out.push('{"act":"read-records","from":"2026-10-01","to":"2026-10-10","modules":["mood","sleep"]}');
    out.push('');
    out.push('规矩：');
    out.push('- date 一律写成 YYYY-MM-DD。');
    out.push('- add-event 不要写 id，系统自己生成。');
    out.push('- update-event 和 delete-event 用 type + date + time + match 定位一条，match 写人看得懂的名字，比如药名、医院名。');
    out.push('- set-field 想清空某个值就写 value:""。');
    out.push('- read-records 只在用户要你分析记录时用，一次最多 31 天；不写 modules 就是全部。');
    out.push('- 指令只是「申请」。用户点同意之后才会真的执行，所以放心提。');

    const records = recordsOf(w);
    if (records.length) {
        out.push('');
        out.push('【可用的记录模块】module 写括号前的英文，field 写冒号前的英文。');
        records.forEach(function (m) {
            out.push(m.id + '（' + m.name + '）');
            fieldLines(m.fields).forEach(function (line) { out.push(line); });
        });
    } else {
        out.push('');
        out.push('【可用的记录模块】用户现在一个都没开。');
    }

    const events = eventsOf(w);
    if (events.length) {
        out.push('');
        out.push('【可用的日程类型】');
        events.forEach(function (t) {
            const kinds = (t.repeats && t.repeats.length) ? t.repeats : ['once'];
            out.push(t.id + '（' + t.name + '）频率只能填：' + kinds.join(' / '));
            fieldLines(t.fields).forEach(function (line) { out.push(line); });
            if (fieldLines(t.fields).length) out.push('  - 剂量单位另用 doseUnit 传，例如"片"');
        });
    } else {
        out.push('');
        out.push('【可用的日程类型】用户现在一个都没开。');
    }

    return out.join('\n');
}

function fmLines(rows) {
    const lines = ['---'];
    rows.forEach(function (r) {
        if (r[1] === null || r[1] === undefined || r[1] === '') return;
        lines.push(r[0] + ': ' + r[1]);
    });
    lines.push('---');
    return lines;
}

function clockOf(at) {
    const s = String(at || '');
    return s.length >= 16 ? s.slice(11, 16) : '';
}

export function toApiMessage(m) {
    const text = String((m && (m.raw || m.text)) || '');
    if (m && m.role === 'user' && (m.photo || m.photoSend)) {
        const parts = [];
        if (text) parts.push({ type: 'text', text: text });
        parts.push({ type: 'image_url', image_url: { url: m.photoSend || m.photo } });
        return { role: 'user', content: parts };
    }
    return { role: m && m.role === 'user' ? 'user' : 'assistant', content: text };
}

export function chatMarkdown(messages, opts) {
    const o = opts || {};
    const list = Array.isArray(messages) ? messages : [];
    const out = fmLines([
        ['date', o.date || todayKey()],
        ['tags', '[ellipse, 弦音]'],
        ['type', '对话记录']
    ]);
    out.push('');
    out.push('# 弦音 · 对话记录');
    out.push('');
    if (!list.length) {
        out.push('（还没有聊过。）');
        return out.join('\n') + '\n';
    }
    let day = '';
    list.forEach(function (m) {
        const at = String(m.at || '');
        const key = at.slice(0, 10);
        if (key && key !== day) {
            day = key;
            out.push('## ' + key + (isKey(key) ? ' 周' + WEEK[fromKey(key).getDay()] : ''));
            out.push('');
        }
        const stamp = clockOf(at);
        if (m.role === 'crisis') {
            out.push('### ' + (stamp ? stamp + ' ' : '') + '求助卡');
            out.push('');
            out.push(String(m.text || '').trim());
            out.push('');
            return;
        }
        out.push('**' + (m.role === 'user' ? '我' : '弦音') + '**' + (stamp ? ' · ' + stamp : ''));
        out.push('');
        if (m.photo || m.photoDropped) out.push(m.photo ? '［照片］' : '［照片，本机没留底］');
        const said = String(m.text || '').trim();
        if (said) out.push(said);
        out.push('');
        (m.acts || []).forEach(function (a) {
            const mark = a.decision === 'ok' ? '已执行' : (a.decision === 'no' ? '没执行' : '没回应');
            out.push('> ' + mark + '：' + String(a.title || ''));
            (a.items || []).forEach(function (it) { out.push('> - ' + String(it)); });
            out.push('');
        });
    });
    return out.join('\n');
}
