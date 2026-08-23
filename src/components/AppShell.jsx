import { useEffect, useRef, useState } from 'react';
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
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const drawerRef = useRef(null);
  const mainContentRef = useRef(null);
  const openedMenuRef = useRef(false);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileMenuOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = [...drawerRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((node) => !node.disabled && node.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    mainContentRef.current?.setAttribute('aria-hidden', 'true');
    if (mainContentRef.current) mainContentRef.current.inert = true;
    requestAnimationFrame(() => drawerRef.current?.querySelector('button')?.focus());
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (mobileMenuOpen) return;
    if (mainContentRef.current) {
      mainContentRef.current.removeAttribute('aria-hidden');
      mainContentRef.current.inert = false;
    }
    if (openedMenuRef.current) {
      openedMenuRef.current = false;
      menuButtonRef.current?.focus();
    }
  }, [mobileMenuOpen]);

  return (
    <main className={`app-frame${sidebarCollapsed ? ' has-rail' : ''}`}>
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

      <div ref={mainContentRef} className="app-main-content">
        <TopBar
          photoCount={photoCount}
          activeScreen={activeScreen}
          isBusy={isBusy}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
          onMenuClick={() => {
            menuButtonRef.current = document.activeElement;
            openedMenuRef.current = true;
            setMobileMenuOpen(true);
          }}
          menuButtonRef={menuButtonRef}
          mobileMenuOpen={mobileMenuOpen}
        />

        <div className="app-layout">
          <div className="screen-content">
            {children}
          </div>
        </div>
        {footer}
      </div>

      <div
        className={`mobile-nav-backdrop${mobileMenuOpen ? ' is-open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
      />
      <aside ref={drawerRef} className={`mobile-nav-drawer${mobileMenuOpen ? ' is-open' : ''}`} role="dialog" aria-modal="true" aria-label="Мобильное меню" aria-hidden={!mobileMenuOpen} inert={mobileMenuOpen ? undefined : ''}>
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
