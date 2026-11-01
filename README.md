# UBTV NestJS API

NestJS 10, MongoDB/Mongoose, email OTP verification over SMTP, JWT access tokens, bcryptjs password hashing and Vitest unit tests.

The current API provides registration, email verification, login, token refresh, logout and the authenticated user profile. The Users and Mail modules support these authentication flows internally.

## Code organization

Features live directly under `src/`. Each feature keeps its module file at the root and groups implementation files by responsibility:

```text
src/
  main.ts
  app.module.ts
  controllers/app.controller.ts
  services/app.service.ts
  common/interceptors/
  config/
    environment.ts
    swagger.ts
    tests/environment.spec.ts
  auth/
    auth.module.ts
    config/jwt.config.ts
    constants/
    controllers/
    decorators/
    dto/
    guards/
    interfaces/
    schemas/
    services/
    tests/
      controllers/
      dto/
      guards/
      services/
    utils/
  users/
    users.module.ts
    schemas/
    services/
    tests/services/
  mail/
    mail.module.ts
    config/
    constants/
    interfaces/
    services/
    tests/services/
```

Mongoose schemas belong in `schemas/`, and feature tests belong in `tests/` with subdirectories matching the implementation roles. Add folders such as `strategies/`, `decorators/`, or `pipes/` when the feature needs them. See [AGENTS.md](AGENTS.md) for the full conventions.

## Setup

Use Node.js 22.12+ (verified locally with Node.js 24) and Corepack. The repository pins pnpm in `package.json`.

```powershell
corepack pnpm install
```

Copy `.env.example` to `.env.local`, or merge its settings into your existing file. Never overwrite an existing file containing other credentials. Environment variables supplied by the host override files; `.env.local` takes priority over `.env`.

| Variable                 | Purpose                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `NODE_ENV`               | `development`, `test` or `production`; defaults to `development`                                 |
| `PORT`                   | HTTP port; defaults to `3000`                                                                    |
| `MONGODB_URI`            | Required MongoDB connection URI                                                                  |
| `FRONTEND_ORIGIN`        | Required exact browser origin, e.g. `http://localhost:5173`; no path or trailing slash           |
| `JWT_SECRET`             | Required random secret, at least 32 UTF-8 bytes                                                  |
| `JWT_ISSUER`             | Required access-token issuer, e.g. `ubtv-api`                                                    |
| `JWT_AUDIENCE`           | Required access-token audience, e.g. `ubtv-web`                                                  |
| `BCRYPT_COST`            | Integer from 10 to 15; defaults to 12                                                            |
| `SWAGGER_ENABLED`        | `true`/`false`; defaults to enabled outside production                                           |
| `SWAGGER_ORIGIN`         | Exact origin used to open Swagger; defaults to `http://localhost:<PORT>` in development          |
| `EMAIL_OTP_SECRET`       | Required random HMAC key, at least 32 UTF-8 bytes; must differ from `JWT_SECRET`                 |
| `SMTP_HOST`              | Required SMTP hostname/IP, without a URL scheme                                                  |
| `SMTP_PORT`              | SMTP port; defaults to `587`                                                                     |
| `SMTP_SECURE`            | `true` for direct TLS (normally port 465), `false` for STARTTLS on port 587; defaults to `false` |
| `SMTP_USER`, `SMTP_PASS` | Required SMTP credentials from your mail provider                                                |
| `MAIL_FROM`              | Required plain sender email address, authorized by your SMTP provider                            |

Generate random secrets locally and put them into `.env.local`. Run the command separately for `JWT_SECRET` and `EMAIL_OTP_SECRET`; use different values. If JWT is already configured, leave it in place and generate only the new OTP secret:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
corepack pnpm start:dev
```

Startup rejects missing/invalid configuration. Production requires HTTPS for the frontend and API; frontend/API must share a site (for example `app.example.com` and `api.example.com`) because the refresh cookie uses `SameSite=Lax`.

MongoDB stores users and refresh sessions in the configured database. Mongoose declares unique indexes for email/token hashes and a TTL index for refresh-session expiry. Let these indexes finish building before accepting traffic. Users are never subject to a TTL index. Existing data is not migrated or deleted automatically; a user without `emailVerified=true` is treated as unverified. Resetting old test accounts is a manual development operation.

## SMTP setup

Add your provider's real SMTP settings to `.env.local` before starting the API. The `smtp.example.com` values in `.env.example` are placeholders, not a working mail service. Do not paste SMTP passwords, OTP secrets or real OTPs into source code or logs.

For submission over STARTTLS use `SMTP_PORT=587` and `SMTP_SECURE=false`. For direct TLS normally use `SMTP_PORT=465` and `SMTP_SECURE=true`. Production requires STARTTLS when direct TLS is disabled, validates server certificates and requires TLS 1.2 or newer. SMTP connection, greeting, socket-idle and DNS timeouts are each 10 seconds. Debug/SMTP message logging is disabled.

The API sends mail synchronously, without a queue or background retries. Startup validates settings but does not contact SMTP. A registration response with `verificationEmailSent=true` means SMTP accepted the send, not that the message is guaranteed to reach the inbox. If false, the account still exists and can request a resend after the cooldown; do not register the same email again. Delivery warnings include only allowlisted SMTP error codes/commands and a numeric response status; raw server responses, credentials and message content are never logged. For example, `EAUTH` indicates authentication failure, `EDNS` a DNS failure, and `EENVELOPE` with `RCPT TO` a recipient rejection. Check your provider settings/inbox/spam folder if a message does not arrive.

## Swagger UI

Start the API with `corepack pnpm start:dev`, then open **http://localhost:3000/docs** (or your configured API port). OpenAPI JSON is available at `/docs-json`.

1. Expand **Auth → POST /auth/register**, select **Try it out**, replace the sample email with your own inbox, fill the body and select **Execute**. The response contains `emailVerified=false` and `verificationEmailSent`.
2. Read the six-digit OTP in your inbox. Call **POST /auth/verify-email** with the email and code as a string (e.g. `"012345"`). Verification does not log in.
3. If mail does not arrive, wait at least 60 seconds and call **POST /auth/resend-verification**. Use the newest email's code; codes expire after 10 minutes and permit at most 5 incorrect attempts.
4. Call **POST /auth/login** with the same email/password. Unverified accounts return `403` with `code=EMAIL_NOT_VERIFIED`. On success the browser stores the HttpOnly refresh cookie automatically.
5. Copy `data.accessToken`, select **Authorize**, paste the token without the `Bearer` prefix and authorize it.
6. Call **GET /auth/me**. Swagger attaches the Bearer token.
7. Call **POST /auth/refresh** without a body: the browser sends the refresh cookie. Replace the Authorize token with the new `data.accessToken` when needed.
8. Call **POST /auth/logout** to revoke the refresh session and clear its cookie. Clear the Authorize value too; existing access JWTs may remain valid until expiry.

Swagger automatically adds `X-App-Request: 1` and enables cookie credentials; it does not spoof the browser's `Origin`. Open `/docs` on the exact configured `SWAGGER_ORIGIN`. For example, if you use `http://127.0.0.1:3000/docs`, set `SWAGGER_ORIGIN=http://127.0.0.1:3000` and restart the API; a mismatch returns `403` on auth POSTs. Cookies are host-specific, so use the same host throughout the login/refresh flow.

Swagger is disabled by default in production. To explicitly enable it there, set `SWAGGER_ENABLED=true` and an HTTPS `SWAGGER_ORIGIN` matching the public API origin. When disabled, its origin is not added to the auth/CORS allowlist. Authorization is kept only for the current page session, not persisted in localStorage.

## Auth API

Every POST below requires both headers:

```http
Origin: http://localhost:5173
X-App-Request: 1
```

Browsers set `Origin` automatically. Postman/curl callers must supply it explicitly. Missing or mismatched Origin/custom header returns `403`. CORS allows the configured frontend origin and, while Swagger is enabled, the configured Swagger origin, with credentials. There is no CSRF-token endpoint: the custom header forces cross-origin browser requests through CORS preflight, while the server also validates the source origin.

| Endpoint                         | Input                                 | Success                                                          |
| -------------------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| `POST /auth/register`            | JSON `{ name, email, password }`      | `201`, pending user and `verificationEmailSent`; does not log in |
| `POST /auth/verify-email`        | JSON `{ email, code }`                | `200`, `{ emailVerified: true, message }`; call login next       |
| `POST /auth/resend-verification` | JSON `{ email }`                      | `200`, generic `{ message }` acknowledgement                     |
| `POST /auth/login`               | JSON `{ email, password }`            | `200`, access token/public user and refresh cookie               |
| `POST /auth/refresh`             | Refresh cookie; no body required      | `200`, new access token/public user and rotated refresh cookie   |
| `GET /auth/me`                   | `Authorization: Bearer <accessToken>` | `200`, public user                                               |
| `POST /auth/logout`              | Refresh cookie; no body required      | `200`, revokes that refresh token and clears the cookie          |

Email is trimmed and lowercased. Name must contain 1–100 characters after trimming. Passwords must contain at least 6 characters and no more than **72 UTF-8 bytes**; passwords are neither trimmed nor silently truncated. Extra DTO fields are rejected.

Public users contain only `{ id, name, email, emailVerified }`. Registration additionally returns `verificationEmailSent` at the same level, without returning the OTP. Login/refresh responses follow the existing envelope:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {
    "accessToken": "<JWT>",
    "expiresIn": 900,
    "user": { "id": "<MongoDB ID>", "name": "An", "email": "an@example.com", "emailVerified": true }
  },
  "timestamp": "2030-01-01T00:00:00.000Z"
}
```

Validation/OTP failures return `400`, duplicate email `409`, invalid credentials/tokens `401`, unverified email `403` with `code=EMAIL_NOT_VERIFIED`, and rate limits `429`, using standard NestJS exception responses. Login checks credentials before exposing verification status; an unknown email and a wrong password still receive the same error. Password hashes, OTP/HMAC state and refresh tokens are never returned in JSON. Successful auth responses have `Cache-Control: no-store`.

Login/register/verify-email allow 10 requests/minute/IP per endpoint; refresh allows 60 and resend-verification allows 5. Counters are in process memory, so this configuration targets one API instance. Express uses the direct peer IP by default. If deploying behind a proxy, configure Express `trust proxy` for your actual trusted proxy topology before relying on per-client limits; do not blindly trust arbitrary forwarded headers.

## Email verification lifecycle

- A new account starts with `emailVerified=false`; login, access-token guards and refresh require a verified user.
- Codes are six-digit strings, including leading zeros, generated with `crypto.randomInt`. Only user/challenge-bound HMAC-SHA256 hashes are stored, using a secret separate from JWT signing.
- Each challenge expires after 10 minutes, permits five incorrect attempts and can be confirmed once. Success stores `emailVerifiedAt` and clears the entire OTP subdocument.
- Sends are at least 60 seconds apart per user, enforced by a conditional MongoDB update. A resend replaces the challenge and resets its expiry/attempt budget. Verification and failed-attempt writes bind the challenge ID/hash so an in-flight operation cannot confirm or decrement a replacement challenge.
- Unknown, already verified and cooldown accounts receive the same resend acknowledgement. SMTP failures also keep this generic response; it does not promise delivery. A failed send keeps the cooldown, so wait 60 seconds before retrying. Database failures remain server errors.

## Postman verification flow

Use a dedicated UBTV collection with `baseUrl=http://localhost:3000` and `origin=http://localhost:5173` in Collection Variables (the latter must match `FRONTEND_ORIGIN`). In the collection's **Scripts → Pre-request** tab:

```javascript
const headers = {
  Origin: pm.collectionVariables.get('origin'),
  'X-App-Request': '1',
  'Content-Type': 'application/json',
}
Object.entries(headers).forEach(([key, value]) => pm.request.headers.upsert({ key, value }))
```

Send `POST {{baseUrl}}/auth/register` with your own email, name and password. Read the code from your inbox and send `POST {{baseUrl}}/auth/verify-email`:

```json
{ "email": "your-address@example.com", "code": "012345" }
```

If necessary, send `POST {{baseUrl}}/auth/resend-verification` with `{ "email": "your-address@example.com" }` after the cooldown. Then log in. In both login and refresh requests, add this **Post-response** script to save the access token:

```javascript
if (pm.response.code === 200) {
  const token = pm.response.json().data?.accessToken
  if (token) pm.collectionVariables.set('accessToken', token)
}
```

For `/auth/me`, select **Authorization → Bearer Token** with `{{accessToken}}`, without adding the `Bearer` prefix yourself. Keep Postman's cookie jar enabled for refresh/logout and use the same API host throughout.

## Token lifecycle

- Access JWTs expire after 15 minutes. Verification requires HS256, the configured issuer/audience, valid expiry and an existing user. Access JWTs are accepted only through the Bearer header.
- Refresh tokens contain 32 random bytes. Only their SHA-256 hashes are stored in MongoDB. Refresh replaces the hash through one conditional atomic update, so an old token cannot be used twice. No transaction/replica set is needed for this single-document update.
- A refresh session expires 7 days after login, without sliding extension. Rotation preserves this deadline in both MongoDB and the cookie. Expiration is checked in the query; TTL deletion can happen later.
- The `ubtv.refresh` cookie is HttpOnly, `SameSite=Lax`, restricted to `/auth`, and Secure in production. It has no Domain attribute.
- Each login creates an independent refresh session. Logout is idempotent and ends only the presented session. Previously issued access JWTs can remain valid for up to 15 minutes; logout does not immediately revoke them.
- Strict rotation means only one of two concurrent refresh requests succeeds. A failed refresh does not clear the cookie, so it cannot overwrite a successful concurrent response. If a rotation response is lost after its database update, the client may need to log in again.

## Frontend integration

Keep the access token in memory, not localStorage/sessionStorage. Use one shared API client to attach the Bearer header and `X-App-Request: 1`. Include credentials on auth requests so the browser can receive/send the HttpOnly cookie.

The following minimal JavaScript example coalesces refresh calls in one tab and retries an API request at most once:

```javascript
const API = 'http://localhost:3000'
let accessToken = null
let refreshInFlight = null

async function authPost(path, body) {
  return fetch(`${API}/auth/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'X-App-Request': '1',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

async function refreshAccess() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await authPost('refresh')
      if (!response.ok) {
        accessToken = null
        throw new Error('Could not restore login')
      }
      accessToken = (await response.json()).data.accessToken
    })().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

async function api(path, options = {}) {
  const send = () =>
    fetch(`${API}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        'X-App-Request': '1',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    })
  let response = await send()
  if (response.status === 401) {
    await refreshAccess()
    response = await send()
  }
  return response
}

// Login: accessToken = (await (await authPost('login', { email, password })).json()).data.accessToken
// Restore on page load: await refreshAccess(); treat failure as signed out.
// Profile: await api('/auth/me')
// Logout: await authPost('logout'); accessToken = null
```

Call `refreshAccess()` when the page loads before restoring authenticated UI. Do not pass auth endpoints through the retry wrapper. Show registration/login errors from their HTTP responses, and do not loop retries after a failed refresh or `429`.

For multiple tabs, serialize refresh and login/logout across tabs with a shared Web Lock (`navigator.locks`) so requests read the latest cookie only after acquiring the lock. Broadcast logout with `BroadcastChannel`, clear each tab's in-memory access token and stop pending refresh/retry work during logout. A per-tab `refreshInFlight` promise alone does not coordinate tabs. If the target browser lacks the chosen coordination APIs, handle rotation conflicts by signing in again. These frontend behaviors are integration guidance, not frontend code shipped in this backend repository.

## Deploy on Render

In the backend web service's Settings, use these commands:

- Build Command: `corepack pnpm run build:render`
- Start Command: `corepack pnpm start:prod`

The `build:render` script installs both runtime and development dependencies before compiling, even when `NODE_ENV=production`. Nest CLI and TypeScript are build tools in `devDependencies`; omitting them causes `nest: not found`. Installation uses the committed lockfile and must succeed before compilation starts.

Set `NODE_VERSION=24` and `NODE_ENV=production` in Render's Environment settings. Supply the required database, frontend, JWT, OTP and SMTP settings from the environment-variable table above. Render supplies `PORT`; the app reads it at startup. Local `.env.local` changes are not deployed because the file is ignored by Git.

Use an HTTPS `FRONTEND_ORIGIN` without a trailing slash. Set `SWAGGER_ENABLED=false`, or enable it with an HTTPS `SWAGGER_ORIGIN` matching the public backend origin. Atlas connection strings using `mongodb+srv://` must not include a hostname port; percent-encode special characters in credentials.

Save the service settings and deploy the commit containing this script. For an existing service, pushing a new script does not change its saved Build Command automatically. If an old dependency cache still causes `nest: not found`, use Render's **Clear build cache & deploy** action after updating the command.

Render Free web services block outbound SMTP ports 25, 465 and 587. OTP delivery through those ports requires a service plan that permits the provider's SMTP port, or a mail integration using HTTPS. See [Render's Free service limitations](https://render.com/docs/free#other-limitations).

## Tests and build

```powershell
corepack pnpm test
corepack pnpm test:watch
corepack pnpm test:cov
corepack pnpm typecheck
corepack pnpm build
corepack pnpm start:prod
```

Tests use Vitest with SWC decorator metadata. Unit tests instantiate services/controllers/guards with mocks: no HTTP server, MongoDB connection, real SMTP delivery or e2e tests. Bcryptjs and JWT verification are exercised directly. OTP race tests simulate conditional database queries; they do not establish real MongoDB atomicity. Actual SMTP delivery, browser CORS/cookie behavior and multi-tab integration remain integration concerns. Runtime build remains the Nest CLI/TypeScript build; Vitest configuration is ESM without changing the app's CommonJS output.

Roles, social login, password changes and account recovery are outside this version.
