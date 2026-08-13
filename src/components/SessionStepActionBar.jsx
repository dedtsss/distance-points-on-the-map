import { Button, Dropdown } from 'antd';
import { getStepPrimaryAction, WIZARD_STAGES } from '../features/session/wizardFlow.js';

export default function SessionStepActionBar({ session, photos, isBusy, onPrimary, onBack, onSettings }) {
  const action = getStepPrimaryAction({ stage: session?.stage, photos, resultSavedAt: session?.resultSavedAt });
  const current = WIZARD_STAGES.indexOf(session?.stage || 'select');
  return (
    <section className="session-step-action-bar" aria-label="Основное действие текущего шага">
      <Button type="primary" size="large" disabled={isBusy || action.disabled} onClick={onPrimary}>{action.label}</Button>
      <Dropdown menu={{ items: [{ key: 'back', label: 'Назад', disabled: current <= 0 }, { key: 'settings', label: 'Параметры проверки' }], onClick: ({ key }) => key === 'back' ? onBack?.() : onSettings?.() }}>
        <Button aria-label="Дополнительные действия текущего шага">Дополнительно</Button>
      </Dropdown>
    </section>
  );
}
