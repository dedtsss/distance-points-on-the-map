export async function uploadViaProxy(file, target, proxyUrl, signal) {
  if (!proxyUrl || !proxyUrl.trim()) {
    throw new Error('Укажите URL прокси-загрузчика');
  }

  const normalizedProxyUrl = proxyUrl.trim();
  const formData = new FormData();
  formData.append('target', target);
  formData.append('file', file, file.name);

  let response;
  try {
    response = await fetch(normalizedProxyUrl, {
      method: 'POST',
      body: formData,
      signal,
    });
  } catch (error) {
    throw new Error(`Не удалось отправить файл в Worker-прокси: ${error instanceof Error ? error.message : 'сетевой сбой'}`);
  }

  const responseText = await response.text();
  let data = null;

  try {
    data = JSON.parse(responseText);
  } catch {
    data = null;
  }

  if (!response.ok || !data?.ok || !data?.url) {
    const attempts = Array.isArray(data?.attempts)
      ? data.attempts.map((attempt, index) => {
        const status = attempt.status ?? 'нет статуса';
        const preview = attempt.responsePreview ? String(attempt.responsePreview).slice(0, 220) : 'без ответа';
        return `${index + 1}) ${attempt.name || 'попытка'}: ${status} ${attempt.statusText || ''}; ${preview}`;
      }).join(' | ')
      : '';

    const baseError = data?.error || responseText || `Прокси вернул ошибку: ${response.status}`;
    throw new Error(attempts ? `${baseError}. Детали: ${attempts}` : baseError);
  }

  return data.url;
}
