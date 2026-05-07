import { useMemo, useState } from 'react';
import HostingSelector from './components/HostingSelector';
import LinksBlock from './components/LinksBlock';
import PhotoCard from './components/PhotoCard';
import ViolationsBlock from './components/ViolationsBlock';
import { readPhotoExif } from './utils/exifReader';
import { buildRemovalRecommendation, findViolations } from './utils/haversine';
import { HOSTING_LABELS, uploadPhotosSequentially } from './utils/uploadManager';

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const makePhotoId = () => `${Date.now()}-${crypto.randomUUID()}`;

function App() {
  const [photos, setPhotos] = useState([]);
  const [threshold, setThreshold] = useState(25);
  const [highlightProblems, setHighlightProblems] = useState(false);
  const [hosting, setHosting] = useState('catbox');
  const [imgbbApiKey, setImgbbApiKey] = useState('');
  const [globalMessage, setGlobalMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const thresholdNumber = Number.isFinite(Number(threshold)) && Number(threshold) > 0 ? Number(threshold) : 25;
  const violations = useMemo(() => findViolations(photos, thresholdNumber), [photos, thresholdNumber]);
  const recommendation = useMemo(() => buildRemovalRecommendation(violations, photos), [violations, photos]);
  const problemPhotoIds = useMemo(() => new Set(violations.flatMap((violation) => [violation.photoAId, violation.photoBId])), [violations]);
  const hasGpsPhotos = photos.some((photo) => photo.gpsStatus === 'found');
  const isReadingExif = photos.some((photo) => photo.gpsStatus === 'pending');

  const updatePhoto = (id, patch) => {
    setPhotos((currentPhotos) => currentPhotos.map((photo) => (
      photo.id === id ? { ...photo, ...patch } : photo
    )));
  };

  const resetUploadsForHostingChange = (nextHosting) => {
    setHosting(nextHosting);
    setGlobalMessage('Хостинг изменён. Ссылки очищены, фотографии нужно загрузить заново.');
    setPhotos((currentPhotos) => currentPhotos.map((photo) => ({
      ...photo,
      uploadedUrl: '',
      uploadStatus: 'не загружено',
      uploadError: '',
      hostingUsed: '',
    })));
  };

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files || []).filter((file) => ACCEPTED_TYPES.includes(file.type));
    setGlobalMessage('');
    setHighlightProblems(false);

    photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));

    if (files.length === 0) {
      setPhotos([]);
      setGlobalMessage('Выберите JPG/JPEG фотографии. PNG/WebP поддерживаются, если браузер может прочитать изображение.');
      return;
    }

    const nextPhotos = files.map((file, index) => ({
      id: makePhotoId(),
      number: index + 1,
      file,
      originalName: file.name,
      previewUrl: URL.createObjectURL(file),
      gpsStatus: 'pending',
      gpsStatusText: 'Чтение EXIF...',
      coordinates: null,
      orientation: 1,
      exifError: null,
      cleanStatus: 'ожидает загрузки',
      cleanWarnings: [],
      uploadFilename: '',
      uploadStatus: 'не загружено',
      uploadError: '',
      uploadedUrl: '',
      hostingUsed: '',
      expanded: false,
    }));

    setPhotos(nextPhotos);

    const withExif = await Promise.all(nextPhotos.map(async (photo) => {
      const exif = await readPhotoExif(photo.file);
      return { ...photo, ...exif };
    }));

    setPhotos(withExif);

    if (!withExif.some((photo) => photo.gpsStatus === 'found')) {
      setGlobalMessage('GPS не найден ни в одной фотографии. Такие фото не участвуют в расчётах расстояний.');
    }
  };

  const handleUpload = async () => {
    if (photos.length === 0) {
      setGlobalMessage('Сначала выберите фотографии.');
      return;
    }

    if (isReadingExif) {
      setGlobalMessage('Дождитесь завершения чтения EXIF/GPS перед загрузкой.');
      return;
    }

    if (hosting === 'imgbb' && !imgbbApiKey.trim()) {
      setGlobalMessage('Укажите API ключ ImgBB');
      return;
    }

    setIsUploading(true);
    setGlobalMessage('Загрузка началась. Файлы отправляются последовательно на выбранный хостинг.');
    setPhotos((currentPhotos) => currentPhotos.map((photo) => ({
      ...photo,
      uploadedUrl: '',
      uploadStatus: 'в очереди',
      uploadError: '',
      hostingUsed: HOSTING_LABELS[hosting],
    })));

    try {
      const uploadedCount = await uploadPhotosSequentially({
        photos,
        hosting,
        imgbbApiKey,
        timeoutMs: 12000,
        onPhotoUpdate: updatePhoto,
      });
      setGlobalMessage(`Загрузка завершена. Успешно загружено: ${uploadedCount} из ${photos.length}.`);
    } catch (error) {
      setGlobalMessage(
        error instanceof Error
          ? `${error.message} Выберите другой хостинг или повторите попытку.`
          : 'Ошибка загрузки. Выберите другой хостинг или повторите попытку.',
      );
    } finally {
      setIsUploading(false);
    }
  };

  const toggleDetails = (id) => {
    setPhotos((currentPhotos) => currentPhotos.map((photo) => (
      photo.id === id ? { ...photo, expanded: !photo.expanded } : photo
    )));
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">GPS Photo Distance Checker</p>
        <h1>Проверка расстояний между GPS-точками фотографий</h1>
        <p>
          Выберите несколько фото, проверьте EXIF GPS, найдите точки ближе заданного порога и загрузите очищенные копии без метаданных.
        </p>
      </header>

      <section className="panel controls">
        <label className="field">
          Фотографии
          <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" multiple onChange={handleFileChange} />
        </label>
        <label className="field threshold-field">
          Порог нарушения, метров
          <input
            type="number"
            min="1"
            step="0.1"
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
          />
        </label>
        <button type="button" onClick={() => setHighlightProblems(true)} disabled={violations.length === 0}>
          Показать проблемные точки
        </button>
      </section>

      <HostingSelector
        hosting={hosting}
        imgbbApiKey={imgbbApiKey}
        onHostingChange={resetUploadsForHostingChange}
        onApiKeyChange={setImgbbApiKey}
      />

      {globalMessage && <div className="status-banner">{globalMessage}</div>}

      <ViolationsBlock violations={violations} recommendation={recommendation} hasGpsPhotos={hasGpsPhotos} />

      <section className="panel upload-panel">
        <h2>Загрузка очищенных копий</h2>
        <p className="muted">
          Перед загрузкой приложение рисует фото на canvas, создаёт новый JPG без EXIF/GPS/device/timestamp metadata и случайным именем файла.
        </p>
        <button type="button" onClick={handleUpload} disabled={isUploading || isReadingExif || photos.length === 0}>
          {isUploading ? 'Загрузка...' : `Загрузить на ${HOSTING_LABELS[hosting]}`}
        </button>
      </section>

      {photos.length > 0 && <LinksBlock photos={photos} hostingLabel={HOSTING_LABELS[hosting]} />}

      <section className="photo-grid" aria-live="polite">
        {photos.map((photo) => (
          <PhotoCard
            key={photo.id}
            photo={photo}
            isProblem={problemPhotoIds.has(photo.id)}
            isHighlighted={highlightProblems}
            conflicts={violations.filter((violation) => violation.photoAId === photo.id || violation.photoBId === photo.id)}
            onToggle={toggleDetails}
          />
        ))}
      </section>
    </main>
  );
}

export default App;
