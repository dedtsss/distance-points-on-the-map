import { readFile } from 'node:fs/promises';
import { releaseNotes } from '../src/changelog.js';
const version = process.argv[2];
const notes = releaseNotes(await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8'), version);
if (!/^Версия \d+\.\d+\.\d+ от \d{2}\.\d{2}\.\d{4} г\./.test(notes)
  || !['Что нового:', 'Изменено:', 'Исправлено:'].every((heading) => notes.includes(heading))) {
  throw new Error(`Нет полной записи CHANGELOG для ${version}. Публикация недопустима.`);
}
process.stdout.write(`${notes}\n`);
