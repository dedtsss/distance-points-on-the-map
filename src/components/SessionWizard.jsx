import { Button, Dropdown, Steps, Tag } from 'antd';
import { ProCard } from '@ant-design/pro-components';
import { SESSION_COLOR_SUGGESTIONS } from '../features/export/exportPreferences.js';
import Icon from './Icon.jsx';

const STEPS = [
  { id: 'select', title: 'Выбор' },
  { id: 'recognition', title: 'Распознавание' },
  { id: 'review', title: 'Проверка' },
  { id: 'result', title: 'Результат' },
];

export default function SessionWizard({ session, photoCount, isBusy, onSessionChange, onStartNew, onStageChange, onPrimary }) {
  const stage = STEPS.some((item) => item.id === session?.stage) ? session.stage : 'select';
  const current = STEPS.findIndex((item) => item.id === stage);
  const update = (patch) => onSessionChange?.(patch);
  const number = String(session?.sessionNumber || 0).padStart(4, '0');
  const prerequisite = photoCount > 0;
  const primaryCopy = ['Продолжить к распознаванию', 'Продолжить к проверке', 'Подготовить очищенные фото', 'Загрузить очищенные'][current];

  return (
    <ProCard className="session-wizard" bordered aria-labelledby="session-wizard-title">
      <div className="session-wizard-heading">
        <div>
          <p className="page-eyebrow">Сессия №{number} <Tag color={prerequisite ? 'blue' : 'default'}>{photoCount} фото</Tag></p>
          <h2 id="session-wizard-title">Рабочая сессия</h2>
          <p>Исходные фото остаются на устройстве. В обработку и upload передаются только данные по правилам privacy pipeline.</p>
        </div>
        <Button onClick={onStartNew} disabled={isBusy} icon={<Icon name="plus" size={16} />}>Новая сессия</Button>
      </div>
      <Steps className="session-ant-steps" current={current} responsive items={STEPS.map((item, index) => ({
        title: item.title,
        disabled: isBusy || (index > current && (!prerequisite || index > current + 1)),
        onClick: () => index <= current && onStageChange?.(item.id),
      }))} />
      {stage === 'select' && <div className="session-fields">
        <label className="setting-field">Название сессии <small>необязательно</small><input type="text" maxLength="160" value={session?.title || session?.name || ''} onChange={(event) => update({ title: event.target.value, name: event.target.value })} placeholder="Например: Северный участок" disabled={isBusy} /></label>
        <label className="setting-field">Цвет<input type="text" list="wizard-session-color-options" maxLength="80" value={session?.color || ''} onChange={(event) => update({ color: event.target.value })} placeholder="Красный" disabled={isBusy} /><datalist id="wizard-session-color-options">{SESSION_COLOR_SUGGESTIONS.map((color) => <option key={color} value={color} />)}</datalist></label>
        <label className="setting-field">Фасовка<input type="text" maxLength="120" value={session?.packing || ''} onChange={(event) => update({ packing: event.target.value })} placeholder="Например: пачка 10 шт." disabled={isBusy} /></label>
        <label className="setting-field session-description-field">Общий комментарий <small>необязательно</small><textarea rows="3" maxLength="4000" value={session?.description || ''} onChange={(event) => update({ description: event.target.value })} placeholder="Комментарий будет добавлен в результат ACTIVE-точек" disabled={isBusy} /></label>
      </div>}
      <div className="wizard-primary-row">
        <Button type="primary" size="large" disabled={isBusy || !prerequisite} onClick={onPrimary}>{primaryCopy}</Button>
        <Dropdown menu={{ items: [{ key: 'back', label: 'Назад', disabled: current === 0 }, { key: 'settings', label: 'Параметры проверки' }], onClick: ({ key }) => key === 'back' && onStageChange?.(STEPS[current - 1]?.id) }}><Button aria-label="Дополнительные действия">Дополнительно</Button></Dropdown>
      </div>
    </ProCard>
  );
}
