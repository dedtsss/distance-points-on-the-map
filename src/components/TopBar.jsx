import { useEffect, useRef, useState } from 'react';
import {
  PHOTO_PROGRESS_EVENT,
  deriveMobileProcessingProgress,
  progressEntryFromDataset,
} from '../features/ui/mobileProcessingProgress.js';
import { APP_SCREENS } from '../features/ui/screens.js';
import Icon from './Icon.jsx';
import './TopBarProgress.css';

const progressNodes = () => (
  typeof document === 'undefined'
    ? []
    : [...document.querySelectorAll('[data-photo-progress="true"]')]
);

export default function TopBar({
  photoCount,
  activeScreen,
  isBusy,
  onMenuClick,
  sidebarCollapsed,
  onToggleSidebar,
}) {
  const current = APP_SCREENS.find((screen) => screen.id === activeScreen);
  const entriesRef = useRef(new Map());
  const [mobileProgress, setMobileProgress] = useState(null);

  useEffect(() => {
    if (!isBusy) {
      entriesRef.current.clear();
      setMobileProgress(null);
      return undefined;
    }

    const refresh = () => {
      setMobileProgress(deriveMobileProcessingProgress([...entriesRef.current.values()], photoCount));
    };

    const readFromDom = () => {
      progressNodes().forEach((node) => {
        const entry = progressEntryFromDataset(node.dataset);
        if (entry.id) entriesRef.current.set(entry.id, entry);
      });
      refresh();
    };

    const onPhotoProgress = (event) => {
      const entry = event.detail || {};
      if (!entry.id) return;
      entriesRef.current.set(entry.id, entry);
      refresh();
    };

    readFromDom();
    window.addEventListener(PHOTO_PROGRESS_EVENT, onPhotoProgress);
    const observer = typeof MutationObserver !== 'undefined'
      ? new MutationObserver(readFromDom)
      : null;
    const observedRoot = document.querySelector('.screen-content') || document.body;
    observer?.observe(observedRoot, {
      subtree: true,
      attributes: true,
      attributeFilter: [
        'data-photo-status',
        'data-photo-status-text',
        'data-photo-gps-status',
        'data-photo-cleanup-status',
        'data-photo-upload-status',
      ],
    });
    const intervalId = window.setInterval(readFromDom, 500);

    return () => {
      window.removeEventListener(PHOTO_PROGRESS_EVENT, onPhotoProgress);
      observer?.disconnect();
      window.clearInterval(intervalId);
    };
  }, [isBusy, photoCount]);

  return (
    <header className={`top-app-bar${mobileProgress ? ' has-mobile-progress' : ''}`}>
      <div className="top-app-bar-main">
        <button type="button" className="icon-button mobile-menu-button" onClick={onMenuClick} aria-label="Открыть меню">
          <Icon name="menu" />
        </button>
        <button
          type="button"
          className="icon-button desktop-rail-button"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель'}
        >
          <Icon name={sidebarCollapsed ? 'chevronRight' : 'chevronLeft'} />
        </button>
        <div className="top-title">
          <p className="brand-mark">GPS Checker Map Photo</p>
          <h1>{current?.label || 'Панель управления'}</h1>
        </div>
      </div>
      <div className="top-app-bar-actions">
        <div className={`system-pill${isBusy ? ' is-busy' : ''}`} aria-live="polite">
          <span className="system-dot" aria-hidden="true" />
          {isBusy ? 'Обработка' : 'Готово'}
        </div>
        <div className="top-app-bar-meta" aria-label="Количество выбранных фото">
          <span>{photoCount}</span>
          <small>фото</small>
        </div>
      </div>

      {mobileProgress && (
        <div
          className="mobile-processing-progress"
          role="progressbar"
          aria-label={`Фото ${mobileProgress.photoNumber} из ${mobileProgress.totalPhotos}: ${mobileProgress.statusText}`}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={mobileProgress.percentRounded}
        >
          <div className="mobile-processing-copy">
            <strong>Фото {mobileProgress.photoNumber} из {mobileProgress.totalPhotos} · {mobileProgress.stageLabel}</strong>
            <span>{mobileProgress.statusText}</span>
            <b>{mobileProgress.percentRounded}%</b>
          </div>
          <div className="mobile-processing-track" aria-hidden="true">
            <span style={{ width: `${mobileProgress.percent}%` }} />
          </div>
        </div>
      )}
    </header>
  );
}
