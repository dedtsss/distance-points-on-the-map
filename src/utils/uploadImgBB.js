const fileToBase64Payload = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();

  reader.onload = () => {
    const result = String(reader.result || '');
    resolve(result.includes(',') ? result.split(',')[1] : result);
  };
  reader.onerror = () => reject(new Error('Не удалось прочитать файл для ImgBB'));
  reader.readAsDataURL(file);
});

export async function uploadImgBB(file, apiKey, signal) {
  const image = await fileToBase64Payload(file);
  const formData = new FormData();
  formData.append('key', apiKey);
  formData.append('image', image);
  formData.append('name', file.name.replace(/\.jpg$/i, ''));

  const response = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: formData,
    signal,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.success || !data?.data?.url) {
    throw new Error(data?.error?.message || 'ImgBB вернул ошибку');
  }

  return data.data.url;
}
