import { useEffect, useMemo, useRef, useState } from 'react';
import DistanceSummary from '../components/DistanceSummary';
import BuildInfo from '../components/BuildInfo';
import ErrorBanner from '../components/ErrorBanner';
import JobProgress from '../components/JobProgress';
import LastSessionPrompt from '../components/LastSessionPrompt';
import PhotoPicker from '../components/PhotoPicker';
import PhotoResultCard from '../components/PhotoResultCard';
import ProviderSettings from '../components/ProviderSettings';
import ProcessingJournal from '../components/ProcessingJournal';
import ResultsSummary from '../components/ResultsSummary';
import { calculateDistances, DEFAULT_DISTANCE_THRESHOLD_METERS } from '../features/distance/distanceService';
import { bufferSelectedFiles } from '../features/files/stableFileStore';
import { normalizeCoordinates } from '../features/gps/coordinateParser';
import {
  deleteLastSession,
  getSessionDiagnostics,
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
import { applyManualCoordinateCorrection, replacePhotoBatch, releasePhotoBuffers } from './appState';
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
  const [regionMode, setRegionMode] = useState('auto');
  const [journal, setJournal] = useState([]);
  const [activeSince, setActiveSince] = useState(null);
  const [sessionDiagnostics, setSessionDiagnostics] = useState(() => getSessionDiagnostics());
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const debugMode = useMemo(() => new URLSearchParams(window.location.search).get('debug') === '1', []);
  const providerValidation = useMemo(() => validateProviderSettings(providerSettings), [providerSettings]);
  const isBusy = mode === 'buffering' || mode === 'running';
  const hasUploadedPhotos = photos.some((photo) => photo.uploadResult?.links?.length > 0);
  const hasRestoredPhotos = photos.some((photo) => photo.restored);
  const addLog = (message, type = 'info') => setJournal((current) => [...current, {
    id: `${Date.now()}-${Math.random()}`, time: new Date().toLocaleTimeString('ru-RU'), message, type,
  }].slice(-200));
  const sessionRevision = useMemo(() => JSON.stringify(photos.map((photo) => ({
    id: photo.id,
    status: photo.status,
    gpsStatus: photo.gpsStatus,
    gpsConfidence: photo.gpsConfidence,
    ocrStatus: photo.ocrStatus,
    manualCoordinates: photo.manualCoordinates,
    coordinates: photo.coordinates,
    distanceStatus: photo.distanceStatus,
    distanceConflicts: photo.distanceConflicts,
    cleanupStatus: photo.cleanupStatus,
    uploadStatus: photo.uploadStatus,
    uploadLinks: photo.uploadResult?.links,
    userError: photo.userError,
    userWarnings: photo.userWarnings,
    thumbnailDataUrl: photo.thumbnailDataUrl,
  }))), [photos]);

  useEffect(() => () => {
    photosRef.current.forEach((photo) => releasePhotoBuffers(photo));
  }, []);

  useEffect(() => {
    if (!sessionMeta || photos.length === 0) return undefined;
    const timeoutId = globalThis.setTimeout(() => {
      try {
        saveLastSession({
          ...sessionMeta,
          thresholdMeters: DEFAULT_DISTANCE_THRESHOLD_METERS,
          photos: photosRef.current,
          providerSettings,
        });
        setSessionDiagnostics(getSessionDiagnostics());
        setJournal((current) => current.at(-1)?.message === 'Сессия сохранена'
          ? current
          : [...current, { id: `${Date.now()}-session`, time: new Date().toLocaleTimeString('ru-RU'), message: 'Сессия сохранена', type: 'info' }].slice(-200));
      } catch (storageError) {
        if (debugMode) console.error(storageError);
      }
    }, 100);
    return () => globalThis.clearTimeout(timeoutId);
  }, [sessionRevision, providerSettings, sessionMeta, debugMode]);

  const clearCurrentPhotos = () => photosRef.current.forEach((photo) => releasePhotoBuffers(photo));

  const handleFileSelect = async (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    setMode('buffering');
    setErrors([]);
    clearCurrentPhotos();
    deleteLastSession();
    setPhotos([]);
    setSavedSession(null);

    try {
      const buffered = await bufferSelectedFiles(selectedFiles);
      const nextBatch = replacePhotoBatch([], buffered.bufferedFiles);
      setPhotos(nextBatch.photos);
      setErrors(buffered.errors);
      setSessionMeta(newSessionMeta());
      setMode(nextBatch.photos.length > 0 ? 'ready' : 'idle');
      addLog(`Выбрано файлов: ${nextBatch.photos.length}. Превью создано: ${nextBatch.photos.filter((photo) => photo.thumbnailDataUrl).length}.`);
    } catch (error) {
      setErrors(['Не удалось подготовить выбранные фотографии. Выберите файлы ещё раз.']);
      setMode('idle');
      if (debugMode) console.error(error);
    }
  };

  const handleRun = async (stages, label) => {
    if (photos.length === 0 || isBusy || (stages.upload && !providerValidation.valid)) return;
    setMode('running');
    setActiveSince(Date.now());
    addLog(`${label}: запуск`);
    setErrors([]);

    try {
      const result = await runPhotoPipeline({
        photos,
        debug: debugMode,
        proxyUrl: DEFAULT_PROXY_URL,
        thresholdMeters: DEFAULT_DISTANCE_THRESHOLD_METERS,
        providerSettings,
        regionMode,
        stages,
        onLog: (entry) => addLog(entry.message, entry.type),
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
      addLog(`${label}: завершено`, 'success');
    } catch (error) {
      setErrors(['Не удалось завершить обработку. Повторно выберите фотографии и попробуйте ещё раз.']);
      setMode('ready');
      addLog(`${label}: ошибка`, 'error');
      if (debugMode) console.error(error);
    } finally {
      setActiveSince(null);
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
    setSessionDiagnostics({ ...getSessionDiagnostics(), accepted: true });
    addLog(`Сессия восстановлена: ${savedSession.photos.length} фото`, 'success');
  };

  const handleDeleteSaved = () => {
    deleteLastSession();
    setSavedSession(null);
    setSessionDiagnostics(getSessionDiagnostics());
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

  const handleManualCoordinates = (photoId, latitude, longitude) => {
    const coordinates = normalizeCoordinates(latitude, longitude);
    if (!coordinates) return false;

    setPhotos((current) => {
      return applyManualCoordinateCorrection(current, photoId, coordinates, (items) => (
        calculateDistances(items, DEFAULT_DISTANCE_THRESHOLD_METERS)
      ));
    });
    return true;
  };

  const handleSwapCoordinates = (photoId) => {
    const photo = photosRef.current.find((item) => item.id === photoId);
    if (!photo?.coordinates) return false;
    addLog(`Фото ${photo.number}: lat/lon поменяны местами вручную`);
    return handleManualCoordinates(photoId, photo.coordinates.longitude, photo.coordinates.latitude);
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="brand-mark">GPS Checker</p>
        <h1>Проверка фотографий по координатам</h1>
        <p>Находим координаты, проверяем расстояния, удаляем metadata и возвращаем ссылки на каждое фото.</p>
      </header>

      {debugMode && <div className="debug-mode-banner">Включён режим диагностики</div>}
      {debugMode && <pre className="session-debug">{JSON.stringify(sessionDiagnostics, null, 2)}</pre>}
      <ErrorBanner messages={errors} />
      <LastSessionPrompt session={savedSession} onRestore={handleRestore} onDelete={handleDeleteSaved} />
      {hasRestoredPhotos && (
        <aside className="notice notice-neutral">
          Восстановлен сохранённый результат без исходных файлов. Для нового cleanup или upload выберите фотографии заново.
        </aside>
      )}

      <PhotoPicker photos={photos} onSelect={handleFileSelect} disabled={isBusy} isBuffering={mode === 'buffering'} />

      {photos.length > 0 && (
        <>
          <ProviderSettings
            value={providerSettings}
            onChange={setProviderSettings}
            disabled={isBusy}
          />
          <section className="provider-settings">
            <h2>Проверка региона</h2>
            <label className="region-setting"><input type="checkbox" checked={regionMode === 'karelia'} onChange={(event) => setRegionMode(event.target.checked ? 'karelia' : 'auto')} /> Ожидаемый регион: Карелия/рядом</label>
            <p className="section-copy">По умолчанию используется авто-кластер текущей пачки.</p>
          </section>
          <section className="run-card">
            <div>
              <p className="section-kicker">Шаг 2</p>
              <h2>Действия</h2>
              <p className="section-copy">{UPLOAD_RULES_EXPLANATION}</p>
            </div>
            <div className="run-actions action-grid">
              <button type="button" className="button-secondary" onClick={() => handleRun({ gps: true, cleanup: false, upload: false }, 'Распознавание координат')} disabled={isBusy || !photos.some((photo) => photo.stableFile)}>Только распознать координаты</button>
              <button type="button" className="button-secondary" onClick={() => handleRun({ gps: false, cleanup: true, upload: false }, 'Очистка metadata')} disabled={isBusy || !photos.some((photo) => photo.stableFile)}>Очистить metadata</button>
              <button type="button" className="button-secondary" onClick={() => handleRun({ gps: false, cleanup: false, upload: true }, 'Загрузка очищенных')} disabled={isBusy || !providerValidation.valid || !photos.some((photo) => photo.cleanedBlob)}>Загрузить очищенные</button>
              <button className="primary-action" type="button" onClick={() => handleRun({ gps: true, cleanup: true, upload: true }, 'Полная обработка')} disabled={isBusy || !providerValidation.valid || !photos.some((photo) => photo.stableFile)}>{isBusy ? 'Обработка…' : 'Проверить и загрузить всё'}</button>
              {!hasUploadedPhotos && mode === 'done' && <button type="button" className="button-secondary" onClick={handleClearResult}>Очистить результат</button>}
            </div>
          </section>
        </>
      )}

      <JobProgress photos={photos} />
      <DistanceSummary photos={photos} thresholdMeters={DEFAULT_DISTANCE_THRESHOLD_METERS} />

      {photos.length > 0 && (
        <section className="photo-results" aria-label="Результаты по фотографиям" aria-live="polite">
          {photos.map((photo) => (
            <PhotoResultCard
              key={photo.id}
              photo={photo}
              debugMode={debugMode}
              providerSettings={providerSettings}
              onApplyCoordinates={handleManualCoordinates}
              onSwapCoordinates={handleSwapCoordinates}
              editingDisabled={isBusy}
            />
          ))}
        </section>
      )}

      <ResultsSummary photos={photos} providerSettings={providerSettings} onClear={handleClearResult} />
      <ProcessingJournal entries={journal} activeSince={activeSince} />

      <footer className="privacy-note">
        После успешной загрузки приложение очищает внутренний буфер. Исходные файлы на устройстве не удаляются.
      </footer>
      <BuildInfo />
    </main>
  );
}
