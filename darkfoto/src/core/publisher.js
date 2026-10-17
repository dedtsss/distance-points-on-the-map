import { validatePointFiles, validPhotoUrl, validGalleryUrl } from './ninjaboxContract.js';

export const DEFAULT_NINJABOX_RELAY_URL = 'https://darkfoto-ninjabox-relay.dvabobra2014.workers.dev/v1/ninjabox';
export const NINJABOX_TIMEOUT_MS = 90_000;

export async function withTimeout(operation, milliseconds, label, onTimeout = () => {}) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new Error(`${label}: тайм-аут ${Math.ceil(milliseconds / 1000)} с`));
    }, milliseconds);
  });
  try { return await Promise.race([Promise.resolve().then(operation), timeout]); }
  finally { clearTimeout(timer); }
}

export function onionBaseUrl(value) {
  const parsed = new URL(String(value || '').trim());
  if (!['http:', 'https:'].includes(parsed.protocol)
    || !/^[a-z2-7]{56}\.onion$/i.test(parsed.hostname)
    || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash
    || parsed.pathname !== '/') {
    throw new Error('Укажите адрес Onion Service вида http://<56 символов>.onion/');
  }
  return parsed.origin;
}

export async function publishCleanImage(cleanedFile, destination, options = {}) {
  const base = onionBaseUrl(destination);
  if (!cleanedFile || cleanedFile.type !== 'image/jpeg') throw new Error('Нужна очищенная JPEG-копия');
  const response = await (options.fetch || fetch)(`${base}/v1/shares`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg' },
    body: cleanedFile,
    cache: 'no-store',
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Onion publisher: HTTP ${response.status}`);
  const body = await response.json();
  if (!/^\/v1\/shares\/[a-f0-9]{48}$/.test(body.viewPath || '')) {
    throw new Error('Onion publisher вернул неверный путь');
  }
  return `${base}${body.viewPath}`;
}

export function ninjaboxRelayUrl(value) {
  const url = new URL(String(value || '').trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search
    || url.pathname !== '/v1/ninjabox' || !url.hostname) {
    throw new Error('Укажите HTTPS адрес NinjaBox relay с путём /v1/ninjabox');
  }
  return url.toString();
}

export async function publishCleanImageToNinjabox(cleanedFile, relay, options = {}) {
  const files = Array.isArray(cleanedFile) ? cleanedFile : [cleanedFile];
  if (!validatePointFiles(files)) throw new Error('Нужны очищенные JPEG-копии: до 25 МБ на фото, 100 МБ на точку');
  const url = ninjaboxRelayUrl(relay);
  const form = new FormData();
  for (const file of files) form.append('file', file, file.name);
  if (options.onProgress && typeof XMLHttpRequest !== 'undefined' && !options.fetch) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('POST', url);
      request.timeout = options.timeoutMs || NINJABOX_TIMEOUT_MS;
      request.withCredentials = false;
      request.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) options.onProgress(event.loaded, event.total);
      };
      request.onerror = () => reject(new Error('NinjaBox relay: ошибка сети'));
      request.ontimeout = () => reject(new Error(`NinjaBox: тайм-аут ${Math.ceil(request.timeout / 1000)} с`));
      request.onload = () => {
        if (request.responseURL !== url) { reject(new Error('NinjaBox relay: неожиданный адрес ответа')); return; }
        let body;
        try { body = JSON.parse(request.responseText); } catch { body = null; }
        if (request.status < 200 || request.status >= 300) {
          reject(new Error(`NinjaBox relay: ${body?.error || `HTTP ${request.status}`} (HTTP ${request.status})`));
          return;
        }
        try { resolve(validNinjaboxLink(body, files.length)); } catch (error) { reject(error); }
      };
      request.send(form);
    });
  }
  const controller = new AbortController();
  return withTimeout(async () => {
    const response = await (options.fetch || fetch)(url, {
      method: 'POST', body: form, cache: 'no-store', redirect: 'error', signal: controller.signal,
    });
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.clone().json())?.error || ''; } catch { /* ignore non-JSON relay errors */ }
      throw new Error(`NinjaBox relay: ${detail || `HTTP ${response.status}`} (HTTP ${response.status})`);
    }
    return validNinjaboxLink(await response.json(), files.length);
  }, options.timeoutMs || NINJABOX_TIMEOUT_MS, 'NinjaBox', () => controller.abort());
}

function validNinjaboxLink(result, count) {
  const link = count === 1 ? result?.url : result?.galleryUrl;
  if (!result?.ok || (count === 1 ? !validPhotoUrl(link)
    : !validGalleryUrl(link) || result.itemCount !== count)) {
    throw new Error('NinjaBox relay вернул неверную ссылку');
  }
  return link;
}
