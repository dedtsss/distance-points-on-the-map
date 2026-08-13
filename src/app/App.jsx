import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dropdown, Space, Tabs } from 'antd';
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
import ReserveScreen from '../components/ReserveScreen.jsx';
import SessionWizard from '../components/SessionWizard.jsx';
import SessionsScreen from '../components/SessionsScreen.jsx';
import SettingsScreen from '../components/SettingsScreen.jsx';
import UploadDropzone from '../components/UploadDropzone.jsx';
import { recommendReserveForConflicts } from '../features/session/conflictResolver.js';
import {
  createSession,
  getReserveItems,
  withPhotoWorkStatus,
} from '../features/session/sessionDomain.js';
import {
  createStoredSession,
  deleteStoredSession,
  getNextSessionNumber,
  listStoredSessions,
  restoreStoredSession,
  saveSessionRecord,
  sessionStorageDiagnostics,
} from '../features/session/sessionRepository.js';
import {
  createD1SessionAdapter,
} from '../features/session/d1SessionAdapter.js';
import { findLocalSessionsForD1Import, importLocalSessionsToD1, isD1MigrationComplete } from '../features/session/sessionMigration.js';
import { loadCrmSettings, saveCrmSettings } from '../features/settings/settingsStore.js';
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
import { loadExportDescription } from '../features/export/exportPreferences.js';
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

const newSessionMeta = (input = {}) => createSession({
  sessionNumber: input.sessionNumber || getNextSessionNumber(),
  description: input.description ?? loadExportDescription(),
  ...input,
});

const sessionMetaFromRecord = (record) => {
  const { photos: _photos, ...meta } = record || {};
  return { ...meta, persisted: true };
};

const screenForStage = (stage) => ({ map: 'map' }[stage] || 'session');
const stageForScreen = (screen) => ({ map: 'review' }[screen] || 'select');

const debugModeFromLocation = () => (
  typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('debug') === '1'
);

function UploadScreen({
  photos,
  session,
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
  onSessionChange,
  onStartNewSession,
  onStageChange,
  onToggleReserve,
  stage = 'select',
  onAdvance,
}) {
  const hasStableFiles = photos.some((photo) => photo.stableFile);
  const hasCleanedPhotos = photos.some((photo) => photo.cleanedBlob);
  const isBuffering = mode === 'buffering' || folderImport?.status === FOLDER_IMPORT_STATUSES.ADDING;

  return (
    <>
      <SessionWizard
        session={session}
        photoCount={photos.length}
        isBusy={isBusy}
        onSessionChange={onSessionChange}
        onStartNew={onStartNewSession}
        onStageChange={onStageChange}
        onPrimary={onAdvance}
      />
      {stage === 'select' && <PageHeader
        eyebrow="Загрузка и проверка"
        title="Новая проверка фотографий"
        actions={null}
      >
        Выберите фотографии, проверьте OCR координат и индекса, затем отправьте только очищенные generic-файлы через `/api/upload`.
      </PageHeader>}

      {stage === 'select' && <UploadDropzone
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
      />}

      {isBuffering && <LoadingState title="Подготовка фотографий">Создаются стабильные копии и миниатюры в памяти браузера.</LoadingState>}

      {photos.length > 0 && stage !== 'select' && (
        <section className="run-card sticky-action-panel">
          <div>
            <p className="page-eyebrow">Действия</p>
            <h3>{stage === 'recognition' ? 'Распознавание EXIF / GPS / OCR' : stage === 'review' ? 'Проверка и metadata cleanup' : 'Загрузка и результат'}</h3>
            <p>{UPLOAD_RULES_EXPLANATION}</p>
          </div>
          <Space wrap>
            {stage === 'recognition' && <Button onClick={() => onRun({ gps: true, cleanup: false, upload: false }, 'Распознавание координат')} disabled={isBusy || !hasStableFiles}>Запустить / повторить OCR</Button>}
            {stage === 'review' && <Button onClick={() => onRun({ gps: false, cleanup: true, upload: false }, 'Очистка metadata')} disabled={isBusy || !hasStableFiles}>Очистить metadata</Button>}
            {stage === 'result' && <Button onClick={() => onRun({ gps: false, cleanup: false, upload: true }, 'Загрузка очищенных')} disabled={isBusy || !providerValidation.valid || !hasCleanedPhotos}>Загрузить очищенные</Button>}
            <Dropdown menu={{ items: [{ key: 'ocr', label: 'Только OCR' }, { key: 'cleanup', label: 'Очистить metadata' }], onClick: ({ key }) => onRun(key === 'ocr' ? { gps: true, cleanup: false, upload: false } : { gps: false, cleanup: true, upload: false }, key === 'ocr' ? 'Только OCR' : 'Очистка metadata') }}><Button>Расширенные действия</Button></Dropdown>
            {!hasUploadedPhotos && mode === 'done' && <Button danger onClick={onClearResult}>Очистить результат</Button>}
          </Space>
          {!providerValidation.valid && <p className="settings-error">{providerValidation.error}</p>}
        </section>
      )}

      {stage !== 'select' && <JobProgress photos={photos} />}
      {stage !== 'select' && <DistanceSummary photos={photos} thresholdMeters={thresholdMeters} />}

      {stage === 'select' && photos.length === 0 ? (
        <EmptyState title="Фотографии ещё не выбраны" icon="upload">
          Перетащите изображения в область загрузки или нажмите «Выбрать фотографии».
        </EmptyState>
      ) : photos.length > 0 && (
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
              onToggleReserve={onToggleReserve}
            />
          ))}
        </section>
      )}
    </>
  );
}

function MapScreen({
  photos,
  thresholdMeters,
  providerSettings,
  focusPhotoId,
  onNavigateUpload,
  mapLayerId,
  onMapLayerChange,
  recommendation,
  onApplyRecommendation,
  onToggleReserve,
}) {
  return (
    <>
      <PageHeader
        eyebrow="Карта"
        title="Точки и расстояния"
        actions={<button type="button" className="button-secondary" onClick={onNavigateUpload}><Icon name="upload" size={18} /> Загрузка</button>}
      >
        Маркеры используют OCR-индекс, статусы quality и конфликтную сеть только ACTIVE-точек. RESERVE остаётся на карте, но не участвует в конфликте.
      </PageHeader>
      <MapPanel
        photos={photos}
        thresholdMeters={thresholdMeters}
        providerSettings={providerSettings}
        focusPhotoId={focusPhotoId}
        mapLayerId={mapLayerId}
        onMapLayerChange={onMapLayerChange}
        recommendation={recommendation}
        onApplyRecommendation={onApplyRecommendation}
        onToggleReserve={onToggleReserve}
      />
    </>
  );
}

export default function App() {
  const [crmSettings, setCrmSettings] = useState(() => loadCrmSettings());
  const [photos, setPhotos] = useState([]);
  const [errors, setErrors] = useState([]);
  const [mode, setMode] = useState('idle');
  const [folderImport, setFolderImport] = useState({ status: FOLDER_IMPORT_STATUSES.IDLE, report: null, error: '' });
  const [savedSession, setSavedSession] = useState(() => loadLastSession());
  const [sessions, setSessions] = useState(() => listStoredSessions());
  const [sessionMeta, setSessionMeta] = useState(() => newSessionMeta({
    sessionNumber: getNextSessionNumber(),
    description: loadExportDescription(),
  }));
  const [providerSettings, setProviderSettings] = useState({ ...DEFAULT_PROVIDER_SETTINGS });
  const [regionMode, setRegionMode] = useState('auto');
  const [thresholdMeters, setThresholdMeters] = useState(() => Number(loadLastSession()?.thresholdMeters) || crmSettings.distanceThresholdMeters || DEFAULT_DISTANCE_THRESHOLD_METERS);
  const [processingSettings, setProcessingSettings] = useState(() => ({
    metadataCleanup: crmSettings.metadataCleanup,
    renameFiles: crmSettings.renameFiles,
    metadataFirst: crmSettings.metadataFirst,
  }));
  const [mapLayerId, setMapLayerId] = useState(() => crmSettings.mapLayerId || 'hybrid');
  const [activeScreen, setActiveScreen] = useState(DEFAULT_SCREEN);
  const [mapFocusPhotoId, setMapFocusPhotoId] = useState(null);
  const [journal, setJournal] = useState([]);
  const [activeSince, setActiveSince] = useState(null);
  const [sessionDiagnostics, setSessionDiagnostics] = useState(() => getSessionDiagnostics());
  const [storageDiagnostics, setStorageDiagnostics] = useState(() => sessionStorageDiagnostics());
  const [remoteState, setRemoteState] = useState({ status: 'loading', error: '', unsynced: false });
  const [localMigration, setLocalMigration] = useState({ status: 'idle', candidates: [], imported: 0, error: '' });
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const folderImportAbortRef = useRef(null);
  const photosRef = useRef(photos);
  const d1AdapterRef = useRef(null);
  const remotePersistenceQueueRef = useRef(Promise.resolve());
  const hydrationRef = useRef(false);
  photosRef.current = photos;
  if (!d1AdapterRef.current) d1AdapterRef.current = createD1SessionAdapter();
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
  const currentSession = useMemo(() => ({
    ...sessionMeta,
    photos,
    providerSettings,
    processingSettings,
    thresholdMeters,
    regionMode,
    mapLayerId,
  }), [sessionMeta, photos, providerSettings, processingSettings, thresholdMeters, regionMode, mapLayerId]);
  const visibleSessions = useMemo(() => {
    const includeCurrent = Boolean(sessionMeta?.persisted || photos.length > 0);
    const rest = sessions.filter((session) => session.sessionId !== sessionMeta?.sessionId);
    const combined = includeCurrent ? [currentSession, ...rest] : rest;
    return combined.sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
  }, [sessions, currentSession, sessionMeta?.persisted, sessionMeta?.sessionId, photos.length]);
  const conflictRecommendation = useMemo(() => recommendReserveForConflicts(photos, thresholdMeters), [photos, thresholdMeters]);
  const reserveItems = useMemo(() => getReserveItems(visibleSessions), [visibleSessions]);

  const addLog = (message, type = 'info') => setJournal((current) => [...current, {
    id: `${Date.now()}-${Math.random()}`, time: new Date().toLocaleTimeString('ru-RU'), message, type,
  }].slice(-200));

  const remoteStateRef = useRef(remoteState);
  remoteStateRef.current = remoteState;

  const replaceRemoteSession = (record) => {
    if (!record?.sessionId) return;
    setSessions((current) => [record, ...current.filter((item) => item.sessionId !== record.sessionId)]
      .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''))));
  };

  const persistSessionRecord = async (draft) => {
    const localRecord = saveSessionRecord(draft);
    const backupPhotos = Array.isArray(draft?.photos) ? draft.photos : photosRef.current;
    const backupActiveScreen = draft?.activeScreen || activeScreen;
    saveLastSession({
      ...localRecord,
      activeScreen: backupActiveScreen,
      processingSettings: localRecord.processingSettings || processingSettings,
      photos: backupPhotos,
    });
    setSessions((current) => [localRecord, ...current.filter((item) => item.sessionId !== localRecord.sessionId)]);
    setSessionDiagnostics(getSessionDiagnostics());

    if (remoteStateRef.current.status !== 'ready') {
      setRemoteState((current) => ({ ...current, unsynced: true }));
      setStorageDiagnostics({ ...sessionStorageDiagnostics(), backend: 'd1', syncState: 'unsynced' });
      return { record: localRecord, remote: false, error: new Error('Server persistence is not available.') };
    }

    const saveRemote = async () => {
      try {
        const remoteRecord = await d1AdapterRef.current.saveSession(localRecord);
        if (!remoteRecord?.sessionId) throw new Error('Server returned an invalid session record.');
        const syncedRecord = {
          ...localRecord,
          ...remoteRecord,
          photos: Array.isArray(remoteRecord.photos) ? remoteRecord.photos : localRecord.photos,
        };
        saveSessionRecord(syncedRecord, undefined, { forceSessionNumber: true });
        saveLastSession({
          ...syncedRecord,
          activeScreen: backupActiveScreen,
          photos: backupPhotos,
        });
        replaceRemoteSession(syncedRecord);
        setRemoteState({ status: 'ready', error: '', unsynced: false });
        setStorageDiagnostics({
          ...sessionStorageDiagnostics(),
          backend: 'd1',
          syncState: 'synced',
          serverUpdatedAt: syncedRecord.updatedAt,
        });
        return { record: syncedRecord, remote: true, error: null };
      } catch (error) {
        setRemoteState({ status: 'fallback', error: 'Изменения сохранены только локально: серверное хранилище недоступно.', unsynced: true });
        setStorageDiagnostics({ ...sessionStorageDiagnostics(), backend: 'd1', syncState: 'unsynced' });
        return { record: localRecord, remote: false, error };
      }
    };
    const queuedSave = remotePersistenceQueueRef.current.catch(() => undefined).then(saveRemote);
    remotePersistenceQueueRef.current = queuedSave.catch(() => undefined);
    return queuedSave;
  };

  useEffect(() => {
    let cancelled = false;
    const hydrateFromServer = async () => {
      try {
        const payload = await d1AdapterRef.current.listSessions();
        if (cancelled) return;
        const remoteSessions = payload.sessions || [];
        setSessions(remoteSessions);
        hydrationRef.current = true;
        setRemoteState({ status: 'ready', error: '', unsynced: false });
        setStorageDiagnostics({
          ...sessionStorageDiagnostics(),
          backend: 'd1',
          syncState: 'synced',
          sessionCount: remoteSessions.length,
          nextSessionNumber: payload.nextSessionNumber,
          dashboard: payload.dashboard,
        });
        if (!sessionMeta?.persisted && photosRef.current.length === 0 && payload.nextSessionNumber) {
          setSessionMeta((current) => ({ ...current, sessionNumber: payload.nextSessionNumber }));
        }
        const localCandidates = findLocalSessionsForD1Import(remoteSessions);
        if (localCandidates.length > 0 && !isD1MigrationComplete()) {
          setLocalMigration({ status: 'ready', candidates: localCandidates, imported: 0, error: '' });
        }
      } catch (error) {
        if (cancelled) return;
        hydrationRef.current = true;
        setSessions(listStoredSessions());
        setRemoteState({ status: 'fallback', error: 'Серверное хранилище недоступно. Локальная копия работает в режиме unsynced.', unsynced: true });
        setStorageDiagnostics({ ...sessionStorageDiagnostics(), backend: 'd1', syncState: 'unsynced', error: error?.message || 'remote_unavailable' });
      }
    };
    hydrateFromServer();
    return () => { cancelled = true; };
  // Server hydration is intentionally performed once for the current browser context.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleImportLocalSessions = async () => {
    if (localMigration.status === 'running' || localMigration.candidates.length === 0) return;
    setLocalMigration((current) => ({ ...current, status: 'running', error: '', imported: 0 }));
    let imported = 0;
    try {
      const importedRecords = await importLocalSessionsToD1({
        sessions: localMigration.candidates,
        adapter: d1AdapterRef.current,
        onProgress: (count, _total, record) => {
          imported = count;
          saveSessionRecord(record, undefined, { forceSessionNumber: true });
          replaceRemoteSession(record);
          setLocalMigration((current) => ({ ...current, imported }));
        },
      });
      const payload = await d1AdapterRef.current.listSessions();
      setSessions(payload.sessions || []);
      setRemoteState({ status: 'ready', error: '', unsynced: false });
      setStorageDiagnostics({ ...sessionStorageDiagnostics(), backend: 'd1', syncState: 'synced', sessionCount: payload.sessions?.length || 0, dashboard: payload.dashboard });
      setLocalMigration({ status: 'complete', candidates: [], imported: importedRecords.length, error: '' });
      addLog(`Локальные сессии перенесены в облако: ${imported}`, 'success');
    } catch (error) {
      setRemoteState({ status: 'fallback', error: 'Импорт не завершён: часть локальных сессий остаётся unsynced.', unsynced: true });
      setLocalMigration((current) => ({ ...current, status: 'error', imported, error: 'Не удалось завершить импорт. Повторите попытку — уже перенесённые сессии не задублируются.' }));
    }
  };

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
    workStatus: photo.workStatus,
    reserveReason: photo.reserveReason,
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

  const lastPersistedKeyRef = useRef('');
  useEffect(() => {
    if (!hydrationRef.current || !sessionMeta || (!sessionMeta.persisted && photos.length === 0)) return undefined;
    const persistKey = JSON.stringify({
      sessionId: sessionMeta.sessionId,
      sessionRevision,
      providerSettings,
      processingSettings,
      thresholdMeters,
      activeScreen,
      regionMode,
      mapLayerId,
    });
    if (lastPersistedKeyRef.current === persistKey) return undefined;
    lastPersistedKeyRef.current = persistKey;
    const timeoutId = globalThis.setTimeout(async () => {
      const result = await persistSessionRecord({
        ...sessionMeta,
        thresholdMeters,
        activeScreen,
        stage: sessionMeta.stage || stageForScreen(activeScreen),
        photos: photosRef.current,
        providerSettings,
        processingSettings,
        regionMode,
        mapLayerId,
      });
      if (result.remote) {
        setSessionMeta((current) => current?.sessionId === result.record.sessionId
          ? sessionMetaFromRecord(result.record)
          : current);
        setJournal((current) => current.at(-1)?.message === 'Сессия сохранена на сервере'
          ? current
          : [...current, { id: `${Date.now()}-session`, time: new Date().toLocaleTimeString('ru-RU'), message: 'Сессия сохранена на сервере', type: 'info' }].slice(-200));
      } else if (result.error) {
        setErrors((current) => current.includes('Сессия не синхронизирована с сервером.')
          ? current
          : [...current, 'Сессия не синхронизирована с сервером. Локальная копия сохранена как backup.']);
      }
    }, 100);
    return () => globalThis.clearTimeout(timeoutId);
  }, [sessionRevision, providerSettings, processingSettings, sessionMeta, thresholdMeters, activeScreen, regionMode, mapLayerId]);

  const clearCurrentPhotos = () => photosRef.current.forEach((photo) => releasePhotoBuffers(photo));
  const modeAfterImport = () => (photosRef.current.length > 0 ? 'ready' : 'idle');

  const selectStoredSession = (record, screen = null) => {
    if (!record) return false;
    clearCurrentPhotos();
    const restored = restoreStoredSession(record);
    setPhotos(restored.photos);
    setSessionMeta(sessionMetaFromRecord(record));
    setProviderSettings(normalizeProviderSettings(record.providerSettings || DEFAULT_PROVIDER_SETTINGS));
    setProcessingSettings(record.processingSettings || {
      metadataCleanup: crmSettings.metadataCleanup,
      renameFiles: crmSettings.renameFiles,
      metadataFirst: crmSettings.metadataFirst,
    });
    setThresholdMeters(Number(record.thresholdMeters) || DEFAULT_DISTANCE_THRESHOLD_METERS);
    setRegionMode(record.regionMode || 'auto');
    setMapLayerId(record.mapLayerId || 'hybrid');
    setErrors([]);
    setFolderImport({ status: FOLDER_IMPORT_STATUSES.IDLE, report: null, error: '' });
    setMode(restored.photos.length ? 'done' : 'idle');
    setActiveScreen(screen || screenForStage(record.stage));
    return true;
  };

  const beginNewSession = (input = {}) => {
    const record = createStoredSession({
      title: input.title || '',
      name: input.title || '',
      color: input.color || '',
      packing: input.packing || '',
      description: input.description ?? loadExportDescription(),
      thresholdMeters,
      providerSettings,
      processingSettings,
      regionMode,
      mapLayerId,
      stage: 'select',
    });
    setSessionMeta(sessionMetaFromRecord(record));
    setSessions(listStoredSessions());
    setStorageDiagnostics(sessionStorageDiagnostics());
    return record;
  };

  const ensureSessionForImport = (input = {}) => {
    const shouldReuseDraft = !sessionMeta?.persisted || photosRef.current.length === 0;
    const record = shouldReuseDraft
      ? saveSessionRecord({
        ...sessionMeta,
        title: input.title || sessionMeta?.title || sessionMeta?.name || '',
        name: input.title || sessionMeta?.title || sessionMeta?.name || '',
        photos: [],
        thresholdMeters,
        providerSettings,
        processingSettings,
        regionMode,
        mapLayerId,
        stage: 'select',
      })
      : beginNewSession({ title: input.title || '' });
    const meta = sessionMetaFromRecord(record);
    setSessionMeta(meta);
    setSessions(listStoredSessions());
    setStorageDiagnostics(sessionStorageDiagnostics());
    return meta;
  };

  const handleStartNewSession = () => {
    clearCurrentPhotos();
    setPhotos([]);
    setSavedSession(null);
    setErrors([]);
    setFolderImport({ status: FOLDER_IMPORT_STATUSES.IDLE, report: null, error: '' });
    beginNewSession();
    setMode('idle');
    setActiveScreen('session');
    addLog('Создана новая сессия', 'success');
  };

  const handleSessionChange = (patch) => {
    setSessionMeta((current) => ({
      ...current,
      ...patch,
      title: patch.title ?? current?.title,
      name: patch.name ?? patch.title ?? current?.name,
    }));
  };

  const handleProcessingSettingsChange = (next) => {
    const saved = saveCrmSettings({
      ...crmSettings,
      ...next,
      distanceThresholdMeters: thresholdMeters,
      mapLayerId,
    });
    setCrmSettings(saved);
    setProcessingSettings({
      metadataCleanup: saved.metadataCleanup,
      renameFiles: saved.renameFiles,
      metadataFirst: saved.metadataFirst,
    });
  };

  const handleMapLayerChange = (next) => {
    const saved = saveCrmSettings({ ...crmSettings, ...processingSettings, distanceThresholdMeters: thresholdMeters, mapLayerId: next });
    setCrmSettings(saved);
    setMapLayerId(saved.mapLayerId);
  };

  const folderImportCancelled = (error) => (
    error?.name === 'AbortError'
    || error?.code === 20
    || /aborted|cancel/i.test(String(error?.message || ''))
  );

  const handleFilesSelected = async (selectedFiles) => {
    const files = Array.from(selectedFiles || []);
    if (files.length === 0) return;
    const importSession = ensureSessionForImport();
    setMode('buffering');
    setFolderImport({ status: FOLDER_IMPORT_STATUSES.IDLE, report: null, error: '' });
    setErrors([]);
    clearCurrentPhotos();
    setPhotos([]);
    setActiveScreen('session');

    try {
      const buffered = await bufferSelectedFiles(files);
      const nextBatch = replacePhotoBatch([], buffered.bufferedFiles);
      setPhotos(nextBatch.photos);
      notifyImportReady('files', nextBatch.photos);
      setErrors(buffered.errors);
      setSessionMeta(importSession);
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

    const importSession = ensureSessionForImport({ title: prepared.report?.folderName || '' });
    const buffered = await bufferSelectedFiles(prepared.files, { signal: controller.signal });
    const finalReport = applyBufferResultToFolderReport(prepared.report, buffered);
    const nextBatch = replacePhotoBatch([], buffered.bufferedFiles);

    clearCurrentPhotos();
    setPhotos(nextBatch.photos);
    notifyImportReady('folder', nextBatch.photos);
    setSavedSession(null);
    setActiveScreen('session');
    setSessionMeta({ ...importSession, title: importSession.title || finalReport.folderName, name: importSession.name || finalReport.folderName });
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
    const automaticFullRun = stages.gps && stages.cleanup && stages.upload;
    const cleanupEnabled = stages.cleanup && (!automaticFullRun || processingSettings.metadataCleanup !== false);
    const effectiveStages = {
      ...stages,
      cleanup: cleanupEnabled,
      // The privacy boundary never uploads raw metadata. When cleanup is
      // disabled, the full run remains an OCR-only run until it is re-enabled.
      upload: stages.upload && (!stages.cleanup || cleanupEnabled),
    };
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
        processingSettings,
        stages: effectiveStages,
        onLog: (entry) => addLog(entry.message, entry.type),
        onPhotoUpdate: (photoId, patch) => {
          setPhotos((current) => current.map((photo) => photo.id === photoId ? { ...photo, ...patch } : photo));
        },
      });
      setPhotos(result.photos);
      const persistence = await persistSessionRecord({
        ...sessionMeta,
        thresholdMeters,
        activeScreen,
        stage: effectiveStages.upload ? 'result' : sessionMeta.stage || 'recognition',
        photos: result.photos,
        providerSettings,
        processingSettings,
        regionMode,
        mapLayerId,
      });
      setSessionMeta(sessionMetaFromRecord(persistence.record));
      if (!persistence.remote) setErrors((current) => [...new Set([...current, 'Обработка завершена, но результат не синхронизирован с сервером.'])]);
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
    if (!savedSession) return;
    const record = saveSessionRecord({
      ...savedSession,
      title: savedSession.title || savedSession.name || '',
      photos: savedSession.photos || [],
      stage: savedSession.stage || 'result',
    });
    selectStoredSession(record, normalizeScreen(savedSession.activeScreen || 'results'));
    setSavedSession(null);
    setSessionDiagnostics({ ...getSessionDiagnostics(), accepted: true });
    setStorageDiagnostics(sessionStorageDiagnostics());
    addLog(`Сессия восстановлена: ${savedSession.photos.length} фото`, 'success');
  };

  const handleDeleteSaved = () => {
    deleteLastSession();
    setSavedSession(null);
    setSessionDiagnostics(getSessionDiagnostics());
  };

  const performClearResult = async () => {
    const deletedSessionId = sessionMeta?.persisted ? sessionMeta.sessionId : '';
    let remoteDeleteConfirmed = !deletedSessionId;
    let deleteError = '';
    clearCurrentPhotos();
    deleteLastSession();
    if (deletedSessionId) {
      deleteStoredSession(deletedSessionId);
      if (remoteStateRef.current.status === 'ready') {
        try {
          await d1AdapterRef.current.deleteSession(deletedSessionId);
          remoteDeleteConfirmed = true;
        } catch {
          setRemoteState({ status: 'fallback', error: 'Сессия удалена локально, но сервер не подтвердил удаление.', unsynced: true });
          deleteError = 'Удаление не синхронизировано с сервером.';
        }
      } else {
        deleteError = 'Сессия удалена локально, но серверное удаление не подтверждено.';
      }
    }
    setPhotos([]);
    setErrors(deleteError ? [deleteError] : []);
    setFolderImport({ status: FOLDER_IMPORT_STATUSES.IDLE, report: null, error: '' });
    setMode('idle');
    setSessionMeta(newSessionMeta({ sessionNumber: getNextSessionNumber(), description: loadExportDescription() }));
    setSavedSession(null);
    if (deletedSessionId && remoteDeleteConfirmed) {
      setSessions((current) => current.filter((session) => session.sessionId !== deletedSessionId));
    } else if (!deletedSessionId) {
      setSessions(listStoredSessions());
    }
    setStorageDiagnostics(deletedSessionId
      ? { ...sessionStorageDiagnostics(), backend: 'd1', syncState: remoteDeleteConfirmed ? 'synced' : 'unsynced' }
      : sessionStorageDiagnostics());
    setMapFocusPhotoId(null);
    setConfirmClearOpen(false);
    addLog(deleteError ? 'Сессия очищена локально; серверное удаление не подтверждено' : 'Сессия очищена', 'warning');
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
    setCrmSettings(saveCrmSettings({ ...crmSettings, ...processingSettings, distanceThresholdMeters: next, mapLayerId }));
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

  const recalculateSessionPhotos = (items, threshold = thresholdMeters) => {
    const distanceResult = calculateDistances(items, threshold);
    return items.map((photo) => ({
      ...photo,
      ...(distanceResult.byPhotoId.get(photo.id) || { distanceStatus: 'missing_coordinates', distanceConflicts: [] }),
    }));
  };

  const handleToggleReserve = (photoId, shouldReserve, reason = '') => {
    setPhotos((current) => recalculateSessionPhotos(current.map((photo) => (
      photo.id === photoId
        ? withPhotoWorkStatus(photo, shouldReserve ? 'reserve' : 'active', reason || (shouldReserve ? 'Вручную переведено в RESERVE' : ''))
        : photo
    ))));
    addLog(shouldReserve ? 'Точка переведена в RESERVE' : 'Точка возвращена в ACTIVE', 'success');
  };

  const handleApplyRecommendation = (recommendation) => {
    const reserveIds = new Set(recommendation?.reservePhotoIds || []);
    if (reserveIds.size === 0) return;
    setPhotos((current) => recalculateSessionPhotos(current.map((photo) => (
      reserveIds.has(photo.id)
        ? withPhotoWorkStatus(photo, 'reserve', `Рекомендация конфликтов < ${thresholdMeters} м`)
        : photo
    ))));
    addLog(`Рекомендация применена: ${reserveIds.size} точек в RESERVE`, 'success');
  };

  const handleOpenStoredSession = (sessionId, screen = 'session') => {
    const record = sessions.find((session) => session.sessionId === sessionId)
      || listStoredSessions().find((session) => session.sessionId === sessionId);
    if (!record) return false;
    return selectStoredSession(record, screen);
  };

  const handleActivateReserveItem = (sessionId, photoId) => {
    if (sessionId === sessionMeta?.sessionId) {
      handleToggleReserve(photoId, false);
      return;
    }
    const record = sessions.find((session) => session.sessionId === sessionId)
      || listStoredSessions().find((session) => session.sessionId === sessionId);
    if (!record) return;
    const restored = restoreSessionPhotos(record);
    const nextPhotos = recalculateSessionPhotos(restored.map((photo) => (
      photo.id === photoId ? withPhotoWorkStatus(photo, 'active') : photo
    )), Number(record.thresholdMeters) || thresholdMeters);
    persistSessionRecord({ ...record, photos: nextPhotos }).then((result) => {
      if (result.remote) {
        addLog('RESERVE-точка возвращена в ACTIVE и сохранена на сервере', 'success');
      } else {
        setErrors((current) => [...new Set([...current, 'Изменение ACTIVE/RESERVE не синхронизировано с сервером.'])]);
        addLog('RESERVE-точка изменена локально; серверное сохранение не подтверждено', 'warning');
      }
    }).catch(() => {
      setErrors((current) => [...new Set([...current, 'Изменение ACTIVE/RESERVE не синхронизировано с сервером.'])]);
      addLog('Изменение ACTIVE/RESERVE не сохранено на сервере', 'error');
    });
  };

  const handleOpenPhoto = (photoId) => {
    setActiveScreen('session');
    if (typeof document !== 'undefined') {
      globalThis.setTimeout(() => document.getElementById(`photo-${photoId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
    }
  };

  const navigate = (screen) => setActiveScreen(normalizeScreen(screen));
  const handleWizardAdvance = async () => {
    const stage = currentSession.stage || 'select';
    if (stage === 'select') return handleSessionChange({ stage: 'recognition' });
    if (stage === 'recognition') {
      await handleRun({ gps: true, cleanup: false, upload: false }, 'Распознавание координат');
      return handleSessionChange({ stage: 'review' });
    }
    if (stage === 'review') {
      await handleRun({ gps: false, cleanup: true, upload: false }, 'Подготовка очищенных фото');
      return handleSessionChange({ stage: 'result' });
    }
    return handleRun({ gps: false, cleanup: false, upload: true }, 'Загрузка очищенных');
  };

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
      {remoteState.status === 'loading' && (
        <aside className="notice notice-neutral" role="status">Подключение к серверному хранилищу Dark Cat…</aside>
      )}
      {remoteState.status !== 'loading' && remoteState.status !== 'ready' && (
        <aside className="notice notice-warning" role="alert">
          <strong>Серверное хранилище недоступно.</strong> Новые изменения остаются локальным backup и помечены как unsynced. Повторите действие после восстановления связи.
        </aside>
      )}
      {localMigration.status === 'ready' && (
        <aside className="notice notice-neutral" role="status">
          <strong>Найдены локальные сессии.</strong> Перенести в облачное хранилище: {localMigration.candidates.length}.
          <button type="button" className="button-secondary" onClick={handleImportLocalSessions}>Перенести в облако</button>
        </aside>
      )}
      {localMigration.status === 'running' && (
        <aside className="notice notice-neutral" role="status">Перенос локальных сессий: {localMigration.imported} из {localMigration.candidates.length}…</aside>
      )}
      {localMigration.status === 'error' && <aside className="notice notice-warning" role="alert">{localMigration.error}</aside>}
      <LastSessionPrompt session={savedSession} onRestore={handleRestore} onDelete={handleDeleteSaved} />
      {hasRestoredPhotos && (
        <aside className="notice notice-neutral">
          Восстановлен сохранённый результат без исходных файлов и без доступа к локальной папке. Для нового cleanup или upload выберите фотографии заново.
        </aside>
      )}

      {activeScreen === 'overview' && (
        <Dashboard
          photos={photos}
          sessions={visibleSessions}
          journal={journal}
          isBusy={isBusy}
          canRunFullCheck={canRunFullCheck}
          onNavigate={navigate}
          onOpenSession={(sessionId) => handleOpenStoredSession(sessionId, 'session')}
          onRunFullCheck={() => navigate('session')}
        />
      )}

      {activeScreen === 'session' && currentSession.stage !== 'result' && (
        <UploadScreen
          photos={photos}
          session={currentSession}
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
          onSessionChange={handleSessionChange}
          onStartNewSession={handleStartNewSession}
          onStageChange={(stage) => {
            handleSessionChange({ stage });
            navigate(screenForStage(stage));
          }}
          onToggleReserve={handleToggleReserve}
          stage={currentSession.stage || 'select'}
          onAdvance={handleWizardAdvance}
        />
      )}

      {activeScreen === 'session' && currentSession.stage === 'result' && (
        <>
          <SessionWizard session={currentSession} photoCount={photos.length} isBusy={isBusy} onSessionChange={handleSessionChange} onStartNew={handleStartNewSession} onStageChange={(stage) => handleSessionChange({ stage })} onPrimary={handleWizardAdvance} />
          <ResultsScreen photos={photos} session={currentSession} providerSettings={providerSettings} isBusy={isBusy} onClear={() => setConfirmClearOpen(true)} onApplyIndex={handleManualIndex} onApplyCoordinates={handleManualCoordinates} onSwapCoordinates={handleSwapCoordinates} onOpenOnMap={handleOpenOnMap} onOpenPhoto={handleOpenPhoto} onRemovePhoto={handleRemovePhoto} onNavigateUpload={() => navigate('session')} onSessionChange={handleSessionChange} onToggleReserve={handleToggleReserve} />
        </>
      )}

      {activeScreen === 'map' && (
        <MapScreen
          photos={photos}
          thresholdMeters={thresholdMeters}
          providerSettings={providerSettings}
          focusPhotoId={mapFocusPhotoId}
          onNavigateUpload={() => navigate('session')}
          mapLayerId={mapLayerId}
          onMapLayerChange={handleMapLayerChange}
          recommendation={conflictRecommendation}
          onApplyRecommendation={handleApplyRecommendation}
          onToggleReserve={handleToggleReserve}
        />
      )}

      {activeScreen === 'history' && <Tabs className="history-tabs" items={[
        { key: 'sessions', label: 'Все сессии', children: <SessionsScreen sessions={visibleSessions} savedSession={savedSession} onOpenSession={(sessionId) => handleOpenStoredSession(sessionId, 'session')} onCreateSession={handleStartNewSession} onNavigateUpload={() => navigate('session')} /> },
        { key: 'reserve', label: `RESERVE (${reserveItems.length})`, children: <ReserveScreen reserveItems={reserveItems} onActivate={handleActivateReserveItem} onOpenSession={(sessionId) => handleOpenStoredSession(sessionId, 'session')} onOpenMap={(sessionId, photoId) => { if (handleOpenStoredSession(sessionId, 'map')) setMapFocusPhotoId(photoId); }} /> },
        { key: 'journal', label: 'Диагностика', children: <JournalScreen entries={journal} activeSince={activeSince} onClear={() => setJournal([])} /> },
      ]} />}

      {activeScreen === 'settings' && (
        <SettingsScreen
          providerSettings={providerSettings}
          onProviderSettingsChange={setProviderSettings}
          regionMode={regionMode}
          onRegionModeChange={setRegionMode}
          thresholdMeters={thresholdMeters}
          onThresholdMetersChange={handleThresholdMetersChange}
          processingSettings={processingSettings}
          onProcessingSettingsChange={handleProcessingSettingsChange}
          mapLayerId={mapLayerId}
          onMapLayerChange={handleMapLayerChange}
          storageDiagnostics={storageDiagnostics}
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
        Будет удалена только текущая сессия: её фото-метаданные, OCR, ссылки и локальная запись. Остальная история не изменится.
      </ConfirmDialog>
    </AppShell>
  );
}
