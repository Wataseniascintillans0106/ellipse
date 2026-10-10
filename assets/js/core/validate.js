import { FIELD_TYPES } from './fields.js';

export const CORE_API_VERSION = 1;

export const KINDS = ['record', 'panel', 'page', 'service'];

const ID_RE = /^[a-z][a-z0-9_-]{0,31}$/;

function checkFields(fields, errors) {
    fields.forEach(function (f, i) {
        const at = 'fields[' + i + ']';
        if (!f || typeof f !== 'object' || Array.isArray(f)) {
            errors.push(at + ' 不是对象');
            return;
        }
        const who = f.key ? at + '（' + f.key + '）' : at;
        if (typeof f.key !== 'string' || !f.key) errors.push(at + ' 缺少 key');
        if (FIELD_TYPES.indexOf(f.type) < 0) {
            errors.push(who + ' 的 type 不认识：' + JSON.stringify(f.type) + '，可选 ' + FIELD_TYPES.join(' / '));
        }
        if (f.type === 'enum' && (!Array.isArray(f.options) || !f.options.length)) {
            errors.push(who + ' 是 enum，必须给 options');
        }
    });
}

export function validateDefinition(def, opts) {
    const o = opts || {};
    if (!def || typeof def !== 'object' || Array.isArray(def)) {
        return { ok: false, errors: ['模块定义必须是一个对象'] };
    }

    const errors = [];
    const id = def.id;
    if (typeof id !== 'string' || !ID_RE.test(id)) {
        errors.push('id 要以小写字母开头，只含小写字母、数字、- 与 _（当前：' + JSON.stringify(id) + '）');
    } else if ((o.taken || []).indexOf(id) >= 0) {
        errors.push('已经有同名的模块「' + id + '」，换一个 id');
    }

    if (typeof def.name !== 'string' || !def.name.trim()) {
        errors.push('缺少 name（记录页上显示的栏名）');
    }

    const version = def.apiVersion;
    if (!Number.isInteger(version)) {
        errors.push('缺少 apiVersion（当前接口版本是 ' + CORE_API_VERSION + '，写 ' + CORE_API_VERSION + ' 即可）');
    } else if (version > CORE_API_VERSION) {
        errors.push('此模块需要更新的 ellipse（它要求接口 ' + version + '，当前只支持 ' + CORE_API_VERSION + '）');
    } else if (version < 1) {
        errors.push('apiVersion 必须大于 0');
    }

    const kind = def.kind === undefined ? 'record' : def.kind;
    if (KINDS.indexOf(kind) < 0) {
        errors.push('kind 只能是 ' + KINDS.join(' / ') + '（当前：' + JSON.stringify(kind) + '）');
    }
    if (kind === 'record' && !Array.isArray(def.fields) && typeof def.template !== 'function') {
        errors.push('记录型模块要有 fields 数组，或者自己写 template 函数');
    }
    if (kind === 'panel' && typeof def.mount !== 'function') {
        errors.push('面板型模块要提供 mount(body, ctx) 函数');
    }
    if (kind === 'page' && typeof def.mount !== 'function') {
        errors.push('独立页面型模块要提供 mount(body, ctx) 函数');
    }
    if (def.fields !== undefined && !Array.isArray(def.fields)) {
        errors.push('fields 必须是数组');
    }
    if (Array.isArray(def.fields)) checkFields(def.fields, errors);
    if (def.metrics !== undefined && !Array.isArray(def.metrics)) {
        errors.push('metrics 必须是数组');
    }

    return { ok: errors.length === 0, errors: errors };
}

export function formatErrors(errors) {
    return (errors || []).join('；');
}
