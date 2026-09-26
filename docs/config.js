// Where the data proxy (Cloudflare Worker in ../worker) lives.
window.APP_CONFIG = {
  apiBase: /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? 'http://127.0.0.1:8787'
    : 'https://orthodox-calendar-api.orthodox-calendar-api.workers.dev',
};
