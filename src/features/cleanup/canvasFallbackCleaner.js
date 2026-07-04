export const DEFAULT_CANVAS_MAX_SIDE = 2800;

const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Не удалось прочитать изображение для очистки'));
  };
  image.src = url;
});

const canvasToBlob = (canvas) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) resolve(blob);
    else reject(new Error('Не удалось создать очищенную копию'));
  }, 'image/jpeg', 0.9);
});

export function calculateMemorySafeSize(width, height, maxSide = DEFAULT_CANVAS_MAX_SIDE) {
  const safeWidth = Number(width);
  const safeHeight = Number(height);
  const safeMaxSide = Math.max(320, Number(maxSide) || DEFAULT_CANVAS_MAX_SIDE);
  if (!Number.isFinite(safeWidth) || !Number.isFinite(safeHeight) || safeWidth <= 0 || safeHeight <= 0) {
    throw new Error('Изображение имеет некорректный размер');
  }

  const scale = Math.min(1, safeMaxSide / Math.max(safeWidth, safeHeight));
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
    scale,
    maxSide: safeMaxSide,
    resized: scale < 1,
  };
}

export async function cleanImageWithCanvas(file, orientation, filename, options = {}) {
  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const target = calculateMemorySafeSize(sourceWidth, sourceHeight, options.maxSide);
  const normalizedOrientation = [1, 3, 6, 8].includes(orientation) ? orientation : 1;
  const swapsSides = normalizedOrientation === 6 || normalizedOrientation === 8;
  const canvas = document.createElement('canvas');
  canvas.width = swapsSides ? target.height : target.width;
  canvas.height = swapsSides ? target.width : target.height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D недоступен');

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

  context.drawImage(image, 0, 0, target.width, target.height);
  const blob = await canvasToBlob(canvas);
  return {
    file: new File([blob], filename, { type: 'image/jpeg', lastModified: Date.now() }),
    debug: {
      sourceDimensions: { width: sourceWidth, height: sourceHeight },
      outputDimensions: { width: canvas.width, height: canvas.height },
      resize: target,
      orientation: normalizedOrientation,
    },
  };
}
