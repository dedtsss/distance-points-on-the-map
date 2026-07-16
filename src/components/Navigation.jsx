import { APP_SCREENS } from '../features/ui/screens.js';

export default function Navigation({ activeScreen, onScreenChange }) {
  return (
    <nav className="navigation-shell" aria-label="Разделы приложения">
      {APP_SCREENS.map((screen) => (
        <button
          type="button"
          key={screen.id}
          className={`nav-item${activeScreen === screen.id ? ' is-active' : ''}`}
          onClick={() => onScreenChange(screen.id)}
          aria-current={activeScreen === screen.id ? 'page' : undefined}
        >
          <span className="nav-icon" aria-hidden="true">{screen.label.slice(0, 1)}</span>
          <span>{screen.label}</span>
        </button>
      ))}
    </nav>
  );
}
