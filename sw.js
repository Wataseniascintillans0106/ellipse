/* ellipse · 日常状态记录 —— sw.js（Service Worker · 联网优先，离线回退）
   与 index.html 放在同一目录，经 HTTPS（或 localhost）访问时页面会自动注册本文件。
   只接管本站的 GET 请求；发往 AI 接口（api.deepseek.com 等）的请求原样放行、绝不缓存。

   ⚠️ 改完本文件的内容，记得把下面的 CACHE 版本号 +1，否则旧缓存不会被清掉。
      详见 docs/PWA部署与安装.md。 */

const CACHE = 'ellipse-cache-v1';

const NAV_TIMEOUT = 20000;   /* 页面：最多等 20 秒 */
const ASSET_TIMEOUT = 9000;  /* 其它资源：最多等 9 秒 */
const FAST_FALLBACK = 3500;  /* 本机有副本时，超过 3.5 秒就先用副本起页 */

/* 导航找不到副本时按顺序兜底：
   部署在 GitHub Pages 的子路径下时，/ellipse/ 与 /ellipse/index.html 是两个 URL。 */
const NAV_FALLBACK = ['./index.html', './'];

/* 预缓存清单：装好 Service Worker 就整份存进本机，第一次打开之后断网也能直接用。
   不预缓存的话，首次那轮页面加载发生在 SW 接管之前，资源根本进不了缓存，
   要等第二次打开才有离线副本 —— 冷启动断网就只剩一页「暂时打不开」。
   这些文件本来首次打开就要下载，预缓存不多花流量，只是让它必定落在缓存里。

   ⚠️ 新增文件要加进这份清单 —— node scripts/smoke.mjs 会检查有没有漏掉 assets/ 下的文件。 */
const SHELL = [
    './index.html',
    './manifest.webmanifest',
    './assets/app.css',
    './assets/js/ai.js',
    './assets/js/app.js',
    './assets/js/charts.js',
    './assets/js/export.js',
    './assets/js/icons.js',
    './assets/js/modules.js',
    './assets/js/storage.js',
    './assets/js/util.js',
    './assets/js/voice.js',
    './fonts/SmileySans-Oblique.ttf.woff2'
];

self.addEventListener('install', function (e) {
    e.waitUntil(
        caches.open(CACHE).then(function (c) {
            /* 逐个加而不是 addAll：某个文件取不到也不该让整个安装失败 */
            return Promise.all(SHELL.map(function (url) {
                return c.add(url).catch(function () {});
            }));
        }).then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function (e) {
    e.waitUntil(
        caches.keys()
            .then(function (keys) {
                return Promise.all(keys
                    .filter(function (k) { return k !== CACHE; })
                    .map(function (k) { return caches.delete(k); }));
            })
            .then(function () { return self.clients.claim(); })
    );
});

function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
        const timer = setTimeout(function () { reject(new Error('timeout')); }, ms);
        promise.then(
            function (value) { clearTimeout(timer); resolve(value); },
            function (err) { clearTimeout(timer); reject(err); }
        );
    });
}

/* 断网且本机没有副本时，给一页可读的提示，而不是浏览器的报错页 */
function offlinePage() {
    return new Response(
        '<!DOCTYPE html><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
        '<title>ellipse</title>' +
        '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
        'font-family:-apple-system,BlinkMacSystemFont,\'PingFang SC\',\'Hiragino Sans GB\',\'Microsoft YaHei\',sans-serif;' +
        'background:#FBFAED;color:#2B2B28">' +
        '<div style="text-align:center;padding:24px">' +
        '<div style="font-size:1.05rem;margin-bottom:10px">暂时打不开</div>' +
        '<div style="font-size:0.84rem;color:#6E6A62;line-height:1.7">' +
        '本机还没有离线副本，网络也没回应。<br>检查网络后点下面重试。</div>' +
        '<button onclick="location.reload()" style="margin-top:18px;height:40px;padding:0 22px;' +
        'border-radius:999px;border:1px solid rgba(223,144,104,.6);background:#fff;color:#de7b49;' +
        'font-size:0.9rem;font-family:inherit">重试</button>' +
        '</div></body>',
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
}

/* 导航请求找本机副本：先按请求原样匹配，再按应用外壳兜底 */
function matchShell(request) {
    return caches.match(request, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        return NAV_FALLBACK.reduce(function (chain, url) {
            return chain.then(function (found) {
                return found || caches.match(url, { ignoreSearch: true });
            });
        }, Promise.resolve(null));
    });
}

self.addEventListener('fetch', function (e) {
    if (e.request.method !== 'GET') return;

    /* 只接管本站请求；AI 接口等跨域请求原样放行，绝不缓存 */
    const url = new URL(e.request.url);
    if (url.origin !== self.location.origin) return;

    const isNav = e.request.mode === 'navigate' || e.request.destination === 'document';

    const net = fetch(e.request).then(function (res) {
        if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE)
                .then(function (c) { c.put(e.request, copy); })
                .catch(function () {});
        }
        return res;
    });

    if (isNav) {
        /* 快速回退之后让网络请求继续跑完，把新版补写进缓存 */
        e.waitUntil(net.then(function () {}, function () {}));
        e.respondWith(matchShell(e.request).then(function (cached) {
            if (!cached) {
                return withTimeout(net, NAV_TIMEOUT).catch(function () { return offlinePage(); });
            }
            const fast = new Promise(function (resolve) {
                setTimeout(function () { resolve(cached); }, FAST_FALLBACK);
            });
            return Promise.race([
                withTimeout(net, NAV_TIMEOUT).catch(function () { return cached; }),
                fast
            ]);
        }));
        return;
    }

    e.respondWith(
        withTimeout(net, ASSET_TIMEOUT).catch(function () {
            return caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
                if (hit) return hit;
                throw new Error('offline');
            });
        })
    );
});
