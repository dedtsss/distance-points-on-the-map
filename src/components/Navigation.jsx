import { APP_SCREENS } from '../features/ui/screens.js';
import Icon from './Icon.jsx';
import { Menu } from 'antd';

const ICON_BY_SCREEN = {
  overview: 'dashboard',
  session: 'upload',
  history: 'sessions',
  map: 'map',
  results: 'results',
  sessions: 'sessions',
  journal: 'journal',
  settings: 'settings',
};

export default function Navigation({ activeScreen, onScreenChange, collapsed = false, onNavigate }) {
  return (
    <nav aria-label="Разделы приложения">
      <Menu
        className="ant-navigation"
        theme="dark"
        mode="inline"
        inlineCollapsed={collapsed}
        selectedKeys={[activeScreen]}
        onClick={({ key }) => { onScreenChange(key); onNavigate?.(); }}
        items={APP_SCREENS.map((screen) => ({ key: screen.id, label: screen.label, icon: <Icon name={ICON_BY_SCREEN[screen.id]} size={18} /> }))}
      />
    </nav>
  );
}
