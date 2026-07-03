# GPS Photo Distance Checker

Web-приложение для проверки расстояний между GPS-точками фотографий и получения резервированных публичных ссылок на очищенные копии.

## Возможности

- выбирает несколько фотографий в браузере;
- ищет координаты через OCR и использует EXIF как fallback;
- исключает фото без GPS из расчётов;
- рассчитывает расстояния по формуле Haversine и отмечает нарушения заданного порога;
- удаляет EXIF/GPS и проверяет очищенный файл перед отправкой;
- никогда не загружает оригинал;
- получает для каждой фотографии две ссылки: Freeimage и Ninjabox;
- использует x0.at только при ошибке или тайм-ауте одного из двух основных сервисов;
- экспортирует GPX, KML, CSV и отчёт нарушений.

## Upload flow

Frontend отправляет один batch очищенных файлов в Cloudflare Worker. Worker загружает их в Freeimage и Ninjabox, сопоставляет ссылки по порядку и при необходимости вызывает x0.at.

Фотохостинги не вызываются напрямую из браузера. Аккаунты и персональные API-ключи не требуются. Публичный Freeimage API key читается Worker-ом с официальной API-страницы и кэшируется.

## Стек

- React 18
- Vite 5
- exifr
- Cloudflare Workers
- GitHub Pages

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
WORKER_URL=https://your-worker.workers.dev node scripts/test-worker-upload.mjs
```

## Деплой

- `.github/workflows/deploy.yml` — GitHub Pages.
- `.github/workflows/deploy-worker.yml` — Cloudflare Worker.
- `.github/workflows/test-worker-upload.yml` — проверка bundle после Worker deploy.

Для CI нужен только GitHub secret `CLOUDFLARE_API_TOKEN`. Секреты фотохостингов не используются.

## Ручная проверка перед production

1. Выбрать несколько реальных фотографий на Android Chrome.
2. Проверить OCR/EXIF и расчёт расстояний.
3. Убедиться, что metadata очищены.
4. Выполнить batch upload и получить две ссылки для каждой фотографии.
5. Проверить сценарий x0 fallback при недоступности одного основного сервиса.
