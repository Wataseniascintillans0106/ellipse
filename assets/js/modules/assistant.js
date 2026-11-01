import { isConfigured, isTrustedEndpoint, getAiConfig, polishText, chatStream } from '../ai.js';
import {
    crisisHit, crisisReply, splitReply, proseSoFar, parseActions,
    validateAction, describeAction, readDigest, buildSystemPrompt, chatMarkdown, toApiMessage
} from '../chat.js';
import { suggestFilename } from '../export.js';
import { todayKey, toKey, pad2, escapeHtml } from '../util.js';
import { KEY_SETTINGS } from '../storage.js';

const MOD_ID = 'assistant';
const MAX_KEEP = 2000;
const HISTORY = 30;
const MAX_TURNS = 3;

const IMG_LIMIT = 30 * 1024 * 1024;
const REQ_MAX = 1568;
const REQ_Q = 0.85;
const THUMB_MAX = 480;
const THUMB_Q = 0.6;
const PHOTO_BUDGET = 1200 * 1024;

export function fitSize(w, h, max) {
    const cw = Math.max(1, Number(w) || 1);
    const ch = Math.max(1, Number(h) || 1);
    if (cw <= max && ch <= max) return { w: cw, h: ch };
    const k = max / Math.max(cw, ch);
    return { w: Math.max(1, Math.round(cw * k)), h: Math.max(1, Math.round(ch * k)) };
}

export function photoBytes(list) {
    return (Array.isArray(list) ? list : []).reduce(function (n, m) {
        return n + (m && m.photo ? String(m.photo).length : 0);
    }, 0);
}

export function trimPhotos(list, budget) {
    const out = (Array.isArray(list) ? list : []).slice();
    let used = photoBytes(out);
    let dropped = 0;
    for (let i = 0; i < out.length && used > budget; i++) {
        if (!out[i] || !out[i].photo) continue;
        used -= String(out[i].photo).length;
        out[i] = Object.assign({}, out[i], { photo: null, photoDropped: true });
        dropped++;
    }
    return { list: out, dropped: dropped };
}

const SUGGESTIONS = [
    '帮我把今天的睡眠记一下：睡了 6 个半小时，还行',
    '我这周的情绪怎么样？',
    '下周三上午 9 点去市立医院复诊'
];

let log = [];
let rootEl = null;
let busy = false;
let ctrl = null;
let active = null;
let typingTimer = 0;
let pending = null;
let wired = false;
let wiredOn = null;
let pendingPhoto = null;
let viewportOff = null;

function A() { return globalThis.ellipse; }

function conf() { return A().settings.get(MOD_ID); }

function watchConfig() {
    if (wired) return;
    wired = true;
    if (typeof A().settings.on !== 'function') return;
    wiredOn = isConfigured();
    A().settings.on(function (evt) {
        if (!evt || evt.type !== 'settings') return;
        const now = isConfigured();
        if (now === wiredOn) return;
        wiredOn = now;
        if (rootEl && rootEl.offsetParent && !busy) paint();
    });
}

function stamp() {
    const d = new Date();
    return toKey(d) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

function uid() {
    return 'm' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
}

function msg(err) { return String((err && err.message) || err); }

function load() {
    const saved = conf().chat;
    log = Array.isArray(saved) ? saved : [];
    log.forEach(function (m) {
        if (m.pending) { m.pending = false; m.text = m.text || ''; }
    });
}

function lastId() {
    return log.length ? log[log.length - 1].id : '';
}

function savedOnDisk() {
    const want = lastId();
    if (!want) return true;
    try {
        const box = JSON.parse(globalThis.localStorage.getItem(KEY_SETTINGS) || '');
        const chat = box && box.mods && box.mods.assistant && box.mods.assistant.chat;
        return Array.isArray(chat) && chat.some(function (m) { return m.id === want; });
    } catch (err) {
        return false;
    }
}

function dropNewestPhoto() {
    for (let i = log.length - 1; i >= 0; i--) {
        if (log[i] && log[i].photo) {
            log[i] = Object.assign({}, log[i], { photo: null, photoDropped: true });
            return true;
        }
    }
    return false;
}

function save() {
    const over = log.length - MAX_KEEP;
    if (over > 0) log = log.slice(over);
    const trimmed = trimPhotos(log, PHOTO_BUDGET);
    log = trimmed.list;
    log.forEach(function (m) { if (m.photoSend) delete m.photoSend; });
    A().settings.set(MOD_ID, { chat: log });
    if (trimmed.dropped) A().toast('照片太多了，早一些的照片没再留底');
    if (!log.some(function (m) { return !!m.photo; })) return;
    if (savedOnDisk()) return;
    if (dropNewestPhoto()) {
        A().settings.set(MOD_ID, { chat: log });
        A().toast(savedOnDisk() ? '这台设备存不下照片了，这张没留底' : '这台设备存不下新的聊天内容了');
        return;
    }
    A().toast('这台设备存不下新的聊天内容了');
}

function recordWorld() {
    const out = [];
    A().registry.enabledOrder().forEach(function (id) {
        const def = A().registry.get(id);
        if (def) out.push({ id: def.id, name: def.name, fields: def.fields || [] });
    });
    return out;
}

function eventWorld() {
    const cal = A().registry.get('calendar');
    const out = [];
    A().registry.eventModules().forEach(function (id) {
        const def = A().registry.get(id);
        if (!def) return;
        const sched = def.schedule || {};
        const raw = A().settings.get(id).events;
        out.push({
            id: def.id,
            name: def.name,
            fields: (def.form || []).concat(def.tail || []),
            schedule: sched,
            repeats: sched.repeats && sched.repeats.length ? sched.repeats : ['once'],
            events: Array.isArray(raw) ? raw : [],
            occurs: (cal && typeof cal.occursOn === 'function')
                ? function (entry, key) { return cal.occursOn(entry, key, entry.repeat || { kind: 'once' }); }
                : null,
            title: (cal && typeof cal.itemTitle === 'function')
                ? function (entry) { return cal.itemTitle(def, entry); }
                : null,
            values: (cal && typeof cal.valueText === 'function')
                ? function (entry) { return cal.valueText(def, entry).join(' '); }
                : null
        });
    });
    return out;
}

function world() {
    return { today: todayKey(), records: recordWorld(), events: eventWorld() };
}

function eventsOf(typeId) {
    const raw = A().settings.get(typeId).events;
    return Array.isArray(raw) ? raw : [];
}

function apiMessages(extra) {
    const out = [{ role: 'system', content: buildSystemPrompt(world()) }];
    log.filter(function (m) {
        return m.role !== 'crisis' && !m.pending && !m.error;
    }).slice(-HISTORY).forEach(function (m) { out.push(toApiMessage(m)); });
    if (extra) out.push(extra);
    return out;
}

function listEl() { return rootEl ? rootEl.querySelector('#chordList') : null; }

function scrollBottom() {
    const list = listEl();
    if (list) list.scrollTop = list.scrollHeight;
}

function faceNode() {
    const face = document.createElement('span');
    face.className = 'chord-face';
    face.innerHTML = A().icon('note');
    return face;
}

function card(title) {
    const box = document.createElement('div');
    box.className = 'chord-card';
    const head = document.createElement('p');
    head.className = 'chord-card-title';
    head.textContent = title;
    box.appendChild(head);
    return box;
}

function cardLines(items) {
    const ul = document.createElement('ul');
    ul.className = 'chord-card-list';
    (items || []).forEach(function (line) {
        const li = document.createElement('li');
        li.textContent = String(line);
        ul.appendChild(li);
    });
    return ul;
}

function chordBtn(label, act, msgId, primary) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn' + (primary ? ' primary' : '');
    btn.dataset.chord = act;
    if (msgId) btn.dataset.msg = msgId;
    btn.textContent = label;
    return btn;
}

function streamTo(node, text) {
    if (typingTimer) { clearInterval(typingTimer); typingTimer = 0; }
    const shown = node.textContent.length;
    if (text.length <= shown || text.length - shown < 24) { node.textContent = text; return; }
    const step = Math.max(1, Math.ceil((text.length - shown) / 10));
    typingTimer = setInterval(function () {
        const cur = node.textContent.length;
        if (cur + step >= text.length) {
            node.textContent = text;
            clearInterval(typingTimer);
            typingTimer = 0;
            return;
        }
        node.textContent = text.slice(0, cur + step);
        scrollBottom();
    }, 22);
}

function crisisNode(m) {
    const wrap = document.createElement('div');
    wrap.className = 'chord-msg chord-msg--ai chord-msg--crisis';
    wrap.dataset.msg = m.id;
    wrap.appendChild(faceNode());
    const col = document.createElement('div');
    col.className = 'chord-col';
    const box = card(m.lead || '');
    box.className = 'chord-card chord-card--crisis';
    const body = document.createElement('p');
    body.className = 'chord-card-body';
    body.textContent = m.body || '';
    box.appendChild(body);
    const ul = cardLines([]);
    (m.lines || []).forEach(function (row) {
        const li = document.createElement('li');
        const b = document.createElement('b');
        b.textContent = String(row.label);
        li.appendChild(b);
        li.appendChild(document.createTextNode(' ' + String(row.value) +
            (row.note ? '（' + row.note + '）' : '')));
        ul.appendChild(li);
    });
    box.appendChild(ul);
    const tail = document.createElement('p');
    tail.className = 'chord-card-body';
    tail.textContent = m.tail || '';
    box.appendChild(tail);
    col.appendChild(box);
    wrap.appendChild(col);
    return wrap;
}

function actCard(m) {
    const acts = m.acts || [];
    const open = acts.filter(function (a) { return !a.decision; });

    if (m.noRead || m.auto) {
        const box = card(acts.length === 1 ? acts[0].title : '弦音想看你的记录');
        acts.forEach(function (a) {
            if (!a.items || !a.items.length) return;
            const ul = cardLines(a.items);
            if (a.decision) ul.className += ' is-done';
            box.appendChild(ul);
        });
        const why = document.createElement('p');
        why.className = 'chord-card-done';
        why.textContent = m.noRead
            ? '读记录这项功能现在关着。要用的话，点右上角的齿轮，打开「允许弦音读取我的记录」。'
            : '已经读过了（你之前勾过「以后不用再问」）。';
        box.appendChild(why);
        if (m.noRead) {
            const go = document.createElement('div');
            go.className = 'chord-card-acts';
            go.appendChild(chordBtn('去设置', 'settings', m.id, false));
            box.appendChild(go);
        }
        return box;
    }

    if (!open.length) {
        const box = card(acts.length === 1 ? acts[0].title : '这些事都处理过了');
        acts.forEach(function (a) {
            const line = document.createElement('p');
            line.className = 'chord-card-done';
            line.textContent = (a.decision === 'ok' ? '已执行：' : '没有执行：') + a.title;
            box.appendChild(line);
            if (a.decision === 'ok' && a.items && a.items.length) box.appendChild(cardLines(a.items));
        });
        return box;
    }

    const box = card(open[0].title + (open.length > 1 ? '，还有 ' + (open.length - 1) + ' 件' : ''));
    acts.forEach(function (a) {
        if (!a.items || !a.items.length) return;
        const ul = cardLines(a.items);
        if (a.decision) ul.className += ' is-done';
        box.appendChild(ul);
    });

    const isRead = acts.some(function (a) { return a.spec && a.spec.kind === 'read-records'; });
    if (isRead) {
        const pick = document.createElement('label');
        pick.className = 'chord-check';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.chord = 'trust';
        pick.appendChild(cb);
        pick.appendChild(document.createTextNode('这几个模块以后不用再问'));
        box.appendChild(pick);
    }

    const row = document.createElement('div');
    row.className = 'chord-card-acts';
    row.appendChild(chordBtn('同意', 'yes', m.id, true));
    row.appendChild(chordBtn('不要', 'no', m.id, false));
    box.appendChild(row);
    return box;
}

function retryCard(m) {
    const box = card('没连上');
    const p = document.createElement('p');
    p.className = 'chord-card-body';
    p.textContent = m.note || '';
    box.appendChild(p);
    const row = document.createElement('div');
    row.className = 'chord-card-acts';
    row.appendChild(chordBtn('再试一次', 'retry', m.id, true));
    box.appendChild(row);
    return box;
}

function msgNode(m) {
    if (m.role === 'crisis') return crisisNode(m);
    const wrap = document.createElement('div');
    wrap.className = 'chord-msg chord-msg--' + (m.role === 'user' ? 'me' : 'ai');
    wrap.dataset.msg = m.id;
    if (m.role !== 'user') wrap.appendChild(faceNode());
    const col = document.createElement('div');
    col.className = 'chord-col';

    if (m.error) {
        col.appendChild(retryCard(m));
    } else {
        if (m.photo || m.photoDropped) {
            const pic = document.createElement('div');
            pic.className = 'chord-pic' + (m.photo ? '' : ' chord-pic--gone');
            if (m.photo) {
                const img = document.createElement('img');
                img.className = 'chord-pic-img';
                img.src = m.photo;
                img.alt = '照片';
                img.dataset.chord = 'view-photo';
                img.dataset.msg = m.id;
                img.addEventListener('error', function () {
                    pic.className = 'chord-pic chord-pic--gone';
                    pic.textContent = '（这张照片没有留底）';
                });
                pic.appendChild(img);
            } else {
                pic.textContent = '（这张照片没有留底）';
            }
            col.appendChild(pic);
        }
        const bubble = document.createElement('div');
        bubble.className = 'chord-bubble';
        if (m.pending && !m.text) {
            bubble.innerHTML = '<span class="chord-dots"><i></i><i></i><i></i></span>';
            col.appendChild(bubble);
        } else if (m.text) {
            bubble.textContent = m.text;
            col.appendChild(bubble);
        }
        if (m.note) {
            const p = document.createElement('p');
            p.className = 'chord-note-in';
            p.textContent = m.note;
            col.appendChild(p);
        }
        if (m.acts && m.acts.length) col.appendChild(actCard(m));
    }

    wrap.appendChild(col);
    return wrap;
}

function emptyNode() {
    const box = document.createElement('div');
    box.className = 'chord-empty';
    const p = document.createElement('p');
    p.textContent = '还没聊过。可以这样说：';
    box.appendChild(p);
    SUGGESTIONS.forEach(function (text) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chord-sug';
        btn.dataset.chord = 'say';
        btn.dataset.text = text;
        btn.textContent = text;
        box.appendChild(btn);
    });
    return box;
}

function setupNode() {
    const box = document.createElement('div');
    box.className = 'chord-empty';
    const p = document.createElement('p');
    p.textContent = '弦音还没接上。点右上角的齿轮，填一下接口地址和密钥就能聊了。';
    box.appendChild(p);
    box.appendChild(chordBtn('去设置', 'settings', '', true));
    return box;
}

function paint() {
    const list = listEl();
    if (!list) return;
    list.innerHTML = '';
    if (!log.length) list.appendChild(emptyNode());
    log.forEach(function (m) { list.appendChild(msgNode(m)); });
    if (!isConfigured()) list.appendChild(setupNode());
    scrollBottom();
}

function setBusy(on) {
    busy = on;
    if (!rootEl) return;
    const send = rootEl.querySelector('#chordSend');
    const stop = rootEl.querySelector('#chordStop');
    const input = rootEl.querySelector('#chordInput');
    const photo = rootEl.querySelector('#chordPhoto');
    if (send) send.hidden = on;
    if (stop) stop.hidden = !on;
    if (input) input.disabled = on;
    if (photo) photo.disabled = on;
}

function drawTo(bitmap, max, q) {
    const w = bitmap.naturalWidth || bitmap.width;
    const h = bitmap.naturalHeight || bitmap.height;
    const size = fitSize(w, h, max);
    const cv = document.createElement('canvas');
    cv.width = size.w;
    cv.height = size.h;
    const ctx = cv.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, size.w, size.h);
    return cv.toDataURL('image/jpeg', q);
}

function decodeViaImg(file) {
    return new Promise(function (resolve, reject) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('读不出来')); };
        img.src = url;
    });
}

function decodeImage(file) {
    if (typeof globalThis.createImageBitmap === 'function') {
        return globalThis.createImageBitmap(file, { imageOrientation: 'from-image' })
            .catch(function () { return decodeViaImg(file); });
    }
    return decodeViaImg(file);
}

function renderPending() {
    const box = rootEl ? rootEl.querySelector('#chordAttach') : null;
    if (!box) return;
    box.innerHTML = '';
    if (!pendingPhoto) { box.hidden = true; return; }
    box.hidden = false;
    const thumb = document.createElement('div');
    thumb.className = 'chord-thumb';
    const img = document.createElement('img');
    img.className = 'chord-thumb-img';
    img.src = pendingPhoto.thumb;
    img.alt = '待发的照片';
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'chord-thumb-x';
    x.dataset.chord = 'drop-photo';
    x.setAttribute('aria-label', '去掉这张照片');
    x.innerHTML = A().icon('close');
    thumb.appendChild(img);
    thumb.appendChild(x);
    box.appendChild(thumb);
}

async function attachPhoto(file) {
    if (!file) return;
    if (!/^image\//.test(file.type || '')) { A().toast('这不是一张图片'); return; }
    if (file.size > IMG_LIMIT) { A().toast('照片太大了，换一张小一点的'); return; }
    let bmp = null;
    try {
        bmp = await decodeImage(file);
    } catch (err) {
        A().toast('这张照片读不出来，换一张 JPG 或 PNG 试试');
        return;
    }
    const req = drawTo(bmp, REQ_MAX, REQ_Q);
    const thumb = drawTo(bmp, THUMB_MAX, THUMB_Q);
    if (typeof bmp.close === 'function') bmp.close();
    pendingPhoto = { req: req, thumb: thumb };
    renderPending();
    scrollBottom();
}

function watchViewport() {
    if (viewportOff) { viewportOff(); viewportOff = null; }
    const vv = globalThis.visualViewport;
    if (!vv) return;
    const apply = function () {
        document.documentElement.style.setProperty('--chat-h', Math.round(vv.height) + 'px');
    };
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    viewportOff = function () {
        vv.removeEventListener('resize', apply);
        vv.removeEventListener('scroll', apply);
        document.documentElement.style.removeProperty('--chat-h');
    };
    apply();
}

function bindHolder(holder) {
    if (typingTimer) { clearInterval(typingTimer); typingTimer = 0; }
    const list = listEl();
    holder.node = list ? list.querySelector('[data-msg="' + holder.id + '"]') : null;
    if (!holder.node) return;
    const bubble = holder.node.querySelector('.chord-bubble');
    if (bubble && holder.shown) bubble.textContent = holder.shown;
}

function reveal(holder, acc) {
    const cut = splitReply(acc);
    holder.shown = cut.found ? cut.prose : proseSoFar(acc);
    if (!holder.node || !holder.node.isConnected) bindHolder(holder);
    const bubble = holder.node ? holder.node.querySelector('.chord-bubble') : null;
    if (!bubble) return;
    streamTo(bubble, holder.shown);
    scrollBottom();
}

function turnNote(messages, err) {
    const said = msg(err);
    const hadPhoto = (messages || []).some(function (m) { return Array.isArray(m.content); });
    if (hadPhoto && /返回 4\d\d/.test(said)) {
        return '这个模型看不了图片（' + said + '）。' +
            '点右上角的齿轮，换一个支持图片的模型，比如 gpt-4o 或 gpt-4o-mini。';
    }
    return '没连上：' + said;
}

async function runTurn(messages, budget) {
    let next = null;
    let halted = false;
    setBusy(true);
    ctrl = new AbortController();

    const holder = { id: uid(), role: 'ai', text: '', raw: '', at: stamp(), acts: [], pending: true };
    log.push(holder);
    active = holder;
    paint();
    bindHolder(holder);

    try {
        const res = await chatStream(messages, {
            signal: ctrl.signal,
            onDelta: function (acc) { reveal(holder, acc); }
        });
        halted = !!res.stopped;
        next = settle(holder, res.text, res.stopped, budget);
    } catch (err) {
        if (typingTimer) { clearInterval(typingTimer); typingTimer = 0; }
        holder.pending = false;
        holder.error = true;
        holder.text = '';
        holder.note = turnNote(messages, err);
        paint();
        save();
    } finally {
        ctrl = null;
        if (active === holder) active = null;
        setBusy(false);
    }

    if (next && !halted) next();
}

function buildActs(acts) {
    const w = world();
    return acts.map(function (raw) {
        const check = validateAction(raw, w);
        if (!check.ok) return { raw: raw, title: '这条没看懂', items: [check.reason], decision: 'no' };
        const said = describeAction(check.spec);
        return { raw: raw, title: said.title, items: said.items, spec: check.spec, decision: null };
    });
}

function settle(holder, full, stopped, budget) {
    holder.pending = false;
    const cut = splitReply(full);
    holder.raw = full;
    holder.text = cut.prose.trim();

    if (cut.found && !cut.closed) {
        holder.note = '（这段指令没写完，没有执行）';
    } else if (cut.closed) {
        const parsed = parseActions(cut.block);
        if (parsed.error) holder.note = '（' + parsed.error + '，没有执行）';
        else if (parsed.acts.length) holder.acts = buildActs(parsed.acts);
    }
    if (stopped) holder.note = '（停在这里了）';
    if (!holder.text && !holder.acts.length && !holder.note) holder.text = '（这次没有回内容）';

    paint();
    save();
    return planRead(holder, budget);
}

function readActOf(holder) {
    return (holder.acts || []).filter(function (a) {
        return !a.decision && a.spec && a.spec.kind === 'read-records';
    })[0] || null;
}

function trustedFor(spec) {
    const has = conf().readTrusted;
    const list = Array.isArray(has) ? has : [];
    return spec.modules.every(function (id) { return list.indexOf(id) >= 0; });
}

function trust(spec) {
    const has = conf().readTrusted;
    const next = (Array.isArray(has) ? has : []).slice();
    spec.modules.forEach(function (id) { if (next.indexOf(id) < 0) next.push(id); });
    A().settings.set(MOD_ID, { readTrusted: next });
}

function planRead(holder, budget) {
    const read = readActOf(holder);
    if (!read) return null;

    if (conf().readAllow !== true) {
        read.decision = 'no';
        holder.noRead = true;
        paint();
        save();
        return null;
    }
    if (budget <= 1) {
        read.decision = 'no';
        holder.note = '（这一轮已经读过一次了，先不再读）';
        paint();
        save();
        return null;
    }
    if (!trustedFor(read.spec)) return null;

    read.decision = 'ok';
    holder.auto = true;
    paint();
    save();
    return function () { followUp(read.spec, budget - 1); };
}

function followUp(spec, budget) {
    const digest = readDigest(spec, world(), A().records.dataOf);
    runTurn(apiMessages({
        role: 'user',
        content: '[读取结果]\n' + digest +
            '\n（以上是你刚获准查看的记录，请直接据此回答，不要再发 read-records）'
    }), budget);
}

function writeEvent(spec) {
    const list = eventsOf(spec.typeId).slice();
    list.push({
        id: 'e' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36),
        date: spec.date,
        time: spec.time || '',
        values: spec.values,
        repeat: spec.repeat,
        updatedAt: Date.now()
    });
    A().settings.set(spec.typeId, { events: list });
}

function doAct(act, pick) {
    const check = validateAction(act.raw, world());
    if (!check.ok) {
        act.decision = 'no';
        act.items = [check.reason];
        return false;
    }
    const spec = check.spec;

    if (spec.kind === 'set-field') {
        A().records.setField(spec.date, spec.moduleId, spec.fieldKey, spec.value);
        return true;
    }

    if (spec.kind === 'add-event') {
        writeEvent(spec);
        return true;
    }

    const target = spec.matches[pick] || spec.matches[0];
    if (!target) { act.decision = 'no'; act.items = ['没找到这条日程']; return false; }

    const list = eventsOf(target.typeId);
    if (spec.kind === 'delete-event') {
        A().settings.set(target.typeId, {
            events: list.filter(function (e) { return e.id !== target.eventId; })
        });
        return true;
    }

    const set = spec.set || {};
    A().settings.set(target.typeId, {
        events: list.map(function (entry) {
            if (entry.id !== target.eventId) return entry;
            const next = Object.assign({}, entry, { updatedAt: Date.now() });
            if (set.date) next.date = set.date;
            if (set.time !== undefined) next.time = set.time;
            if (set.repeat) next.repeat = set.repeat;
            if (set.values) next.values = Object.assign({}, entry.values, set.values);
            return next;
        })
    });
    return true;
}

function commit(holder, pick) {
    const acts = (holder.acts || []).filter(function (a) { return !a.decision; });
    if (!acts.length) return;
    let any = false;
    let failed = false;
    acts.forEach(function (a) {
        if (doAct(a, pick)) { a.decision = 'ok'; any = true; }
        else { a.decision = 'no'; failed = true; }
    });
    holder.auto = false;
    if (any) { A().refresh(); A().toast(failed ? '有一部分没记上' : '记好了'); }
    else if (failed) A().toast('没能记上，看卡片上的说明');
    paint();
    save();
}

function handleChord(evt) {
    const node = evt.target.closest('[data-chord]');
    if (!node) return;
    const what = node.dataset.chord;

    if (what === 'settings') { openAiSettings(); return; }
    if (what === 'say') { send(node.dataset.text || ''); return; }
    if (what === 'stop') { if (ctrl) ctrl.abort(); return; }
    if (what === 'drop-photo') { pendingPhoto = null; renderPending(); return; }

    const holder = log.filter(function (m) { return m.id === node.dataset.msg; })[0];
    if (!holder) return;

    if (what === 'view-photo') {
        if (holder.photo) A().sheet.open('照片', '<img class="chord-view-img" alt="照片" src="' +
            holder.photo + '">', '');
        return;
    }

    if (what === 'retry') {
        log = log.filter(function (m) { return m.id !== holder.id; });
        paint();
        save();
        runTurn(apiMessages(), MAX_TURNS);
        return;
    }

    if (what === 'no') {
        const read = readActOf(holder);
        (holder.acts || []).forEach(function (a) { if (!a.decision) a.decision = 'no'; });
        if (read) holder.noRead = true;
        paint();
        save();
        return;
    }

    if (what === 'yes') {
        const box = node.closest('.chord-card');
        const trustBox = box ? box.querySelector('[data-chord="trust"]') : null;
        const read = readActOf(holder);

        if (read) {
            if (trustBox && trustBox.checked) trust(read.spec);
            read.decision = 'ok';
            holder.noRead = false;
            paint();
            save();
            followUp(read.spec, MAX_TURNS - 1);
            return;
        }
        commit(holder, 0);
    }
}

function send(text) {
    const raw = String(text || '').trim();
    if ((!raw && !pendingPhoto) || busy) return;
    const input = rootEl ? rootEl.querySelector('#chordInput') : null;
    if (input) { input.value = ''; input.style.height = ''; }

    const line = { id: uid(), role: 'user', text: raw, raw: raw, at: stamp() };
    if (pendingPhoto) {
        line.photo = pendingPhoto.thumb;
        line.photoSend = pendingPhoto.req;
        pendingPhoto = null;
        renderPending();
    }
    log.push(line);
    const outbound = apiMessages();

    if (crisisHit(raw)) {
        const c = crisisReply();
        log.push({
            id: uid(), role: 'crisis', at: stamp(),
            lead: c.lead, body: c.body, lines: c.lines, tail: c.tail,
            text: c.lead + ' ' + c.body
        });
        paint();
        save();
        return;
    }

    if (!isConfigured()) {
        log.push({
            id: uid(), role: 'ai', at: stamp(),
            text: '弦音还没接上。点右上角的齿轮，填一下接口地址和密钥，我就能回话了。'
        });
        paint();
        save();
        return;
    }

    paint();
    save();
    runTurn(outbound, MAX_TURNS);
}

function exportChat() {
    A().download(chatMarkdown(log), suggestFilename('chat'));
    globalThis.dispatchEvent(new Event('ellipse:chat-exported'));
    A().toast('已导出聊天记录');
}

function wipeChat() {
    log = [];
    A().sheet.close();
    paint();
    save();
    A().toast('聊天记录已清空');
}

function mountChat(box, ctx) {
    rootEl = box;
    pendingPhoto = null;
    if (!active) load();
    watchConfig();
    watchViewport();

    if (ctx && ctx.head) {
        const gear = document.createElement('button');
        gear.type = 'button';
        gear.className = 'page-back chord-gear-btn';
        gear.setAttribute('data-head-extra', '');
        gear.setAttribute('aria-label', '弦音设置');
        gear.setAttribute('title', '弦音设置');
        gear.innerHTML = A().icon('gear');
        gear.addEventListener('click', openAiSettings);
        ctx.head.appendChild(gear);
    }

    box.innerHTML =
        '<div class="chord">' +
        '<div class="chord-list" id="chordList"></div>' +
        '<div class="chord-attach" id="chordAttach" hidden></div>' +
        '<form class="chord-bar" id="chordForm">' +
        '<button class="chord-photo" id="chordPhoto" type="button" aria-label="发照片">' +
        A().icon('photo') + '</button>' +
        '<input class="chord-file" id="chordFile" type="file" accept="image/*" hidden>' +
        '<textarea class="chord-input" id="chordInput" rows="1" ' +
        'placeholder="说点什么…" aria-label="给弦音发消息"></textarea>' +
        '<button class="chord-send" id="chordSend" type="submit" aria-label="发送">' +
        A().icon('send') + '</button>' +
        '<button class="chord-stop" id="chordStop" type="button" data-chord="stop" hidden aria-label="停止">' +
        A().icon('stop') + '</button>' +
        '</form>' +
        '<p class="chord-disclaimer">' +
        '内容由 AI 生成，仅供参考，只辅助记录，不做任何医学判断。</p>' +
        '</div>';
    paint();
    renderPending();
    if (active) bindHolder(active);

    const form = box.querySelector('#chordForm');
    const input = box.querySelector('#chordInput');
    const photoBtn = box.querySelector('#chordPhoto');
    const fileEl = box.querySelector('#chordFile');

    if (photoBtn && fileEl) {
        photoBtn.addEventListener('click', function () {
            if (!busy) fileEl.click();
        });
        fileEl.addEventListener('change', function () {
            const file = fileEl.files && fileEl.files[0];
            fileEl.value = '';
            attachPhoto(file);
        });
    }

    form.addEventListener('submit', function (evt) {
        evt.preventDefault();
        send(input.value);
    });

    input.addEventListener('keydown', function (evt) {
        if (evt.key !== 'Enter' || evt.shiftKey || evt.isComposing) return;
        if (globalThis.matchMedia && globalThis.matchMedia('(pointer: coarse)').matches) return;
        evt.preventDefault();
        send(input.value);
    });

    input.addEventListener('input', function () {
        input.style.height = 'auto';
        input.style.height = Math.min(88, input.scrollHeight) + 'px';
    });

    box.addEventListener('click', handleChord);

    if (busy) setBusy(true);
    scrollBottom();
}

function setRow(title, desc, inner) {
    return '<div class="set-row"><span class="set-row-main">' +
        '<span class="set-row-title">' + escapeHtml(title) + '</span>' +
        '<span class="set-row-desc">' + escapeHtml(desc) + '</span>' +
        (inner || '') +
        '</span></div>';
}

function statusText() {
    if (!isConfigured()) return '当前状态：还没配置。填上 API Key 之后，这里就能聊了。';
    if (!isTrustedEndpoint()) return '当前状态：密钥有了，但接口地址不在可信名单里，浏览器可能会拦下这个请求。';
    return '当前状态：已配置，接口是 ' + getAiConfig().baseUrl + '。';
}

function refreshStatus() {
    const status = document.getElementById('aiStatus');
    if (status) status.textContent = statusText();
}

function aiSettingsHtml() {
    const ai = A().settings.get(MOD_ID);
    const cfg = getAiConfig();
    const readOn = ai.readAllow === true;
    return setRow('接口地址', '兼容 OpenAI 的服务地址，例如 api.deepseek.com 或 api.openai.com',
            '<input class="set-input" type="url" data-ai="baseUrl" placeholder="' + escapeHtml(cfg.baseUrl) +
            '" value="' + escapeHtml(ai.baseUrl || '') + '">') +
        setRow('API Key', '只存在这台机器的浏览器里，不会传到别处',
            '<input class="set-input" type="password" data-ai="apiKey" autocomplete="off" ' +
            'placeholder="sk-…" value="' + escapeHtml(ai.apiKey || '') + '">') +
        setRow('模型', '用来聊天，默认 gpt-4o-mini',
            '<input class="set-input" type="text" data-ai="model" placeholder="gpt-4o-mini" ' +
            'value="' + escapeHtml(ai.model || '') + '">') +
        '<div class="set-actions">' +
        '<button class="btn" type="button" data-set="ai-test">测试连接</button>' +
        '<button class="btn" type="button" data-set="ai-clear">清除密钥</button>' +
        '</div>' +
        '<p class="sheet-note" id="aiStatus">' + escapeHtml(statusText()) + '</p>' +
        '<label class="set-check"><input type="checkbox" data-ai="readAllow"' +
        (readOn ? ' checked' : '') + '>' +
        '允许弦音读取我的记录（默认关；打开之后每次要读还会再问你一次）</label>' +
        '<div class="set-actions">' +
        '<button class="btn" type="button" data-set="ai-export-chat">导出弦音聊天 md</button>' +
        '<button class="btn danger" type="button" data-set="ai-clear-chat">清空聊天记录</button>' +
        '</div>' +
        '<p class="sheet-note">开着弦音，你打的字和之前的聊天内容会发给你填的这个 AI 接口；' +
        '状态记录只在你点过同意之后才会发出去。聊天记录存在本机，也会写进备份文件。</p>';
}

function testConnection(api, btn) {
    if (!isConfigured()) { api.toast('先填 API Key'); return; }
    btn.disabled = true;
    btn.textContent = '测试中…';
    polishText('连接测试，请回复四个字：连接正常', '你是连接测试助手。无论用户说什么，你只回复四个字：连接正常')
        .then(function (out) {
            api.toast('连接正常：' + out.slice(0, 16));
        })
        .catch(function (err) {
            api.toast('连接失败：' + msg(err).slice(0, 40));
        })
        .then(function () {
            btn.disabled = false;
            btn.textContent = '测试连接';
            refreshStatus();
        });
}

function openAiSettings() {
    A().sheet.open('弦音设置', aiSettingsHtml(), '');
    bindAiSettings();
}

function bindAiSettings() {
    const body = A().sheet.body();
    if (!body) return;

    function saveInputs() {
        const patch = {};
        body.querySelectorAll('[data-ai]').forEach(function (input) {
            patch[input.dataset.ai] = input.type === 'checkbox' ? input.checked : input.value.trim();
        });
        A().settings.set(MOD_ID, patch);
    }
    const saveSoon = A().debounce(saveInputs, 600);
    body.querySelectorAll('[data-ai]').forEach(function (input) {
        input.addEventListener('input', saveSoon);
        input.addEventListener('change', function () {
            saveInputs();
            refreshStatus();
        });
    });

    const testBtn = body.querySelector('[data-set="ai-test"]');
    if (testBtn) testBtn.addEventListener('click', function () { testConnection(A(), testBtn); });

    const clearBtn = body.querySelector('[data-set="ai-clear"]');
    if (clearBtn) clearBtn.addEventListener('click', function () {
        A().settings.set(MOD_ID, { apiKey: '', baseUrl: '', model: '' });
        ['baseUrl', 'apiKey', 'model'].forEach(function (key) {
            const input = body.querySelector('[data-ai="' + key + '"]');
            if (input) input.value = '';
        });
        refreshStatus();
        A().toast('已清除 AI 配置');
    });

    const exportBtn = body.querySelector('[data-set="ai-export-chat"]');
    if (exportBtn) exportBtn.addEventListener('click', exportChat);

    const wipeBtn = body.querySelector('[data-set="ai-clear-chat"]');
    if (wipeBtn) wipeBtn.addEventListener('click', function () {
        A().sheet.open('清空聊天记录',
            '<p class="sheet-note">本机存着的弦音对话会全删掉，删了找不回来。' +
            '想留一份的话，先点「导出弦音聊天 md」。</p>',
            '<button class="btn" type="button" data-action="chat-cancel">取消</button>' +
            '<button class="btn danger" type="button" data-action="chat-wipe">确认清空</button>');
    });
}

function runPolish(ctx) {
    const api = ctx.api;
    pending = { existing: String(ctx.value || ''), setValue: ctx.setValue };
    api.sheet.open('整理成日记',
        '<textarea class="textarea" id="aiInput" rows="5" ' +
        'placeholder="把今天的经过简单写几句，交给弦音整理成日记"></textarea>' +
        '<p class="sheet-note" id="aiNote">' +
        (isConfigured()
            ? '内容会发送到你填的接口（' + api.escapeHtml(getAiConfig().baseUrl) + '）。'
            : '还没有配置弦音，请先点弦音页右上角的齿轮填写 API Key。') +
        '</p>',
        '<button class="btn" type="button" data-action="ai-cancel">取消</button>' +
        '<button class="btn primary" type="button" data-action="ai-run"' +
        (isConfigured() ? '' : ' disabled') + '>整理</button>');
}

ellipse.define({
    apiVersion: 1,
    id: 'assistant',
    kind: 'page',
    name: '弦音',
    icon: 'note',
    note: '能陪你说话、帮你记状态、排日程',
    desc: '独立的一页聊天；能帮你记状态、排日程，动手之前先问你',
    group: 'assistant',
    groupTitle: 'AI——弦音',
    pageClass: 'page--chat',
    secrets: ['apiKey', 'baseUrl'],

    mount: mountChat,

    services: {
        ai: {
            isConfigured: isConfigured,
            isTrustedEndpoint: isTrustedEndpoint,
            getConfig: getAiConfig,
            polish: polishText
        }
    },

    tools: [
        { id: 'ai', icon: 'spark', label: '整理成日记', run: runPolish }
    ],

    actions: {
        'ai-cancel': function (ctx) { ctx.api.sheet.close(); },

        'ai-run': function (ctx) {
            const api = ctx.api;
            const note = api.sheet.body().querySelector('#aiNote');
            const input = api.sheet.body().querySelector('#aiInput');
            const raw = input ? input.value.trim() : '';
            if (!raw) { api.toast('先写几句内容'); return; }
            if (!pending) return;

            const btn = ctx.target;
            btn.disabled = true;
            btn.textContent = '整理中…';
            polishText(raw).then(function (out) {
                pending.setValue((pending.existing + '\n\n' + out).trim());
                api.sheet.close();
                api.toast('已写入日记');
            }).catch(function (err) {
                btn.disabled = false;
                btn.textContent = '整理';
                if (note) note.textContent = '整理失败：' + msg(err);
            });
        },

        'chat-cancel': function (ctx) { ctx.api.sheet.close(); },

        'chat-wipe': function () { wipeChat(); }
    }
});
