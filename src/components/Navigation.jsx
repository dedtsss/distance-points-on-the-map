import { APP_SCREENS } from '../features/ui/screens.js';
import Icon from './Icon.jsx';

const ICON_BY_SCREEN = {
  dashboard: 'dashboard',
  upload: 'upload',
  reserve: 'folder',
  map: 'map',
  results: 'results',
  sessions: 'sessions',
  journal: 'journal',
  settings: 'settings',
};

export default function Navigation({ activeScreen, onScreenChange, collapsed = false, onNavigate }) {
  return (
    <nav className={`navigation-shell${collapsed ? ' is-collapsed' : ''}`} aria-label="Разделы приложения">
      {APP_SCREENS.map((screen) => (
        <button
          type="button"
          key={screen.id}
          className={`nav-item${activeScreen === screen.id ? ' is-active' : ''}`}
          onClick={() => {
            onScreenChange(screen.id);
            onNavigate?.();
          }}
          aria-current={activeScreen === screen.id ? 'page' : undefined}
          aria-label={collapsed ? screen.label : undefined}
          title={collapsed ? screen.label : undefined}
        >
          <span className="nav-icon" aria-hidden="true">
            <Icon name={ICON_BY_SCREEN[screen.id]} size={20} />
          </span>
          <span className="nav-label">{screen.label}</span>
        </button>
      ))}
    </nav>
  );
}
