const CACHE = 'ellipse-cache-v5';

const NAV_TIMEOUT = 20000;
const ASSET_TIMEOUT = 9000;
const FAST_FALLBACK = 3500;

const NAV_FALLBACK = ['./index.html', './'];

const SHELL = [
    './index.html',
    './manifest.webmanifest',
    './assets/app.css',
    './assets/js/ai.js',
    './assets/js/app.js',
    './assets/js/charts.js',
    './assets/js/export.js',
    './assets/js/icons.js',
    './assets/js/storage.js',
    './assets/js/util.js',
    './assets/js/core/api.js',
    './assets/js/core/fields.js',
    './assets/js/core/loader.js',
    './assets/js/core/registry.js',
    './assets/js/core/sheet.js',
    './assets/js/core/validate.js',
    './assets/js/modules/index.js',
    './assets/js/modules/mood.js',
    './assets/js/modules/sleep.js',
    './assets/js/modules/pain.js',
    './assets/js/modules/exercise.js',
    './assets/js/modules/micro.js',
    './assets/js/modules/diary.js',
    './assets/js/modules/trend.js',
    './assets/js/modules/assistant.js',
    './fonts/SmileySans-Oblique.ttf.woff2'
];

self.addEventListener('install', function (e) {
    e.waitUntil(
        caches.open(CACHE).then(function (c) {
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
