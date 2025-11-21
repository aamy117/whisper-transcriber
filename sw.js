/**
 * Service Worker - PWA 支援
 * 提供離線功能、快取管理和背景同步
 */

const CACHE_NAME = 'whisper-transcriber-v1.2.4';
const STATIC_CACHE_NAME = `${CACHE_NAME}-static`;
const DYNAMIC_CACHE_NAME = `${CACHE_NAME}-dynamic`;

// 需要快取的核心檔案（GitHub Pages 路徑）
const CORE_FILES = [
  '/whisper-transcriber/',
  '/whisper-transcriber/index.html',
  '/whisper-transcriber/css/style.css',
  '/whisper-transcriber/css/shared.css',
  '/whisper-transcriber/css/splash.css',
  '/whisper-transcriber/css/onboarding.css',
  '/whisper-transcriber/css/progress.css',
  '/whisper-transcriber/css/preprocessing.css',
  '/whisper-transcriber/js/main.js',
  '/whisper-transcriber/js/app-optimized.js',
  '/whisper-transcriber/js/core-loader.js',
  '/whisper-transcriber/js/onboarding.js',
  '/whisper-transcriber/js/notification.js',
  '/whisper-transcriber/js/dialog.js',
  '/whisper-transcriber/js/utils/debounce.js',
  '/whisper-transcriber/manifest.json'
];

// 需要網路優先的檔案（API 相關）
const NETWORK_FIRST_PATTERNS = [
  /\/api\//,
  /api\.openai\.com/,
  /cdn\.jsdelivr\.net/
];

// 快取優先的檔案（靜態資源）
const CACHE_FIRST_PATTERNS = [
  /\.(?:js|css|html|png|jpg|jpeg|svg|ico|woff2?|ttf)$/,
  /\/assets\//,
  /\/docs\//
];

/**
 * Service Worker 安裝事件
 */
self.addEventListener('install', event => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching core files...');
        return cache.addAll(CORE_FILES);
      })
      .then(() => {
        console.log('[SW] Core files cached successfully');
        // 強制啟用新版本
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] Failed to cache core files:', error);
      })
  );
});

/**
 * Service Worker 啟用事件
 */
self.addEventListener('activate', event => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    Promise.all([
      // 清理舊快取
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE_NAME && cacheName !== DYNAMIC_CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // 立即控制所有頁面
      self.clients.claim()
    ])
  );
});

/**
 * 請求攔截和快取策略
 */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // 跳過非 GET 請求
  if (request.method !== 'GET') {
    return;
  }
  
  // 跳過 chrome-extension 等協議
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  event.respondWith(
    handleRequest(request)
  );
});

/**
 * 處理請求的核心邏輯
 */
async function handleRequest(request) {
  const url = new URL(request.url);
  
  try {
    // 1. 網路優先策略（API 請求）
    if (NETWORK_FIRST_PATTERNS.some(pattern => pattern.test(request.url))) {
      return await networkFirst(request);
    }
    
    // 2. 快取優先策略（靜態資源）
    if (CACHE_FIRST_PATTERNS.some(pattern => pattern.test(request.url))) {
      return await cacheFirst(request);
    }
    
    // 3. 導航請求（HTML 頁面）
    if (request.mode === 'navigate') {
      return await handleNavigationRequest(request);
    }
    
    // 4. 預設策略：先快取後網路
    return await cacheFirst(request);
    
  } catch (error) {
    console.error('[SW] Request handling failed:', error);
    return await handleOfflineFallback(request);
  }
}

/**
 * 網路優先策略
 */
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    // 成功則更新快取
    if (networkResponse.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // 網路失敗，嘗試從快取獲取
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

/**
 * 快取優先策略
 */
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    // 背景更新快取
    updateCacheInBackground(request);
    return cachedResponse;
  }
  
  // 快取中沒有，從網路獲取
  const networkResponse = await fetch(request);
  
  if (networkResponse.status === 200) {
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    cache.put(request, networkResponse.clone());
  }
  
  return networkResponse;
}

/**
 * 處理導航請求
 */
async function handleNavigationRequest(request) {
  try {
    // 優先嘗試網路
    const networkResponse = await fetch(request);
    return networkResponse;
  } catch (error) {
    // 網路失敗，返回快取的首頁
    const cachedResponse = await caches.match('/whisper-transcriber/index.html');
    if (cachedResponse) {
      return cachedResponse;
    }

    // 沒有快取，返回離線頁面
    return new Response(createOfflinePage(), {
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

/**
 * 背景更新快取
 */
async function updateCacheInBackground(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.status === 200) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      await cache.put(request, networkResponse);
    }
  } catch (error) {
    // 背景更新失敗不影響主流程
    console.log('[SW] Background cache update failed:', error);
  }
}

/**
 * 離線降級處理
 */
async function handleOfflineFallback(request) {
  const url = new URL(request.url);

  // 嘗試從快取獲取
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  // 根據請求類型返回不同的離線內容
  if (request.destination === 'document') {
    const offlinePage = await caches.match('/whisper-transcriber/index.html');
    return offlinePage || new Response(createOfflinePage(), {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  if (request.destination === 'image') {
    return new Response(createOfflineImageSVG(), {
      headers: { 'Content-Type': 'image/svg+xml' }
    });
  }

  // 對於 JS/CSS 檔案，嘗試從網路載入（不返回 503）
  if (request.destination === 'script' || request.destination === 'style') {
    try {
      const networkResponse = await fetch(request);
      // 成功則快取
      if (networkResponse.ok) {
        const cache = await caches.open(DYNAMIC_CACHE_NAME);
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    } catch (error) {
      // 網路完全失敗才返回 503
      return new Response(`/* Offline: ${url.pathname} */`, {
        status: 503,
        statusText: 'Service Unavailable'
      });
    }
  }

  // 其他資源返回 503
  return new Response('Service Unavailable', {
    status: 503,
    statusText: 'Service Unavailable'
  });
}

/**
 * 創建離線頁面 HTML
 */
function createOfflinePage() {
  return `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>離線模式 - Whisper 聽打工具</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .offline-container {
            text-align: center;
            padding: 40px;
            max-width: 400px;
        }
        .offline-icon {
            font-size: 64px;
            margin-bottom: 20px;
        }
        .offline-title {
            font-size: 28px;
            margin-bottom: 16px;
            font-weight: 600;
        }
        .offline-message {
            font-size: 16px;
            margin-bottom: 30px;
            opacity: 0.9;
            line-height: 1.5;
        }
        .offline-button {
            background: rgba(255, 255, 255, 0.2);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.3);
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
            transition: all 0.3s;
        }
        .offline-button:hover {
            background: rgba(255, 255, 255, 0.3);
        }
    </style>
</head>
<body>
    <div class="offline-container">
        <div class="offline-icon">📡</div>
        <h1 class="offline-title">離線模式</h1>
        <p class="offline-message">
            您目前處於離線狀態。<br>
            已快取的功能仍可正常使用。
        </p>
        <button class="offline-button" onclick="location.reload()">
            重新連線
        </button>
    </div>
</body>
</html>
  `;
}

/**
 * 創建離線圖片 SVG
 */
function createOfflineImageSVG() {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#f0f0f0"/>
  <text x="100" y="100" text-anchor="middle" dominant-baseline="middle" font-size="16" fill="#666">
    圖片離線不可用
  </text>
</svg>
  `;
}

/**
 * 訊息處理
 */
self.addEventListener('message', event => {
  const { type, payload } = event.data;
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_VERSION':
      event.ports[0].postMessage({ version: CACHE_NAME });
      break;
      
    case 'CLEAR_CACHE':
      clearAllCaches().then(() => {
        event.ports[0].postMessage({ success: true });
      });
      break;
      
    case 'CACHE_URLS':
      if (payload && payload.urls) {
        cacheUrls(payload.urls).then(() => {
          event.ports[0].postMessage({ success: true });
        });
      }
      break;
  }
});

/**
 * 清理所有快取
 */
async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map(name => caches.delete(name)));
  console.log('[SW] All caches cleared');
}

/**
 * 快取指定 URL
 */
async function cacheUrls(urls) {
  const cache = await caches.open(DYNAMIC_CACHE_NAME);
  await cache.addAll(urls);
  console.log('[SW] URLs cached:', urls);
}

/**
 * 推送通知處理
 */
self.addEventListener('push', event => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || '您有新的通知',
    icon: '/assets/icons/icon-192x192.png',
    badge: '/assets/icons/icon-72x72.png',
    tag: data.tag || 'whisper-notification',
    renotify: true,
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || []
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Whisper 聽打工具', options)
  );
});

/**
 * 通知點擊處理
 */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow('/')
  );
});

console.log('[SW] Service Worker script loaded');