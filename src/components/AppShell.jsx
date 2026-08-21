import { useEffect, useState } from 'react';
import TopBar from './TopBar.jsx';
import Navigation from './Navigation.jsx';
import Icon from './Icon.jsx';

const BUILD = typeof __BUILD_INFO__ === 'undefined' ? { version: 'unknown', commit: 'unknown' } : __BUILD_INFO__;

export default function AppShell({
  activeScreen,
  onScreenChange,
  photoCount,
  isBusy = false,
  children,
  footer,
  visualVariant = null,
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  return (
    <main className={`app-frame${sidebarCollapsed ? ' has-rail' : ''}${visualVariant === 'light' ? ' visual-variant-light' : ''}`} data-visual-variant={visualVariant || undefined}>
      <aside className="sidebar-shell" aria-label="Основная навигация">
        <div className="sidebar-brand">
          <span className="brand-symbol" aria-hidden="true">
            <Icon name="target" size={24} />
          </span>
          <div className="sidebar-brand-text">
            <strong>Dark Cat CRM</strong>
            <span>GPS Map Photo · v{BUILD.version}</span>
          </div>
        </div>
        <Navigation activeScreen={activeScreen} onScreenChange={onScreenChange} collapsed={sidebarCollapsed} />
        <div className="sidebar-status" aria-label="Статус рабочего места">
          <span className="sidebar-status-dot" aria-hidden="true" />
          <span><strong>Локальное рабочее место</strong><small>Данные остаются в браузере</small></span>
        </div>
      </aside>

      <TopBar
        photoCount={photoCount}
        activeScreen={activeScreen}
        isBusy={isBusy}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
        onMenuClick={() => setMobileMenuOpen(true)}
      />

      <div className="app-layout">
        <div className="screen-content">
          {children}
        </div>
      </div>
      {footer}

      <div
        className={`mobile-nav-backdrop${mobileMenuOpen ? ' is-open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
      />
      <aside className={`mobile-nav-drawer${mobileMenuOpen ? ' is-open' : ''}`} aria-label="Мобильное меню">
        <div className="drawer-heading">
          <div className="sidebar-brand">
            <span className="brand-symbol" aria-hidden="true">
              <Icon name="target" size={24} />
            </span>
            <div className="sidebar-brand-text">
              <strong>Dark Cat CRM</strong>
              <span>v{BUILD.version} · {BUILD.commit}</span>
            </div>
          </div>
          <button type="button" className="icon-button" onClick={() => setMobileMenuOpen(false)} aria-label="Закрыть меню">
            <Icon name="close" />
          </button>
        </div>
        <Navigation activeScreen={activeScreen} onScreenChange={onScreenChange} onNavigate={() => setMobileMenuOpen(false)} />
      </aside>
    </main>
  );
}
