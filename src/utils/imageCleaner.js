const randomHex = (bytes = 8) => {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
};

const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Не удалось загрузить изображение для очистки'));
  };
  image.src = url;
});

const canvasToBlob = (canvas) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) {
      resolve(blob);
    } else {
      reject(new Error('Canvas не смог создать очищенный файл'));
    }
  }, 'image/jpeg', 0.92);
});

const normalizeFilename = (filename) => {
  const value = String(filename || '').trim();
  if (!value) return `f_${randomHex(8)}.jpg`;

  const safe = value
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return `${safe || `f_${randomHex(8)}`}.jpg`;
};

export async function cleanImageForUpload(file, orientation = 1, preferredFilename = '') {
  const filename = normalizeFilename(preferredFilename);
  const warnings = [];

  try {
    const image = await loadImage(file);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas 2D недоступен');
    }

    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const normalizedOrientation = [1, 3, 6, 8].includes(orientation) ? orientation : 1;

    if (normalizedOrientation !== orientation) {
      warnings.push(`Ориентация ${orientation} не поддержана, использован обычный режим`);
    }

    if (normalizedOrientation === 6 || normalizedOrientation === 8) {
      canvas.width = height;
      canvas.height = width;
    } else {
      canvas.width = width;
      canvas.height = height;
    }

    if (normalizedOrientation === 3) {
      context.translate(canvas.width, canvas.height);
      context.rotate(Math.PI);
    } else if (normalizedOrientation === 6) {
      context.translate(canvas.width, 0);
      context.rotate(Math.PI / 2);
    } else if (normalizedOrientation === 8) {
      context.translate(0, canvas.height);
      context.rotate(-Math.PI / 2);
    }

    context.drawImage(image, 0, 0, width, height);
    const blob = await canvasToBlob(canvas);
    const cleanedFile = new File([blob], filename, { type: 'image/jpeg' });

    return {
      ok: true,
      file: cleanedFile,
      filename,
      warnings,
    };
  } catch (error) {
    return {
      ok: false,
      file: null,
      filename,
      warnings: [
        ...warnings,
        error instanceof Error ? error.message : 'Ошибка очистки изображения',
      ],
    };
  }
}
