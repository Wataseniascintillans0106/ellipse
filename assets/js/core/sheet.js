let onCloseFn = null;
let stateHook = function () {};
let actionHandler = null;
let bound = false;

function node(id) { return document.getElementById(id); }

function bindOnce() {
    if (bound) return;
    const sheet = node('sheet');
    if (!sheet) return;
    bound = true;
    sheet.addEventListener('click', function (evt) {
        const action = evt.target.closest('[data-action]');
        if (!action || !actionHandler) return;
        actionHandler(action.getAttribute('data-action'), action, evt);
    });
}

export function onAction(fn) { actionHandler = fn; }

export function isOpen() {
    const sheet = node('sheet');
    return !!sheet && sheet.classList.contains('open');
}

export function onStateChange(fn) { stateHook = fn || function () {}; }

export function open(title, bodyHtml, footHtml) {
    const sheet = node('sheet');
    if (!sheet) return;
    bindOnce();
    node('sheetTitle').textContent = title;
    node('sheetBody').innerHTML = bodyHtml || '';
    node('sheetFoot').innerHTML = footHtml || '';
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    stateHook();
}

export function close() {
    const sheet = node('sheet');
    if (!sheet) return;
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    stateHook();
    if (onCloseFn) {
        const fn = onCloseFn;
        onCloseFn = null;
        try { fn(); } catch (err) { console.warn('[ellipse] 面板关闭回调出错：', err); }
    }
}

export function onClose(fn) { onCloseFn = fn; }

export function body() { return node('sheetBody'); }

export function foot() { return node('sheetFoot'); }

export function titleNode() { return node('sheetTitle'); }

export function closeButton() { return node('sheetClose'); }
