# ellipse · 日常状态记录

面向有身体疾病人群的手机端日常记录工具。零依赖、零构建的静态网页：数据全部保存在本机浏览器，
可导出为 Obsidian 风格的 md 文件。

当前完成的是**功能框架**，视觉细节与图标（svg）留待后续打磨。

---

## 一、运行

```powershell
node scripts/serve.mjs 5173
```

- 电脑预览：<http://localhost:5173/index.html>
- 手机预览：手机与电脑连同一个 Wi-Fi，浏览器打开 `http://<电脑局域网IP>:5173/index.html`

也可以直接双击 `index.html`（Chrome / Edge / Safari 都支持本地模块加载）。
若浏览器拦截本地模块，就用上面的服务器方式。

> ⚠️ 手机连 Wi-Fi 访问 `http://<电脑局域网IP>:5173` **只能看版式**。
> 局域网 HTTP 不是浏览器的「安全来源」，所以 Service Worker、离线缓存、安装到主屏、
> 麦克风授权在这个地址下**全都不会生效**。要试这些请按下面的方式部署到 HTTPS
> （电脑上用 `http://localhost:5173` 则可以正常测）。

### 部署到手机（PWA）

项目已经配好了 PWA：部署到任意支持 HTTPS 的静态空间后，就能「安装到主屏」，
全屏运行、断网可用，录音转写需要的麦克风授权也才会正常弹出。

```
manifest.webmanifest    应用清单（名称 / 图标 / 启动方式）
sw.js                   Service Worker（联网优先，离线回退）
icon-192.png            图标
icon-512.png            图标
```

以免费的 GitHub Pages 为例：仓库 Settings → Pages → Deploy from a branch →
分支选 `main`、目录选 **`/(root)`**（⚠️ 别选 `/docs`，那会是 404）→ 几分钟后拿到网址，
手机浏览器打开后「添加到主屏幕」即可。

逐步图文步骤、更新与缓存的注意事项、常见问题，都在
**[docs/PWA部署与安装.md](docs/PWA部署与安装.md)**。

**示例数据（可选）**：打开 `scripts/seed.html` 会写入 90 天示例记录并跳回首页。
清除数据：设置 → 数据 → 清空全部记录。

---

## 二、页面结构

两层。主页保持 `demo.html` 的样子，状态记录是它的下一层：

1. **主页**：只有字标；右下角是**设置**按钮，右侧竖栏里是「状态记录」入口（与 demo 一致）。
2. **状态记录**（点竖栏图标进入）：
   - 顶部是日期，下面按设置的顺序排列各模块的栏；
   - 记录页左右内边距相等（各 26px），内容在屏幕中居中；
   - **右上角是返回主页按钮**；
   - 没有设置按钮：**设置只在主页**；也没有右侧竖栏（导出入口在页面底部）；
   - 手机系统返回键 / 浏览器返回键同样能退回主页。

地址：主页 `index.html#home`，记录页 `index.html#record`（可刷新、可分享）。

## 三、已经实现的模块

| 栏 | 记录内容 | 波状图 |
| --- | --- | --- |
| 情绪 | 醒后 / 睡前心情，1–10 评分 | 醒后、睡前、日内变化（睡前−醒后）三条 |
| 睡眠 | 睡眠质量 1–10，睡眠时长（小时） | 质量、时长两条 |
| 疼痛 | 疼痛程度 0–10，部位/备注 | 疼痛程度一条 |
| 运动 | 运动时长（分钟，可手填或用快捷键），是否不适 | 运动时长一条 |
| 日记 | 纯文本，可语音转写、可交 AI 整理 | 无（纯文字模块不生成图表） |
| 状态波动图 | 不出记录，只把上面各模块的评分汇成曲线 | 默认展开；可在设置里关闭 |

- 日期条两个箭头都在左侧（前 / 后一天，未来日期不可选），点日期本身可跳到最近有记录的某天，
  在记录页上左右滑动也能切换日期。
- 每一天的栏从上到下排列，点标题栏展开 / 收起；「状态波动图」默认保持展开。
- 记录页最下面是导出入口：预览当天的 md，可复制或下载。

## 四、状态波动图

- 就是记录页最后一条栏，和「情绪」「睡眠」同一种形态，**默认展开**，点标题栏可收起。
- 区间可切 **7 天 / 1 个月 / 3 个月**（设置里可改默认区间）。
- 点任意数据点，显示「日期 · 数值」；缺记录的日期用虚线段断开。
- 按记录页的栏顺序排列；**在设置里关掉的模块，这里的图一起消失**（数据仍保留在本机）。
- 整条栏也可以在设置里关闭。

## 五、设置页（只在主页，右下角齿轮）

1. **自定义功能区** —— 情绪 / 睡眠 / 疼痛 / 运动 / 日记各一个开关，可用上下箭头调整栏的顺序；
   最后是「状态波动图」的开关（它固定在记录页最后一条，不参与排序）。
   记录模块至少保留一个。关闭的模块不出现在记录页，对应的波状图同步隐藏。
2. **显示** —— 波状图默认区间。
3. **AI 辅助**（可选）
   - 接口地址：OpenAI 兼容地址，如 `https://api.deepseek.com` 或 `https://api.openai.com/v1`
   - API Key：**只保存在本机 localStorage**，直接从浏览器请求接口，不经过任何中间服务器
   - 模型 / 转写模型（默认 `gpt-4o-mini` / `whisper-1`）
   - 填了 Key：录音 → 上传转写 → AI 整理成日记
   - 没填 Key：用浏览器内置语音识别，识别结果直接写入日记
   - 非可信域名的接口地址，浏览器可能直接拒绝跨域请求（设置页会提示）
4. **数据** —— 导出今天 md / 全部 md / 区间汇总 md（含统计与表格）/ 备份 JSON / 导入备份（合并或覆盖）/ 清空记录。

## 六、文件与数据

导出 md 的文件名就是当天日期，可直接放进 Obsidian 库：

```markdown
---
date: 2026-09-27
weekday: 周日
tags: [ellipse, 状态记录]
modules: [mood, sleep, pain, exercise, diary]
---

# 2026年09月27日 周日

## 情绪

- 醒后：5 / 10
- 睡前：7 / 10

## 睡眠

- 睡眠质量：6 / 10
- 睡眠时长：7.5 小时

## 日记

上午在小区里慢走了二十分钟，膝盖比上周轻。
```

浏览器本地存储的键：

| 键 | 内容 |
| --- | --- |
| `ellipse.v1.records` | 全部记录，按 `YYYY-MM-DD` 分组 |
| `ellipse.v1.settings` | 模块开关 / 顺序 / 默认区间 / AI 配置 |

> 清理浏览器数据会一并清空，请定期在设置里备份 JSON。

---

## 七、目录结构

```
index.html                 页面骨架（主页 + 状态记录两层）
manifest.webmanifest       PWA 应用清单（装到主屏用）
sw.js                      Service Worker（联网优先，离线回退）
icon-192.png / icon-512.png  PWA 图标
assets/app.css             设计系统（沿用 demo.html 的配色、字体、右栏逻辑）
assets/js/app.js           主逻辑：页面切换、日期、栏渲染、设置页、底部面板
assets/js/modules.js       模块定义 + 「状态波动图」栏定义（新增模块只改这里）
assets/js/charts.js        波状图（SVG 折线 + 数据点）
assets/js/storage.js       本地存储、订阅、备份导入导出
assets/js/export.js        md 生成（单日 / 区间汇总 / 全部）
assets/js/voice.js         录音、语音识别通路
assets/js/ai.js            转写与文本整理接口
assets/js/icons.js         线性描边图标（24 viewBox，stroke 1.5）
assets/js/util.js          日期与通用工具
scripts/serve.mjs          本地预览服务器
scripts/seed.html          写入示例数据
scripts/smoke.mjs          逻辑冒烟测试（node scripts/smoke.mjs）
scripts/flowcheck.html     浏览器交互自检（打开 /scripts/flowcheck.html 看结果）
fonts/                     得意黑 Smiley Sans
docs/版本管理.md            给自己看的 Git / GitHub 操作小抄
docs/PWA部署与安装.md       部署到 HTTPS、装到手机主屏的步骤与常见问题
```

## 八、如何再加一个模块

在 `assets/js/modules.js` 里加一条定义即可，记录页、波状图、md 导出会自动接上：

```js
{
  id: 'weight', name: '体重', icon: 'chart',
  desc: '每天同一时间称重',
  template: function (m) { /* 返回该模块的表单 HTML */ },
  preview: function (m) { return m.kg ? m.kg + ' kg' : ''; },
  metrics: [{ key: 'kg', label: '体重', field: 'kg', min: 0, unit: 'kg' }],
  metricValue: function (metric, m) { return m[metric.key]; },
  summary: function (m) { return this.preview(m); }
}
```

表单里凡是带 `data-field` 的控件都会被自动保存，规则见 `app.js` 的 `handleStackInput`：

- `.scale-cell`：评分格，再点一次取消
- `.seg-item`：二选一
- `.chip`：快捷数值
- `.num-input`：数值
- `.text-input` / `.textarea`：文本

## 九、测试

```powershell
node scripts/smoke.mjs          # 逻辑：记录读写、波状图、md 导出、默认设置
```

浏览器交互自检：起好服务器后打开 <http://localhost:5173/scripts/flowcheck.html>，
它会在 iframe 里跑一遍真实操作（进记录页、展开栏、切区间、开关导出面板、设置里关栏），
把每条结果打在页面上，方便改动后回归。

---

## 十、后续可做

- 细化图标与版式（字体排列向 ABCD 工作室风格靠拢：更大字距、更克制的层级）
- 疼痛部位、情绪标签等可多选维度
- 周报 / 月报文字总结（复用 AI 通路）
- 数据导出为图表图片，或按模块分别导出

## 十一、隐私

记录**不出本机**：没有账号、没有服务器、没有埋点。数据只写进浏览器的 localStorage，
AI 功能（可选）由浏览器直接请求你自己填的接口地址，不经过任何中间服务器。

两点需要注意：

- **同一台设备的同一个浏览器**才看得到同一份数据。电脑上记的和手机上记的是两份，
  不会自动同步；换浏览器、开无痕窗口同样看不到。跨设备迁移只能靠「备份 JSON」手动导入。
- 清理浏览器数据（或卸载浏览器）会**一并清空**记录，请定期在设置里导出备份。

## 十二、开源协议

本项目代码以 [MIT 协议](LICENSE) 发布，可自由使用、修改、商用，保留署名即可。

`fonts/` 目录下的**得意黑 Smiley Sans** 不是本项目原创，按 SIL Open Font License 1.1
分发，版权归原作者所有，详见 [fonts/README.md](fonts/README.md)。
