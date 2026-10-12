export function releaseNotes(source, version) {
  const entries = String(source).split(/(?=^Версия \d+\.\d+\.\d+ от )/m);
  const entry = entries.find((text) => text.startsWith(`Версия ${version} от `));
  return entry ? entry.split(/^Источники подтверждённой истории:/m)[0].trim() : '';
}

// The full repository entry remains the release source. In-app history takes
// one user-facing item per category, avoiding an ever-growing wall of text.
export function compactReleaseNotes(source, version) {
  const notes = releaseNotes(source, version);
  if (!notes) return '';
  const items = ['Что нового:', 'Изменено:', 'Исправлено:'].flatMap((heading) => {
    const section = notes.split(heading)[1]?.split(/\n\s*\n/)[0];
    const first = section?.split('\n').find((line) => line.startsWith('- '));
    return first ? [first] : [];
  });
  return [notes.split('\n')[0], ...items].join('\n');
}

export function recentReleaseEntries(source) {
  return [...String(source).matchAll(/^Версия (\d+\.\d+\.\d+) от /gm)]
    .slice(0, 3).map((match) => ({ version: match[1], text: compactReleaseNotes(source, match[1]) }));
}
