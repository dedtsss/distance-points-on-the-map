AP-260808-0244 · DARK CAT · #42 · Перестроить GPS Map Photo в рабочую CRM

# ЦЕЛЬ

Автономно, без остановок на промежуточных вопросах, превратить текущее приложение GPS Map Photo в практически готовый к ежедневной работе продукт под рабочим названием **Dark Cat CRM**.

Это НЕ быстрый MVP и НЕ декоративный макет. Нужен максимально законченный рабочий продукт в рамках текущей инфраструктуры: архитектура, данные, CRM-shell, мобильный Material 3 UI, сессии, мастер обработки фотографий, OCR/metadata pipeline, загрузка, карта, разрешение конфликтов расстояния, ACTIVE/RESERVE, результаты, экспорт, настройки, тесты, self-review, CI, merge и production deployment.

Целевой репозиторий: `dedtsss/distance-points-on-the-map`
Главный issue: `#42 Dark Cat CRM: productize GPS Map Photo into session-based Material 3 workflow`
Базовая версия перед задачей: ориентировочно `0.3.12`.
Production: `https://gps.bruce-group.net/`
Guest: `https://gps-guest.bruce-group.net/`

# РЕЖИМ РАБОТЫ — ОБЯЗАТЕЛЬНО

Работай в режиме цели / non-stop от начала до конца.

1. Сначала исследуй текущий `main`: React/Vite UI, Worker, workflows, storage, OCR, GPS metadata, cleanup, upload providers, map, result formatter, current tests и deployment.
2. Не задавай пользователю уточняющих вопросов и не жди подтверждения после этапов.
3. При неоднозначности выбирай самый простой, обратимый и совместимый вариант; фиксируй решение в issue/PR.
4. Если конкретный подпункт блокируется внешним API, credential, Cloudflare provisioning, permissions или сторонним сервисом:
   - попробуй разумные варианты решения;
   - если внешнее действие действительно обязательно — зафиксируй `BLOCKED` с точной причиной;
   - реализуй безопасный adapter/fallback/stub, если возможно;
   - продолжай остальные этапы, не останавливая всю задачу.
5. Не ломай существующую рабочую OCR/upload/map-логику ради редизайна. Сначала отделяй engine/domain от UI, затем перестраивай оболочку.
6. Делай логические commits по крупным фазам.
7. После крупных фаз оставляй короткий status comment в issue #42: что сделано, commit, проверки, известные ограничения. Это отчёт, не запрос разрешения.
8. Не публикуй реальные пользовательские фото, логины, пароли, API keys, tokens и secrets.
9. Не удаляй production secrets, существующие endpoints и deploy workflows.
10. В конце создай PR в `main`, проведи self-review, исправь замечания, доведи CI до green. После green merge, если rules/permissions позволяют, затем отдельно проверь `deploy/production` и `deploy/guest`.
11. Если merge/deploy физически запрещён permissions — это допустимый финальный blocker; вся остальная работа всё равно должна быть завершена.

Предпочтительная ветка: `codex/dark-cat-crm-42`.

# 1. ПРОДУКТОВАЯ МОДЕЛЬ

Главная сущность — **Session / Сессия обработки фотографий**.

Dark Cat не должен оставаться одной длинной страницей GPS checker. Существующая функциональность должна быть разложена вокруг сессии и последовательного рабочего процесса.

Минимальная модель Session:
- stable id;
- последовательный неизменяемый `sessionNumber`;
- optional name/title;
- color;
- packing / фасовка;
- common comment/description;
- status;
- createdAt / updatedAt;
- total photo count;
- active count;
- reserve count;
- OCR/upload/error statistics.

Минимальная модель PhotoItem:
- id;
- sessionId;
- original file name;
- optional processed/renamed file name;
- OCR index;
- latitude / longitude;
- coordinate source: metadata / OCR / manual / unavailable;
- OCR status / diagnostics;
- metadata cleanup status;
- upload status;
- links/providers;
- ACTIVE / RESERVE;
- optional reserve reason;
- thumbnail/local preview reference, если технически возможно без публикации приватных файлов.

# 2. ХРАНЕНИЕ

Сессии должны сохраняться между перезагрузками.

Предпочтительный production-путь — текущая Cloudflare архитектура + D1, если его можно корректно добавить без ручного внешнего вмешательства.

Порядок:
1. Проверь Worker/wrangler/deploy и существующее persistent storage.
2. Если D1 можно provision/bind/deploy имеющимися правами — сделай D1 schema/migrations/repository layer.
3. Миграции только неразрушающие.
4. Не храни большие binary photo blobs в D1.
5. Если D1 блокируется credential/permissions — не останавливай задачу: реализуй storage abstraction + рабочий IndexedDB/local persistent adapter, а D1 schema/migrations/adapter подготовь настолько полно, насколько возможно.

# 3. DARK CAT CRM SHELL

Сделай цельную тёмную CRM-оболочку в стиле Material 3, без декоративного перегруза.

Главный приоритет — мобильный телефон в вертикальном положении.

Обязательный QA:
- 390x844;
- 360x800;
- 412x915;
- дополнительно desktop smoke.

Требования:
- mobile-first;
- никакого horizontal overflow;
- safe-area support;
- кнопки не перекрываются browser/navigation bars;
- клавиатура не закрывает критические действия;
- длинные русские надписи не ломают layout;
- нормальные touch targets;
- оформленные loading/error/empty/success states;
- единые spacing/radius/type tokens;
- аккуратные Material 3 cards, app bar, fields, chips, buttons, sheets/dialogs;
- никаких плавающих высот, съезжающих кнопок, обрезанных подписей.

## Навигация

На мобильном — hamburger + выезжающий слева Navigation Drawer.

Разделы:
1. Дашборд
2. Сессии
3. Обработать фотографии
4. Резерв
5. Настройки

В drawer показать:
- Dark Cat;
- версию приложения;
- short commit/build identifier, если текущая система это поддерживает.

На широком экране допускается permanent drawer/rail.

Не проектируй заново auth. Сохрани текущий production/guest access layer. Авторизация не должна блокировать эту задачу.

# 4. ДАШБОРД

Только реальные метрики из сохранённых данных, без fake charts.

Минимум:
- всего сессий;
- всего обработанных фото;
- распознано индексов;
- распознано координат;
- загружено фото;
- ACTIVE;
- RESERVE;
- ошибки/требуют внимания;
- последние сессии.

Для последних сессий:
- номер;
- дата;
- цвет;
- фасовка;
- количество фото;
- ACTIVE/RESERVE;
- статус.

Клик открывает session detail.

# 5. СЕССИИ

Раздел `Сессии`:
- новые сверху;
- поиск минимум по номеру/названию/цвету/фасовке, если не усложняет архитектуру;
- статусы;
- открыть detail;
- создать новую;
- продолжить незавершённую.

Session detail объединяет стадии:
`Обработка → Загрузка → Карта → Результат`.

Разрешить возвращаться назад без потери данных.

# 6. МАСТЕР «ОБРАБОТАТЬ ФОТОГРАФИИ»

Сделай пошаговый wizard/stepper.

## Шаг 1 — новая сессия / выбор файлов

Поля:
- выбрать фотографии или папку;
- цвет;
- фасовка — произвольный текст;
- optional common description/comment;
- optional session title.

Сохрани Android-compatible folder picker fallback для GrapheneOS/Vanadium. Не возвращай регрессию `showDirectoryPicker()/getFile()` на Android.

После выбора показывай количество файлов и ошибки чтения.

## Шаг 2 — распознавание

Координаты:
1. сначала корректный GPS из metadata, если реально существует;
2. если metadata нет/невалидна — OCR coordinates;
3. OCR index существующим проверенным механизмом;
4. если не распознано — `требует внимания` + ручная правка.

Не ухудшай существующую точность OCR.

Progress:
- текущий файл;
- этап;
- N из M;
- success/warning/error counts.

После обработки карточки/таблица:
- index;
- coordinates;
- coordinate source;
- status;
- ручная правка.

Отдельный обязательный preview-step не нужен.

## Шаг 3 — очистка и upload

Сохрани существующий pipeline:
- metadata cleanup согласно Settings;
- rename rule, если включена;
- upload;
- provider fallback;
- проверка URL.

Проверь текущий fallback `NinjaBox → Freeimage → x0.at`. Если он работает — сохрани, но provider order должен управляться Settings.

Покажи uploaded/fallback/failed/retry.

# 7. КАРТА И КОНФЛИКТЫ < 25 М

Карта — рабочий инструмент текущей сессии.

Для точки по tap/click показать popup/card:
- index;
- coordinates;
- thumbnail, если доступен;
- статус ACTIVE/RESERVE;
- расстояния до конфликтующих точек;
- действие ACTIVE ↔ RESERVE.

Distance threshold по умолчанию 25 м, но вынести в Settings.

Если есть пары ACTIVE-точек ближе threshold, система должна предложить минимальное количество точек для перевода в RESERVE, чтобы среди оставшихся ACTIVE не осталось конфликтующих пар.

Рассматривай конфликтную сеть как граф. Для небольших типичных сессий рассчитай точное или практически точное минимальное удаление. Не используй тупое правило «каждая вторая точка». Если точный алгоритм становится слишком дорогим на больших наборах — используй детерминированный bounded алгоритм/эвристику с явным сообщением.

Покажи:
- количество конфликтов;
- рекомендуемые индексы к переводу в RESERVE;
- сколько ACTIVE останется;
- принять рекомендацию целиком;
- ручное изменение.

RESERVE — только логическое исключение. Не удалять photo data, links, coordinates физически.

# 8. РЕЗЕРВ

Отдельный раздел со всеми RESERVE items.

Нужно:
- сессия происхождения;
- index;
- coordinates;
- thumbnail/links;
- причина;
- вернуть в ACTIVE;
- архитектурно подготовить перенос в другую сессию; если полноценный перенос безопасно реализуется — сделай.

# 9. РЕЗУЛЬТАТ

Итог формируется только из ACTIVE items текущей сессии.

Сохрани формат одного блока:

==========
#12346
Координаты: 64.123500, 30.123600
Цвет: Красный
Фасовка: пачка 10 шт.
Фото: https://ссылка
Комментарий: Описание
==========

В общем тексте между блоками ровно одна пустая строка.

Нужно:
- общий textarea/result view;
- `Скопировать всё`;
- отдельная карточка каждого ACTIVE item;
- `Копировать блок`;
- после поштучного копирования карточка заметно отмечается как скопированная;
- состояние copied сохраняется минимум пока открыта session page;
- счётчик `Скопировано X / N`;
- при разумной реализации добавить `Скопировать следующий`.

RESERVE не должен попадать в основной общий текст, но остаётся доступен рядом/через раздел Резерв.

# 10. TXT EXPORT

Добавить кнопку `Скачать TXT`.

TXT содержит ровно текущий общий ACTIVE result text.

Имя файла обязательно строить в таком порядке:
1. номер сессии;
2. фасовка;
3. цвет;
4. количество блоков ACTIVE.

Пример после безопасной нормализации имени:
`0042_10шт_Красный_12.txt`

Требования:
- `sessionNumber` всегда первый;
- затем packing;
- затем color;
- затем active block count;
- убрать символы, запрещённые в именах файлов;
- не допускать пустое/сломанное имя;
- download локально на устройство стандартным браузерным механизмом.

Сохрани также GPX/KML/GeoJSON export.

# 11. ЗАГОТОВКА ПЕРЕДАЧИ ВО ВНЕШНИЙ СКРИПТ

Реальный механизм внешнего autofill-скрипта сейчас отлаживается отдельно. НЕ выдумывай протокол и НЕ блокируй задачу на этой интеграции.

Сделай подготовленный integration boundary:
- `ExportPackage`/эквивалент;
- sessionId/sessionNumber;
- packing;
- color;
- active count;
- items[];
- formattedText;
- version/schemaVersion;
- adapter/interface для будущего transport;
- UI-кнопку можно показать как disabled/`Скоро` или feature-flagged только если это не вводит пользователя в заблуждение.

Никаких fake successful send.

Структурированный export должен позволить в будущем передавать данные без повторного парсинга текстового блока.

# 12. НАСТРОЙКИ

Сделай реально работающие группы Settings.

Фотографии:
- metadata cleanup;
- rename rule;
- рабочие параметры обработки, если они реально поддержаны.

Загрузка:
- включённые providers;
- порядок fallback;
- основной provider;
- проверка ссылок.

Распознавание:
- metadata → OCR policy там, где это действительно имеет смысл;
- практические OCR параметры только если pipeline их поддерживает.

Карта:
- default basemap;
- доступные OSM/EOX/ArcGIS слои, сохранив существующие legal/safe варианты;
- distance threshold, default 25 м.

Результат:
- common description;
- при возможности без усложнения — параметры отображения/export, но не ломай установленный формат по умолчанию.

Не показывай control, который ни на что не влияет.

# 13. UX / MOBILE QA

Это почти production-ready продукт, поэтому доведи интерфейс, а не только функциональность.

Проверить каждый раздел на 360x800, 390x844, 412x915:
- drawer;
- dashboard;
- sessions;
- wizard каждый шаг;
- processing progress;
- upload progress;
- map;
- popup точки;
- conflict recommendation;
- result cards;
- copied state;
- TXT export action;
- reserve;
- settings.

Проверить:
- horizontal overflow = 0;
- sticky/fixed элементы не перекрывают контент;
- safe areas;
- keyboard/IME;
- длинные URL;
- длинные packing/color/comment;
- empty/loading/error/success;
- кнопки и тексты не скачут;
- элементы доступны пальцем.

Если есть Playwright — расширь browser/mobile smoke tests. Не ограничивайся только unit tests.

# 14. ТЕСТЫ

Сохрани все существующие тесты и добавь минимум:
- Session domain/storage;
- session number generation;
- persistence;
- ACTIVE/RESERVE filtering;
- conflict graph calculation;
- recommendation minimal removals на representative fixtures;
- result formatting;
- TXT filename normalization/order;
- ExportPackage contract;
- settings persistence;
- wizard stage transitions;
- Android folder strategy regression;
- mobile layout/browser smoke.

Запусти полный test suite и production build.

Не отключай существующий failing test просто ради green. Исправляй причину или обоснованно обновляй ожидание при сознательном изменении продукта.

# 15. СОВМЕСТИМОСТЬ / НЕ ЛОМАТЬ

Сохранить:
- рабочий OCR index/coordinates;
- GPS metadata path;
- Android GrapheneOS folder fallback;
- metadata cleanup;
- upload provider fallback;
- link formatting;
- Leaflet/map functionality;
- current basemap choices;
- coordinate export GPX/KML/GeoJSON;
- production/guest access;
- deploy workflows;
- отсутствие secrets в frontend bundle/repo.

# 16. ВЕРСИЯ

Подними semver обоснованно как значимый product release. Показывай версию в drawer/about area из одного source of truth, не хардкодь несколько разных значений.

# 17. ПОРЯДОК ВЫПОЛНЕНИЯ

Следуй примерно этому порядку, но сам корректируй его, если кодовая база требует другого:

1. Audit current main.
2. Domain/session/storage architecture.
3. CRM shell + routing/navigation + Material 3 tokens.
4. Dashboard + sessions.
5. Wizard wrapping existing processing engine.
6. Upload stage.
7. Map/session state + conflicts + ACTIVE/RESERVE.
8. Reserve.
9. Result + copied workflow.
10. TXT export + ExportPackage stub.
11. Settings.
12. Persistence integration.
13. Mobile visual QA/fixes.
14. Full tests/build.
15. Self-review.
16. PR.
17. CI fixes until green.
18. Merge.
19. Verify deploy/production and deploy/guest.
20. Final issue comment/report.

Не останавливайся между этими пунктами.

# 18. SELF-REVIEW ПЕРЕД PR/MERGE

Проверь минимум:
- нет ли потери существующей GPS/OCR функциональности;
- нет ли случайного удаления production data;
- нет ли secrets;
- нет ли hardcoded fake data;
- правильно ли ACTIVE/RESERVE влияет на map/result/export;
- действительно ли recommendation устраняет все <threshold conflicts;
- TXT имя соответствует `номер → фасовка → цвет → количество`;
- внешняя script integration честно обозначена как stub;
- responsive UI не имеет overflow;
- version/build display корректен;
- CI workflows не сломаны.

# 19. ФИНАЛЬНЫЙ ОТЧЁТ

После завершения оставь в issue #42 один итоговый комментарий:
- Result: SUCCESS / PARTIAL / BLOCKED;
- branch;
- PR;
- merge commit;
- production commit;
- version;
- основные реализованные модули;
- storage backend фактически используемый;
- tests/build results;
- mobile viewports tested;
- production deployment status отдельно для main и guest;
- известные blockers/ограничения;
- список того, что сознательно оставлено на будущую интеграцию внешнего скрипта.

Цель считается выполненной только после максимально полного end-to-end прохода, а не после первого работающего экрана.