import React, { useEffect, useRef, useState } from 'react';
import { readPhoto } from './core/readPhoto.js';
import { splitBatch } from './core/batch.js';
import { groupPhotos, pointMembers, sourcePhotoCount, splitPoint, mergePoint, hasPublishedPoints, removeMember, moveMember, appendPhotos, restoreMemberPoint, restoreLastMember } from './core/photoPoints.js';
import { buildResultText } from './resultSummary.js';
import { DEFAULT_NINJABOX_RELAY_URL, onionBaseUrl, ninjaboxRelayUrl } from './core/publisher.js';
import { outgoingName, publishBatch } from './publishBatch.js';
import { buildGpx, buildPointGpx, hasPointCoordinates, resultBlocksForCopy, validResultPhotos } from './resultExports.js';
import { cleanImageForUpload } from './core/features/cleanup/cleanImageForUpload.js';
import { formatPhotoResultBlock } from './core/features/export/resultBlockFormatter.js';
import { hasAndroidFolderPicker, pickAndroidFolder, pickAndroidPhotos, readAndroidPhoto,
  saveAndroidRecovery, loadAndroidRecovery, clearAndroidRecovery } from './androidFolder.js';
import { checkForUpdate, clearUpdateState, installRelease, installedVersion, isAndroidUpdateAvailable, startUpdateDownload, updateState } from './update.js';
import { actionProgress, updateButton, updateProgress } from './progress.js';
import { recognizeAndroidStamp } from './nativeOcr.js';
import { copyResultBlocks, copyText, exportGpx, exportText, isNativeTextExport } from './androidText.js';
import { IonApp, IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonCard,
  IonCardContent, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption,
  IonSegment, IonSegmentButton, IonBadge, IonList, IonText, IonModal, IonProgressBar, IonFooter, IonActionSheet, IonSearchbar } from '@ionic/react';
import PhotoViewer from './PhotoViewer.jsx';
import changelog from '../CHANGELOG.md?raw';
import buildInfo from '../build-info.json';
import { releaseNotes } from './changelog.js';
import RecentField from './RecentField.jsx';
import { exportLocalSession } from './localSessionExport.js';
import { androidSessionDestination, hasSessionFolderExport } from './androidSessionExport.js';
import { activePoints, setPointRemoved, establishReviewSlots, reviewSections } from './pointState.js';

const imageFiles = (files) => [...files].filter((file) => file.type.startsWith('image/'))
  .sort((left, right) => (left.webkitRelativePath || left.name).localeCompare(right.webkitRelativePath || right.name));
const errorText = (error) => error instanceof Error ? error.message : String(error);
const WorkProgress = ({ progress }) => progress && <div className="progress-area" role="status" aria-live="polite">
  <span>{progress.label}{progress.itemPercent !== null
    ? ` · ${progress.itemPercent}% ${progress.kind === 'ninjabox' ? 'загрузки' : 'текущего фото'}` : ''}</span>
  <IonProgressBar type={progress.type} value={progress.value} buffer={progress.buffer}
    aria-label={progress.label} />
</div>;

export default function App() {
  const [files, setFiles] = useState([]);
  const [onion, setOnion] = useState('');
  const [publisher, setPublisher] = useState('none');
  const ninjaboxRelay = import.meta.env.VITE_NINJABOX_RELAY_URL || DEFAULT_NINJABOX_RELAY_URL;
  const [screen, setScreen] = useState('photos');
  const [version, setVersion] = useState(null);
  const [candidate, setCandidate] = useState(null);
  const [updateStatus, setUpdateStatus] = useState('');
  const [nativeUpdate, setNativeUpdate] = useState(null);
  const [session, setSession] = useState('');
  const [comment, setComment] = useState('');
  const [color, setColor] = useState('');
  const [packing, setPacking] = useState('');
  const [rows, setRows] = useState([]);
  const [split, setSplit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [txtOpen, setTxtOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [copyBusy, setCopyBusy] = useState(false);
  const [workProgress, setWorkProgress] = useState(null);
  const [resumeAvailable, setResumeAvailable] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [previews, setPreviews] = useState({});
  const previewsRef = useRef({});
  const [viewer, setViewer] = useState(null);
  const [photoAction, setPhotoAction] = useState(null);
  const [moveAction, setMoveAction] = useState(null);
  const [targetSearch, setTargetSearch] = useState('');
  const [pointAction, setPointAction] = useState(null);
  const appendInput = useRef(null);

  const rememberPreview = (id, file) => {
    const old = previewsRef.current[id];
    if (old) URL.revokeObjectURL(old);
    const url = URL.createObjectURL(file);
    previewsRef.current[id] = url;
    setPreviews({ ...previewsRef.current });
  };
  const clearPreviews = () => {
    Object.values(previewsRef.current).forEach((url) => URL.revokeObjectURL(url));
    previewsRef.current = {};
    setPreviews({});
  };
  useEffect(() => () => Object.values(previewsRef.current).forEach((url) => URL.revokeObjectURL(url)), []);

  useEffect(() => {
    let active = true;
    loadAndroidRecovery().then(async (saved) => {
      if (!saved || !active) return;
      setFiles(saved.files);
      setRows(saved.rows.every((point) => Number.isFinite(point.reviewSlot))
        ? saved.rows : establishReviewSlots(saved.rows, splitBatch(saved.rows)));
      setSplit(splitBatch(saved.rows));
      setPublisher(saved.publisher);
      setOnion(saved.onion || '');
      setSession(saved.session || '');
      setComment(saved.comment || '');
      setColor(saved.color || '');
      setPacking(saved.packing || '');
      setReviewing(saved.phase === 'review');
      setResumeAvailable(!['review', 'complete'].includes(saved.phase));
      const completed = activePoints(saved.rows).filter((row) => row.uploadResult?.links?.some((link) => link.provider === saved.publisher)).length;
      setStatus(saved.phase === 'complete' ? 'Обработка завершена.' : saved.phase === 'review' ? 'Проверьте точки перед публикацией.'
        : `${completed} из ${activePoints(saved.rows).length} точек готовы · можно продолжить`);
      for (const row of saved.rows.flatMap(pointMembers)) {
        if (!active) break;
        try {
          const file = await readAndroidPhoto(saved.files[row.number - 1]);
          const cleaned = await cleanImageForUpload(file, { orientation: row.orientation,
            preferredFilename: outgoingName(row, row.number) });
          if (active) rememberPreview(row.id, cleaned.ok ? cleaned.file : file);
        } catch { /* A missing preview does not hide the recovered link. */ }
      }
    }).catch((error) => { if (active) setStatus(`Восстановление: ${errorText(error)}`); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (screen !== 'about' || !isAndroidUpdateAvailable()) return undefined;
    let active = true;
    const poll = async () => {
      try {
        const state = await updateState();
        if (!active) return;
        setNativeUpdate(state);
        if (state.state === 'ready_to_install')
          setUpdateStatus((current) => current.includes('Разрешите установку') ? '' : current);
        if (state.state === 'failed') setUpdateStatus('');
        setCandidate(state.url && state.version
          ? { version: state.version, url: state.url, sha256: state.sha256 } : null);
      } catch (error) { if (active) setUpdateStatus(errorText(error)); }
    };
    poll();
    const timer = setInterval(() => { if (!document.hidden) poll(); }, 1000);
    const resume = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', resume);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', resume); };
  }, [screen]);

  const showAbout = async () => {
    setScreen('about');
    if (!isAndroidUpdateAvailable()) { setUpdateStatus('Обновление доступно в Android-приложении.'); return; }
    try { setVersion(await installedVersion()); }
    catch (error) { setUpdateStatus(errorText(error)); }
  };

  const checkUpdate = async () => {
    setUpdateStatus('Проверка обновлений…');
    try {
      const next = await checkForUpdate(version.versionName);
      setCandidate(next);
      setNativeUpdate(await (next ? updateState(next) : clearUpdateState()));
      setUpdateStatus(next ? '' : 'Обновлений нет.');
    } catch (error) { setUpdateStatus(`Проверка не удалась: ${errorText(error)}`); }
  };

  const downloadUpdate = async () => {
    setUpdateStatus('');
    try {
      const current = await updateState(candidate);
      const result = ['ready_to_install', 'permission_required'].includes(current.state)
        ? await installRelease() : await startUpdateDownload(candidate);
      setNativeUpdate(result);
      if (result.state === 'permission_required') setUpdateStatus('Разрешите установку из DarkCat Photo в Android. APK сохранён.');
      else if (result.state === 'ready_to_install') setUpdateStatus('APK проверен. Подтвердите установку в Android.');
    } catch (error) { setUpdateStatus(`Обновление отклонено: ${errorText(error)}`); }
  };

  const select = (event) => {
    clearPreviews();
    setFiles(imageFiles(event.target.files || []));
    setRows([]);
    setSplit(null);
    setResumeAvailable(false);
    setReviewing(false);
  };

  const selectAndroidFolder = async () => {
    try {
      const picked = await pickAndroidFolder();
        await clearAndroidRecovery();
      clearPreviews();
      setFiles(picked);
      setRows([]);
      setSplit(null);
      setResumeAvailable(false);
      setReviewing(false);
    } catch (error) { setStatus(`Папка: ${errorText(error)}`); }
  };

  const selectAndroidPhotos = async () => {
    try {
      const picked = await pickAndroidPhotos();
        await clearAndroidRecovery();
      clearPreviews();
      setFiles(picked);
      setRows([]);
      setSplit(null);
      setResumeAvailable(false);
      setReviewing(false);
    } catch (error) { setStatus(`Фото: ${errorText(error)}`); }
  };

  const fileAt = (index) => files[index].native ? readAndroidPhoto(files[index]) : files[index];

  const recoveryState = (current) => ({
    files: files.map(({ id, name, type, size, native }) => ({ id, name, type, size, native })),
    rows: current, publisher, onion, session, comment, color, packing, phase: reviewing ? 'review' : resumeAvailable ? 'publishing' : 'complete',
  });

  useEffect(() => {
    if (busy || !files.length || !rows.length) return undefined;
    const timer = setTimeout(() => {
      saveAndroidRecovery(recoveryState(rows)).catch((error) => setStatus(`Сохранение состояния: ${errorText(error)}`));
    }, 300);
    return () => clearTimeout(timer);
  }, [resumeAvailable, reviewing, busy, files, rows, publisher, onion, session, comment, color, packing]);

  const publishCurrent = async (current, destination, includePhotos) => {
    await saveAndroidRecovery({ ...recoveryState(current), phase: 'publishing' }, includePhotos);
    setReviewing(false);
    setResumeAvailable(true);
    const publication = await publishBatch(current, new Set(splitBatch(current).unresolved.map((photo) => photo.id)), {
      publisher, destination, fileAt, onStatus: setStatus,
      onCleaned: (row, cleaned) => rememberPreview(row.id, cleaned),
      onRows: async (updated) => {
        await saveAndroidRecovery({ ...recoveryState(updated), phase: 'publishing' });
        setRows(updated);
      },
      onProgress: (stage, completed, total, fraction) =>
        setWorkProgress(actionProgress(stage, completed, total, fraction)),
    });
    const active = activePoints(current);
    const completed = active.filter((row) => row.uploadResult?.links?.some((link) => link.provider === publisher)).length;
    if (completed === active.length) setResumeAvailable(false);
    await saveAndroidRecovery({ ...recoveryState(current), phase: completed === active.length ? 'complete' : 'publishing' });
    setStatus(publication.failures
      ? `Готово ${completed} из ${active.length}. Ошибок публикации: ${publication.failures}.${publication.stopped ? ' NinjaBox остановлен.' : ''}`
      : completed === active.length ? 'Обработка завершена.' : `Готово ${completed} из ${active.length}. Можно продолжить публикацию.`);
  };

  const resumePublication = async () => {
    setBusy(true);
    try {
      const destination = publisher === 'onion' ? onionBaseUrl(onion) : ninjaboxRelayUrl(ninjaboxRelay);
      if (publisher === 'onion' && activePoints(rows).some((point) => pointMembers(point).length > 1)) {
        throw new Error('Onion публикует одно фото. Разделите многокадровые точки или выберите NinjaBox.');
      }
      await publishCurrent([...rows], destination, true);
    } catch (error) { setStatus(`Продолжение: ${errorText(error)}`); }
    finally { setBusy(false); setWorkProgress(null); }
  };

  const recognizeFiles = async (selected, offset = 0, onRows = () => {}) => {
    const current = [];
    for (let index = 0; index < selected.length; index += 1) {
      setStatus(`Распознавание ${index + 1}/${selected.length}`);
      setWorkProgress(actionProgress('recognition', index, selected.length));
      try {
        const nativeOcr = selected[index].native ? await recognizeAndroidStamp(selected[index]) : null;
        const file = await (selected[index].native ? readAndroidPhoto(selected[index]) : selected[index]);
        rememberPreview(String(offset + index + 1), file);
        const read = await readPhoto(file, {
          ...(nativeOcr ? { readOcr: async () => nativeOcr } : {}),
          onProgress: ({ status: ocrStatus, progress }) => {
            const percent = Number.isFinite(progress) ? ` ${Math.round(progress * 100)}%` : '';
            const stage = String(ocrStatus || 'ocr')
              .replace('ocr:initializing', 'OCR запуск')
              .replace('ocr:ready', 'OCR готов')
              .replace('loading tesseract core', 'ядро OCR')
              .replace('initializing tesseract', 'инициализация OCR')
              .replace('loading language traineddata', 'язык OCR')
              .replace('initializing api', 'OCR API')
              .replace('recognizing text', 'распознавание');
            setStatus(`Распознавание ${index + 1}/${selected.length} · ${stage}${percent}`);
          },
        });
        current.push({
          id: String(offset + index + 1), number: offset + index + 1, fileName: file.name,
          ...read, uploadResult: { providerOrder: [publisher], links: [] },
        });
        console.info('DarkCat Photo recognition', { photo: index + 1, engine: read.ocrEngine, elapsedMs: read.recognitionMs });
      } catch (error) {
        current.push({
          id: String(offset + index + 1), number: offset + index + 1, fileName: selected[index].name,
          coordinates: null, indexFromOcr: null, indexStatus: 'missing',
          gpsStatus: 'missing', coordinateQuality: 'missing', gpsSource: 'missing',
          warnings: [`photo_error: ${errorText(error)}`], uploadResult: { providerOrder: [publisher], links: [] },
        });
      }
      onRows([...current]);
      setWorkProgress(actionProgress('recognition', index + 1, selected.length));
    }
    return current;
  };

  const run = async () => {
    setBusy(true);
    setRows([]);
    setSplit(null);
    clearPreviews();
    try {
      const current = await recognizeFiles(files, 0, setRows);
      const logical = groupPhotos(current);
      const points = establishReviewSlots(logical, splitBatch(logical));
      setRows(points);
      setSplit(splitBatch(points));
      setReviewing(true);
      await saveAndroidRecovery({ ...recoveryState(points), phase: 'review' }, true);
      setStatus('Распознавание завершено. Проверьте точки перед публикацией.');
    } catch (error) { setStatus(`Ошибка: ${errorText(error)}`); }
    finally {
      setBusy(false);
      setWorkProgress(null);
    }
  };

  const appendSelected = async (selected) => {
    if (busy || !selected.length || !split) return;
    if (files.length + selected.length > 100) { setStatus('В сессии может быть до 100 фото.'); return; }
    setBusy(true);
    try {
      const additions = await recognizeFiles(selected, files.length);
      const combinedFiles = [...files, ...selected];
      const combined = appendPhotos(rows, additions);
      // Retain existing review slots, including every removed placeholder.
      const slotted = establishReviewSlots(combined, splitBatch(combined));
      const nextRows = combined.map((point) => Number.isFinite(point.reviewSlot) ? point
        : { ...point, reviewSection: slotted.find((item) => item.id === point.id).reviewSection,
          reviewSlot: Math.max(-1, ...rows.map((item) => item.reviewSlot)) + 1 + additions.findIndex((item) => item.id === point.id) });
      await saveAndroidRecovery({ ...recoveryState(nextRows), files: combinedFiles.map(({ id, name, type, size, native }) => ({ id, name, type, size, native })), phase: 'review' }, true);
      setFiles(combinedFiles);
      setRows(nextRows);
      setSplit(splitBatch(nextRows));
      setReviewing(true);
      setResumeAvailable(false);
      setStatus(`Добавлено ${selected.length} фото. Проверьте точки перед публикацией.`);
    } catch (error) { setStatus(`Добавление: ${errorText(error)}`); }
    finally { setBusy(false); setWorkProgress(null); }
  };
  const addPhotos = async () => {
    if (!hasAndroidFolderPicker()) { appendInput.current?.click(); return; }
    try { await appendSelected(await pickAndroidPhotos(true)); }
    catch (error) { setStatus(`Добавление: ${errorText(error)}`); }
  };

  const reviewLabels = {
    coordinates_missing: 'Координаты не найдены', index_missing: 'Индекс не найден',
    index_low_confidence: 'Индекс распознан неуверенно', coordinates_low_precision: 'Недостаточная точность координат',
    coordinates_low_confidence: 'Координаты требуют проверки', low_confidence: 'Координаты распознаны неуверенно',
    batch_outlier: 'Координаты отличаются от партии', outside_expected_region: 'Координаты вне ожидаемого региона',
  };
  const active = activePoints(rows);
  const pending = active.filter((point) => point.uploadResult?.stale
    || !point.uploadResult?.links?.some((link) => link.provider === publisher && link.url));
  const grouped = split ? splitBatch(active) : null;
  const normalizedSession = session.trim();
  const formatOptions = { description: comment, color, packing, session: normalizedSession };
  const validPhotos = validResultPhotos(grouped);
  const mainBlocks = resultBlocksForCopy({ main: grouped?.main, reserve: [] }, formatOptions);
  const reserveBlocks = resultBlocksForCopy({ main: [], reserve: grouped?.reserve }, formatOptions);
  const txtText = grouped ? buildResultText({
    grouped, formatOptions, session: normalizedSession, reviewLabels,
  }) : '';
  const download = async (action = 'save') => {
    try { await exportText(txtText, action, normalizedSession); setStatus('TXT готов.'); }
    catch (error) { setStatus(`TXT: ${errorText(error)}`); }
  };
  const exportSession = async () => {
    if (busy) return;
    setBusy(true); setStatus('Выберите папку для экспорта сессии.');
    try {
      const result = await exportLocalSession(rows, { session, color, packing, comment }, {
        destination: androidSessionDestination, fileAt,
        onCommit: () => { setStatus('Запись и проверка файлов…'); setWorkProgress({ kind: 'local-export', label: 'Запись и проверка файлов…',
          type: 'indeterminate', value: 0, buffer: 0, itemPercent: null }); },
        onProgress: (completed, total) => {
          setStatus(`Подготовка экспорта ${completed}/${total}`);
          setWorkProgress(actionProgress('local-export', completed, total));
        },
      });
      setStatus(`Сессия экспортирована: ${result.directory} · ${result.files} файлов. Копии проверены.`);
    } catch (error) { setStatus(`Экспорт сессии: ${errorText(error)}`); }
    finally { setBusy(false); setWorkProgress(null); }
  };
  const copyPreview = async () => {
    try {
      await copyText(txtText);
      setCopyStatus('Скопировано.');
    } catch (error) { setCopyStatus(`Не удалось скопировать: ${errorText(error)}`); }
  };
  const copyBlocks = async (blocks, label) => {
    setCopyBusy(true);
    setWorkProgress(actionProgress('clipboard', 0, blocks.length));
    setCopyStatus(`${label}: 0/${blocks.length}`);
    try {
      const count = await copyResultBlocks(blocks,
        (copied, total) => {
          setCopyStatus(`${label}: ${copied}/${total}`);
          setWorkProgress(actionProgress('clipboard', copied, total));
        });
      setCopyStatus(`${label}: скопировано ${count}. История буфера зависит от клавиатуры.`);
    } catch (error) { setCopyStatus(`Не удалось скопировать блоки: ${errorText(error)}`); }
    finally { setCopyBusy(false); setWorkProgress(null); }
  };
  const copyOne = async (photo) => {
    try {
      await copyText(formatPhotoResultBlock(photo, formatOptions));
      setCopyStatus(`Скопирован блок #${photo.indexFromOcr}`);
    } catch (error) { setCopyStatus(`Не удалось скопировать: ${errorText(error)}`); }
  };
  const gpx = async (action) => {
    try {
      await exportGpx(buildGpx(grouped, normalizedSession), action, normalizedSession);
      setStatus('GPX готов.');
    } catch (error) { setStatus(`GPX: ${errorText(error)}`); }
  };
  const pointGpx = async (photo) => {
    try {
      await exportGpx(buildPointGpx(photo, normalizedSession), 'share',
        [normalizedSession, photo.indexFromOcr || photo.id].filter(Boolean).join('_'));
      setStatus('GPX точки готов.');
    } catch (error) { setStatus(`GPX: ${errorText(error)}`); }
  };
  const validById = new Map(validPhotos.map((photo) => [photo.id, photo]));
  const reviewById = new Map((grouped?.unresolved || []).map((photo) => [photo.id, photo.reviewReason]));
  const reserveIds = new Set((grouped?.reserve || []).map((photo) => photo.id));
  const photoStatus = (photo) => photo.removed ? { kind: 'removed', text: 'Убрано' } : reviewById.has(photo.id)
    ? { kind: 'review', text: `Требует проверки: ${reviewLabels[reviewById.get(photo.id)] || reviewById.get(photo.id)}` }
    : !grouped ? { kind: 'recognized', text: 'Распознано' }
      : reserveIds.has(photo.id) ? { kind: 'reserve', text: 'Резерв' }
        : { kind: 'main', text: 'Основное' };
  const pointLabel = (photo) => photo?.indexFromOcr ? `#${photo.indexFromOcr}`
    : photo?.number ? `Точка ${photo.number}` : 'Точка';
  const rowPosition = new Map(rows.map((photo, index) => [photo.id, index]));
  const neighborOf = (photo, direction) => {
    const position = rowPosition.get(photo.id);
    const neighbor = Number.isInteger(position) ? rows[position + direction] || null : null;
    return neighbor?.removed ? null : neighbor;
  };
  const displaySections = grouped ? reviewSections(rows, grouped)
    : [{ key: 'recognized', title: '', items: rows }];
  const applyRegroup = (nextRows) => {
    setRows(establishReviewSlots(nextRows, splitBatch(nextRows)));
  };
  const removePoint = (photo) => {
    if (!reviewing || busy || hasPublishedPoints(rows)) return;
    setRows((current) => setPointRemoved(current, photo.id, true));
    setStatus(`${pointLabel(photo)} убрана из текущего набора.`);
  };
  const restorePoint = (photo) => {
    if (busy) return;
    setRows((current) => restoreMemberPoint(current, photo.id));
    if (!reviewing && publisher !== 'none') setResumeAvailable(true);
    setStatus(`${pointLabel(photo)} возвращена.`);
  };
  const applyMembership = (nextRows) => {
    setRows(nextRows);
    if (!reviewing && publisher !== 'none') setResumeAvailable(true);
  };
  const removePhoto = ({ pointId, memberId }) => {
    if (busy) return;
    applyMembership(removeMember(rows, pointId, memberId));
    setStatus('Фото убрано из точки. Исходный файл сохранён.');
  };
  const movePhoto = (targetId) => {
    if (busy || !moveAction) return;
    applyMembership(moveMember(rows, moveAction.pointId, moveAction.memberId, targetId));
    setMoveAction(null);
    setStatus('Фото перемещено. Проверьте обновлённые точки.');
  };
  const copyLink = async (url) => {
    try { await copyText(url); setCopyStatus('Ссылка скопирована.'); }
    catch (error) { setCopyStatus(`Не удалось скопировать: ${errorText(error)}`); }
  };
  const viewerPoint = rows.find((point) => point.id === viewer?.pointId);
  const viewerMembers = viewerPoint && !viewerPoint.removed ? pointMembers(viewerPoint) : [];
  const viewerIndex = viewerMembers.findIndex((member) => member.id === viewer?.memberId);
  const actionPoint = rows.find((point) => point.id === pointAction && !point.removed);
  const canRegroup = reviewing && !busy && !hasPublishedPoints(rows);
  const pointButtons = actionPoint ? [
    ...(canRegroup && pointMembers(actionPoint).length > 1 ? [{ text: 'Разделить', handler: () => applyRegroup(splitPoint(rows, actionPoint.id)) }] : []),
    ...[-1, 1].flatMap((direction) => {
      const neighbor = neighborOf(actionPoint, direction);
      return canRegroup && neighbor ? [{ text: `${direction === -1 ? 'С предыдущей' : 'Со следующей'} ${pointLabel(neighbor)}`,
        handler: () => applyRegroup(mergePoint(rows, actionPoint.id, direction)) }] : [];
    }),
    ...(validById.has(actionPoint.id) ? [{ text: 'Копировать блок', handler: () => copyOne(validById.get(actionPoint.id)) }] : []),
    ...(canRegroup ? [{ text: 'Убрать', role: 'destructive', handler: () => removePoint(actionPoint) }] : []),
    { text: 'Отмена', role: 'cancel' },
  ] : [];
  const moveTargets = active.filter((point) => point.id !== moveAction?.pointId
    && `${pointLabel(point)} ${point.id}`.toLowerCase().includes(targetSearch.toLowerCase().trim()));
  const updateBar = updateProgress(nativeUpdate);
  const updateAction = updateButton(nativeUpdate?.state, candidate?.version);
  const nativeStatus = {
    idle: candidate ? `Доступна версия ${candidate.version}` : 'Обновление не проверено.',
    downloading: 'Загрузка обновления', paused: 'Загрузка приостановлена Android; ожидается возобновление',
    completed: 'Загрузка завершена. Проверка APK…', verifying: 'Проверка APK…',
    ready_to_install: 'APK проверен и готов к установке.',
    permission_required: 'APK проверен. Разрешите установку из DarkCat Photo.',
    failed: nativeUpdate?.error || 'Загрузка не удалась.',
  }[nativeUpdate?.state];

  return <IonApp><IonPage>
    <IonHeader><IonToolbar><IonTitle>DarkCat Photo</IonTitle></IonToolbar></IonHeader>
    <IonContent className="darkfoto-content">
      <div className="darkfoto-layout">
        <IonSegment value={screen} onIonChange={(event) => event.detail.value === 'about' ? showAbout() : setScreen('photos')}>
          <IonSegmentButton value="photos"><IonLabel>Точки</IonLabel></IonSegmentButton>
          <IonSegmentButton value="about"><IonLabel>О приложении</IonLabel></IonSegmentButton>
        </IonSegment>
        {screen === 'about' ? <IonCard><IonCardContent>
          <h2>О приложении / Обновление</h2>
          {!buildInfo.releaseReady && <p className="stage-notice">{buildInfo.version} · этап {buildInfo.stage}, подготовка. Выпуск ожидает приёмки карты.</p>}
          <p>Установлена версия: {version ? `${version.versionName} (код ${version.versionCode})` : `${buildInfo.version} (код ${buildInfo.versionCode}, Web)`}</p>
          <p role="status">{updateStatus || nativeStatus || 'Обновление не проверено.'}</p>
          {updateBar?.active && <div className="progress-area" role="status" aria-label="Загрузка обновления">
            <span>{updateBar.label}</span>
            <IonProgressBar type={updateBar.type} value={updateBar.value} aria-label={updateBar.label} />
          </div>}
          {version && <IonButton expand="block" onClick={checkUpdate}>Проверить обновление</IonButton>}
          {candidate && <><p>Новая версия: {candidate.version}</p>
            {releaseNotes(changelog, candidate.version) && <pre className="changelog-text">{releaseNotes(changelog, candidate.version)}</pre>}
            {updateAction && <IonButton expand="block" onClick={downloadUpdate}>{updateAction}</IonButton>}</>}
          <h3>История изменений</h3>
          <pre className="changelog-text" aria-label="История изменений">{changelog}</pre>
        </IonCardContent></IonCard> : <>
          <p className="intro">Выберите фотографии и получите Основные / Резерв. Исходники остаются на устройстве.</p>
          <IonCard><IonCardContent>
            <h2>Фотографии</h2>
            {hasAndroidFolderPicker() ? <div className="action-row">
              <IonButton expand="block" fill="outline" onClick={selectAndroidPhotos} disabled={busy}>Выбрать фото</IonButton>
              <IonButton expand="block" fill="outline" onClick={selectAndroidFolder} disabled={busy}>Выбрать папку</IonButton>
            </div> : <div className="web-pickers">
              <label>Отдельные фото<input type="file" accept="image/*" multiple onChange={select} disabled={busy} /></label>
              <label>Папка с фото<input type="file" accept="image/*" webkitdirectory="" multiple onChange={select} disabled={busy} /></label>
            </div>}
            <p>Выбрано: {files.length}</p>
            {grouped && <>
              <IonButton fill="outline" onClick={addPhotos} disabled={busy}>Добавить фото</IonButton>
              <input ref={appendInput} type="file" accept="image/*" multiple hidden data-testid="append-photos"
                onChange={(event) => { const selected = imageFiles(event.target.files || []); event.target.value = ''; appendSelected(selected); }} />
            </>}
          </IonCardContent></IonCard>
          <IonCard><IonCardContent>
            <IonList lines="inset">
              <IonItem><IonSelect label="Публикация" labelPlacement="stacked" value={publisher}
                interface="action-sheet" interfaceOptions={{ header: 'Публикация', cssClass: 'publication-sheet' }}
                onIonChange={(event) => setPublisher(event.detail.value)} disabled={busy || resumeAvailable || hasPublishedPoints(rows)}>
                <IonSelectOption value="none">Только локально</IonSelectOption>
                <IonSelectOption value="onion">Onion</IonSelectOption>
                <IonSelectOption value="ninjabox">NinjaBox</IonSelectOption>
              </IonSelect></IonItem>
              {publisher === 'onion' && <IonItem><IonInput label="Onion адрес" labelPlacement="stacked" type="url"
                value={onion} onIonInput={(event) => setOnion(event.detail.value || '')} disabled={busy || resumeAvailable || hasPublishedPoints(rows)} /></IonItem>}
              {publisher === 'ninjabox' && <IonItem><IonLabel className="publisher-note">
                NinjaBox: публичная публикация через встроенный relay. Для анонимного режима используйте Onion.
              </IonLabel></IonItem>}
              <RecentField field="session" label="Сессия" value={session} onChange={setSession} placeholder="Например 17 или Север-2" />
              <RecentField field="color" label="Цвет" value={color} onChange={setColor} />
              <RecentField field="packing" label="Фасовка" value={packing} onChange={setPacking} />
              <RecentField field="comment" label="Комментарий" value={comment} onChange={setComment} multiline />
            </IonList>
            <IonButton className="primary-action" expand="block"
              onClick={resumeAvailable || (reviewing && publisher !== 'none') ? resumePublication : run}
              disabled={busy || !files.length || (reviewing && publisher === 'none')
                || (reviewing && !active.length)
                || (!reviewing && hasPublishedPoints(rows) && !resumeAvailable)}>
              {busy ? 'Обработка…' : resumeAvailable ? 'Продолжить публикацию'
                : reviewing ? publisher === 'none' ? 'Точки готовы локально' : `Опубликовать ${pending.length} точек` : 'Обработать фото'}
            </IonButton>
            <IonText><p role="status" aria-live="polite">{status}</p></IonText>
            {workProgress?.kind !== 'clipboard' && <WorkProgress progress={workProgress} />}
          </IonCardContent></IonCard>
          {grouped && <IonCard><IonCardContent>
            <h2>{reviewing ? 'Проверка точек' : 'Результат'}</h2>
            <p className="point-count">{sourcePhotoCount(active)} фото → {active.length} точек</p>
            {reviewing && <p>Группы созданы автоматически. При необходимости разделите точку и объедините соседние.</p>}
            {reviewing && publisher === 'onion' && activePoints(rows).some((point) => pointMembers(point).length > 1)
              && <p>Onion публикует одно фото. Разделите многокадровые точки или выберите NinjaBox для галерей.</p>}
            {normalizedSession && <p className="session-summary">Сессия: <strong>{normalizedSession}</strong></p>}
            <div className="counts">
              <IonBadge color="success">Основные {grouped.main.length}</IonBadge>
              <IonBadge color="warning">Резерв {grouped.reserve.length}</IonBadge>
              <IonBadge color="danger">Требует проверки {grouped.unresolved.length}</IonBadge>
            </div>
            {hasSessionFolderExport() && <IonButton fill="outline" onClick={exportSession} disabled={busy || !active.length}>Экспортировать сессию</IonButton>}
            <div className="export-groups">
              <div><strong>TXT</strong><div className="compact-actions">
                <IonButton fill="clear" onClick={() => { setCopyStatus(''); setTxtOpen(true); }}>Посмотреть</IonButton>
                <IonButton fill="clear" onClick={() => download('save')}>Сохранить</IonButton>
                {isNativeTextExport() && <IonButton fill="clear" onClick={() => download('share')}>Поделиться</IonButton>}
              </div></div>
              <div><strong>GPX</strong><div className="compact-actions">
                <IonButton fill="clear" onClick={() => gpx('save')} disabled={!validPhotos.length}>Экспорт</IonButton>
                {isNativeTextExport() && <IonButton fill="clear" onClick={() => gpx('share')}
                  disabled={!validPhotos.length}>Поделиться</IonButton>}
              </div></div>
            </div>
            <p className="copy-explanation">Каждый блок копируется автоматически отдельным событием буфера обмена.</p>
            <div className="group-copy-actions">
              <IonButton fill="outline" onClick={() => copyBlocks(mainBlocks, 'Основные')}
                disabled={!mainBlocks.length || copyBusy}>Копировать основные по одному</IonButton>
              <IonButton fill="outline" onClick={() => copyBlocks(reserveBlocks, 'Резерв')}
                disabled={!reserveBlocks.length || copyBusy}>Копировать резерв по одному</IonButton>
            </div>
            {copyStatus && <IonText><p role="status" aria-live="polite">{copyStatus}</p></IonText>}
            {workProgress?.kind === 'clipboard' && <WorkProgress progress={workProgress} />}
          </IonCardContent></IonCard>}
          {rows.length > 0 && <IonCard><IonCardContent><h2>{grouped ? 'Точки' : 'Распознавание'}</h2>
            <div className="point-sections">
              {displaySections.map((section) => <section key={section.key} className={`point-section point-section-${section.key}`}>
                {section.title && <h3 className="point-section-title">{section.title}<span>{section.count}</span></h3>}
                <div className="result-photo-list">
                  {section.items.map((photo) => {
                    const state = photoStatus(photo);
                    const statusLabel = state.kind === 'review' ? 'Требует проверки' : state.text;
                    return <article key={photo.id} className={`result-photo-card${photo.removed ? ' point-removed' : ''}`} data-point-id={photo.id}>
                      <header className={`point-card-header point-card-header-${state.kind}`}>
                        <div className="point-card-title-row">
                          <strong className="photo-identity">{pointLabel(photo)}</strong>
                          <span className={`photo-state photo-state-${state.kind}`}>{statusLabel}</span>
                        </div>
                        <div className="point-card-meta">
                          <span>{photo.emptyFromMove ? 0 : pointMembers(photo).length} фото</span>
                          <span className="photo-coordinates">{photo.coordinates
                            ? `${photo.coordinates.latitude}, ${photo.coordinates.longitude}` : 'Координаты не найдены'}</span>
                        </div>
                        <div className="point-header-actions">
                          {!photo.removed && grouped && <IonButton size="small" fill="clear" disabled={busy}
                            aria-label={`Действия точки ${pointLabel(photo)}`} onClick={() => setPointAction(photo.id)}>⋯ Точка</IonButton>}
                          {!!photo.memberUndo?.length && (!photo.removed || photo.memberRemovedLast) && <IonButton size="small" fill="outline" disabled={busy}
                            aria-label={`Вернуть фото точки ${pointLabel(photo)}`} onClick={() => {
                              applyMembership(restoreLastMember(rows, photo.id)); setStatus('Фото возвращено.');
                            }}>Вернуть фото ({photo.memberUndo.length})</IonButton>}
                          {hasPointCoordinates(photo) && <IonButton size="small" fill="clear"
                            onClick={() => pointGpx(photo)}>GPX</IonButton>}
                          {photo.removed && !photo.memberRemovedLast && <IonButton size="small" fill="outline" disabled={busy}
                            onClick={() => restorePoint(photo)}>Вернуть</IonButton>}
                        </div>
                      </header>
                      {!photo.removed && <div className="point-card-body">
                        <div className={`point-thumbnails ${pointMembers(photo).length > 1 ? 'multi-photo' : ''}`}>
                          {pointMembers(photo).map((member) => <div key={member.id} className="member-photo" data-member-id={member.id}><button type="button" className="photo-thumbnail"
                            onClick={() => setViewer({ pointId: photo.id, memberId: member.id })} disabled={!previews[member.id]}
                            aria-label={`Открыть фото ${member.fileName || member.number} точки ${photo.indexFromOcr || photo.number}`}>
                            {previews[member.id] && <img src={previews[member.id]} alt="" loading="lazy" />}
                          </button>
                            {grouped && <IonButton fill="clear" size="small" disabled={busy}
                              aria-label={`Действия фото ${member.fileName || member.number}`}
                              onClick={() => setPhotoAction({ pointId: photo.id, memberId: member.id, name: member.fileName || String(member.number) })}>⋯</IonButton>}
                          </div>)}
                        </div>
                        <div className="photo-detail">
                          <span className="photo-filename">{pointMembers(photo).map((member) => member.fileName).join(', ')}</span>
                          {state.kind === 'reserve' && (photo.reserveConflicts || []).length > 0 && <div className="reserve-reasons">
                            <strong>Почему в резерве</strong>
                            {photo.reserveConflicts.map((conflict) => <span key={`${photo.id}:${conflict.otherId}`}>
                              {conflict.otherStatus === 'main' ? 'Конфликт' : 'Также рядом'}: {conflict.otherLabel} · {conflict.distanceMeters.toFixed(1)} м
                            </span>)}
                          </div>}
                          {state.kind === 'review' && <span className="review-reason">{state.text}</span>}
                          {photo.uploadResult?.stale && <span className="review-reason">Фото изменены · требуется повторная публикация</span>}
                          {!photo.uploadResult?.stale && photo.uploadResult?.links?.filter((link) => link?.url).map((link, index) => <div className="point-link" key={`${link.url}:${index}`}>
                            <span>{link.provider || link.source || 'Ссылка'}</span>
                            <div className="compact-actions">
                              <IonButton size="small" fill="clear" href={link.url} target="_blank" rel="noreferrer">Открыть</IonButton>
                              <IonButton size="small" fill="clear" onClick={() => copyLink(link.url)}>Копировать</IonButton>
                            </div>
                          </div>)}
                          {photo.publishError && <span role="alert">Публикация: {photo.publishError}</span>}
                        </div>
                      </div>}
                    </article>;
                  })}
                </div>
              </section>)}
            </div>
          </IonCardContent></IonCard>}
        </>}
      </div>
    </IonContent>
    <IonModal className="txt-modal" isOpen={txtOpen} onDidDismiss={() => setTxtOpen(false)}>
      <IonHeader><IonToolbar><IonTitle>TXT результат</IonTitle></IonToolbar></IonHeader>
      <IonContent className="txt-modal-content">
        <div className="txt-preview-wrap">
          <pre className="txt-preview" aria-label="TXT результат">{txtText}</pre>
        </div>
      </IonContent>
      <IonFooter><IonToolbar className="txt-actions"><div className="action-row">
        <IonButton onClick={copyPreview}>Копировать</IonButton>
        <IonButton fill="outline" onClick={() => setTxtOpen(false)}>Закрыть</IonButton>
      </div>{copyStatus && <span role="status">{copyStatus}</span>}</IonToolbar></IonFooter>
    </IonModal>
    <IonActionSheet cssClass="publication-sheet point-action-sheet" isOpen={!!actionPoint} header={actionPoint ? pointLabel(actionPoint) : ''}
      onDidDismiss={() => setPointAction(null)} buttons={pointButtons} />
    <IonActionSheet cssClass="publication-sheet photo-action-sheet" isOpen={!!photoAction} header={photoAction?.name}
      onDidDismiss={() => setPhotoAction(null)} buttons={[
        { text: 'Переместить', disabled: active.length < 2, handler: () => { setTargetSearch(''); setMoveAction(photoAction); } },
        { text: 'Убрать фото', role: 'destructive', handler: () => removePhoto(photoAction) },
        { text: 'Отмена', role: 'cancel' },
      ]} />
    <IonModal className="move-photo-modal" isOpen={!!moveAction} onDidDismiss={() => setMoveAction(null)}>
      <IonHeader><IonToolbar><IonTitle>Переместить фото</IonTitle></IonToolbar>
        <IonSearchbar value={targetSearch} placeholder="Индекс или точка" aria-label="Найти точку"
          onIonInput={(event) => setTargetSearch(event.detail.value || '')} />
      </IonHeader>
      <IonContent><IonList>
        {moveTargets.map((point) => <IonItem key={point.id} button onClick={() => movePhoto(point.id)}>
          <IonLabel><strong>{pointLabel(point)}</strong><p>{pointMembers(point).length} фото · {photoStatus(point).text}</p></IonLabel>
        </IonItem>)}
        {!moveTargets.length && <IonItem><IonLabel>Точки не найдены</IonLabel></IonItem>}
      </IonList></IonContent>
      <IonFooter><IonToolbar><IonButton expand="block" fill="outline" onClick={() => setMoveAction(null)}>Отмена</IonButton></IonToolbar></IonFooter>
    </IonModal>
    <PhotoViewer src={viewer ? previews[viewer.memberId] : null} open={!!viewer} onClose={() => setViewer(null)}
      index={viewerIndex} total={viewerMembers.length} onNavigate={(direction) => {
        const member = viewerMembers[viewerIndex + direction];
        if (member) setViewer({ ...viewer, memberId: member.id });
      }} />
  </IonPage></IonApp>;
}
