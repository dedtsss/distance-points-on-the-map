import { useEffect, useMemo, useRef, useState } from 'react';
import DistanceSummary from '../components/DistanceSummary';
import ErrorBanner from '../components/ErrorBanner';
import JobProgress from '../components/JobProgress';
import LastSessionPrompt from '../components/LastSessionPrompt';
import PhotoPicker from '../components/PhotoPicker';
import PhotoResultCard from '../components/PhotoResultCard';
import ProviderSettings from '../components/ProviderSettings';
import ResultsSummary from '../components/ResultsSummary';
import { DEFAULT_DISTANCE_THRESHOLD_METERS } from '../features/distance/distanceService';
import { bufferSelectedFiles } from '../features/files/stableFileStore';
import {
  deleteLastSession,
  loadLastSession,
  restoreSessionPhotos,
  saveLastSession,
} from '../features/session/sessionStore';
import {
  DEFAULT_PROVIDER_SETTINGS,
  normalizeProviderSettings,
  validateProviderSettings,
} from '../features/upload/providerPolicy';
import { DEFAULT_PROXY_URL } from '../features/upload/uploadService';
import { replacePhotoBatch, releasePhotoBuffers } from './appState';
import { runPhotoPipeline } from './pipeline';
import { UPLOAD_RULES_EXPLANATION } from './pipelineRules';

const newSessionMeta = () => ({
  sessionId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  createdAt: new Date().toISOString(),
});

export default function App() {
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState([]);
  const [mode, setMode] = useState('idle');
  const [savedSession, setSavedSession] = useState(() => loadLastSession());
  const [sessionMeta, setSessionMeta] = useState(null);
  const [providerSettings, setProviderSettings] = useState({ ...DEFAULT_PROVIDER_SETTINGS });
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const debugMode = useMemo(() => new URLSearchParams(window.location.search).get('debug') === '1', []);
  const providerValidation = useMemo(() => validateProviderSettings(providerSettings), [providerSettings]);
  const isBusy = mode === 'buffering' || mode === 'running';
  const hasUploadedPhotos = photos.some((photo) => photo.uploadResult?.links?.length > 0);

  useEffect(() => () => {
    photosRef.current.forEach((photo) => releasePhotoBuffers(photo));
  }, []);

  const clearCurrentPhotos = () => photosRef.current.forEach((photo) => releasePhotoBuffers(photo));

  const handleFileSelect = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    setMode('buffering');
    setErrors([]);
    clearCurrentPhotos();
    setPhotos([]);
    setSavedSession(null);

    try {
      const buffered = await bufferSelectedFiles(selectedFiles);
      const nextBatch = replacePhotoBatch([], buffered.bufferedFiles);
      setPhotos(nextBatch.photos);
      setErrors(buffered.errors);
      setSessionMeta(newSessionMeta());
      setMode(nextBatch.photos.length > 0 ? 'ready' : 'idle');
    } catch (error) {
      setErrors(['Не удалось подготовить выбранные фотографии. Выберите файлы ещё раз.']);
      setMode('idle');
      if (debugMode) console.error(error);
    }
  };

  const handleRun = async () => {
    if (photos.length === 0 || isBusy || !providerValidation.valid) return;
    setMode('running');
    setErrors([]);

    try {
      const result = await runPhotoPipeline({
        photos,
        debug: debugMode,
        proxyUrl: DEFAULT_PROXY_URL,
        thresholdMeters: DEFAULT_DISTANCE_THRESHOLD_METERS,
        providerSettings,
        onPhotoUpdate: (photoId, patch) => {
          setPhotos((current) => current.map((photo) => photo.id === photoId ? { ...photo, ...patch } : photo));
        },
      });
      setPhotos(result.photos);
      try {
        const snapshot = saveLastSession({
          ...sessionMeta,
          thresholdMeters: DEFAULT_DISTANCE_THRESHOLD_METERS,
          photos: result.photos,
          providerSettings,
        });
        setSessionMeta({ sessionId: snapshot.sessionId, createdAt: snapshot.createdAt });
      } catch (storageError) {
        setErrors(['Обработка завершена, но браузер не смог сохранить последний результат.']);
        if (debugMode) console.error(storageError);
      }
      setMode('done');
    } catch (error) {
      setErrors(['Не удалось завершить обработку. Повторно выберите фотографии и попробуйте ещё раз.']);
      setMode('ready');
      if (debugMode) console.error(error);
    }
  };

  const handleRestore = () => {
    clearCurrentPhotos();
    setPhotos(restoreSessionPhotos(savedSession));
    setProviderSettings(normalizeProviderSettings(savedSession.providerSettings || DEFAULT_PROVIDER_SETTINGS));
    setSessionMeta({ sessionId: savedSession.sessionId, createdAt: savedSession.createdAt });
    setErrors([]);
    setMode('done');
    setSavedSession(null);
  };

  const handleDeleteSaved = () => {
    deleteLastSession();
    setSavedSession(null);
  };

  const handleClearResult = () => {
    clearCurrentPhotos();
    deleteLastSession();
    setPhotos([]);
    setErrors([]);
    setMode('idle');
    setSessionMeta(null);
    setSavedSession(null);
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="brand-mark">GPS Checker</p>
        <h1>Проверка фотографий по координатам</h1>
        <p>Находим координаты, проверяем расстояния, удаляем metadata и возвращаем ссылки на каждое фото.</p>
      </header>

      {debugMode && <div className="debug-mode-banner">Включён режим диагностики</div>}
      <ErrorBanner messages={errors} />
      <LastSessionPrompt session={savedSession} onRestore={handleRestore} onDelete={handleDeleteSaved} />

      <PhotoPicker photos={photos} onSelect={handleFileSelect} disabled={isBusy} isBuffering={mode === 'buffering'} />

      {photos.length > 0 && (
        <>
          <ProviderSettings
            value={providerSettings}
            onChange={setProviderSettings}
            disabled={isBusy || mode === 'done'}
          />
          <section className="run-card">
            <div>
              <p className="section-kicker">Шаг 2</p>
              <h2>Проверить и загрузить</h2>
              <p className="section-copy">{UPLOAD_RULES_EXPLANATION}</p>
            </div>
            <div className="run-actions">
              <button className="primary-action" type="button" onClick={handleRun} disabled={mode !== 'ready' || !providerValidation.valid}>
                {mode === 'running' ? 'Обработка…' : mode === 'done' ? 'Обработка завершена' : 'Проверить и загрузить'}
              </button>
              {mode === 'done' && !hasUploadedPhotos && <button type="button" className="button-secondary" onClick={handleClearResult}>Очистить результат</button>}
            </div>
          </section>
        </>
      )}

      <JobProgress photos={photos} />
      <DistanceSummary photos={photos} thresholdMeters={DEFAULT_DISTANCE_THRESHOLD_METERS} />

      {photos.length > 0 && (
        <section className="photo-results" aria-label="Результаты по фотографиям" aria-live="polite">
          {photos.map((photo) => (
            <PhotoResultCard key={photo.id} photo={photo} debugMode={debugMode} providerSettings={providerSettings} />
          ))}
        </section>
      )}

      <ResultsSummary photos={photos} providerSettings={providerSettings} onClear={handleClearResult} />

      <footer className="privacy-note">
        После успешной загрузки приложение очищает внутренний буфер. Исходные файлы на устройстве не удаляются.
      </footer>
    </main>
  );
}
