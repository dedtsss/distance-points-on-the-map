const bounded = (value) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;

export function actionProgress(kind, completed, total, itemFraction = null) {
  if (!Number.isInteger(total) || total <= 0) return null;
  const done = Math.max(0, Math.min(total, Math.floor(completed)));
  const part = bounded(itemFraction);
  const current = Math.min(total, done + 1);
  const names = { recognition: 'Распознавание', cleanup: 'Очистка', ninjabox: 'NinjaBox', onion: 'Onion', clipboard: 'Копирование блоков' };
  return {
    kind,
    label: `${names[kind] || kind} ${kind === 'clipboard' ? done : current}/${total}`,
    type: part === null && kind !== 'clipboard' ? (kind === 'recognition' ? 'buffer' : 'indeterminate') : 'determinate',
    value: Math.min(1, (done + (part || 0)) / total),
    buffer: current / total,
    itemPercent: part === null ? null : Math.round(part * 100),
  };
}

export function updateProgress(state) {
  if (!state) return null;
  const total = Number(state.totalBytes);
  const downloaded = Math.max(0, Number(state.downloadedBytes) || 0);
  const fraction = total > 0 ? Math.max(0, Math.min(1, downloaded / total)) : null;
  const active = state.state === 'downloading' || (state.state === 'paused' && fraction !== null);
  return {
    active,
    type: fraction === null ? 'indeterminate' : 'determinate',
    value: fraction ?? 0,
    label: total > 0
      ? `${(downloaded / 1_000_000).toFixed(1)} / ${(total / 1_000_000).toFixed(1)} MB · ${Math.round(fraction * 100)}%`
      : downloaded > 0 ? `${(downloaded / 1_000_000).toFixed(1)} MB · размер неизвестен` : 'Ожидание данных о размере',
  };
}

export function updateButton(state, version) {
  if (!version) return null;
  if (['ready_to_install', 'permission_required'].includes(state)) return `Установить ${version}`;
  if (['downloading', 'paused', 'completed', 'verifying'].includes(state)) return null;
  return 'Скачать обновление';
}
