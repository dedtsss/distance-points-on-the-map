export const DEFAULT_NINJABOX_RELAY_URL = 'https://darkfoto-ninjabox-relay.dvabobra2014.workers.dev/v1/ninjabox';

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
  if (!cleanedFile || cleanedFile.type !== 'image/jpeg') throw new Error('Нужна очищенная JPEG-копия');
  const form = new FormData();
  form.append('file', cleanedFile, cleanedFile.name);
  const response = await (options.fetch || fetch)(ninjaboxRelayUrl(relay), {
    method: 'POST', body: form, cache: 'no-store', redirect: 'error',
  });
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.clone().json())?.error || ''; } catch { /* ignore non-JSON relay errors */ }
    throw new Error(`NinjaBox relay: ${detail || `HTTP ${response.status}`} (HTTP ${response.status})`);
  }
  const result = await response.json();
  const link = result?.url;
  if (!result?.ok || !/^https:\/\/ninjabox\.org\/i\/[a-zA-Z0-9/_-]+$/.test(link || '')) {
    throw new Error('NinjaBox relay вернул неверную ссылку');
  }
  return link;
}
