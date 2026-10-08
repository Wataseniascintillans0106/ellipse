# ellipse 模块开发指南

这份文档写给「想给 ellipse 加一个模块」的人。看完你应该能自己写一个能用的模块，
并且知道哪些事**不要**做。

> 一句话原理：核心（`assets/js/core/`）不认识「情绪」「睡眠」「AI」，
> 它只认识一件事——**模块的定义**。内置的 7 个模块和你在设置里导入的模块，
> 走的是同一套契约，没有特权通道。

---

## 一、最小的一个模块

新建一个文本文件，比如 `weight.js`，写这些：

```js
/* 体重：每天同一时间称一次 */
ellipse.define({
    apiVersion: 1,
    id: 'weight',
    name: '体重',
    icon: 'chart',
    desc: '每天同一时间称重',
    fields: [
        { key: 'kg', type: 'number', label: '体重', unit: 'kg', step: 0.1, chips: [55, 60, 65] }
    ]
});
```

**这就写完了。** 不需要注册、不需要写渲染、不需要碰导出。装上之后你会自动得到：

| 你得到的 | 来自哪里 |
| --- | --- |
| 记录页最后多一栏「体重」，带输入框和 55 / 60 / 65 三个快捷按钮 | `fields` 声明 |
| 栏收起时显示「体重 63.5 kg」 | 同上（自动摘要） |
| md 导出里多一段 `## 体重` + `- 体重：63.5 kg` | 同上 |
| 区间汇总的表格里多一列、波状图里多一条曲线 | 同上（数值型字段自动变成图表指标） |

`number` 只是 6 种字段类型之一，其余见第三节。

### 怎么装进去

1. 起好预览（双击 `启动预览.bat`），打开页面；
2. 右下角齿轮 → **模块** → **导入模块** → 选中你的 `weight.js`；
3. 弹出确认框，核对它自称的 id / 名字，确认后它就在记录页上了。

### 怎么改

设置 → 模块 → 找到它 → **导出**。拿回的就是你写的那份源码，改完重新导入即可
（**同一个 `id` 再导入一次 ＝ 更新**，不会变成两份）。

---

## 二、契约字段一览

`ellipse.define({...})` 收到的是一个普通对象。除了自己加的键，核心认这些：

| 键 | 必填 | 说明 |
| --- | --- | --- |
| `apiVersion` | ✅ | 现在填 `1`。填比核心更高的数字会被拒绝，并提示「此模块需要更新的 ellipse」 |
| `id` | ✅ | 小写字母开头，只含 `a-z 0-9 - _`，最长 32 位。**它是数据的归属**，改 id 等于换一个模块 |
| `name` | ✅ | 记录页上显示的栏名 |
| `kind` | | `record`（默认，收集字段）/ `panel`（自己画一整块）/ `service`（只提供能力，不占位置） |
| `icon` | | 图标名，见 `assets/js/icons.js`；不写用 `chart` |
| `desc` | | 一句话说明，设置的模块列表里会显示 |
| `fields` | | 字段声明数组，`record` 型的主要工作都在这里 |
| `defaultOff` | | `true` 表示装上后默认关闭，让用户自己去开 |
| `secrets` | | 敏感字段名数组。声明过的字段，在「备份 JSON」里**默认不会被导出** |

**id 的约束是硬拦的**：格式不对、跟已有模块重名、想抢内置模块的 id，导入时就会被挡下来。

---

## 三、字段类型

`record` 型模块的 `fields` 数组，每一项是一张表单控件。**声明它，核心自己推导出
表单、摘要、markdown、图表指标**——这就是模块能做到 11 行的原因。

| `type` | 长什么样 | 存的值 | markdown 输出 |
| --- | --- | --- | --- |
| `scale` | 一排评分格，再点一次取消 | 数字 | `- 醒后：7 / 10` |
| `slider` | 滑动条 | 数字 | `- 疼痛程度：3 / 10` |
| `number` | 数字输入框（可配快捷按钮） | 数字 | `- 睡眠时长：7.5 小时` |
| `enum` | 二选一 / 多选一的按钮组 | 数字、字符串或布尔 | `- 是否不适：无不适` |
| `text` | 单行输入框 | 字符串 | `- 部位 / 备注：左侧膝关节` |
| `textarea` | 多行输入框（可挂工具按钮） | 字符串 | 正文直接输出，不加标签 |

公共属性：

| 属性 | 适用 | 说明 |
| --- | --- | --- |
| `key` | 全部 | 数据里的字段名，同一个模块里唯一 |
| `label` | 全部 | 表单上的标签，也是 md 里 `- 标签：值` 的那个标签 |
| `short` | 全部 | 摘要里用的短名（默认取 `label`）；传 `''` 表示摘要里不要名字 |
| `preview` | 全部 | `false` 表示摘要里不显示这一项 |
| `metric` | 数值型 | `false` 表示这一项不进波状图 |

各类型专属：

```js
// scale：评分格
{ key: 'morning', type: 'scale', label: '醒后', min: 1, max: 10,   // 默认 1–10
  low: '1 低落', high: '10 很好' }                                  // 两端的小字提示

// slider：滑动条
{ key: 'level', type: 'slider', label: '疼痛程度', min: 0, max: 10 } // 默认 0–10

// number：数字框
{ key: 'kg', type: 'number', label: '体重', unit: 'kg', step: 0.1,
  min: 0, max: 200, chips: [55, 60, 65], chipUnit: '' }             // chips 是下面的快捷按钮

// enum：选项按钮
{ key: 'discomfort', type: 'enum', label: '是否不适',
  options: [ { value: false, label: '无不适' }, { value: true, label: '有不适' } ] }

// text：单行
{ key: 'note', type: 'text', label: '部位 / 备注', placeholder: '可选', maxlength: 60 }

// textarea：多行，可以挂工具按钮（见第五节）
{ key: 'text', type: 'textarea', label: '日记', rows: 6, counter: true,
  foot: '写完可以让我整理一下', tools: ['ai'] }
```

> **空值也照实写。** 没填的字段在 md 里是 `- 标签：—`，但 `text` 类型空着就整行不写。
> 数值 `0` 和布尔 `false` 都算「有值」，不会被丢掉——疼痛 0 分会老老实实出现在导出里。

**`label` 里可以写 `\n` 换行**，把标题分两行（`.field-label` 开了 `white-space: pre-line`）。
内置的「微成就」就是这么写的：

```js
label: '记录一些微小的成就\n哪怕是多吃一口饭 多喝一口水'
```

> 不写 `\n` 就正常一行；写了但把 app.css 里那句 `white-space: pre-line` 删掉，换行会被
> HTML 折回一个空格，两句挤成一行——`node scripts/smoke.mjs` 两边都盯着。

### 想自己控制导出格式？

给模块加一个 `markdown(record)` 函数，返回字符串或字符串数组，核心就用它代替自动生成：

```js
markdown: function (m) {
    return ['体重：' + m.kg + ' kg', '', '比昨天轻了 ' + (m.prev - m.kg) + ' kg'];
}
```

**一行一条的写法**（内置的「微成就」就是这么做的）：让患者在一个 `textarea` 里一行写一条，
导出时切成列表项。空行和只有空格的行顺手丢掉，免得留下一条空的 `-`：

```js
markdown: function (m) {
    const text = m && m.text ? String(m.text).trim() : '';
    if (!text) return [];
    return text.split('\n')
        .map(function (line) { return line.trim(); })
        .filter(Boolean)
        .map(function (line) { return '- ' + line; });
}
```

> 顺带一提：`textarea` 在自动导出里走的是独立分支，**`label` 不会被写进 md**。
> 所以把说明性的句子放在 `label`（框上面）或 `foot`（框下面）都是安全的，不会污染导出。

### 想自己定义图表指标？

不写 `metrics` 时，全部数值型字段各成一条曲线。想合并（比如「日内变化 ＝ 睡前 − 醒后」）就自己声明：

```js
metrics: [
    { key: 'morning', label: '醒后', field: 'morning', min: 0, max: 10 },
    { key: 'swing', label: '日内变化', min: 0, max: 10,
      value: function (m) { return (m.evening == null || m.morning == null) ? null : m.evening - m.morning; } }
]
```

`value(m)` 返回 `null` 表示这天没数据：那天**不画圆点**，但在横轴上照样占一格，
折线按 `min`（也就是图的最低处）画过去，所以整条线是连续的。

想要**柱状图**（比如运动时长），给指标加一句 `style: 'bar'` 就行，别的一个字都不用改：

```js
metrics: [
    { key: 'minutes', label: '运动时长', field: 'minutes', unit: '分钟', min: 0, style: 'bar' }
]
```

柱状图与折线图共用网格、刻度和日期轴，只有两点不一样：

- 一天一根柱子，按「当天」居中；**没记录的日子空着不画**（不像折线会贴到底连过去）。
- 纵轴上限跟着数据走：最长的那根柱子顶到最上面一条线。

⚠️ **别把字段上的 `max` 抄进指标**。`{ type:'number', max:600 }` 里的 `max` 只管
「输入框最多能填 600」；指标里的 `max` 是「纵轴画到多高」。照抄过去，纵轴会一路顶到 600，
30 分钟的柱子就缩成贴着底的一条细线。**指标不写 `max`，纵轴才会跟着数据走。**

（`scale` / `slider` 字段上的 `max` 是评分上限，那是指标该用的，照抄没问题。）

---

## 四、另外两种模块

### `panel`：自己画一整块

「状态波动图」就是这种。它不收集数据，只把别的模块的评分汇成曲线。

```js
ellipse.define({
    apiVersion: 1, id: 'mypanel', kind: 'panel', name: '我的面板',
    desc: '一块自己画的内容',
    defaultOpen: true,                       // 这一栏默认展开
    mount: function (body, ctx) {            // body 是个空的 <div>，往里塞 DOM
        const p = document.createElement('p');
        p.textContent = '今天一共 ' + ctx.api.records.allKeys().length + ' 天有记录';
        body.appendChild(p);
    }
});
```

- 必须提供 `mount(body, ctx)`。它在该栏展开时被调用，**每次展开都会重新调用一次**。
- 面板型模块**不产生数据**，也不进 md 导出，但会出现在设置页的模块列表里，可以被关掉。
- `ctx.api` 就是第五节的 API 门面。

### `service`：只提供能力

「AI 助手」是这种。它不占记录页的位置，但可以：

- 向别的模块暴露能力（`services`），
- 往日记这类字段旁边挂按钮（`tools`），
- 往设置页塞一整个分区（`settingsSections`），
- 认领面板上的按钮（`actions`）。

**关掉它，这四样东西一起消失**——这正是「AI 也是一个模块」的意思。

---

## 五、模块能看到的全部能力：`ellipse`

模块文件里可用的东西**只有**全局的 `ellipse`，加上标准 JS。不要指望 `import`，
不要指望别的模块的内部函数。

```js
ellipse.define({...})       // 注册自己（模块文件的唯一入口）

// 通用小工具
ellipse.icon(name)          // 取一段 svg 图标
ellipse.icons               // 全部图标名
ellipse.escapeHtml(str)     // 拼 HTML 时防注入
ellipse.fmtNum(n)           // 数字格式化（7.0 → 7）
ellipse.debounce(fn, ms)
ellipse.toast('已保存')      // 屏幕下方的小提示

ellipse.refresh()           // 你改了数据，让记录页重画一次

// 只读查询别的模块
ellipse.registry.all() / get(id) / ids() / has(id) / isEnabled(id)
ellipse.registry.cardOrder() / enabledOrder() / chartModules(list)
ellipse.registry.tools() / settingsSections() / secretFields(id)

// 取用别的模块提供的能力
ellipse.services.get('ai')  // 没有这个服务时返回 null
ellipse.services.names()

// 记录读写（按日期 key 'YYYY-MM-DD'）
ellipse.records.dataOf(dateKey)          // 某天全部模块的数据
ellipse.records.setField(dateKey, modId, field, value)
ellipse.records.drop(modId)              // 删掉某模块的全部数据
ellipse.records.allKeys()                // 有记录的日期列表

// 这个模块自己的配置（存在 settings.mods[你的id] 下）
ellipse.settings.get('你的id')
ellipse.settings.set('你的id', { range: '7d' })
ellipse.settings.global()                // 全站设置，只读

// 底部面板
ellipse.sheet.open(标题, 正文HTML, 底部按钮HTML)
ellipse.sheet.close() / isOpen()
ellipse.sheet.onClose(fn)                // 关面板时跑一次
ellipse.sheet.body() / foot()            // 取面板元素，自己挂监听

// 图表与表单控件工具包
ellipse.charts.block(module, opts) / render(opts) / ranges / rangeById(id)
ellipse.ui.renderFields(fields, data, ctx)   // 声明式字段背后的函数
ellipse.ui.summarize / markdownLines / metricsFromFields / fieldByKey

// 下载与复制
ellipse.download(text, filename)   // 存成文件（浏览器会弹下载）
ellipse.copy(text)                 // 复制到剪贴板
```

### 贡献点

| 键 | 形状 | 作用 |
| --- | --- | --- |
| `services` | `{ ai: { polish } }` | 把能力暴露给别的模块，`ellipse.services.get('ai')` 取 |
| `tools` | `[{ id, icon, label, run(ctx) }]` | 字段声明 `tools:['ai']` 时才出现的按钮 |
| `settingsSections` | `[{ id, title, note, html(ctx), bind(root, ctx) }]` | 设置页里的一整个分区 |
| `actions` | `{ 'my-act': function (ctx) {} }` | 认领界面上 `data-act="my-act"` 的按钮 |

`tools[].run(ctx)` 拿到的 `ctx`：

```js
{ api, date, moduleId, module, field, fieldDef, value, target,
  setValue(text) }      // 把结果写回那个字段，并自动重画记录页
```

`actions` 里函数的 `ctx`：

```js
// 记录页卡片里的按钮
{ api, def, date, target, card }
// 底部面板里的按钮（ellipse.sheet.open 出去的 HTML）
{ api, target, sheet }
```

`settingsSections` 里函数的 `ctx`：

```js
{ api, rerender }       // rerender() 让设置页整个重画一遍
```

---

## 六、写模块时的几条规矩

1. **单文件、自包含。** 模块源码会被整体存进本机、下次启动重新求值。
   不要在里面 `import './别的.js'`——装上去之后那个路径不存在。需要什么从 `ellipse` 拿。
2. **顶层不要碰 `document`。** 顶层只写 `ellipse.define({...})` 这一句。
   要用 DOM 就写在 `mount` / `html` / `bind` / `run` 这些函数里面，
   它们只在界面真的要用到时才被调用。
3. **一次 `define`。** 一个文件里只调一次（第一次调用会被接住）。
4. **体积上限 200 KB。** 超了导入时就被拒绝——本机存储总共只有几 MB。
5. **别改别人的数据。** 写记录请用 `ellipse.records.setField(日期, 你的模块id, ...)`，
   只碰自己 id 名下的东西。

---

## 七、写坏了会怎么样

装模块系统就得先接受「有人会装坏模块」。四条防线：

1. **求值失败**（语法错误、执行时抛异常、没调 `define`）→ 设置 → 模块里多一条
   「加载失败」的条目，写着原因，旁边能一键删掉。页面其余部分照常。
2. **渲染失败** → 那一栏原地换成一张错误卡片，其他模块不受影响。
3. **导出失败** → 只有这一段变成「导出这个模块的内容时出错：…」，整份 md 仍然导得出来。
4. **启动顺序** → 先渲染外壳、再求值模块，所以**设置页在你最需要它的时候一定打得开**。

如果模块里有**死循环**（浏览器会被卡死，任何代码都救不了），在地址后面加 **`?nomods=1`**：

```
http://localhost:5173/index.html?nomods=1
```

它会跳过所有自制模块的求值，只装内置的。进去之后到设置 → 模块里删掉那一条即可。
设置里还有一个「停用全部自定义模块」的按钮，作用类似。

---

## 八、安全须知（重要）

**模块就是一段能在你浏览器里运行的代码，它拥有这个页面的全部权限。** 具体说：

- 它能读到本机保存的**全部记录**（`ellipse.v1.records`）；
- 它能读到你在设置里填的 **AI 接口地址与 API Key**；
- 它能把这些东西发到任何地方去。

这不是 ellipse 的缺陷，而是所有「可装模块」系统的固有代价——游戏 mod、浏览器扩展同理。

所以：

- **只导入你自己写的、或者你能看懂并且信得过的人给的 `.js` 文件。**
- 导入确认框会写明这一点，并列出模块**自称**的 id 与名字。
  但要清楚：名字是它自己填的，不代表它真的只干那件事。
- 建议的做法是：拿到别人的模块先**用文本编辑器打开看一眼**，尤其是文件末尾有没有
  `fetch(...)`、`XMLHttpRequest`、`localStorage` 之类的动作。

另外两个相关的设计，是为了不让你无意中泄露：

- **备份 JSON 默认不含密钥。** 设置 → 数据 → 备份 JSON 里的「备份包含 AI 密钥」
  默认是**不勾**的。要发给别人时，保持不勾。
- **模块声明的 `secrets`** 字段在备份时会被一并剔除。AI 助手就声明了 `apiKey` 与 `baseUrl`。

> 给以后维护的人的备注：将来如果给页面加 CSP，这两条装载路径需要放行——
> 优先路 `import(Blob URL)` 要 `script-src blob:`，兜底路 `new Function` 要
> `script-src 'unsafe-eval'`。现在仓库里没有任何 CSP，两条路都通。

---

## 九、调试

- **看报错**：浏览器开发者工具（F12）的 Console。装载失败的模块，报错信息里会带
  `ellipse-mod-<你的文件>` 这样的名字，一眼能认出是谁。
- **改一行看一行**：设置 → 模块 → 导出 → 改 → 重新导入（同 id 即更新）→ 重新打开记录页。
  比重新装一遍快。
- **想抄内置模块**：内置的 7 个模块就是最好的范例，同样可以在设置里导出源码
  （需要从 `http://localhost:5173` 打开页面才取得到）。
  - `mood.js` —— `scale` 评分格 + 派生指标（日内变化）
  - `sleep.js` —— 两种数值字段
  - `pain.js` —— `slider` + `text`
  - `exercise.js` —— `number` + 快捷按钮 + `enum`
  - `micro.js` —— `textarea` + 自定义 `markdown`（一行一条，导出成列表）
  - `diary.js` —— `textarea`（纯文本，目前不挂工具按钮）
  - `trend.js` —— `panel` 型样板
  - `assistant.js` —— `service` 型样板（服务 / 工具 / 设置分区 / 动作，四样占全）
- **逻辑回归**：改完核心代码跑 `node scripts/smoke.mjs`；浏览器交互自检看
  `http://localhost:5173/scripts/flowcheck.html` 和 `.../modcheck.html`。
