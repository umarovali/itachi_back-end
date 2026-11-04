# TopUp Backend

NestJS + PostgreSQL (TypeORM). Пополнение игровых валют с ручной проверкой оплаты админом.

## Запуск

```bash
cp .env.example .env          # поправить пароли/секреты
docker compose up -d          # PostgreSQL (или свой)
npm install
npm run start:dev
```

- API: `http://localhost:3000/api`
- Swagger: `http://localhost:3000/docs` (только не в production)
- Первый суперадмин создаётся автоматически из `SUPERADMIN_PHONE` / `SUPERADMIN_PASSWORD`.

**Production:** `DB_SYNC=false`, `npm run migration:generate` → `npm run migration:run`
(при `DB_SYNC=false` миграции применяются и при старте), `COOKIE_SECURE=true`, длинные JWT-секреты.

## Деплой на Render (тестовый сервер)

1. Dashboard → **New → Blueprint** → выбрать репозиторий. Render прочитает [render.yaml](render.yaml)
   и создаст веб-сервис и PostgreSQL. JWT-секреты он сгенерирует сам.
2. Заполнить переменные, которые Render спросит:
   - `CORS_ORIGINS`: адреса фронтенда через запятую, например `http://localhost:5173,https://my-front.vercel.app`;
   - `SUPERADMIN_PHONE`, `SUPERADMIN_PASSWORD`: первый суперадмин;
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_ADMIN_CHAT_ID`: можно оставить пустыми.
3. После деплоя: `https://<сервис>.onrender.com/api` и Swagger на `/docs`.

Ограничения бесплатного тарифа:
- сервис засыпает через 15 минут без запросов, и первый запрос после этого идёт около минуты. Пока сервис спит, бот не отвечает;
- файлы (чеки, картинки) удаляются при каждом перезапуске;
- бесплатная PostgreSQL на Render живёт 30 дней.

**Один бот — один сервер.** Если один и тот же `TELEGRAM_BOT_TOKEN` стоит и на Render, и локально, оба сервера будут
забирать друг у друга сообщения. Локально оставьте токен пустым или заведите второго бота для разработки.

### Фронтенд и cookies

Токены лежат в httpOnly cookies, поэтому фронт делает все запросы с `credentials: 'include'`
(в axios: `withCredentials: true`). Адрес фронта должен быть указан в `CORS_ORIGINS`.

При локальной разработке фронта проще всего проксировать API, тогда cookies будут «свои». Пример для Vite:

```ts
// vite.config.ts
server: {
  proxy: {
    '/api': { target: 'https://<сервис>.onrender.com', changeOrigin: true },
    '/uploads': { target: 'https://<сервис>.onrender.com', changeOrigin: true },
  },
},
```

и запросы идут на `/api/...` без домена.

## Как устроены игры (главная идея)

Игры отличаются тем, **что клиент вводит** и **что покупает**. Поэтому:

| Сущность | Что хранит |
|---|---|
| `Game` | название, slug, валюта ("Алмазы"), инструкция и **`fields`** — схема формы заказа |
| `Product` | пакет: цена, количество (+бонус), `type`, и необязательный **`fields`**, который переопределяет форму игры |
| `PaymentMethod` | QR-картинка и реквизиты |
| `Order` | снапшот товара/цены, `playerData`, Telegram, чек, статус, кто обработал |

**`fields`** — массив полей: `{ key, label, type, required, placeholder?, hint?, pattern?, minLength?, maxLength?, options? }`,
`type`: `text | number | email | phone | select | password`.

```jsonc
// Free Fire — по ID
[{ "key": "playerId", "label": "ID игрока", "type": "number", "required": true, "pattern": "^[0-9]{6,12}$" }]

// Genshin — UID + сервер
[{ "key": "uid", "label": "UID", "type": "number", "required": true },
 { "key": "server", "label": "Сервер", "type": "select", "required": true,
   "options": [{ "value": "europe", "label": "Europe" }, { "value": "asia", "label": "Asia" }] }]

// Пополнение через аккаунт — email
[{ "key": "email", "label": "Email аккаунта", "type": "email", "required": true }]
```

Фронтенд рисует форму по `fields`, бэкенд проверяет `playerData` по той же схеме (лишние ключи отбрасываются).
Новая игра добавляется через админку **без изменения кода**.

**Типы товара** (`ProductType`):
- `CURRENCY`: зачисление валюты на аккаунт.
- `VOUCHER`: при подтверждении админ **обязан** указать код (`deliveredData`), и клиент увидит его на странице заказа. Обычно у такого товара `fields: []`, то есть ID не нужен.
- `SUBSCRIPTION`: пропуски и подписки.
- `OTHER`: всё остальное.

Правило полей товара: `null` → берутся поля игры, `[]` → полей нет, массив → свои поля.

## Валюты и цены по стране клиента

- Цена товара (`price`) хранится в **базовой валюте** (`BASE_CURRENCY`, по умолчанию RUB, создаётся автоматически).
- Валюта (`/api/admin/currencies`, создаёт только SUPERADMIN): `code`, `symbol`, `roundTo` — округление вверх,
  `countries` — страны, где валюта включается сама, и курс:
  - **автокурс** (`autoRate: true`, `markupPercent: 3`): курс берётся у ЦБ РФ (`RATES_SOURCE_URL`) при старте и каждые
    `RATES_SYNC_INTERVAL_MIN` минут, к нему добавляется наценка. Пример: курс ЦБ 146,2 сум, +3% → 150,6.
    Если ЦБ недоступен, остаётся последний курс. Если курс скакнул больше чем на 15%, в логе будет предупреждение.
    Обновить вручную: `POST /api/admin/currencies/sync-rates`;
  - **ручной** (`autoRate: false`, `rate: 160`): курс не меняется сам.
  Пример: UZS, курс 150,6, `roundTo: 500`: 84 ₽ → 12 650 → **13 000 сум**.
  Цена фиксируется в заказе в момент создания, поэтому изменение курса не трогает уже созданные заказы.
- Цену можно задать вручную: `product.prices = { "UZS": { "price": 13000, "oldPrice": 15000 } }`.
  Если валюты нет в `prices`, цена считается по курсу. В админке у товара есть `localPrices`: цены во всех валютах, ручные помечены `isManual`.
- **Какая валюта показывается клиенту:**
  1. `?currency=UZS`, если клиент выбрал валюту сам (фронт запоминает выбор);
  2. иначе страна из заголовка `CF-IPCountry`. Его бесплатно добавляет Cloudflare, или nginx с geoip (`GEO_COUNTRY_HEADER`);
  3. иначе базовая валюта.
- `GET /api/currencies` возвращает список валют и `selected`, то есть валюту, выбранную для этого клиента.
- `GET /api/games/:slug?currency=` отдаёт цены уже в нужной валюте. В `POST /api/orders` можно передать `currency`, но цену всегда считает сервер.
- У способа оплаты есть `currencies` (например, СБП → `["RUB"]`, Click → `["UZS"]`; пустой список — любая валюта).
  `GET /api/payment-methods?currency=UZS` возвращает только подходящие способы, а оплатить заказ «чужим» способом нельзя.
- В заказе хранятся `currency`, `price` (в валюте заказа) и `basePrice`. Статистика даёт общую выручку в базовой валюте и отдельно по каждой валюте.

## Telegram-бот

Создайте бота у @BotFather и заполните `TELEGRAM_BOT_TOKEN` и `TELEGRAM_BOT_USERNAME`. Без токена бот выключен.
Бот работает через long polling, поэтому webhook и публичный адрес не нужны. Запускайте **один** экземпляр бэкенда с токеном.

**Клиентам.** В `GET /api/orders/:id` есть `telegramBotLink`: это кнопка «Получать уведомления в Telegram».
Клиент жмёт её, затем «Старт» в боте, и заказ привязывается (`telegramLinked: true`). Бот пишет клиенту, когда:
чек получен, заказ выполнен, заказ отклонён (с причиной), заказ отменён по таймауту.
Если человек уже запускал бота, его следующие заказы с тем же ником приходят ему **автоматически**.
Код ваучера присылается только в чат, привязанный по ссылке из заказа.

**Админам.** Добавьте бота в группу админов, напишите там `/chatid` и вставьте ответ в `TELEGRAM_ADMIN_CHAT_ID`.
По каждому оплаченному заказу в группу придёт сообщение с фото чека, суммой (совпадает или нет) и данными игрока.
Пароли в группу не отправляются.
Кнопки-ссылки (`SITE_URL`, `ADMIN_PANEL_URL`) работают только с адресами на https.

## Процесс заказа

```
AWAITING_PAYMENT ──(клиент прислал чек)──► PENDING_REVIEW ──(take)──► IN_PROGRESS
       │                                        │  ▲                    │
       │ cancel / таймаут                       │  └────(release)───────┤
       ▼                                        ▼                       ▼
   CANCELLED                          COMPLETED / REJECTED  ◄───────────┘
```

1. `GET /api/games` → `GET /api/games/:slug` (товары + `fields`)
2. `POST /api/orders` `{ productId, playerData, telegramUsername }` → заказ (`id` надо сохранить на фронте)
3. `GET /api/payment-methods` → показать QR
4. `POST /api/orders/:id/payment` multipart: `paymentMethodId`, `paidAmount`, `receipt` (jpg/png/webp/pdf, ≤10MB)
5. Клиент опрашивает `GET /api/orders/:id`: статус, `customerMessage`, `rejectReasonText`, `deliveredData`

Неоплаченный заказ отменяется сам через `ORDER_PAYMENT_TIMEOUT_MIN`.
Все переходы атомарные (`UPDATE ... WHERE status = ...`), поэтому два админа не смогут обработать один заказ.

## Админка

Авторизация: `POST /api/admin/auth/login { phone, password }`. Ставятся httpOnly cookies:
`access_token` (15 мин) и `refresh_token` (7 дней, path `/api/admin/auth`, с ротацией).
Когда приходит 401, фронт вызывает `POST /api/admin/auth/refresh` и повторяет запрос.
Все запросы фронта отправляются с `credentials: 'include'`.

| | SUPERADMIN | ADMIN |
|---|---|---|
| Заказы: список, чек, take/complete/reject | ✅ | ✅ |
| Товары: создание, цены (в т.ч. по валютам), скрытие; загрузка картинок | ✅ | ✅ |
| Просмотр игр, способов оплаты, валют | ✅ | ✅ |
| Создание/изменение игр, способов оплаты, валют и курсов | ✅ | ❌ |
| Управление админами | ✅ | ❌ |
| Закрыть заказ, взятый другим админом | ✅ | ❌ |

Новые заказы в реальном времени: `new EventSource('/api/admin/orders/events', { withCredentials: true })`.
События: `order.created`, `order.paid`, `order.updated`.

Причины отказа (`RejectReason`): `PAYMENT_NOT_RECEIVED`, `AMOUNT_MISMATCH`, `INVALID_RECEIPT`,
`INVALID_PLAYER_DATA`, `OUT_OF_STOCK`, `OTHER`, плюс свободный текст `customerMessage`.

Файлы: чеки лежат в `UPLOAD_DIR/receipts` и отдаются только через `GET /api/admin/orders/:id/receipt`.
Картинки игр и QR загружаются через `POST /api/admin/uploads/image` и раздаются по `/uploads/...`.
