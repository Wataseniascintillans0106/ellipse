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

export async function polishText(raw, instruction) {
    const cfg = getAiConfig();
    if (!cfg.apiKey) throw new Error('还没有填写 API Key，请在「设置 · AI 辅助」中配置');
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
