import { randomBytes } from 'node:crypto'
import type { BbgddgConfig } from '../../src/core/config.js'
import { buildServer } from '../../src/server/app.js'

export async function buildTestServer(config: BbgddgConfig) {
  const accessToken = randomBytes(32).toString('hex')
  const app = await buildServer(config, { accessToken }), original = app.inject.bind(app)
  app.inject = ((options: any) => original({ ...(typeof options === 'string' ? { url: options } : options), headers: {
    host: 'localhost:80', origin: 'http://localhost', 'x-bbgddg-token': accessToken, ...options.headers,
  } })) as typeof app.inject
  return app
}
