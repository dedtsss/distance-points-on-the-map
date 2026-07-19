# GPS Photo Distance Checker

Web-приложение для проверки расстояний между GPS-точками фотографий и получения резервированных публичных ссылок на очищенные копии.

## Возможности

- выбирает несколько фотографий в браузере;
- выбирает физическую папку с фотографиями, включая вложенные подпапки, когда это поддерживает браузер;
- ищет координаты последовательным multi-pass OCR и использует EXIF как fallback;
- исключает фото без GPS из расчётов;
- рассчитывает расстояния по формуле Haversine и отмечает нарушения заданного порога;
- удаляет EXIF/GPS и проверяет очищенный файл перед отправкой;
- никогда не загружает оригинал;
- позволяет выбрать Freeimage и/или Ninjabox;
- поддерживает x0.at как обязательную третью ссылку или fallback;
- очищает тяжёлые данные из внутреннего буфера после успешной загрузки;
- сохраняет последний результат локально без исходных файлов и полных буферов.

## Пользовательский сценарий

1. Выберите до 20 фотографий JPG, PNG или WebP: отдельными файлами через «Выбрать фотографии» или физической папкой через «Выбрать папку».
2. Нажмите «Проверить и загрузить».
3. Дождитесь OCR/EXIF, расчёта расстояний, очистки metadata и загрузки.
4. Скопируйте полный URL из карточки или сформируйте общий блок URL без подписей.

Фото без координат не участвуют в расчёте расстояний, но очищаются и загружаются. Техническая диагностика доступна только с query-параметром `?debug=1`.

OCR проверяет несколько нижних областей изображения с разной preprocessing-обработкой, показывает качество результата и позволяет вручную исправить latitude/longitude с немедленным пересчётом расстояний. Последний лёгкий результат сохраняется по ходу обработки; после reload его можно восстановить для просмотра, но продолжение cleanup/upload требует повторного выбора исходных файлов.

Перед расчётом расстояний координаты проходят sanity-проверку относительно медианного кластера пачки. Подозрительные выбросы не считаются найденными и не получают статус «ОК». OCR, очистку и загрузку можно запускать отдельно; текущий шаг отображается в журнале обработки.

## Выбор файлов и папок

Кнопка «Выбрать фотографии» использует обычный `<input type="file" multiple>` и сохраняет прежнее поведение выбора одного или нескольких файлов.

Кнопка «Выбрать папку» появляется только при фактической поддержке браузером. Приложение использует progressive enhancement:

- `window.showDirectoryPicker()` из File System Access API, если метод доступен;
- fallback `<input type="file" webkitdirectory multiple accept="image/*">`, если доступен directory input;
- обычный выбор отдельных файлов остаётся доступен всегда.

Папочный импорт работает с физической папкой, выбранной через системный файловый проводник. Приложение рекурсивно собирает файлы из подпапок, сортирует их естественно по относительному пути и имени (`photo2.jpg` раньше `photo10.jpg`), сохраняет `relativePath`, если браузер его предоставляет, и показывает сводку: имя папки, найдено файлов, добавлено фотографий, пропущено, вложенных папок и причины пропуска.

Поддерживаемые форматы остаются текущими для pipeline: JPG/JPEG, PNG и WebP. HEIC/HEIF не добавляются, потому что текущая OCR/cleanup-цепочка не гарантирует их обработку во всех целевых браузерах. Если у файла есть явный неподдерживаемый MIME type, он не принимается только по расширению.

Текущий лимит приложения — до 20 фотографий за один выбор. Большая папка сканируется для отчёта, но в память читаются только допустимые файлы, которые попали в лимит; остальные отмечаются как превышение существующего ограничения. Дубликаты внутри одной операции пропускаются по безопасной комбинации `relativePath/name + size + lastModified`.

Поддержка браузеров:

- Windows Chrome и Windows Edge: `showDirectoryPicker` или `webkitdirectory`, плюс drag/drop файлов; drop папок поддерживается в desktop Chromium, когда браузер отдаёт directory entries.
- Android Chrome: папочный выбор работает только через доступные системные picker-возможности браузера; поддержка определяется feature detection, а не user-agent.
- Android Chromium WebView/PWA: зависит от конкретной WebView/PWA-оболочки и доступных picker API.
- Firefox и Safari: обычный выбор отдельных файлов сохраняется; кнопка папки скрывается, если доступных directory API нет.

Ограничения Android 13, 14 и 15: веб-приложение не получает постоянный произвольный доступ ко всему хранилищу. Пользователь каждый раз явно выбирает папку через системный picker. Некоторые системные каталоги могут быть недоступны. Виртуальные альбомы галереи, облачные подборки, «Недавние», «Избранное» и похожие коллекции могут не соответствовать реальной папке. Приложение не запрашивает лишние разрешения, не использует `MANAGE_EXTERNAL_STORAGE`, APK, MediaStore или Storage Access Framework в этой задаче.

После закрытия браузера сохранённая сессия может восстановить результаты и относительные пути, но не доступ к локальной папке и не исходные `File` objects. Для нового OCR/cleanup/upload нужно снова выбрать файлы или папку.

Если в будущем понадобится выбирать виртуальные альбомы галереи, облачные подборки или стабильно работать с Android media library вне ограничений браузерного picker, потребуется отдельный APK с MediaStore и/или Storage Access Framework.

## Upload flow

Сразу после выбора frontend копирует каждый picker `File` в стабильный in-memory `File`/`Blob` и создаёт thumbnail до 320 px. Для папочного импорта сохраняется лёгкий `relativePath`, но не directory handle. OCR, EXIF, cleanup и upload используют только стабильную копию. JPEG сначала очищается бинарно при любой orientation; Canvas fallback ограничен стороной 2800 px. После cleanup frontend отправляет один batch очищенных файлов в Cloudflare Worker. Результаты сопоставляются по `photoId`.

Фотохостинги не вызываются напрямую из браузера. Аккаунты и персональные API-ключи не требуются. Публичный Freeimage API key читается Worker-ом с официальной API-страницы и кэшируется.

## Стек

- React 18
- Vite 5
- exifr
- Cloudflare Workers Static Assets
- GitHub Pages legacy/manual preview

## Локальный запуск

```bash
npm install
npm run dev
```

## Проверки

```bash
npm test
npm run build
npm run build:cloudflare
npm run test:preview-smoke
npx wrangler deploy --dry-run --config wrangler.toml
npx wrangler deploy --dry-run --config wrangler.guest.toml
```

Live smoke-test уже развёрнутого Worker:

```bash
WORKER_URL=https://gps.bruce-group.net/api/upload WORKER_ACCESS_TOKEN=<token> node scripts/test-worker-upload.mjs
```

Guest Basic Auth smoke (без печати пароля в команду/логи):

```bash
read -r -s -p "Guest username: " GUEST_BASIC_AUTH_USERNAME; echo
read -r -s -p "Guest password: " GUEST_BASIC_AUTH_PASSWORD; echo
export GUEST_BASIC_AUTH_USERNAME GUEST_BASIC_AUTH_PASSWORD
node scripts/test-worker-guest-auth.mjs
unset GUEST_BASIC_AUTH_USERNAME GUEST_BASIC_AUTH_PASSWORD
```

## Деплой

- Owner production: приватный Cloudflare Worker на `https://gps.bruce-group.net/` (Google Cloudflare Access).
- Guest production: отдельный Cloudflare Worker на `https://gps-guest.bruce-group.net/` (Worker Basic Auth).
- Guest Worker работает в fail-closed режиме `BASIC_AUTH_REQUIRED=true`: без `BASIC_AUTH_USERNAME` или `BASIC_AUTH_PASSWORD` frontend и `/api/upload` отвечают `401`, а первый deploy передаёт оба значения через временный `wrangler deploy --secrets-file` файл с правами `600`.
- Worker отдаёт frontend из `dist` и обслуживает upload API на `/api/upload`.
- `.github/workflows/deploy-worker.yml` — production Cloudflare Worker + Static Assets, только `main` или manual.
- `.github/workflows/deploy-worker-guest.yml` — ручной deploy guest Worker + проверки разделения owner/guest и атомарная публикация `BASIC_AUTH_USERNAME`/`BASIC_AUTH_PASSWORD` через `--secrets-file`.
- `.github/workflows/deploy.yml` — legacy GitHub Pages, только manual.
- `.github/workflows/test-worker-upload.yml` — manual smoke-test bundle upload.

Для CI нужны GitHub secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `BASIC_AUTH_USERNAME` и `BASIC_AUTH_PASSWORD` для guest workflow. Guest вход использует только Worker secrets `BASIC_AUTH_USERNAME` и `BASIC_AUTH_PASSWORD` в `wrangler.guest.toml`; `APP_ACCESS_TOKEN` сохраняется как машинная/CI совместимость только через Bearer или `X-App-Access-Token` для owner flow, не как Basic Auth credential. Секреты фотохостингов не используются.

Подробно: [DEPLOYMENT.md](DEPLOYMENT.md).

## Ручная проверка перед production

1. Выбрать несколько реальных фотографий на desktop Chrome/Edge.
2. Выбрать тестовую физическую папку и папку с вложенными подпапками.
3. Проверить порядок, сводку, причины пропусков и восстановление текущей сессии.
4. Открыть карту и результаты.
5. Выбрать несколько реальных фотографий на Android Chrome.
6. При доступности на устройстве выбрать физическую папку через системный picker.
7. Проверить OCR/EXIF и расчёт расстояний.
8. Убедиться, что metadata очищены.
9. Выполнить batch upload и получить две ссылки для каждой фотографии.
10. Проверить сценарий x0 fallback при недоступности одного основного сервиса.

Справочные документы по browser API:

- [Chrome File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
- [MDN `showDirectoryPicker`](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)
- [MDN `HTMLInputElement.webkitdirectory`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory)
- [MDN `File.webkitRelativePath`](https://developer.mozilla.org/en-US/docs/Web/API/File/webkitRelativePath)
- [Android Storage Access Framework](https://developer.android.com/training/data-storage/shared/documents-files)
