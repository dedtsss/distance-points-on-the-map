import { APP_SCREENS } from '../features/ui/screens.js';
import Icon from './Icon.jsx';

export default function TopBar({
  photoCount,
  activeScreen,
  isBusy,
  onMenuClick,
  sidebarCollapsed,
  onToggleSidebar,
}) {
  const current = APP_SCREENS.find((screen) => screen.id === activeScreen);

  return (
    <header className="top-app-bar">
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
    </header>
  );
}
