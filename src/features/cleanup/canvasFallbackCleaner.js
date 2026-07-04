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
  }, 'image/jpeg', 0.92);
});

export async function cleanImageWithCanvas(file, orientation, filename) {
  const image = await loadImage(file);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D недоступен');

  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const normalizedOrientation = [1, 3, 6, 8].includes(orientation) ? orientation : 1;
  const swapsSides = normalizedOrientation === 6 || normalizedOrientation === 8;
  canvas.width = swapsSides ? height : width;
  canvas.height = swapsSides ? width : height;

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
  return new File([blob], filename, { type: 'image/jpeg', lastModified: Date.now() });
}
