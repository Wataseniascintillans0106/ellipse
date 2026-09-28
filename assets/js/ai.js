/* AI 能力：语音转写、文段整理。全部在浏览器内直接请求用户自己填写的接口。

   这是「AI 助手」模块自己的实现细节，不是核心的一部分 ——
   配置存在该模块的命名空间 settings.mods.assistant 下（老版本的顶层 ai 键会自动搬过来）。 */

import { getModuleSettings } from './storage.js';

const MOD_ID = 'assistant';

const DEFAULT_BASE = 'https://api.openai.com/v1';
const FALLBACK_BASE = 'https://api.deepseek.com/v1';
const TRUSTED_HOSTS = ['api.openai.com', 'api.deepseek.com'];

export function getAiConfig() {
    const ai = getModuleSettings(MOD_ID);
    let baseUrl = (ai.baseUrl || '').trim().replace(/\/+$/, '');
    if (!baseUrl) baseUrl = DEFAULT_BASE;
    if (!/\/v\d+(\/)?$/.test(baseUrl)) baseUrl += '/v1';
    return {
        baseUrl: baseUrl,
        model: (ai.model || '').trim() || 'gpt-4o-mini',
        transcribeModel: (ai.transcribeModel || '').trim() || 'whisper-1',
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

/** 语音转写：把音频 blob 交给 Whisper 兼容接口 */
export async function transcribeAudio(blob, filename) {
    const cfg = getAiConfig();
    if (!cfg.apiKey) throw new Error('还没有填写 API Key，请在「设置 · AI 辅助」中配置');
    const form = new FormData();
    form.append('file', blob, filename || 'voice.webm');
    form.append('model', cfg.transcribeModel);
    const data = await requestJson('/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + cfg.apiKey },
        body: form
    });
    const text = data && (data.text || (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content));
    if (!text) throw new Error('转写结果为空');
    return String(text).trim();
}

/** 文本整理：把口述内容整理成通顺的日记 */
export async function polishText(raw, instruction) {
    const cfg = getAiConfig();
    if (!cfg.apiKey) throw new Error('还没有填写 API Key，请在「设置 · AI 辅助」中配置');
    const sys = instruction || '你是健康状况日记的整理助手。把用户口述的零散内容整理成第一人称、通顺、克制的日记段落：' +
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

/** 浏览器内置语音识别（无需 API Key，Chrome / Edge 可用） */
export function createRecognizer(handlers) {
    const h = handlers || {};
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        return {
            supported: false,
            start: function () { if (h.onError) h.onError('当前浏览器不支持内置语音识别'); },
            stop: function () {}
        };
    }
    const rec = new SR();
    rec.lang = 'zh-CN';
    rec.continuous = true;
    rec.interimResults = true;

    let finals = '';

    rec.onresult = function (evt) {
        let interim = '';
        for (let i = evt.resultIndex; i < evt.results.length; i++) {
            const r = evt.results[i];
            if (r.isFinal) finals += r[0].transcript;
            else interim += r[0].transcript;
        }
        if (h.onText) h.onText(finals, interim);
    };
    rec.onerror = function (evt) {
        if (h.onError) h.onError(evt.error === 'not-allowed' ? '没有麦克风权限' : '语音识别出错：' + evt.error);
    };
    rec.onend = function () { if (h.onEnd) h.onEnd(finals); };

    return {
        supported: true,
        get text() { return finals; },
        start: function () {
            finals = '';
            try { rec.start(); } catch (err) { if (h.onError) h.onError('无法启动录音：' + err.message); }
        },
        stop: function () {
            try { rec.stop(); } catch (err) { /* 已停止 */ }
        }
    };
}

export function recordingSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

export { DEFAULT_BASE, FALLBACK_BASE, TRUSTED_HOSTS };
