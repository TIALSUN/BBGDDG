import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance } from 'fastify'

export const SESSION_COOKIE = 'bbgddg_session'
export const newAccessToken = () => randomBytes(32).toString('hex')
const pageCsp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"

export function installLocalAccess(app: FastifyInstance, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid local session token')
  const matches = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && timingSafeEqual(Buffer.from(value), Buffer.from(token))
  const fromCookie = (header?: string) => {
    const values = (header || '').split(';').map(value => value.trim()).filter(value => value.startsWith(SESSION_COOKIE + '='))
    return values.length === 1 ? values[0]!.slice(SESSION_COOKIE.length + 1) : undefined
  }
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer')
      .header('X-Content-Type-Options', 'nosniff').header('X-Frame-Options', 'DENY').header('Content-Security-Policy', pageCsp)
    const host = request.headers.host || ''
    // CORS is not authentication. Validate Host as well to reject DNS rebinding.
    if (!/^(?:127\.0\.0\.1|localhost|\[::1\])(?::[0-9]{1,5})?$/i.test(host)) return reply.status(403).send({ detail: '只允许本机地址访问。' })
    let url: URL
    try { url = new URL('http://' + host) } catch { return reply.status(403).send({ detail: '本机服务地址不匹配。' }) }
    const port = request.raw.socket.localPort
    if (port && Number(url.port || 80) !== port) return reply.status(403).send({ detail: '本机服务地址不匹配。' })
    const origin = request.headers.origin
    if (origin && origin !== url.origin) return reply.status(403).send({ detail: '不允许其他页面访问本机数据。' })
    if (request.headers['sec-fetch-site'] === 'cross-site') return reply.status(403).send({ detail: '不允许跨站访问本机数据。' })
    const pathname = request.url.split('?')[0]
    if (request.method === 'GET' && pathname === '/unlock') return
    const headerToken = matches(request.headers['x-bbgddg-token'])
    if (!headerToken && !matches(fromCookie(request.headers.cookie))) return reply.status(401).send({ detail: '本机会话未授权，请从 BBGDDG 或当前启动链接打开。' })
    // A cookie alone must not authorize an origin-less state-changing request.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !origin && !headerToken) return reply.status(403).send({ detail: '修改请求缺少可信来源。' })
  })
  app.get('/unlock', async (_request, reply) => {
    const nonce = randomBytes(18).toString('base64')
    reply.header('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`)
    // The access token lives in the URL fragment: it never enters HTTP request logs.
    return reply.type('text/html').send(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>打开 BBGDDG</title><style nonce="${nonce}">body{background:#13151a;color:#e4e8f0;font:16px system-ui;margin:50px}</style><p id="status">正在打开本机文献库…</p><script nonce="${nonce}">const token=location.hash.slice(1);history.replaceState(null,'','/unlock');fetch('/api/session',{method:'POST',headers:{'x-bbgddg-token':token},credentials:'same-origin'}).then(response=>{if(!response.ok)throw new Error();location.replace('/')}).catch(()=>{document.getElementById('status').textContent='此启动链接已失效，请使用当前的 BBGDDG 启动链接。'});</script></html>`)
  })
  app.post('/api/session', async (request, reply) => {
    if (!matches(request.headers['x-bbgddg-token'])) return reply.status(401).send({ detail: '启动口令无效。' })
    reply.header('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`)
    return { ok: true }
  })
}
