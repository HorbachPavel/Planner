# FocusFlow

Локальный персональный таск-трекер для macOS. Интерфейс работает на
`localhost`, а задачи хранятся в SQLite только на ноутбуке.

## Возможности

- быстрый ввод задач сразу в статус «В план»;
- отдельные списки рабочих и личных задач с одинаковым поведением;
- ручной порядок задач перетаскиванием;
- вкладка тем для разговора с людьми;
- выбираемый срок: просрочено, сегодня, завтра, эта неделя, следующая неделя или позже;
- одна рекомендуемая задача в Focus-режиме;
- повторения и оценка времени.

Системные уведомления, мобильная версия и облачная синхронизация задач намеренно
не входят в MVP.

## Запуск

Требуются macOS, Node.js 22+ и npm.

```bash
npm install
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000). Production-сборка:

```bash
npm run build
npm start
```

SQLite создаётся в:

```text
~/Library/Application Support/FocusFlow/assistant.sqlite
```

Для тестов или отдельного профиля путь можно заменить переменной
`ASSISTANT_DB_PATH`. Секреты сохраняются в macOS Keychain с именем сервиса
`FocusFlow Local Assistant`; они не попадают в SQLite или git.

## Проверка

```bash
npm test
npm run lint
npm run build
```

Тесты покрывают сроки, повторения, защиту от дублей, ручной порядок и CRUD.
Основной сценарий: записать задачу → выбрать срок → перетащить её на нужное
место → завершить и получить следующий экземпляр повторяющейся задачи.

## Локальные API

- `GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/:id`, `POST /api/tasks/reorder`
- `GET/POST /api/calendar`, `DELETE /api/calendar/:id`
- `GET/POST /api/people`, `PATCH/DELETE /api/people/:id`
- `GET /api/outlook/auth`, `POST /api/outlook/sync`
- `POST /api/outlook/ics`

Все API слушают только тот адрес, с которым запущен Next.js. Скрипт `npm start`
явно привязывает production-сервер к `127.0.0.1`.
