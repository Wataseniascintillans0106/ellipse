/* AI 助手：一个「服务型」模块 —— 它不产生记录卡片，只贡献三样东西：
     1. 设置里的「AI 辅助」分区（连同测试连接、清除密钥按钮）
     2. 两项能力：ai.polish（整理文段）、ai.transcribe（录音转写），别的模块可以取用
     3. 日记栏里的「语音转写」「整理成日记」两个工具按钮

   关掉它，上面三样一起消失 —— 日记里的按钮会自己不见。 */

import { isConfigured, isTrustedEndpoint, getAiConfig, polishText, transcribeAudio } from '../ai.js';
import { openVoiceFlow } from '../voice.js';

/* 打开「整理成日记」面板时记住是哪个字段，等点了「整理」再用 */
let pending = null;

function row(title, desc, inner) {
    return '<div class="set-row"><span class="set-row-main">' +
        '<span class="set-row-title">' + title + '</span>' +
        '<span class="set-row-desc">' + desc + '</span>' + inner +
        '</span></div>';
}

function statusText() {
    if (!isConfigured()) return '当前状态：未配置，语音将使用浏览器内置识别。';
    if (!isTrustedEndpoint()) return '当前状态：已填写密钥，但接口地址不在可信列表内，浏览器可能拒绝请求。';
    return '当前状态：已配置（' + getAiConfig().baseUrl + '）。';
}

function refreshStatus(root) {
    const status = root.querySelector('#aiStatus');
    if (status) status.textContent = statusText();
}

function sectionHtml(api) {
    const ai = api.settings.get('assistant');
    const cfg = getAiConfig();
    const esc = api.escapeHtml;
    return row('接口地址', '兼容 OpenAI 的服务地址，例如 https://api.deepseek.com 或 https://api.openai.com/v1',
            '<input class="set-input" type="url" data-ai="baseUrl" placeholder="' + esc(cfg.baseUrl) +
            '" value="' + esc(ai.baseUrl || '') + '">') +
        row('API Key', '仅保存在浏览器 localStorage，不会上传到别处',
            '<input class="set-input" type="password" data-ai="apiKey" autocomplete="off" ' +
            'placeholder="sk-…" value="' + esc(ai.apiKey || '') + '">') +
        row('模型', '用于整理文段，默认 gpt-4o-mini',
            '<input class="set-input" type="text" data-ai="model" placeholder="gpt-4o-mini" ' +
            'value="' + esc(ai.model || '') + '">') +
        row('转写模型', '用于语音转写，需要 /audio/transcriptions 接口',
            '<input class="set-input" type="text" data-ai="transcribeModel" placeholder="whisper-1" ' +
            'value="' + esc(ai.transcribeModel || '') + '">') +
        '<div class="set-actions">' +
        '<button class="btn" type="button" data-set="ai-test">测试连接</button>' +
        '<button class="btn" type="button" data-set="ai-clear">清除密钥</button>' +
        '</div>' +
        '<p class="sheet-note" id="aiStatus">' + statusText() + '</p>';
}

function testConnection(api, btn, root) {
    if (!isConfigured()) { api.toast('先填写 API Key'); return; }
    btn.disabled = true;
    btn.textContent = '测试中…';
    polishText('测试连接：请回复「连接正常」。', '你是连接测试助手，只回复四个字：连接正常')
        .then(function (out) {
            api.toast('连接正常：' + out.slice(0, 20));
        })
        .catch(function (err) {
            api.toast('连接失败：' + String(err.message || err).slice(0, 40));
        })
        .then(function () {
            btn.disabled = false;
            btn.textContent = '测试连接';
            refreshStatus(root);
        });
}

/* ---------------- 两个工具按钮 ---------------- */

function runVoice(ctx) {
    const api = ctx.api;
    openVoiceFlow({
        body: api.sheet.body(),
        foot: api.sheet.foot(),
        close: api.sheet.close,
        onClose: api.sheet.onClose
    }, function (text) {
        ctx.setValue(text);      /* 语音面板自己会 toast 并关掉面板 */
    });
}

function runPolish(ctx) {
    const api = ctx.api;
    const existing = String(ctx.value || '');
    pending = { existing: existing, setValue: ctx.setValue };
    api.sheet.open('整理成日记',
        '<textarea class="textarea" id="aiInput" rows="5" ' +
        'placeholder="把今天的经过简单写几句，交给 AI 整理成日记">' + api.escapeHtml(existing) + '</textarea>' +
        '<p class="sheet-note" id="aiNote">' +
        (isConfigured()
            ? '内容会发送到你配置的接口（' + getAiConfig().baseUrl + '）。'
            : '还没有配置 AI 接口，请先到「设置 · AI 辅助」填写 API Key。') +
        '</p>',
        '<button class="btn" type="button" data-action="ai-cancel">取消</button>' +
        '<button class="btn primary" type="button" data-action="ai-run"' +
        (isConfigured() ? '' : ' disabled') + '>整理</button>');
}

ellipse.define({
    apiVersion: 1,
    id: 'assistant',
    kind: 'service',
    name: 'AI 助手',
    icon: 'spark',
    desc: '语音转写与文段整理；关掉它，设置里的 AI 分区和日记里的两个按钮会一起消失',
    secrets: ['apiKey', 'baseUrl'],

    services: {
        ai: {
            isConfigured: isConfigured,
            isTrustedEndpoint: isTrustedEndpoint,
            getConfig: getAiConfig,
            polish: polishText,
            transcribe: transcribeAudio
        }
    },

    tools: [
        { id: 'voice', icon: 'mic', label: '语音转写', run: runVoice },
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
                /* 与改造前一致：原文在前，整理结果接在后面 */
                const merged = (pending.existing + '\n\n' + out).trim();
                pending.setValue(merged);
                api.sheet.close();
                api.toast('已写入日记');
            }).catch(function (err) {
                btn.disabled = false;
                btn.textContent = '整理';
                if (note) note.textContent = '整理失败：' + String(err.message || err);
            });
        }
    },

    settingsSections: [{
        id: 'ai',
        title: 'AI 辅助',
        note: '可选，密钥只存在本机',
        html: function (ctx) { return sectionHtml(ctx.api); },

        bind: function (root, ctx) {
            const api = ctx.api;

            function saveInputs() {
                const patch = {};
                root.querySelectorAll('[data-ai]').forEach(function (input) {
                    patch[input.dataset.ai] = input.value.trim();
                });
                api.settings.set('assistant', patch);
            }

            root.addEventListener('input', api.debounce(saveInputs, 600));
            root.addEventListener('change', function () {
                saveInputs();
                refreshStatus(root);
            });

            root.addEventListener('click', function (evt) {
                const btn = evt.target.closest('[data-set]');
                if (!btn) return;
                const name = btn.getAttribute('data-set');
                if (name === 'ai-test') { testConnection(api, btn, root); return; }
                if (name === 'ai-clear') {
                    api.settings.set('assistant', { apiKey: '', baseUrl: '', model: '', transcribeModel: '' });
                    ctx.rerender();
                    api.toast('已清除 AI 配置');
                }
            });

            refreshStatus(root);
        }
    }]
});
