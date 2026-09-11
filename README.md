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

## 4. Деплой на Render
1. Залейте репозиторий на GitHub.
2. В Render: New -> Blueprint -> укажите репозиторий с `render.yaml` в корне —
   он создаст оба сервиса (`chat-server` и `chat-client`) автоматически.
3. В настройках каждого сервиса (Environment) впишите реальные значения переменных
   (они помечены `sync: false`, то есть их нужно вписать вручную в Dashboard).
4. В `server`: `CLIENT_ORIGIN` = URL клиента (для CORS).
   В `client`: `VITE_API_URL` = URL сервера.
5. После первого деплоя обновите оба URL друг у друга и передеплойте (Manual Deploy).

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
- Индикатор "онлайн"/"печатает".
- Загрузка аватара в Firebase Storage вместо текстового поля.
- Rate limiting на отправку сообщений.
