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
