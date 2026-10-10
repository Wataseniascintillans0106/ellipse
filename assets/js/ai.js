import { getModuleSettings } from './storage.js';

const MOD_ID = 'assistant';

const DEFAULT_BASE = 'https://api.openai.com/v1';
const FALLBACK_BASE = 'https://api.deepseek.com/v1';
const TRUSTED_HOSTS = ['api.openai.com', 'api.deepseek.com'];

const IDLE_MS = 60000;

export function getAiConfig() {
    const ai = getModuleSettings(MOD_ID);
    let baseUrl = (ai.baseUrl || '').trim().replace(/\/+$/, '');
    if (!baseUrl) baseUrl = DEFAULT_BASE;
    if (!/\/v\d+(\/)?$/.test(baseUrl)) baseUrl += '/v1';
    return {
        baseUrl: baseUrl,
        model: (ai.model || '').trim() || 'gpt-4o-mini',
        apiKey: (ai.apiKey || '').trim()
    };
}

export function isConfigured() {
    return !!getAiConfig().apiKey;
}

export function isTrustedEndpoint() {
    const cfg = getAiConfig();
    try {
        const host = new URL(cfg.baseUrl).hostname;
        return TRUSTED_HOSTS.indexOf(host) >= 0 || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    } catch (err) {
        return false;
    }
}

export function isReadAllowed() {
    return getModuleSettings(MOD_ID).readAllow === true;
}

export function setReadAllowed(on) {
    if (!globalThis.ellipse || !globalThis.ellipse.settings) return;
    globalThis.ellipse.settings.set(MOD_ID, { readAllow: on === true });
}

function detailOf(text) {
    const raw = String(text || '');
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (err) { data = null; }
    const msg = data && data.error && data.error.message ? data.error.message : raw.slice(0, 200);
    return msg ? '：' + msg : '';
}

function pieceOf(obj) {
    const c = obj && obj.choices && obj.choices[0];
    if (!c) return '';
    if (c.delta && typeof c.delta.content === 'string') return c.delta.content;
    if (c.message && typeof c.message.content === 'string') return c.message.content;
    if (typeof c.text === 'string') return c.text;
    return '';
}

function wholeText(text) {
    const t = String(text || '');
    if (!t.trim()) throw new Error('接口没有返回内容');

    let obj = null;
    try { obj = JSON.parse(t); } catch (err) { obj = null; }
    if (obj) {
        if (obj.error) throw new Error('接口说：' + (obj.error.message || '出错了'));
        const got = pieceOf(obj);
        if (got) return got;
        throw new Error('接口返回的内容看不懂');
    }

    if (t.indexOf('data:') >= 0) {
        let out = '';
        t.split('\n').forEach(function (line) {
            const s = line.replace(/\r$/, '');
            if (s.indexOf('data:') !== 0) return;
            const payload = s.slice(5).trim();
            if (!payload || payload === '[DONE]') return;
            try { out += pieceOf(JSON.parse(payload)); } catch (err) { return; }
        });
        if (out) return out;
    }
    return t;
}

async function post(messages, opts) {
    const o = opts || {};
    const cfg = getAiConfig();
    if (!cfg.apiKey) throw new Error('还没有填 API Key，去「设置 · 弦音」里填一下');

    const ctrl = new AbortController();
    let stopped = false;
    let timedOut = false;
    let timer = 0;

    function onStop() { stopped = true; ctrl.abort(); }
    function arm(ms) {
        clearTimeout(timer);
        timer = setTimeout(function () { timedOut = true; ctrl.abort(); }, ms || IDLE_MS);
    }

    if (o.signal) {
        if (o.signal.aborted) onStop();
        else o.signal.addEventListener('abort', onStop);
    }

    let acc = '';
    const push = function (piece) {
        if (!piece) return;
        acc += piece;
        if (typeof o.onDelta === 'function') o.onDelta(acc);
    };

    try {
        arm();
        const res = await fetch(cfg.baseUrl + '/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + cfg.apiKey
            },
            body: JSON.stringify({
                model: cfg.model,
                temperature: o.temperature === undefined ? 0.7 : o.temperature,
                stream: o.stream === true,
                messages: messages
            }),
            signal: ctrl.signal
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error('接口返回 ' + res.status + detailOf(body));
        }

        const type = String(res.headers.get('content-type') || '').toLowerCase();
        const canStream = o.stream === true && !!res.body &&
            typeof res.body.getReader === 'function' && type.indexOf('text/event-stream') >= 0;

        if (!canStream) {
            const text = await res.text();
            push(wholeText(text));
            return { text: acc, stopped: false };
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buf = '';
        let raw = '';
        let sawData = false;

        while (true) {
            const step = await reader.read();
            if (step.done) break;
            arm();
            const chunk = decoder.decode(step.value, { stream: true });
            raw += chunk;
            buf += chunk;
            let at = buf.indexOf('\n');
            while (at >= 0) {
                const line = buf.slice(0, at).replace(/\r$/, '');
                buf = buf.slice(at + 1);
                at = buf.indexOf('\n');
                if (line.indexOf('data:') !== 0) continue;
                sawData = true;
                const payload = line.slice(5).trim();
                if (!payload || payload === '[DONE]') continue;
                try { push(pieceOf(JSON.parse(payload))); } catch (err) { continue; }
            }
        }

        if (!sawData && !acc) push(wholeText(raw));
        return { text: acc, stopped: false };
    } catch (err) {
        if (stopped && !timedOut) return { text: acc, stopped: true };
        if (timedOut) throw new Error('等太久了，超过一分钟没有动静');
        throw err;
    } finally {
        clearTimeout(timer);
        if (o.signal) o.signal.removeEventListener('abort', onStop);
    }
}

export function chatStream(messages, opts) {
    return post(messages, Object.assign({}, opts, { stream: true }));
}

export function chatOnce(messages, opts) {
    return post(messages, Object.assign({}, opts, { stream: false }));
}

async function requestJson(path, options) {
    const cfg = getAiConfig();
    const res = await fetch(cfg.baseUrl + path, options);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (err) { data = null; }
    if (!res.ok) {
        const detail = data && data.error && data.error.message ? data.error.message : (text || '').slice(0, 200);
        throw new Error('接口返回 ' + res.status + (detail ? '：' + detail : ''));
    }
    return data;
}

export async function polishText(raw, instruction) {
    const cfg = getAiConfig();
    if (!cfg.apiKey) throw new Error('还没有填写 API Key，请在「设置 · 弦音」中配置');
    const sys = instruction || '你是健康状况日记的整理助手。把用户零散写下的内容整理成第一人称、通顺、克制的日记段落：' +
        '保留全部事实与数字，不添加未提到的信息，不做医疗建议，不抒情，不用 emoji 与表情符号，' +
        '输出纯文本，150 字以内，直接给出整理后的正文。';
    const data = await requestJson('/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + cfg.apiKey
        },
        body: JSON.stringify({
            model: cfg.model,
            temperature: 0.3,
            messages: [
                { role: 'system', content: sys },
                { role: 'user', content: String(raw || '') }
            ]
        })
    });
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('整理结果为空');
    return String(text).trim();
}

export { DEFAULT_BASE, FALLBACK_BASE, TRUSTED_HOSTS };
