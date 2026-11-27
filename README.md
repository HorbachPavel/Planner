# FocusFlow

Личный планировщик задач и заметок «что обсудить с людьми». Работает в браузере
на ноутбуке и телефоне. Опубликован на GitHub Pages.

## Возможности

- вкладки «Work», «Personal» и «To discuss»;
- быстрый ввод задачи со сроком (Overdue, Today, Tomorrow, This week, Next week,
  Later); сроки сдвигаются сами при смене дня;
- ручной порядок задач и людей перетаскиванием;
- полоса «Now» с текущей задачей;
- список людей с темами для разговора и закреплением наверху;
- изменения видны на экране сразу, сохранение идёт в фоне;
- у каждого пользователя свой вход и свой отдельный список.

## Где хранятся данные

Списки хранятся в Firebase (проект `focusflow-717b1`, бесплатный план Spark):
вход по почте и паролю — Firebase Authentication, данные — Cloud Firestore, один
документ `users/{uid}` на человека. Правила доступа — в `firestore.rules`: каждый
читает и меняет только свой документ. Файл в репозитории — копия для справки,
действуют правила, опубликованные в консоли Firebase (Firestore → Rules).

Тексты (названия и заметки задач, имена и тексты карточек) шифруются на устройстве
до отправки. У каждого свой случайный ключ; в Firebase он лежит запертым паролем и
кодом восстановления. Без пароля и без кода список не восстановить никому. Сроки,
статусы, порядок, количество записей и почта не шифруются. Подробности — в
`src/lib/keys.ts` и `src/lib/encryptedDocument.ts`.

Автоматических резервных копий нет. Кнопка Account → Export to file сохраняет
список в файл (незашифрованный). Там же — перенос списка из старого хранилища
`HorbachPavel/Planner-Data` (нужен GitHub-токен, файл на GitHub не меняется).

## Запуск на своём компьютере

Нужен Node.js 22 или новее.

```bash
npm install
npm run dev
```

Затем откройте адрес, который покажет `npm run dev`
(обычно http://127.0.0.1:3000/Planner/).

В Windows PowerShell команда `npm` может не запускаться с ошибкой про
«выполнение сценариев отключено». Это лечится один раз командой:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## Публикация

Любой push в ветку `main` запускает GitHub Actions
(`.github/workflows/pages.yml`). Он собирает сайт и публикует его на GitHub
Pages.

## Проверка перед публикацией

```bash
npm test
npm run lint
npm run build
```

## Устройство кода

- `src/app/` — страница и стили;
- `src/components/Dashboard.tsx` — весь интерфейс;
- `src/components/PlannerProvider.tsx` — проверка входа и доступ к списку;
- `src/components/SignInForm.tsx` — вход, регистрация, сброс пароля;
- `src/components/AccountPanel.tsx` — выгрузка в файл, перенос, выход;
- `src/lib/plannerSync.ts` — мгновенные изменения и фоновое сохранение;
- `src/lib/plannerChanges.ts` — что именно изменилось и надо записать;
- `src/components/KeyGate.tsx`, `RecoveryCode.tsx` — ключ и код восстановления;
- `src/lib/keys.ts`, `encryptedDocument.ts`, `deviceKey.ts` — шифрование;
- `src/lib/firebase.ts` — связь с Firebase;
- `src/lib/plannerDocument.ts` — правила работы со списком (добавить, изменить,
  переставить, сдвинуть сроки);
- `src/lib/githubImport.ts` — чтение старого списка с GitHub.
