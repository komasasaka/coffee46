// オフライン用のごく小さなサービスワーカー。
// 初回アクセス時に本体と画像を保存し、以降はネットワークを試してから保存分にフォールバックする。
// サーバに届かない時は失敗せず応答待ちになることがあるので、一定時間で見切る。
const CACHE = 'coffee46-v3';
const ASSETS = ['index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromCache(req) {
  // ?付きで開かれても当たるように検索部分は無視。ページ遷移なら最後は本体を返す
  return caches.match(req, { ignoreSearch: true })
    .then(res => res || (req.mode === 'navigate' ? caches.match('index.html') : undefined))
    .then(res => res || Response.error());
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const network = fetch(e.request).then(res => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return res;
  });
  const timeout = new Promise((_, reject) => setTimeout(reject, NETWORK_TIMEOUT_MS));
  e.respondWith(
    Promise.race([network, timeout]).catch(() => fromCache(e.request).then(res =>
      // 保存分が無ければ、遅れてでもネットワークの結果を待つ
      res.type === 'error' ? network.catch(() => res) : res
    ))
  );
});
