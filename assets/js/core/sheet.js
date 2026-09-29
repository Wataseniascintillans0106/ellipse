/* 底部面板：导出预览、AI 整理都用它。模块通过 api.sheet 使用。

   刻意不认识记录页 —— 面板关掉之后要重画的话，模块自己调 api.refresh()。
   元素全部惰性查找，这样 Node 里 import 本文件不会因为 document 是替身就炸。 */

let onCloseFn = null;
let stateHook = function () {};
let actionHandler = null;
let bound = false;

function node(id) { return document.getElementById(id); }

/* 面板里的按钮统一走一次事件委托：面板内容每次都被换掉，
   逐个按钮挂监听会越挂越多，所以只在面板元素上挂一次。 */
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

/** app.js 用它在启动时装上总的分发器：先认核心动作，再交给模块注册的动作 */
export function onAction(fn) { actionHandler = fn; }

export function isOpen() {
    const sheet = node('sheet');
    return !!sheet && sheet.classList.contains('open');
}

/** app.js 用它在面板开关时收放右上角的返回按钮 */
export function onStateChange(fn) { stateHook = fn || function () {}; }

/** 打开面板。title 是标题，bodyHtml / footHtml 直接塞进面板骨架 */
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
        onCloseFn = null;       /* 一次性：面板换内容时不该被上一次的回调打扰 */
        try { fn(); } catch (err) { console.warn('[ellipse] 面板关闭回调出错：', err); }
    }
}

/** 面板下次关闭时执行一次。 */
export function onClose(fn) { onCloseFn = fn; }

export function body() { return node('sheetBody'); }

export function foot() { return node('sheetFoot'); }

export function titleNode() { return node('sheetTitle'); }

export function closeButton() { return node('sheetClose'); }
