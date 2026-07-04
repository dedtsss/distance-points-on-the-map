import { useEffect, useMemo, useRef, useState } from 'react';
import DistanceSummary from '../components/DistanceSummary';
import ErrorBanner from '../components/ErrorBanner';
import JobProgress from '../components/JobProgress';
import PhotoPicker from '../components/PhotoPicker';
import PhotoResultCard from '../components/PhotoResultCard';
import ResultsSummary from '../components/ResultsSummary';
import { DEFAULT_DISTANCE_THRESHOLD_METERS } from '../features/distance/distanceService';
import { bufferSelectedFiles } from '../features/files/stableFileStore';
import { DEFAULT_PROXY_URL } from '../features/upload/uploadService';
import { createPhotoJob, releasePhotoBuffers } from './appState';
import { runPhotoPipeline } from './pipeline';

export default function App() {
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState([]);
  const [mode, setMode] = useState('idle');
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const debugMode = useMemo(
    () => new URLSearchParams(window.location.search).get('debug') === '1',
    [],
  );
  const isBusy = mode === 'buffering' || mode === 'running';

  useEffect(() => () => {
    photosRef.current.forEach((photo) => releasePhotoBuffers(photo));
  }, []);

  const handleFileSelect = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    setMode('buffering');
    setErrors([]);
    photos.forEach((photo) => releasePhotoBuffers(photo));
    setPhotos([]);

    try {
      const buffered = await bufferSelectedFiles(selectedFiles);
      setPhotos(buffered.bufferedFiles.map(createPhotoJob));
      setErrors(buffered.errors);
      setMode('ready');
    } catch (error) {
      setErrors(['Не удалось подготовить выбранные фотографии. Выберите файлы ещё раз.']);
      setMode('idle');
      if (debugMode) console.error(error);
    }
  };

  const handleRun = async () => {
    if (photos.length === 0 || isBusy) return;
    setMode('running');
    setErrors([]);

    try {
      const result = await runPhotoPipeline({
        photos,
        debug: debugMode,
        proxyUrl: DEFAULT_PROXY_URL,
        thresholdMeters: DEFAULT_DISTANCE_THRESHOLD_METERS,
        onPhotoUpdate: (photoId, patch) => {
          setPhotos((current) => current.map((photo) => (
            photo.id === photoId ? { ...photo, ...patch } : photo
          )));
        },
      });
      setPhotos(result.photos);
      setMode('done');
    } catch (error) {
      setErrors(['Не удалось завершить обработку. Повторно выберите фотографии и попробуйте ещё раз.']);
      setMode('ready');
      if (debugMode) console.error(error);
    }
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="brand-mark">GPS Checker</p>
        <h1>Проверка фотографий по координатам</h1>
        <p>
          Находим координаты, проверяем расстояния, удаляем metadata и возвращаем две ссылки на каждое фото.
        </p>
      </header>

      {debugMode && <div className="debug-mode-banner">Включён режим диагностики</div>}
      <ErrorBanner messages={errors} />

      <PhotoPicker
        photos={photos}
        onSelect={handleFileSelect}
        disabled={isBusy}
        isBuffering={mode === 'buffering'}
      />

      {photos.length > 0 && (
        <section className="run-card">
          <div>
            <p className="section-kicker">Шаг 2</p>
            <h2>Проверить и загрузить</h2>
            <p className="section-copy">
              Обработка идёт по очереди. Фото без координат всё равно будут очищены и загружены.
            </p>
          </div>
          <button className="primary-action" type="button" onClick={handleRun} disabled={mode !== 'ready'}>
            {mode === 'running' ? 'Обработка…' : mode === 'done' ? 'Обработка завершена' : 'Проверить и загрузить'}
          </button>
        </section>
      )}

      <JobProgress photos={photos} />
      <DistanceSummary photos={photos} thresholdMeters={DEFAULT_DISTANCE_THRESHOLD_METERS} />

      {photos.length > 0 && (
        <section className="photo-results" aria-label="Результаты по фотографиям" aria-live="polite">
          {photos.map((photo) => (
            <PhotoResultCard key={photo.id} photo={photo} debugMode={debugMode} />
          ))}
        </section>
      )}

      <ResultsSummary photos={photos} />

      <footer className="privacy-note">
        После успешной загрузки приложение очищает внутренний буфер. Исходные файлы на устройстве не удаляются.
      </footer>
    </main>
  );
}
