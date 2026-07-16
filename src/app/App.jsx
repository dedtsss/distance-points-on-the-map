import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../components/AppShell.jsx';
import BuildInfo from '../components/BuildInfo';
import DistanceSummary from '../components/DistanceSummary';
import EmptyState from '../components/EmptyState.jsx';
import ErrorBanner from '../components/ErrorBanner';
import JobProgress from '../components/JobProgress';
import LastSessionPrompt from '../components/LastSessionPrompt';
import MapPanel from '../components/MapPanel.jsx';
import PhotoPicker from '../components/PhotoPicker';
import PhotoResultCard from '../components/PhotoResultCard';
import ProcessingJournal from '../components/ProcessingJournal';
import ProviderSettings from '../components/ProviderSettings';
import ResultsSummary from '../components/ResultsSummary';
import ResultsTable from '../components/ResultsTable.jsx';
import SectionHeader from '../components/SectionHeader.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { calculateDistances, DEFAULT_DISTANCE_THRESHOLD_METERS } from '../features/distance/distanceService';
import { bufferSelectedFiles } from '../features/files/stableFileStore';
import { normalizeCoordinates } from '../features/gps/coordinateParser';
import { normalizeIndexValue } from '../features/points/pointIdentity.js';
import {
  deleteLastSession,
  getSessionDiagnostics,
  loadLastSession,
  restoreSessionPhotos,
  saveLastSession,
} from '../features/session/sessionStore';
import { DEFAULT_SCREEN, normalizeScreen } from '../features/ui/screens.js';
import {
  DEFAULT_PROVIDER_SETTINGS,
  normalizeProviderSettings,
  validateProviderSettings,
} from '../features/upload/providerPolicy';
import { DEFAULT_PROXY_URL } from '../features/upload/uploadService';
import {
  applyManualCoordinateCorrection,
  applyManualIndexCorrection,
  replacePhotoBatch,
  releasePhotoBuffers,
} from './appState';
import { runPhotoPipeline } from './pipeline';
import { UPLOAD_RULES_EXPLANATION } from './pipelineRules';

const newSessionMeta = () => ({
  sessionId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  createdAt: new Date().toISOString(),
});

const debugModeFromLocation = () => (
  typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('debug') === '1'
);

function UploadScreen({
  photos,
  mode,
  isBusy,
  providerValidation,
  hasUploadedPhotos,
  providerSettings,
  debugMode,
  thresholdMeters,
  activeSince,
  journal,
  onFileSelect,
  onRun,
  onClearResult,
  onApplyCoordinates,
  onApplyIndex,
  onSwapCoordinates,
}) {
  return (
    <>
      <section className="screen-panel">
        <SectionHeader
          kicker="Workflow"
          title="Загрузка и проверка"
        >
          OCR ищет координаты и индекс точки, затем cleanup удаляет metadata, а upload отправляет только очищенные generic-файлы.
        </SectionHeader>
        <PhotoPicker photos={photos} onSelect={onFileSelect} disabled={isBusy} isBuffering={mode === 'buffering'} />
      </section>

      {photos.length > 0 && (
        <section className="run-card">
          <SectionHeader kicker="Шаг 2" title="Действия">{UPLOAD_RULES_EXPLANATION}</SectionHeader>
          <div className="run-actions action-grid">
            <button type="button" className="button-secondary" onClick={() => onRun({ gps: true, cleanup: false, upload: false }, 'Распознавание координат')} disabled={isBusy || !photos.some((photo) => photo.stableFile)}>Только распознать координаты</button>
            <button type="button" className="button-secondary" onClick={() => onRun({ gps: false, cleanup: true, upload: false }, 'Очистка metadata')} disabled={isBusy || !photos.some((photo) => photo.stableFile)}>Очистить metadata</button>
            <button type="button" className="button-secondary" onClick={() => onRun({ gps: false, cleanup: false, upload: true }, 'Загрузка очищенных')} disabled={isBusy || !providerValidation.valid || !photos.some((photo) => photo.cleanedBlob)}>Загрузить очищенные</button>
            <button className="primary-action" type="button" onClick={() => onRun({ gps: true, cleanup: true, upload: true }, 'Полная обработка')} disabled={isBusy || !providerValidation.valid || !photos.some((photo) => photo.stableFile)}>{isBusy ? 'Обработка...' : 'Проверить и загрузить всё'}</button>
            {!hasUploadedPhotos && mode === 'done' && <button type="button" className="button-secondary" onClick={onClearResult}>Очистить результат</button>}
          </div>
          {!providerValidation.valid && <p className="settings-error">{providerValidation.error}</p>}
        </section>
      )}

      <JobProgress photos={photos} />
      <DistanceSummary photos={photos} thresholdMeters={thresholdMeters} />

      {photos.length > 0 && (
        <section className="photo-results" aria-label="Результаты по фотографиям" aria-live="polite">
          {photos.map((photo) => (
            <PhotoResultCard
              key={photo.id}
              photo={photo}
              debugMode={debugMode}
              providerSettings={providerSettings}
              onApplyCoordinates={onApplyCoordinates}
              onApplyIndex={onApplyIndex}
              onSwapCoordinates={onSwapCoordinates}
              editingDisabled={isBusy}
            />
          ))}
        </section>
      )}
      <ProcessingJournal entries={journal} activeSince={activeSince} />
    </>
  );
}

function MapScreen({ photos, thresholdMeters, providerSettings, focusPhotoId }) {
  return (
    <section className="screen-panel">
      <SectionHeader kicker="Карта" title="Точки и расстояния">
        Подписи берутся из OCR-индекса. Low precision и suspicious отображаются, но не считаются строгими OK-точками.
      </SectionHeader>
      <MapPanel
        photos={photos}
        thresholdMeters={thresholdMeters}
        providerSettings={providerSettings}
        focusPhotoId={focusPhotoId}
      />
    </section>
  );
}

function ResultsScreen({
  photos,
  providerSettings,
  onClear,
  onApplyIndex,
  onOpenOnMap,
  onOpenPhoto,
}) {
  if (photos.length === 0) {
    return <EmptyState title="Результатов пока нет.">Сначала выберите фотографии и запустите обработку.</EmptyState>;
  }

  return (
    <>
      <section className="screen-panel">
        <SectionHeader kicker="Результаты" title="Сводка ссылок и точек">
          Таблица хранит внутренние имена точек, статусы координат, upload-ссылки и действия для дальнейшей работы.
        </SectionHeader>
        <ResultsSummary photos={photos} providerSettings={providerSettings} onClear={onClear} />
        <ResultsTable
          photos={photos}
          providerSettings={providerSettings}
          onApplyIndex={onApplyIndex}
          onOpenOnMap={onOpenOnMap}
          onOpenPhoto={onOpenPhoto}
        />
      </section>
    </>
  );
}

function SettingsScreen({
  providerSettings,
  onProviderSettingsChange,
  regionMode,
  onRegionModeChange,
  thresholdMeters,
  onThresholdMetersChange,
  debugMode,
  isBusy,
}) {
  return (
    <>
      <section className="screen-panel">
        <SectionHeader kicker="Настройки" title="Загрузка и приватность">
          Внутренний индекс используется только в UI/session/export/map. Provider upload filename остаётся anonymized/generic.
        </SectionHeader>
        <ProviderSettings
          value={providerSettings}
          onChange={onProviderSettingsChange}
          disabled={isBusy}
        />
        <section className="provider-settings">
          <h2>Порог расстояния</h2>
          <label className="setting-field">
            Метры
            <input
              type="number"
              min="1"
              max="1000"
              value={thresholdMeters}
              onChange={(event) => onThresholdMetersChange(event.target.value)}
              disabled={isBusy}
            />
          </label>
        </section>
        <section className="provider-settings">
          <h2>Проверка региона</h2>
          <label className="region-setting">
            <input
              type="checkbox"
              checked={regionMode === 'karelia'}
              onChange={(event) => onRegionModeChange(event.target.checked ? 'karelia' : 'auto')}
              disabled={isBusy}
            />
            Ожидаемый регион: Карелия/рядом
          </label>
          <p className="section-copy">По умолчанию используется авто-кластер текущей пачки.</p>
        </section>
        <section className="provider-settings">
          <h2>Debug mode</h2>
          <StatusChip tone={debugMode ? 'warning' : 'neutral'}>{debugMode ? 'включён' : 'выключен'}</StatusChip>
          <p className="section-copy">Debug включается параметром URL `?debug=1` и не сохраняет heavy raw photo данные в session.</p>
        </section>
        <section className="provider-settings">
          <h2>Privacy upload settings</h2>
          <p className="section-copy">Placeholder для будущих политик. Сейчас outbound filename формируется как `gps-001.jpg`, `gps-002.jpg` и не содержит индекс.</p>
        </section>
      </section>
    </>
  );
}

export default function App() {
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState([]);
  const [mode, setMode] = useState('idle');
  const [savedSession, setSavedSession] = useState(() => loadLastSession());
  const [sessionMeta, setSessionMeta] = useState(null);
  const [providerSettings, setProviderSettings] = useState({ ...DEFAULT_PROVIDER_SETTINGS });
  const [regionMode, setRegionMode] = useState('auto');
  const [thresholdMeters, setThresholdMeters] = useState(() => Number(loadLastSession()?.thresholdMeters) || DEFAULT_DISTANCE_THRESHOLD_METERS);
  const [activeScreen, setActiveScreen] = useState(() => normalizeScreen(loadLastSession()?.activeScreen || DEFAULT_SCREEN));
  const [mapFocusPhotoId, setMapFocusPhotoId] = useState(null);
  const [journal, setJournal] = useState([]);
  const [activeSince, setActiveSince] = useState(null);
  const [sessionDiagnostics, setSessionDiagnostics] = useState(() => getSessionDiagnostics());
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const debugMode = useMemo(debugModeFromLocation, []);
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
    indexFromOcr: photo.indexFromOcr,
    indexStatus: photo.indexStatus,
    pointLabel: photo.pointLabel,
    internalName: photo.internalName,
    displayName: photo.displayName,
    displayFileName: photo.displayFileName,
    manualCoordinates: photo.manualCoordinates,
    coordinateQuality: photo.coordinateQuality,
    coordinatePrecision: photo.coordinatePrecision,
    coordinateText: photo.coordinateText,
    gpsWarnings: photo.gpsWarnings,
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
          thresholdMeters,
          activeScreen,
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
  }, [sessionRevision, providerSettings, sessionMeta, debugMode, thresholdMeters, activeScreen]);

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
    setActiveScreen('upload');

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
        thresholdMeters,
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
          thresholdMeters,
          activeScreen,
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
    setThresholdMeters(Number(savedSession.thresholdMeters) || DEFAULT_DISTANCE_THRESHOLD_METERS);
    setActiveScreen(normalizeScreen(savedSession.activeScreen || DEFAULT_SCREEN));
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
    setMapFocusPhotoId(null);
  };

  const handleManualCoordinates = (photoId, latitude, longitude) => {
    const coordinates = normalizeCoordinates(latitude, longitude);
    if (!coordinates) return false;

    setPhotos((current) => applyManualCoordinateCorrection(current, photoId, coordinates, (items) => (
      calculateDistances(items, thresholdMeters)
    )));
    return true;
  };

  const handleManualIndex = (photoId, value) => {
    if (String(value || '').trim() && !normalizeIndexValue(value)) return false;
    setPhotos((current) => {
      const withIndex = applyManualIndexCorrection(current, photoId, value);
      const distanceResult = calculateDistances(withIndex, thresholdMeters);
      return withIndex.map((photo) => ({
        ...photo,
        ...(distanceResult.byPhotoId.get(photo.id) || { distanceStatus: 'missing_coordinates', distanceConflicts: [] }),
      }));
    });
    return true;
  };

  const handleSwapCoordinates = (photoId) => {
    const photo = photosRef.current.find((item) => item.id === photoId);
    if (!photo?.coordinates) return false;
    addLog(`Фото ${photo.number}: lat/lon поменяны местами вручную`);
    return handleManualCoordinates(photoId, photo.coordinates.longitude, photo.coordinates.latitude);
  };

  const handleThresholdMetersChange = (value) => {
    const next = Math.max(1, Math.min(1000, Number(value) || DEFAULT_DISTANCE_THRESHOLD_METERS));
    setThresholdMeters(next);
    setPhotos((current) => {
      if (current.length === 0) return current;
      const distanceResult = calculateDistances(current, next);
      return current.map((photo) => ({
        ...photo,
        ...(distanceResult.byPhotoId.get(photo.id) || { distanceStatus: 'missing_coordinates', distanceConflicts: [] }),
      }));
    });
  };

  const handleOpenOnMap = (photoId) => {
    setMapFocusPhotoId(photoId);
    setActiveScreen('map');
  };

  const handleOpenPhoto = (photoId) => {
    setActiveScreen('upload');
    if (typeof document !== 'undefined') {
      globalThis.setTimeout(() => document.getElementById(`photo-${photoId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
    }
  };

  return (
    <AppShell
      activeScreen={activeScreen}
      onScreenChange={(screen) => setActiveScreen(normalizeScreen(screen))}
      photoCount={photos.length}
      footer={(
        <footer className="app-footer">
          <p className="privacy-note">После успешной загрузки приложение очищает внутренний буфер. Исходные файлы на устройстве не удаляются.</p>
          <BuildInfo />
        </footer>
      )}
    >
      {debugMode && <div className="debug-mode-banner">Включён режим диагностики</div>}
      {debugMode && <pre className="session-debug">{JSON.stringify(sessionDiagnostics, null, 2)}</pre>}
      <ErrorBanner messages={errors} />
      <LastSessionPrompt session={savedSession} onRestore={handleRestore} onDelete={handleDeleteSaved} />
      {hasRestoredPhotos && (
        <aside className="notice notice-neutral">
          Восстановлен сохранённый результат без исходных файлов. Для нового cleanup или upload выберите фотографии заново.
        </aside>
      )}

      {activeScreen === 'upload' && (
        <UploadScreen
          photos={photos}
          mode={mode}
          isBusy={isBusy}
          providerValidation={providerValidation}
          hasUploadedPhotos={hasUploadedPhotos}
          providerSettings={providerSettings}
          debugMode={debugMode}
          thresholdMeters={thresholdMeters}
          activeSince={activeSince}
          journal={journal}
          onFileSelect={handleFileSelect}
          onRun={handleRun}
          onClearResult={handleClearResult}
          onApplyCoordinates={handleManualCoordinates}
          onApplyIndex={handleManualIndex}
          onSwapCoordinates={handleSwapCoordinates}
        />
      )}
      {activeScreen === 'map' && (
        <MapScreen
          photos={photos}
          thresholdMeters={thresholdMeters}
          providerSettings={providerSettings}
          focusPhotoId={mapFocusPhotoId}
        />
      )}
      {activeScreen === 'results' && (
        <ResultsScreen
          photos={photos}
          providerSettings={providerSettings}
          onClear={handleClearResult}
          onApplyIndex={handleManualIndex}
          onOpenOnMap={handleOpenOnMap}
          onOpenPhoto={handleOpenPhoto}
        />
      )}
      {activeScreen === 'settings' && (
        <SettingsScreen
          providerSettings={providerSettings}
          onProviderSettingsChange={setProviderSettings}
          regionMode={regionMode}
          onRegionModeChange={setRegionMode}
          thresholdMeters={thresholdMeters}
          onThresholdMetersChange={handleThresholdMetersChange}
          debugMode={debugMode}
          isBusy={isBusy}
        />
      )}
    </AppShell>
  );
}
