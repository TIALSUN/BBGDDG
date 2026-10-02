import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { buildServer } from '../../src/server/app.js'
import { cleanup, testConfig } from '../helpers/test-utils.js'

test('reader toolbar preference requires authorization and persists across server restarts', async () => {
  const config = testConfig()
  const token = 'b'.repeat(64)
  const headers = { host: 'localhost:80', origin: 'http://localhost', 'x-bbgddg-token': token }
  let app = await buildServer(config, { accessToken: token })
  try {
    assert.equal((await app.inject({ method: 'GET', url: '/api/ui/preferences' })).statusCode, 401)
    assert.equal((await app.inject({ method: 'PUT', url: '/api/ui/preferences', payload: { readerTopCollapsed: true } })).statusCode, 401)
    assert.deepEqual((await app.inject({ method: 'GET', url: '/api/ui/preferences', headers })).json(), { readerTopCollapsed: false })
    const saved = await app.inject({ method: 'PUT', url: '/api/ui/preferences', headers, payload: { readerTopCollapsed: true } })
    assert.equal(saved.statusCode, 200)
    assert.deepEqual(saved.json(), { readerTopCollapsed: true })
    await app.close()
    app = await buildServer(config, { accessToken: token })
    assert.deepEqual((await app.inject({ method: 'GET', url: '/api/ui/preferences', headers })).json(), { readerTopCollapsed: true })
    for (const payload of [{ readerTopCollapsed: 'true' }, {}, { readerTopCollapsed: false, dataDir: 'unexpected' }]) {
      assert.equal((await app.inject({ method: 'PUT', url: '/api/ui/preferences', headers, payload })).statusCode, 400)
    }
    assert.deepEqual((await app.inject({ method: 'GET', url: '/api/ui/preferences', headers })).json(), { readerTopCollapsed: true })
    assert.equal((await app.inject({ method: 'PUT', url: '/api/ui/preferences', headers, payload: { readerTopCollapsed: false } })).statusCode, 200)
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(config.dataDir, 'ui-preferences.json'), 'utf8')), { readerTopCollapsed: false })
  } finally { await app.close(); cleanup(config, { close() {} } as never) }
})

test('a malformed preference file falls back to the expanded toolbar and can be repaired', async () => {
  const config = testConfig(), token = 'c'.repeat(64)
  const app = await buildServer(config, { accessToken: token })
  const headers = { host: 'localhost:80', origin: 'http://localhost', 'x-bbgddg-token': token }
  try {
    const file = path.join(config.dataDir, 'ui-preferences.json')
    for (const contents of ['not json', '{"readerTopCollapsed":"yes"}']) {
      fs.writeFileSync(file, contents)
      assert.deepEqual((await app.inject({ method: 'GET', url: '/api/ui/preferences', headers })).json(), { readerTopCollapsed: false })
    }
    assert.equal((await app.inject({ method: 'PUT', url: '/api/ui/preferences', headers, payload: { readerTopCollapsed: true } })).statusCode, 200)
    assert.deepEqual((await app.inject({ method: 'GET', url: '/api/ui/preferences', headers })).json(), { readerTopCollapsed: true })
    assert.deepEqual(fs.readdirSync(config.dataDir).filter(name => name.endsWith('.tmp')), [])
  } finally { await app.close(); cleanup(config, { close() {} } as never) }
})
