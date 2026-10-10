export function releaseNotes(source, version) {
  const entries = String(source).split(/(?=^Версия \d+\.\d+\.\d+ от )/m);
  const entry = entries.find((text) => text.startsWith(`Версия ${version} от `));
  return entry ? entry.split(/^Источники подтверждённой истории:/m)[0].trim() : '';
}
