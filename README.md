

---

# GoGoldZ App Server

Node.js/Express + Prisma (Postgres).
Hardened auth/session framework with CSRF (cookie flows), refresh rotation, reuse detection, rate-limiting, and audit logging.

---

## Requirements

* Node 20+ (works on Node 22)
* Postgres 13+
* Prisma CLI (`npx prisma`)
* pnpm/npm/yarn (examples use `npm`)

---

## Quick Start

```bash
# 1) Install
npm i

# 2) Env
cp .env.example .env
# fill in DB + secrets

# 3) Prisma
npx prisma generate
npx prisma migrate dev

# 4) Run
npm run dev   # nodemon
# or
npm start
```

Health check: `GET /healthz` → `200 OK`.

---

## Environment Variables

| Key                   | Required | Example                                         | Notes                          |
| --------------------- | -------- | ----------------------------------------------- | ------------------------------ |
| `DATABASE_URL`        | ✅        | `postgresql://user:pass@localhost:5432/gogoldz` | Prisma connection              |
| `JWT_SECRET`          | ✅        | strong random string                            | Access token signing (HS256)   |
| `COOKIE_SECRET`       | ✅        | strong random string                            | Cookie signing if used         |
| `REFRESH_COOKIE_NAME` | ✅        | `refresh_token`                                 | Refresh cookie name            |
| `CSRF_COOKIE_NAME`    | ✅        | `csrf_token`                                    | CSRF cookie name               |
| `REFRESH_COOKIE_PATH` | ✅        | `/session`                                      | Must match route path          |
| `CORS_ALLOWLIST`      | ✅        | `http://localhost:3000`                         | Comma-separated list           |
| `NODE_ENV`            | ✅        | `development`/`production`                      | Controls error details         |
| `METRICS_KEY`         | optional | `some-key`                                      | Protects `/metrics` if enabled |
| `TEST_OTP`            | dev only | `123456`                                        | E2E tests/stubs                |

> **Secrets**: generate with `openssl rand -base64 48` (or similar). Rotate regularly.

---

## Security Architecture (short)

* **Access/Refresh**: short-lived access JWT + long-lived refresh token per session.
* **Rotation**: every successful refresh rotates a new refresh token (old invalidated).
* **Reuse detection**: if a **stale** refresh token is seen → **revoke all sessions for that user** and require login.
* **Cookies**: web flows use `HttpOnly` refresh cookie (`/session` path) + **double-submit CSRF** cookie.
* **Header flow**: mobile/native can send refresh token via `X-Refresh-Token` (no cookies → no CSRF).
* **CSRF**: enforced **only for cookie flows**; middleware auto-skips when no cookies present.
* **Rate-limiting**: OTP send/verify, refresh, logout, revoke, session list (IPv6-safe keys, abuse logs).
* **Audit logging**: actions logged with `userId`, IP, UA (when available).
* **Error handling**: generic messages in prod; detailed in dev.

---

## Endpoints

### Auth (OTP)

* `POST /api/auth/send-otp`
  Body: `{ phoneNumber | email, purpose }`
  Rate-limited (per-target + per-IP).

* `POST /api/auth/verify-otp`
  Body: `{ phoneNumber | email, otp, purpose }`
  Returns `{ accessToken, ... }` and initializes a **session** (refresh token is cookie for web, JSON for header flow).

### Session

* `GET /api/session`
  **Auth required** (Bearer). List active sessions.

* `POST /api/session/refresh`
  **Cookie flow**: send `refresh_token` + `csrf_token` cookies and header `X-CSRF-Token`.
  **Header flow**: send `X-Refresh-Token: <token>`.
  Returns: `{ accessToken }` for cookie flow; `{ accessToken, refreshToken }` for header flow.

* `POST /api/session/logout`
  CSRF (cookie flow). Clears `refresh_token` & `csrf_token`. Revokes current session.

* `POST /api/session/revoke`
  Body: `{ sessionId: uuid }` (must belong to the authenticated user).
  CSRF (cookie flow) + Auth (Bearer).

* `POST /api/session/revoke-others`
  Body: `{ keepSessionId: uuid }`
  Revokes all sessions except the one you keep. CSRF (cookie flow) + Auth.

---

## Rate Limits (defaults)

| Route                                    | Window |  Max | Notes                    |
| ---------------------------------------- | -----: | ---: | ------------------------ |
| `POST /api/auth/send-otp` (per-target)   |    15m |    5 | target key = phone/email |
| `POST /api/auth/send-otp` (per-IP)       |    15m |   20 | IPv6-safe key            |
| `POST /api/auth/verify-otp` (per-target) |    15m |   10 | —                        |
| `POST /api/auth/verify-otp` (per-IP)     |    15m |   50 | —                        |
| `POST /api/session/refresh`              |     5m |   30 | —                        |
| `POST /api/session/logout`               |    15m |   50 | light                    |
| `POST /api/session/revoke*`              |    15m |  100 | light                    |
| `GET /api/session`                       |     1m |  120 | list throttle            |
| `globalLimiter` (optional)               |     1m | 1000 | if mounted app-wide      |

> All limiter blocks return `{ success:false, message:"Too many …" }` and log a warning.

---

## CSRF for Cookie Flows

* Server sets `csrf_token` cookie.
* Client must echo it in `X-CSRF-Token` for **state-changing** endpoints when using cookies (`/session/refresh`, `/session/logout`, `/session/revoke*`).

**Postman pre-request script (collection-level):**

```js
const needs = ['POST','PUT','PATCH','DELETE'].includes(pm.request.method.toUpperCase());
if (needs) {
  const csrf = pm.cookies.get('csrf_token');
  if (csrf) pm.request.headers.upsert({ key: 'X-CSRF-Token', value: csrf });
}
const at = pm.environment.get('accessToken');
if (at) pm.request.headers.upsert({ key: 'Authorization', value: `Bearer ${at}` });
```

---

## Example cURL

### Cookie refresh

```bash
curl -X POST http://localhost:5000/api/session/refresh \
  -H "X-CSRF-Token: <csrf_cookie_value>" \
  --cookie "refresh_token=<rt>; csrf_token=<csrf>"
```

### Header refresh (mobile)

```bash
curl -X POST http://localhost:5000/api/session/refresh \
  -H "X-Refresh-Token: <refreshToken>"
```

### Revoke by id

```bash
curl -X POST http://localhost:5000/api/session/revoke \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<uuid>"}'
```

---

## Testing

### Unit/Integration (Jest + Supertest)

```bash
npm i -D jest supertest cross-fetch
npm test
```

**Covers:**

* Cookie refresh (with/without CSRF; cookie rotation).
* Header refresh (no CSRF; returns new RT).
* Reuse attack → **all sessions revoked**.
* Logout clears cookies; subsequent cookie refresh fails.
* Revoke by id (ownership enforced).
* Revoke-others (keep one).
* Rate limit returns `429` and logs.

> Use `TEST_OTP=123456` or your dev stub for OTP verification.

---

## Logging & Monitoring

* Structured logs for:

  * `refresh_attempt/refresh_success/refresh_failed`
  * `logout_*`, `revoke_*`, `sessions_revoked_others`
  * `RATE_LIMIT_BLOCK` warnings
* In **production**, responses are sanitized; logs omit stack traces but keep minimal context (path, method, code, message).

Attach your logger at boot:

```js
app.set('logger', pinoInstance);
```

---

## Troubleshooting

* **403 CSRF** on cookie flows
  Ensure `X-CSRF-Token` matches the latest `csrf_token` cookie (cookie rotates on refresh).

* **401 refresh** immediately after reuse
  Expected: stale RT was replayed → all sessions revoked. Re-authenticate.

* **400 “sessionId must be a GUID”**
  Body key must be `sessionId` (lower camelCase) and a valid UUID.

* **429 Too many requests**
  You hit a limiter; wait for window to reset. Check logs for `RATE_LIMIT_BLOCK`.

---

## Conventions

* Responses: `{ success, message, data }`
* Cookie names: `refresh_token`, `csrf_token`
* Cookie path: `/session`
* CSRF: cookie flows only (auto-skips for header flows)
* Only canonical refresh path: `POST /api/session/refresh`

---

## Roadmap / Nice-to-have

* Redis-backed limiters & session cache (scale-out)
* Asymmetric JWTs (RS256) if external verification required
* Device ID + step-up auth for sensitive actions
* TypeScript migration for controllers/services

---

## License

Internal / © GoGoldZ. All rights reserved.

---
