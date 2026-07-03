export async function uploadPhotoBundleViaProxy(entries, proxyUrl, signal) {
  if (!proxyUrl?.trim()) throw new Error('URL Worker-прокси не настроен');
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('Нет очищенных файлов для загрузки');

  const formData = new FormData();
  formData.append('target', 'bundle');
  for (const entry of entries) {
    formData.append('photoId', entry.photoId);
    formData.append('files', entry.file, entry.file.name);
  }

  let response;
  try {
    response = await fetch(proxyUrl.trim(), { method: 'POST', body: formData, signal });
  } catch (error) {
    throw new Error(`Не удалось отправить фотографии в Worker: ${error instanceof Error ? error.message : 'сетевой сбой'}`);
  }

  const responseText = await response.text();
  let data = null;
  try { data = JSON.parse(responseText); } catch { /* validated below */ }

  if (!response.ok || data?.target !== 'bundle' || !Array.isArray(data?.items)) {
    throw new Error(data?.error || responseText.slice(0, 500) || `Worker вернул HTTP ${response.status}`);
  }
  return data;
}
