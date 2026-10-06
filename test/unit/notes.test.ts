import test from 'node:test'
import assert from 'node:assert/strict'
import { NoteService } from '../../src/core/notes.js'
import { BbgddgError } from '../../src/core/types.js'
import { cleanup, createProject, createSource, testConfig, testDb } from '../helpers/test-utils.js'

test('creates a note and resolves it by id or exact case-insensitive title', () => {
  const config = testConfig(), db = testDb(config)
  try {
    const projectId = createProject(db, 'Research')
    const service = new NoteService(db, config)
    const note = service.create(projectId, { title: 'Reading Order', content: '# Notes' })
    assert.equal(service.resolve(projectId, note.id).id, note.id)
    assert.equal(service.resolve(projectId, 'reading order').id, note.id)
    assert.equal(service.list(projectId).length, 1)
  } finally { cleanup(config, db) }
})

test('defaults an untitled note and an empty content note', () => {
  const config = testConfig(), db = testDb(config)
  try {
    const projectId = createProject(db, 'Research')
    const note = new NoteService(db, config).create(projectId)
    assert.equal(note.title, 'Untitled Note')
    assert.equal(note.content, '')
  } finally { cleanup(config, db) }
})

test('ambiguous note titles are rejected', () => {
  const config = testConfig(), db = testDb(config)
  try {
    const projectId = createProject(db, 'Research')
    const service = new NoteService(db, config)
    service.create(projectId, { title: 'Same' }); service.create(projectId, { title: 'Same' })
    assert.throws(() => service.resolve(projectId, 'same'), (error: unknown) => error instanceof BbgddgError && error.code === 'AMBIGUOUS_NOTE')
  } finally { cleanup(config, db) }
})

test('an unknown selector is reported as not found', () => {
  const config = testConfig(), db = testDb(config)
  try {
    const projectId = createProject(db, 'Research')
    assert.throws(() => new NoteService(db, config).resolve(projectId, 'missing'), (error: unknown) => error instanceof BbgddgError && error.code === 'NOTE_NOT_FOUND')
  } finally { cleanup(config, db) }
})

test('update changes only the field provided, leaving the other untouched', () => {
  const config = testConfig(), db = testDb(config)
  try {
    const projectId = createProject(db, 'Research')
    const service = new NoteService(db, config)
    const note = service.create(projectId, { title: 'Draft', content: 'v1' })
    const renamed = service.update(projectId, note.id, { title: 'Final' })
    assert.equal(renamed.title, 'Final')
    assert.equal(renamed.content, 'v1')
    const edited = service.update(projectId, note.id, { content: 'v2' })
    assert.equal(edited.title, 'Final')
    assert.equal(edited.content, 'v2')
    assert.throws(() => service.update(projectId, note.id, { title: '  ' }), (error: unknown) => error instanceof BbgddgError && error.code === 'INVALID_TITLE')
  } finally { cleanup(config, db) }
})

test('lists only the notes attached to a given source', () => {
  const config = testConfig(), db = testDb(config)
  try {
    const projectId = createProject(db, 'Research')
    const sourceId = createSource(db, projectId)
    const service = new NoteService(db, config)
    const attached = service.create(projectId, { title: 'Source note', sourceSelector: sourceId })
    service.create(projectId, { title: 'Project note' })
    const bySource = service.listBySource(projectId, sourceId)
    assert.equal(bySource.length, 1)
    assert.equal(bySource[0]!.id, attached.id)
  } finally { cleanup(config, db) }
})

test('deletes a note', () => {
  const config = testConfig(), db = testDb(config)
  try {
    const projectId = createProject(db, 'Research')
    const service = new NoteService(db, config)
    const note = service.create(projectId, { title: 'Temp' })
    service.delete(projectId, note.id)
    assert.equal(service.list(projectId).length, 0)
  } finally { cleanup(config, db) }
})

test('note anchors persist independently, preserve file identity and reject foreign sources', () => {
  const config=testConfig(),db=testDb(config)
  try{
    const project=createProject(db),source=createSource(db,project),foreign=createSource(db,createProject(db))
    db.prepare('UPDATE sources SET content_hash=? WHERE id=?').run('original',source)
    const service=new NoteService(db,config)
    const note=service.create(project,{sourceSelector:source,content:'My understanding',tags:['concept'],anchors:[{sourceId:source,page:1,text:'testing',rects:[{x1:.1,y1:.2,x2:.6,y2:.3}]}],origin:{kind:'ai',content:'An explanation',createdAt:'2026-10-07'}})
    assert.equal(service.resolve(project,note.id).anchors?.[0]?.contentHash,'original')
    db.prepare('UPDATE sources SET content_hash=? WHERE id=?').run('changed',source)
    assert.equal(service.update(project,note.id,{title:'Revised'}).anchors?.[0]?.contentHash,'original')
    assert.equal(service.listBySource(project,source)[0]?.origin?.content,'An explanation')
    assert.throws(()=>service.create(project,{anchors:[{sourceId:foreign,page:1,text:'foreign',rects:[]}]}))
    assert.throws(()=>service.create(project,{anchors:[{sourceId:source,page:2,text:'invalid page',rects:[]}]}))
    assert.throws(()=>service.create(project,{anchors:[{sourceId:source,page:1,text:'bad rectangle',rects:[{x1:.8,y1:.1,x2:.2,y2:.3}]}]}))
  }finally{cleanup(config,db)}
})
