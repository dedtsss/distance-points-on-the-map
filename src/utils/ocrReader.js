import { recognize } from 'tesseract.js';

const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Не удалось загрузить изображение для OCR'));
  };
  image.src = url;
});

const cropBottomRightBlock = async (file) => {
  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;

  const cropWidth = Math.min(sourceWidth, Math.round(sourceWidth * 0.55));
  const cropHeight = Math.min(sourceHeight, Math.round(sourceHeight * 0.32));
  const cropX = Math.max(0, sourceWidth - cropWidth);
  const cropY = Math.max(0, sourceHeight - cropHeight);

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = cropWidth * scale;
  canvas.height = cropHeight * scale;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas 2D недоступен для OCR');
  }

  context.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
    const value = gray > 110 ? 255 : 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }

  context.putImageData(imageData, 0, 0);

  return canvas;
};

const normalizeOcrText = (text) => String(text || '')
  .replace(/[°º]/g, '')
  .replace(/[|]/g, '1')
  .replace(/[Оо]/g, '0')
  .replace(/[Зз]/g, '3')
  .replace(/[Бб]/g, '6')
  .replace(/[,;]/g, '.')
  .replace(/\s+/g, ' ')
  .trim();

const parseCoordinates = (text) => {
  const normalized = normalizeOcrText(text);
  const patterns = [
    /(-?\d{1,2}\.\d{4,8})\s*([NS])?\s+(-?\d{1,3}\.\d{4,8})\s*([EW])?/i,
    /([NS])\s*(-?\d{1,2}\.\d{4,8})\s+([EW])\s*(-?\d{1,3}\.\d{4,8})/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;

    let latitude;
    let longitude;
    let latRef = '';
    let lonRef = '';

    if (pattern === patterns[0]) {
      latitude = Number(match[1]);
      latRef = String(match[2] || '').toUpperCase();
      longitude = Number(match[3]);
      lonRef = String(match[4] || '').toUpperCase();
    } else {
      latRef = String(match[1] || '').toUpperCase();
      latitude = Number(match[2]);
      lonRef = String(match[3] || '').toUpperCase();
      longitude = Number(match[4]);
    }

    if (latRef === 'S') latitude *= -1;
    if (lonRef === 'W') longitude *= -1;

    if (Number.isFinite(latitude) && Number.isFinite(longitude)
      && latitude >= -90 && latitude <= 90
      && longitude >= -180 && longitude <= 180) {
      return { latitude, longitude };
    }
  }

  return null;
};

const parseIndex = (text) => {
  const normalized = normalizeOcrText(text);
  const match = normalized.match(/(?:index|индекс|idx|id|№|#)\s*[:=\-]?\s*(\d{1,5})/i)
    || normalized.match(/(?:^|\s)(\d{1,5})(?=\s+(?:-?\d{1,2}\.\d{4,8}|[NS]))/i);

  return match ? Number(match[1]) : null;
};

export async function readCoordinatesFromImageText(file) {
  try {
    const canvas = await cropBottomRightBlock(file);
    const result = await recognize(canvas, 'eng', {
      logger: () => {},
    });

    const rawText = result?.data?.text || '';
    const coordinates = parseCoordinates(rawText);
    const index = parseIndex(rawText);

    if (!coordinates) {
      return {
        ok: false,
        index,
        coordinates: null,
        rawText,
        statusText: 'OCR: координаты не распознаны',
      };
    }

    return {
      ok: true,
      index,
      coordinates,
      rawText,
      statusText: 'OCR: координаты найдены',
    };
  } catch (error) {
    return {
      ok: false,
      index: null,
      coordinates: null,
      rawText: '',
      statusText: error instanceof Error ? `OCR: ${error.message}` : 'OCR: ошибка распознавания',
    };
  }
}
