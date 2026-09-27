/* 录音与语音转写：两种通路
   1) 浏览器内置识别（无需配置，边说边出字）
   2) 录音上传到 Whisper 兼容接口（需要 API Key，中文更稳）
*/

import { createRecognizer, recordingSupported, transcribeAudio, isConfigured } from './ai.js';
import { toast } from './util.js';
import { icon } from './icons.js';

export { recordingSupported, isConfigured };

/** 内置识别：实时回调文本 */
export function startLiveRecognition(handlers) {
    const rec = createRecognizer(handlers);
    if (!rec.supported) {
        if (handlers && handlers.onError) handlers.onError('当前浏览器不支持内置语音识别，可改用录音转写');
        if (handlers && handlers.onEnd) handlers.onEnd('');
        return { supported: false, stop: function () {} };
    }
    rec.start();
    return {
        supported: true,
        stop: function () { rec.stop(); }
    };
}

/** 录音上传：返回停止函数，停止后通过 onDone(blob, filename) 回调 */
export function startAudioRecording(handlers) {
    const h = handlers || {};
    if (!recordingSupported()) {
        if (h.onError) h.onError('当前浏览器不支持录音上传');
        return { supported: false, stop: function () {} };
    }
    let recorder = null;
    let chunks = [];
    let stopped = false;

    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        try {
            recorder = new MediaRecorder(stream);
        } catch (err) {
            stream.getTracks().forEach(function (t) { t.stop(); });
            if (h.onError) h.onError('无法创建录音器');
            return;
        }
        recorder.addEventListener('dataavailable', function (evt) {
            if (evt.data && evt.data.size) { chunks.push(evt.data); }
        });
        recorder.addEventListener('stop', function () {
            stream.getTracks().forEach(function (t) { t.stop(); });
            const type = recorder.mimeType || 'audio/webm';
            const blob = new Blob(chunks, { type: type });
            if (h.onDone) h.onDone(blob, type.indexOf('mp4') >= 0 ? 'voice.mp4' : 'voice.webm');
        });
        recorder.start();
        if (h.onStart) h.onStart();
    }).catch(function (err) {
        if (h.onError) h.onError(err && err.name === 'NotAllowedError' ? '没有麦克风权限' : '无法打开麦克风');
    });

    return {
        supported: true,
        stop: function () {
            if (stopped) return;
            stopped = true;
            try {
                if (recorder && recorder.state !== 'inactive') recorder.stop();
            } catch (err) { /* 忽略 */ }
        }
    };
}

export async function transcribeBlob(blob, filename) {
    return transcribeAudio(blob, filename);
}

/**
 * 语音面板：录音 -> 转写 ->（可选 AI 整理）-> 回填
 * @param {object} ctx { body, foot, close, onClose }
 * @param {function} commit (text) => void
 */
export function openVoiceFlow(ctx, commit) {
    const body = ctx.body;
    const foot = ctx.foot;

    body.innerHTML =
        '<div class="rec-stage">' +
        '<button class="rec-btn" type="button" id="recBtn" aria-label="开始录音">' + icon('mic') + '</button>' +
        '<p class="rec-state" id="recState">点一下开始说话</p>' +
        '<div class="rec-live" id="recLive"></div>' +
        '</div>' +
        '<p class="sheet-note" id="recNote"></p>';

    foot.innerHTML =
        '<button class="btn" type="button" data-action="voice-cancel">取消</button>' +
        '<button class="btn primary" type="button" data-action="voice-apply" disabled>写入日记</button>';

    const btn = body.querySelector('#recBtn');
    const state = body.querySelector('#recState');
    const live = body.querySelector('#recLive');
    const note = body.querySelector('#recNote');
    const applyBtn = foot.querySelector('[data-action="voice-apply"]');

    note.textContent = isConfigured()
        ? '录音结束后可由 AI 整理成通顺的日记，也可以直接在下方文字上修改。'
        : '未配置 AI 时，识别结果直接写入日记；在「设置 · AI 辅助」里填写 API Key 后可自动整理。';

    let liveRec = null;
    let audioRec = null;
    let mode = null;          // 'live' | 'audio'
    let text = '';
    let busy = false;

    function setText(t) {
        text = t || '';
        live.textContent = text;
        applyBtn.disabled = busy || !text.trim();
    }

    function setState(s) { state.textContent = s; }

    function stopAll() {
        if (liveRec) { liveRec.stop(); liveRec = null; }
        if (audioRec) { audioRec.stop(); audioRec = null; }
        btn.classList.remove('on');
    }

    async function finishAudio(blob, filename) {
        setState('转写中…');
        try {
            const t = await transcribeBlob(blob, filename);
            setText(t);
            setState('转写完成，可修改后写入');
        } catch (err) {
            setState('转写失败');
            note.textContent = String(err.message || err);
        }
    }

    function start() {
        if (isConfigured() && recordingSupported()) {
            mode = 'audio';
            setText('');
            audioRec = startAudioRecording({
                onStart: function () { btn.classList.add('on'); setState('录音中，再点一下结束'); },
                onError: function (msg) { mode = null; btn.classList.remove('on'); setState(msg); },
                onDone: function (blob, filename) { finishAudio(blob, filename); }
            });
            if (!audioRec.supported) mode = null;
            return;
        }
        mode = 'live';
        setState('识别中，再点一下结束');
        liveRec = startLiveRecognition({
            onText: function (finals, interim) { setText(finals + (interim ? ' ' + interim : '')); },
            onError: function (msg) { setState(msg); },
            onEnd: function (finals) {
                setText(finals || text);
                setState(String(finals || text).trim() ? '识别完成，可修改后写入' : '没有听到内容，可以再试一次');
                mode = null;
                btn.classList.remove('on');
            }
        });
        if (liveRec.supported) btn.classList.add('on');
        else mode = null;
    }

    function stop() {
        const wasAudio = mode === 'audio';
        stopAll();
        mode = null;
        if (!wasAudio) setState(text ? '已停止，可写入' : '点一下开始说话');
    }

    btn.addEventListener('click', function () {
        if (busy) return;
        if (mode) stop();
        else start();
    });

    foot.addEventListener('click', function (evt) {
        const action = evt.target.closest('[data-action]');
        if (!action) return;
        const name = action.getAttribute('data-action');

        if (name === 'voice-cancel') {
            stopAll();
            ctx.close();
            return;
        }

        if (name === 'voice-apply') {
            const content = (live.textContent || text).trim();
            if (!content) { toast('还没有内容'); return; }
            if (!isConfigured()) {
                commit(content);
                ctx.close();
                toast('已写入日记');
                return;
            }
            busy = true;
            stopAll();
            applyBtn.disabled = true;
            applyBtn.textContent = '整理中…';
            import('./ai.js').then(function (ai) {
                return ai.polishText(content);
            }).then(function (polished) {
                commit(polished || content);
                ctx.close();
                toast('已写入日记');
            }).catch(function (err) {
                busy = false;
                applyBtn.disabled = false;
                applyBtn.textContent = '写入日记';
                note.textContent = '整理失败：' + String(err.message || err) + '。可以直接再点「写入日记」使用原文。';
            });
        }
    });

    ctx.onClose(function () { stopAll(); });
}
