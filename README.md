# GPS Photo Distance Checker

Web-приложение для проверки расстояний между GPS-точками фотографий и получения резервированных публичных ссылок на очищенные копии.

## Возможности

- выбирает несколько фотографий в браузере;
- ищет координаты последовательным multi-pass OCR и использует EXIF как fallback;
- исключает фото без GPS из расчётов;
- рассчитывает расстояния по формуле Haversine и отмечает нарушения заданного порога;
- удаляет EXIF/GPS и проверяет очищенный файл перед отправкой;
- никогда не загружает оригинал;
- позволяет выбрать Freeimage и/или Ninjabox;
- поддерживает x0.at как обязательную третью ссылку или fallback;
- очищает тяжёлые данные из внутреннего буфера после успешной загрузки.
- сохраняет последний результат локально без исходных файлов и полных буферов.

## Пользовательский сценарий

1. Выберите до 20 фотографий JPG, PNG или WebP.
2. Нажмите «Проверить и загрузить».
3. Дождитесь OCR/EXIF, расчёта расстояний, очистки metadata и загрузки.
4. Скопируйте полный URL из карточки или сформируйте общий блок URL без подписей.

Фото без координат не участвуют в расчёте расстояний, но очищаются и загружаются. Техническая диагностика доступна только с query-параметром `?debug=1`.

OCR проверяет несколько нижних областей изображения с разной preprocessing-обработкой, показывает качество результата и позволяет вручную исправить latitude/longitude с немедленным пересчётом расстояний. Последний лёгкий результат сохраняется по ходу обработки; после reload его можно восстановить для просмотра, но продолжение cleanup/upload требует повторного выбора исходных файлов.

Перед расчётом расстояний координаты проходят sanity-проверку относительно медианного кластера пачки. Подозрительные выбросы не считаются найденными и не получают статус «ОК». OCR, очистку и загрузку можно запускать отдельно; текущий шаг отображается в журнале обработки.

## Upload flow

Сразу после выбора frontend копирует каждый picker `File` в стабильный in-memory `File`/`Blob` и создаёт thumbnail до 320 px. OCR, EXIF, cleanup и upload используют только стабильную копию. JPEG сначала очищается бинарно при любой orientation; Canvas fallback ограничен стороной 2800 px. После cleanup frontend отправляет один batch очищенных файлов в Cloudflare Worker. Результаты сопоставляются по `photoId`.

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
npx wrangler deploy --dry-run --config wrangler.toml
```

Live smoke-test уже развёрнутого Worker:

```bash
WORKER_URL=https://gps.brus-group.net/api/upload WORKER_ACCESS_TOKEN=<token> node scripts/test-worker-upload.mjs
```

## Деплой

- Production готовится как приватный Cloudflare Worker на `https://gps.brus-group.net/`.
- Worker отдаёт frontend из `dist` и обслуживает upload API на `/api/upload`.
- `.github/workflows/deploy-worker.yml` — production Cloudflare Worker + Static Assets, только `main` или manual.
- `.github/workflows/deploy.yml` — legacy GitHub Pages, только manual.
- `.github/workflows/test-worker-upload.yml` — manual smoke-test bundle upload.

Для CI нужны GitHub secrets `CLOUDFLARE_API_TOKEN` и `CLOUDFLARE_ACCOUNT_ID`. Для приватного доступа используйте Cloudflare Access или Worker secret `BASIC_AUTH_PASSWORD` / `APP_ACCESS_TOKEN`. Секреты фотохостингов не используются.

Подробно: [DEPLOYMENT.md](DEPLOYMENT.md).

## Ручная проверка перед production

1. Выбрать несколько реальных фотографий на Android Chrome.
2. Проверить OCR/EXIF и расчёт расстояний.
3. Убедиться, что metadata очищены.
4. Выполнить batch upload и получить две ссылки для каждой фотографии.
5. Проверить сценарий x0 fallback при недоступности одного основного сервиса.
