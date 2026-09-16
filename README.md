# Chat App (TypeScript + Firebase + Redis + Render)

## Структура
- `server/` — Node.js + Express + Socket.io (TypeScript). Проверяет Firebase ID-токены,
  хранит профили в Firestore, сообщения — в Redis.
- `client/` — React + Vite (TypeScript). Регистрация/вход через Firebase Auth,
  чат через Socket.io.

## 1. Настройка Firebase
1. Создайте проект на https://console.firebase.google.com
2. Authentication -> Sign-in method -> включите **Email/Password**.
3. Firestore Database -> создайте базу (production mode).
4. Project settings -> General -> Add app (Web) -> скопируйте `apiKey`, `authDomain`,
   `projectId`, `appId` — это пойдёт в `client/.env`.
5. Project settings -> Service accounts -> Generate new private key -> скачается JSON.
   Из него возьмите `project_id`, `client_email`, `private_key` — это пойдёт в `server/.env`.

## 2. Настройка Redis
Вариант А — Render Redis (Dashboard -> New -> Redis, выберите план, скопируйте
"Internal Redis URL" если сервер тоже на Render, или "External" если снаружи).
Вариант Б — Upstash / Redis Cloud (есть бесплатный tier, дают готовый `REDIS_URL` с TLS).
Полученную строку впишите в `server/.env` как `REDIS_URL`.

## 3. Локальный запуск
```bash
cd server
cp .env.example .env   # заполните значениями из Firebase/Redis
npm install
npm run dev

cd ../client
cp .env.example .env   # заполните публичными ключами Firebase + http://localhost:3000
npm install
npm run dev
```
Откройте http://localhost:5173

## 4. Деплой на Render — один web-сервис (проще, экономит бесплатные часы)
Сервер сам отдаёт собранный клиент (`client/dist`) как статику, поэтому для
бесплатного аккаунта достаточно ОДНОГО Web Service + одного Key Value (Redis).

1. Залейте репозиторий на GitHub.
2. New -> Key Value -> план Free. Скопируйте Internal Redis URL.
3. New -> Web Service -> ваш репозиторий. Root Directory: **оставьте пустым** (корень репо).
   Build Command: `npm run build`. Start Command: `npm start`. Instance Type: Free.
4. В Environment впишите: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
   `FIREBASE_PRIVATE_KEY`, `REDIS_URL`, `VITE_FIREBASE_API_KEY`,
   `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`.
   `VITE_*` нужны на этапе сборки клиента — Render подставит их автоматически
   при `npm run build`, т.к. это переменные того же сервиса.
5. Деплой. Готовый URL (`https://xxx.onrender.com`) откроет и фронтенд, и API/сокеты —
   `CLIENT_ORIGIN` и `VITE_API_URL` не нужны, всё на одном origin.

### Вариант с двумя сервисами (если нужен отдельный CDN для фронта)
Тогда используйте `server/render.yaml`-подобную схему из предыдущей версии: отдельный
Web Service для `server/` и Static Site для `client/`, плюс `CLIENT_ORIGIN` /
`VITE_API_URL` для связи между ними по CORS.

## Как это работает
- **Регистрация/вход** — целиком на клиенте через Firebase Auth SDK. Сервер получает
  ID-токен и проверяет его через Firebase Admin SDK на каждый HTTP-запрос и при
  подключении сокета.
- **Профиль/управление аккаунтом** — хранится в Firestore (`users/{uid}`), редактируется
  через `PATCH /api/users/me` (сейчас: имя и аватар).
- **Общий чат** — Redis List `chat:general`, при подключении отдаётся последние 100
  сообщений, новые сообщения рассылаются всем через комнату Socket.io `general`.
- **Личные сообщения** — Redis List `dm:{uid1}:{uid2}` (ключ сортируется), плюс
  Redis Set `conv:{uid}` — список собеседников. Доставка — в комнату `user:{uid}`.
- **Масштабирование** — подключён `@socket.io/redis-adapter`, поэтому если на Render
  запустить несколько инстансов сервера, сообщения всё равно долетят до нужных сокетов.

## Что можно добавить дальше
- Пагинация истории (сейчас грузится последние 100/1000 сообщений).
- Индикато "онлайн"/"печатает".
- Загрузка аватара в Firebase Storage вместо текстового поля.
- Rate limiting на отправку сообщений.

## Обновлённый интерфейс чата
- отдельное модальное окно **Профиль**: изменение ника и URL аватара;
- в сообщениях отображается **ник вместо email**;
- время отправки сообщения в формате HH:MM;
- **Ответить** на конкретное сообщение с цитатой;
- встроенный **emoji picker** без дополнительной библиотеки;
- 4 темы: Midnight, Ocean, Forest и Light, выбор сохраняется в браузере;
- обновлённый адаптивный интерфейс и мобильная боковая панель.
