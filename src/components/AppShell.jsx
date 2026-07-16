import TopBar from './TopBar.jsx';
import Navigation from './Navigation.jsx';

export default function AppShell({
  activeScreen,
  onScreenChange,
  photoCount,
  children,
  footer,
}) {
  return (
    <main className="app-frame">
      <TopBar photoCount={photoCount} />
      <div className="app-layout">
        <Navigation activeScreen={activeScreen} onScreenChange={onScreenChange} />
        <div className="screen-content">
          {children}
        </div>
      </div>
      {footer}
    </main>
  );
}
