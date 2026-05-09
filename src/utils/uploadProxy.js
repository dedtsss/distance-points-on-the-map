export async function uploadViaProxy(file, target, proxyUrl, signal) {
  if (!proxyUrl || !proxyUrl.trim()) {
    throw new Error('Укажите URL прокси-загрузчика');
  }

  const normalizedProxyUrl = proxyUrl.trim();
  const formData = new FormData();
  formData.append('target', target);
  formData.append('file', file, file.name);

  const response = await fetch(normalizedProxyUrl, {
    method: 'POST',
    body: formData,
    signal,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok || !data?.url) {
    throw new Error(data?.error || `Прокси вернул ошибку: ${response.status}`);
  }

  return data.url;
}
