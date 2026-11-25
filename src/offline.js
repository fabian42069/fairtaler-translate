// Starts the service worker (public/sw.js) that keeps the big offline files
// (translation models and voices) on this device after their first use.
// In the Android app it also fetches those files the first time they're needed,
// because the app ships without them to stay small.
//
// On the very first start the page reloads once, so that everything the page
// loads from then on goes through the service worker.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(() => {
    if (navigator.serviceWorker.controller) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      try {
        if (sessionStorage.getItem('tr.swReload')) return;
        sessionStorage.setItem('tr.swReload', '1');
      } catch { return; }
      location.reload();
    }, { once: true });
  }).catch(() => { /* not supported here (e.g. the desktop app): files are local anyway */ });
}
