import { isEmail } from 'class-validator'

export function validateEnvironment(env: Record<string, unknown>) {
  const required = (key: string) => {
    const value = env[key]
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} is required`)
    return value
  }

  const nodeEnv = env.NODE_ENV ?? 'development'
  if (!['development', 'test', 'production'].includes(nodeEnv as string)) {
    throw new Error('NODE_ENV must be development, test or production')
  }
  const mongoUri = required('MONGODB_URI')
  if (!/^mongodb(?:\+srv)?:\/\//.test(mongoUri)) throw new Error('MONGODB_URI must be a MongoDB URI')

  const secret = required('JWT_SECRET')
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('JWT_SECRET must contain at least 32 bytes')

  const origin = required('FRONTEND_ORIGIN')
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    throw new Error('FRONTEND_ORIGIN must be an HTTP(S) origin without a path or trailing slash')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) {
    throw new Error('FRONTEND_ORIGIN must be an HTTP(S) origin without a path or trailing slash')
  }
  if (nodeEnv === 'production' && url.protocol !== 'https:') {
    throw new Error('FRONTEND_ORIGIN must use HTTPS in production')
  }

  const bcryptCost = Number(env.BCRYPT_COST ?? 12)
  if (!Number.isInteger(bcryptCost) || bcryptCost < 10 || bcryptCost > 15) {
    throw new Error('BCRYPT_COST must be an integer between 10 and 15')
  }
  const port = Number(env.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535')

  const swaggerFlag = env.SWAGGER_ENABLED ?? nodeEnv !== 'production'
  if (![true, false, 'true', 'false'].includes(swaggerFlag as boolean | string)) {
    throw new Error('SWAGGER_ENABLED must be true or false')
  }
  const swaggerEnabled = swaggerFlag === true || swaggerFlag === 'true'
  const swaggerOrigin =
    env.SWAGGER_ORIGIN ??
    (nodeEnv === 'production' && swaggerEnabled
      ? required('SWAGGER_ORIGIN')
      : `${nodeEnv === 'production' ? 'https' : 'http'}://localhost:${port}`)
  try {
    const swaggerUrl = new URL(swaggerOrigin as string)
    if (!['http:', 'https:'].includes(swaggerUrl.protocol) || swaggerUrl.origin !== swaggerOrigin) throw new Error()
    if (nodeEnv === 'production' && swaggerUrl.protocol !== 'https:') throw new Error()
  } catch {
    throw new Error('SWAGGER_ORIGIN must be an HTTP(S) origin without a path; use HTTPS in production')
  }

  const otpSecret = required('EMAIL_OTP_SECRET')
  if (Buffer.byteLength(otpSecret, 'utf8') < 32 || otpSecret === secret) {
    throw new Error('EMAIL_OTP_SECRET must contain at least 32 bytes and differ from JWT_SECRET')
  }
  const smtpHost = required('SMTP_HOST')
  if (/[\s/@?#]/.test(smtpHost)) throw new Error('SMTP_HOST must be a hostname or IP without a URL scheme')
  const smtpPort = Number(env.SMTP_PORT ?? 587)
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    throw new Error('SMTP_PORT must be between 1 and 65535')
  }
  const smtpSecureFlag = env.SMTP_SECURE ?? false
  if (![true, false, 'true', 'false'].includes(smtpSecureFlag as boolean | string)) {
    throw new Error('SMTP_SECURE must be true or false')
  }
  const mailFrom = required('MAIL_FROM')
  if (!isEmail(mailFrom)) throw new Error('MAIL_FROM must be a plain email address')

  return {
    ...env,
    NODE_ENV: nodeEnv,
    MONGODB_URI: mongoUri,
    JWT_SECRET: secret,
    JWT_ISSUER: required('JWT_ISSUER'),
    JWT_AUDIENCE: required('JWT_AUDIENCE'),
    FRONTEND_ORIGIN: origin,
    BCRYPT_COST: bcryptCost,
    PORT: port,
    SWAGGER_ENABLED: swaggerEnabled,
    SWAGGER_ORIGIN: swaggerOrigin as string,
    EMAIL_OTP_SECRET: otpSecret,
    SMTP_HOST: smtpHost,
    SMTP_PORT: smtpPort,
    SMTP_SECURE: smtpSecureFlag === true || smtpSecureFlag === 'true',
    SMTP_USER: required('SMTP_USER'),
    SMTP_PASS: required('SMTP_PASS'),
    MAIL_FROM: mailFrom,
  }
}
