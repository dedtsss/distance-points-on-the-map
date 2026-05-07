export async function uploadCatbox(file, signal) {
  const formData = new FormData();
  formData.append('reqtype', 'fileupload');
  formData.append('fileToUpload', file, file.name);

  const response = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    body: formData,
    signal,
  });

  const text = await response.text();

  if (!response.ok || !text.startsWith('https://')) {
    throw new Error(text || 'Catbox вернул ошибку');
  }

  return text.trim();
}
