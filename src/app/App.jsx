import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../components/AppShell.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import Dashboard from '../components/Dashboard.jsx';
import DistanceSummary from '../components/DistanceSummary.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorBanner from '../components/ErrorBanner.jsx';
import Icon from '../components/Icon.jsx';
import JobProgress from '../components/JobProgress.jsx';
import JournalScreen from '../components/JournalScreen.jsx';
import LastSessionPrompt from '../components/LastSessionPrompt.jsx';
import LoadingState from '../components/LoadingState.jsx';
import MapPanel from '../components/MapPanel.jsx';
import PageHeader from '../components/PageHeader.jsx';
import PhotoCard from '../components/PhotoCard.jsx';
import ResultsScreen from '../components/ResultsScreen.jsx';
import SessionsScreen from '../components/SessionsScreen.jsx';
import SettingsScreen from '../components/SettingsScreen.jsx';
import UploadDropzone from '../components/UploadDropzone.jsx';
import { calculateDistances, DEFAULT_DISTANCE_THRESHOLD_METERS } from '../features/distance/distanceService.js';
import { bufferSelectedFiles } from '../features/files/stableFileStore.js';
import {
  FOLDER_IMPORT_STATUSES,
  applyBufferResultToFolderReport,
  createFolderImportReport,
  prepareFolderImportFromDataTransfer,
  prepareFolderImportFromDirectoryHandle,
  prepareFolderImportFromFileList,
  requestDirectoryHandle,
} from '../features/files/folderPicker.js';
import { normalizeCoordinates } from '../features/gps/coordinateParser.js';
import { normalizeIndexValue } from '../features/points/pointIdentity.js';
import {
  deleteLastSession,
  getSessionDiagnostics,
  loadLastSession,
  restoreSessionPhotos,
  saveLastSession,
} from '../features/session/sessionStore.js';
import { DEFAULT_SCREEN, normalizeScreen } from '../features/ui/screens.js';
import {
  DEFAULT_PROVIDER_SETTINGS,
  normalizeProviderSettings,
  validateProviderSettings,
} from '../features/upload/providerPolicy.js';
import { DEFAULT_PROXY_URL } from '../features/upload/uploadService.js';
import {
  applyManualCoordinateCorrection,
  applyManualIndexCorrection,
  releasePhotoBuffers,
  replacePhotoBatch,
} from './appState.js';
import { runPhotoPipeline } from './pipeline.js';
import { UPLOAD_RULES_EXPLANATION } from './pipelineRules.js';

const newSessionMeta = (name = '') => ({
  sessionId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  createdAt: new Date().toISOString(),
  name,
});

const debugModeFromLocation = () => (
  typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('debug') === '1'
);

const buildVisibleSessions = ({ sessionMeta, photos, savedSession }) => {
  const sessions = [];
  if (sessionMeta && photos.length > 0) {
    sessions.push({
      ...sessionMeta,
      name: sessionMeta.name || (photos.some((photo) => photo.restored) ? 'Восстановленная сессия' : 'Текущая сессия'),
      photos,
      status: photos.some((photo) => ['reading_gps', 'cleaning', 'uploading'].includes(photo.status)) ? 'обрабатывается' : 'локальная',
    });
  }

  if (savedSession && savedSession.sessionId !== sessionMeta?.sessionId) {
    sessions.push({
      ...savedSession,
      name: savedSession.name || 'Последняя сохранённая сессия',
      photos: savedSession.photos || [],
      status: 'сохранена',
    });
  }

  return sessions;
};

function UploadScreen({
  photos,
  mode,
  isBusy,
  providerValidation,
  hasUploadedPhotos,
  providerSettings,
  thresholdMeters,
  onFiles,
  onFolderFiles,
  onPickFolder,
  onDropItems,
  onCancelFolderImport,
  onRun,
  onClearResult,
  onApplyCoordinates,
  onApplyIndex,
  onSwapCoordinates,
  onRemovePhoto,
  onOpenOnMap,
  onOpenSettings,
  folderImport,
}) {
  const hasStableFiles = photos.some((photo) => photo.stableFile);
  const hasCleanedPhotos = photos.some((photo) => photo.cleanedBlob);
  const isBuffering = mode === 'buffering' || folderImport?.status === FOLDER_IMPORT_STATUSES.ADDING;

  return (
    <>
      <PageHeader
        eyebrow="Загрузка и проверка"
        title="Новая проверка фотографий"
        actions={(
          <button
            type="button"
            onClick={() => onRun({ gps: true, cleanup: true, upload: true }, 'Полная обработка')}
            disabled={isBusy || !providerValidation.valid || !hasStableFiles}
          >
            <Icon name="play" size={18} />
            {isBusy ? 'Обработка' : 'Проверить и загрузить'}
          </button>
        )}
      >
        Выберите фотографии, проверьте OCR координат и индекса, затем отправьте только очищенные generic-файлы через `/api/upload`.
      </PageHeader>

      <UploadDropzone
        photos={photos}
        isBusy={isBusy}
        isBuffering={isBuffering}
        onFiles={onFiles}
        onFolderFiles={onFolderFiles}
        onPickFolder={onPickFolder}
        onDropItems={onDropItems}
        onCancelFolderImport={onCancelFolderImport}
        onOpenSettings={onOpenSettings}
        folderImport={folderImport}
      />

      {isBuffering && <LoadingState title="Подготовка фотографий">Создаются стабильные копии и миниатюры в памяти браузера.</LoadingState>}

      {photos.length > 0 && (
        <section className="run-card sticky-action-panel">
          <div>
            <p className="page-eyebrow">Действия</p>
            <h3>Этапы проверки</h3>
            <p>{UPLOAD_RULES_EXPLANATION}</p>
          </div>
          <div className="run-actions action-grid">
            <button type="button" className="button-secondary" onClick={() => onRun({ gps: true, cleanup: false, upload: false }, 'Распознавание координат')} disabled={isBusy || !hasStableFiles}>Только OCR</button>
            <button type="button" className="button-secondary" onClick={() => onRun({ gps: false, cleanup: true, upload: false }, 'Очистка metadata')} disabled={isBusy || !hasStableFiles}>Очистить metadata</button>
            <button type="button" className="button-secondary" onClick={() => onRun({ gps: false, cleanup: false, upload: true }, 'Загрузка очищенных')} disabled={isBusy || !providerValidation.valid || !hasCleanedPhotos}>Загрузить очищенные</button>
            <button type="button" onClick={() => onRun({ gps: true, cleanup: true, upload: true }, 'Полная обработка')} disabled={isBusy || !providerValidation.valid || !hasStableFiles}>Полная обработка</button>
            {!hasUploadedPhotos && mode === 'done' && <button type="button" className="button-secondary danger-ghost-button" onClick={onClearResult}>Очистить результат</button>}
          </div>
          {!providerValidation.valid && <p className="settings-error">{providerValidation.error}</p>}
        </section>
      )}

      <JobProgress photos={photos} />
      <DistanceSummary photos={photos} thresholdMeters={thresholdMeters} />

      {photos.length === 0 ? (
        <EmptyState title="Фотографии ещё не выбраны" icon="upload">
          Перетащите изображения в область загрузки или нажмите «Выбрать фотографии».
        </EmptyState>
      ) : (
        <section className="photo-grid" aria-label="Выбранные фотографии" aria-live="polite">
          {photos.map((photo) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              editingDisabled={isBusy}
              onRemove={onRemovePhoto}
              onApplyCoordinates={onApplyCoordinates}
              onApplyIndex={onApplyIndex}
              onSwapCoordinates={onSwapCoordinates}
              onOpenOnMap={onOpenOnMap}
              providerSettings={providerSettings}
            />
          ))}
        </section>
      )}
    </>
  );
}

function MapScreen({ photos, thresholdMeters, providerSettings, focusPhotoId, onNavigateUpload }) {
  return (
    <>
      <PageHeader
        eyebrow="Карта"
        title="Точки и расстояния"
        actions={<button type="button" className="button-secondary" onClick={onNavigateUpload}><Icon name="upload" size={18} /> Загрузка</button>}
      >
        Маркеры используют OCR-индекс, статусы low_precision/suspicious и текущие конфликты расстояний. Расчёты не менялись.
      </PageHeader>
      <MapPanel
        photos={photos}
        thresholdMeters={thresholdMeters}
        providerSettings={providerSettings}
        focusPhotoId={focusPhotoId}
      />
    </>
  );
}

export default function App() {
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState([]);
  const [mode, setMode] = useState('idle');
  const [folderImport, setFolderImport] = useState({ status: FOLDER_IMPORT_STATUSES.IDLE, report: null, error: '' });
  const [savedSession, setSavedSession] = useState(() => loadLastSession());
  const [sessionMeta, setSessionMeta] = useState(null);
  const [providerSettings, setProviderSettings] = useState({ ...DEFAULT_PROVIDER_SETTINGS });
  const [regionMode, setRegionMode] = useState('auto');
  const [thresholdMeters, setThresholdMeters] = useState(() => Number(loadLastSession()?.thresholdMeters) || DEFAULT_DISTANCE_THRESHOLD_METERS);
  const [activeScreen, setActiveScreen] = useState(DEFAULT_SCREEN);
  const [mapFocusPhotoId, setMapFocusPhotoId] = useState(null);
  const [journal, setJournal] = useState([]);
  const [activeSince, setActiveSince] = useState(null);
  const [sessionDiagnostics, setSessionDiagnostics] = useState(() => getSessionDiagnostics());
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const folderImportAbortRef = useRef(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const debugMode = useMemo(debugModeFromLocation, []);
  const providerValidation = useMemo(() => validateProviderSettings(providerSettings), [providerSettings]);
  const folderImportBusy = [
    FOLDER_IMPORT_STATUSES.SELECTING,
    FOLDER_IMPORT_STATUSES.SCANNING,
    FOLDER_IMPORT_STATUSES.ADDING,
  ].includes(folderImport.status);
  const isBusy = mode === 'buffering' || mode === 'running' || folderImportBusy;
  const hasUploadedPhotos = photos.some((photo) => photo.uploadResult?.links?.length > 0);
  const hasRestoredPhotos = photos.some((photo) => photo.restored);
  const canRunFullCheck = photos.some((photo) => photo.stableFile);
  const visibleSessions = useMemo(() => buildVisibleSessions({ sessionMeta, photos, savedSession }), [sessionMeta, photos, savedSession]);

  const addLog = (message, type = 'info') => setJournal((current) => [...current, {
    id: `${Date.now()}-${Math.random()}`, time: new Date().toLocaleTimeString('ru-RU'), message, type,
  }].slice(-200));

  const notifyImportReady = (source, batchPhotos) => {
    try {
      globalThis.__gpsImportTestSink?.({
        source,
        photos: (batchPhotos || []).map((photo) => ({
          fileName: photo.fileName,
          relativePath: photo.relativePath || '',
          stableFileName: photo.stableFile?.name || '',
          stableFileType: photo.stableFile?.type || '',
          stableFileIsFile: typeof File !== 'undefined' && photo.stableFile instanceof File,
        })),
      });
    } catch {
      // Test-only diagnostics must never affect the user flow.
    }
  };

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
    relativePath: photo.relativePath,
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
  const modeAfterImport = () => (photosRef.current.length > 0 ? 'ready' : 'idle');

  const folderImportCancelled = (error) => (
    error?.name === 'AbortError'
    || error?.code === 20
    || /aborted|cancel/i.test(String(error?.message || ''))
  );

  const handleFilesSelected = async (selectedFiles) => {
    const files = Array.from(selectedFiles || []);
    if (files.length === 0) return;
    setMode('buffering');
    setFolderImport({ status: FOLDER_IMPORT_STATUSES.IDLE, report: null, error: '' });
    setErrors([]);
    clearCurrentPhotos();
    deleteLastSession();
    setPhotos([]);
    setSavedSession(null);
    setActiveScreen('upload');

    try {
      const buffered = await bufferSelectedFiles(files);
      const nextBatch = replacePhotoBatch([], buffered.bufferedFiles);
      setPhotos(nextBatch.photos);
      notifyImportReady('files', nextBatch.photos);
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

  const finishPreparedFolderImport = async (prepared, controller) => {
    const addingReport = createFolderImportReport({ ...prepared.report, status: FOLDER_IMPORT_STATUSES.ADDING });
    setFolderImport({ status: FOLDER_IMPORT_STATUSES.ADDING, report: addingReport, error: '' });
    setMode('buffering');

    if (prepared.files.length === 0) {
      const doneReport = createFolderImportReport({ ...prepared.report, status: FOLDER_IMPORT_STATUSES.DONE });
      setFolderImport({ status: FOLDER_IMPORT_STATUSES.DONE, report: doneReport, error: '' });
      setMode(modeAfterImport());
      addLog(`Папка ${doneReport.folderName}: найдено ${doneReport.foundFiles}, добавлено 0, пропущено ${doneReport.skippedFiles}.`, 'warning');
      return;
    }

    const buffered = await bufferSelectedFiles(prepared.files, { signal: controller.signal });
    const finalReport = applyBufferResultToFolderReport(prepared.report, buffered);
    const nextBatch = replacePhotoBatch([], buffered.bufferedFiles);

    clearCurrentPhotos();
    deleteLastSession();
    setPhotos(nextBatch.photos);
    notifyImportReady('folder', nextBatch.photos);
    setSavedSession(null);
    setActiveScreen('upload');
    setSessionMeta(newSessionMeta(finalReport.folderName));
    setErrors(buffered.errors);
    setFolderImport({ status: FOLDER_IMPORT_STATUSES.DONE, report: finalReport, error: '' });
    setMode(nextBatch.photos.length > 0 ? 'ready' : 'idle');
    addLog(`Папка ${finalReport.folderName}: найдено ${finalReport.foundFiles}, добавлено ${finalReport.addedPhotos}, пропущено ${finalReport.skippedFiles}.`, finalReport.addedPhotos > 0 ? 'success' : 'warning');
  };

  const runFolderImport = async (loadPrepared, initialReport) => {
    const controller = new AbortController();
    folderImportAbortRef.current = controller;
    setErrors([]);
    setMode(modeAfterImport());
    setFolderImport({
      status: initialReport?.status || FOLDER_IMPORT_STATUSES.SCANNING,
      report: initialReport || null,
      error: '',
    });

    try {
      const prepared = await loadPrepared(controller.signal);
      if (controller.signal.aborted) {
        const error = new Error('Folder import was cancelled.');
        error.name = 'AbortError';
        throw error;
      }
      await finishPreparedFolderImport(prepared, controller);
    } catch (error) {
      if (folderImportCancelled(error)) {
        const report = initialReport
          ? createFolderImportReport({ ...initialReport, status: FOLDER_IMPORT_STATUSES.CANCELLED })
          : null;
        setFolderImport({ status: FOLDER_IMPORT_STATUSES.CANCELLED, report, error: '' });
        setMode(modeAfterImport());
        addLog('Импорт папки отменён', 'warning');
      } else {
        setFolderImport({
          status: FOLDER_IMPORT_STATUSES.ERROR,
          report: initialReport || null,
          error: 'Не удалось выбрать или прочитать папку.',
        });
        setErrors(['Не удалось выбрать или прочитать папку. Выберите другую физическую папку или отдельные фотографии.']);
        setMode(modeAfterImport());
        addLog('Импорт папки: ошибка', 'error');
        if (debugMode) console.error(error);
      }
    } finally {
      if (folderImportAbortRef.current === controller) folderImportAbortRef.current = null;
    }
  };

  const handlePickFolder = async () => {
    await runFolderImport(async (signal) => {
      setFolderImport({ status: FOLDER_IMPORT_STATUSES.SELECTING, report: null, error: '' });
      const directoryHandle = await requestDirectoryHandle();
      const scanningReport = createFolderImportReport({
        status: FOLDER_IMPORT_STATUSES.SCANNING,
        folderName: directoryHandle?.name || 'Выбранная папка',
        source: 'showDirectoryPicker',
      });
      setFolderImport({ status: FOLDER_IMPORT_STATUSES.SCANNING, report: scanningReport, error: '' });
      return prepareFolderImportFromDirectoryHandle(directoryHandle, { signal });
    }, createFolderImportReport({ status: FOLDER_IMPORT_STATUSES.SELECTING }));
  };

  const handleFolderFilesSelected = async (selectedFiles) => {
    const files = Array.from(selectedFiles || []);
    if (files.length === 0) {
      setFolderImport({ status: FOLDER_IMPORT_STATUSES.CANCELLED, report: null, error: '' });
      return;
    }
    const initialReport = createFolderImportReport({ status: FOLDER_IMPORT_STATUSES.SCANNING, source: 'input' });
    await runFolderImport(async () => prepareFolderImportFromFileList(files, { source: 'input' }), initialReport);
  };

  const handleDropItems = async (dataTransfer) => {
    const items = Array.from(dataTransfer?.items || []);
    if (items.length === 0) return false;

    let prepared;
    const controller = new AbortController();
    folderImportAbortRef.current = controller;
    try {
      prepared = await prepareFolderImportFromDataTransfer(dataTransfer, { signal: controller.signal });
    } catch (error) {
      folderImportAbortRef.current = null;
      if (debugMode) console.error(error);
      return false;
    }

    if (!prepared.hasDirectory) {
      folderImportAbortRef.current = null;
      return false;
    }

    setErrors([]);
    try {
      await finishPreparedFolderImport(prepared, controller);
    } catch (error) {
      if (folderImportCancelled(error)) {
        setFolderImport({ status: FOLDER_IMPORT_STATUSES.CANCELLED, report: prepared.report, error: '' });
        setMode(modeAfterImport());
      } else {
        setFolderImport({ status: FOLDER_IMPORT_STATUSES.ERROR, report: prepared.report, error: 'Не удалось обработать перетащенную папку.' });
        setErrors(['Не удалось обработать перетащенную папку.']);
        setMode(modeAfterImport());
        if (debugMode) console.error(error);
      }
    } finally {
      if (folderImportAbortRef.current === controller) folderImportAbortRef.current = null;
    }
    return true;
  };

  const handleCancelFolderImport = () => {
    folderImportAbortRef.current?.abort();
    setFolderImport((current) => ({
      status: FOLDER_IMPORT_STATUSES.CANCELLED,
      report: current.report ? createFolderImportReport({ ...current.report, status: FOLDER_IMPORT_STATUSES.CANCELLED }) : null,
      error: '',
    }));
    setMode(modeAfterImport());
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
        setSessionMeta({
          sessionId: snapshot.sessionId,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
          name: snapshot.name || sessionMeta?.name || '',
        });
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
    setActiveScreen(normalizeScreen(savedSession.activeScreen || 'results'));
    setSessionMeta({ sessionId: savedSession.sessionId, createdAt: savedSession.createdAt, updatedAt: savedSession.updatedAt, name: savedSession.name || '' });
    setErrors([]);
    setFolderImport({ status: FOLDER_IMPORT_STATUSES.IDLE, report: null, error: '' });
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

  const performClearResult = () => {
    clearCurrentPhotos();
    deleteLastSession();
    setPhotos([]);
    setErrors([]);
    setFolderImport({ status: FOLDER_IMPORT_STATUSES.IDLE, report: null, error: '' });
    setMode('idle');
    setSessionMeta(null);
    setSavedSession(null);
    setMapFocusPhotoId(null);
    setConfirmClearOpen(false);
    addLog('Сессия очищена', 'warning');
  };

  const handleRemovePhoto = (photoId) => {
    const current = photosRef.current;
    const removed = current.find((photo) => photo.id === photoId);
    if (!removed || isBusy) return;
    releasePhotoBuffers(removed);
    const remaining = current.filter((photo) => photo.id !== photoId);
    const distanceResult = calculateDistances(remaining, thresholdMeters);
    const next = remaining.map((photo) => ({
      ...photo,
      ...(distanceResult.byPhotoId.get(photo.id) || { distanceStatus: 'missing_coordinates', distanceConflicts: [] }),
    }));
    setPhotos(next);
    if (next.length === 0) {
      deleteLastSession();
      setSessionMeta(null);
      setSavedSession(null);
      setMode('idle');
    }
    addLog(`Фото удалено: ${removed.fileName}`);
  };

  const handleManualCoordinates = (photoId, latitude, longitude) => {
    const coordinates = normalizeCoordinates(latitude, longitude);
    if (!coordinates) return false;

    setPhotos((current) => applyManualCoordinateCorrection(current, photoId, coordinates, (items) => (
      calculateDistances(items, thresholdMeters)
    )));
    addLog('Координаты сохранены вручную', 'success');
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
    addLog('Индекс точки сохранён', 'success');
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

  const navigate = (screen) => setActiveScreen(normalizeScreen(screen));

  return (
    <AppShell
      activeScreen={activeScreen}
      onScreenChange={navigate}
      photoCount={photos.length}
      isBusy={isBusy}
      footer={(
        <footer className="app-footer">
          <p className="privacy-note">После успешной загрузки приложение очищает внутренний буфер. Исходные файлы на устройстве не удаляются.</p>
        </footer>
      )}
    >
      {debugMode && <div className="debug-mode-banner">Включён режим диагностики</div>}
      {debugMode && <pre className="session-debug">{JSON.stringify(sessionDiagnostics, null, 2)}</pre>}
      <ErrorBanner messages={errors} />
      <LastSessionPrompt session={savedSession} onRestore={handleRestore} onDelete={handleDeleteSaved} />
      {hasRestoredPhotos && (
        <aside className="notice notice-neutral">
          Восстановлен сохранённый результат без исходных файлов и без доступа к локальной папке. Для нового cleanup или upload выберите фотографии заново.
        </aside>
      )}

      {activeScreen === 'dashboard' && (
        <Dashboard
          photos={photos}
          sessions={visibleSessions}
          journal={journal}
          isBusy={isBusy}
          canRunFullCheck={canRunFullCheck}
          onNavigate={navigate}
          onRunFullCheck={() => handleRun({ gps: true, cleanup: true, upload: true }, 'Полная обработка')}
        />
      )}

      {activeScreen === 'upload' && (
        <UploadScreen
          photos={photos}
          mode={mode}
          isBusy={isBusy}
          providerValidation={providerValidation}
          hasUploadedPhotos={hasUploadedPhotos}
          providerSettings={providerSettings}
          thresholdMeters={thresholdMeters}
          onFiles={handleFilesSelected}
          onFolderFiles={handleFolderFilesSelected}
          onPickFolder={handlePickFolder}
          onDropItems={handleDropItems}
          onCancelFolderImport={handleCancelFolderImport}
          onRun={handleRun}
          onClearResult={() => setConfirmClearOpen(true)}
          onApplyCoordinates={handleManualCoordinates}
          onApplyIndex={handleManualIndex}
          onSwapCoordinates={handleSwapCoordinates}
          onRemovePhoto={handleRemovePhoto}
          onOpenOnMap={handleOpenOnMap}
          onOpenSettings={() => navigate('settings')}
          folderImport={folderImport}
        />
      )}

      {activeScreen === 'map' && (
        <MapScreen
          photos={photos}
          thresholdMeters={thresholdMeters}
          providerSettings={providerSettings}
          focusPhotoId={mapFocusPhotoId}
          onNavigateUpload={() => navigate('upload')}
        />
      )}

      {activeScreen === 'results' && (
        <ResultsScreen
          photos={photos}
          providerSettings={providerSettings}
          isBusy={isBusy}
          onClear={() => setConfirmClearOpen(true)}
          onApplyIndex={handleManualIndex}
          onApplyCoordinates={handleManualCoordinates}
          onSwapCoordinates={handleSwapCoordinates}
          onOpenOnMap={handleOpenOnMap}
          onOpenPhoto={handleOpenPhoto}
          onRemovePhoto={handleRemovePhoto}
          onNavigateUpload={() => navigate('upload')}
        />
      )}

      {activeScreen === 'sessions' && (
        <SessionsScreen
          sessions={visibleSessions}
          savedSession={savedSession}
          onOpenSession={() => navigate('results')}
          onRestoreSaved={handleRestore}
          onDeleteSaved={handleDeleteSaved}
          onNavigateUpload={() => navigate('upload')}
        />
      )}

      {activeScreen === 'journal' && (
        <JournalScreen
          entries={journal}
          activeSince={activeSince}
          onClear={() => setJournal([])}
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
          onRequestClearSession={() => setConfirmClearOpen(true)}
        />
      )}

      <ConfirmDialog
        open={confirmClearOpen}
        title="Очистить текущую сессию?"
        confirmLabel="Очистить"
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={performClearResult}
      >
        Фотографии, результаты OCR, ссылки и последняя локальная сессия будут удалены из состояния приложения и `localStorage`.
      </ConfirmDialog>
    </AppShell>
  );
}
