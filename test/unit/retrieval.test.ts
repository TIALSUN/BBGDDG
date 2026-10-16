import test from 'node:test'
import assert from 'node:assert/strict'
import { RetrievalService, splitPages } from '../../src/core/retrieval.js'
import { cleanup, createProject, createSource, testConfig, testDb } from '../helpers/test-utils.js'

test('splitPages preserves page numbers and content', () => {
  assert.deepEqual(splitPages('[Page 2]\nAlpha\n[Page 4]\nBeta'), [
    { page: 2, text: 'Alpha' }, { page: 4, text: 'Beta' },
  ])
})

test('retrieval indexes and filters passages by project/source', () => {
  const config = testConfig(), db = testDb(config)
  try {
    const project = createProject(db), other = createProject(db)
    const source = createSource(db, project, '[Page 3]\nSQLite indexing makes research searchable.')
    const otherSource = createSource(db, other, '[Page 1]\nSQLite indexing in another project.')
    const retrieval = new RetrievalService(db)
    retrieval.index(source, '[Page 3]\nSQLite indexing makes research searchable.')
    retrieval.index(otherSource, '[Page 1]\nSQLite indexing in another project.')
    const results = retrieval.search(project, 'SQLite indexing')
    assert.equal(results.length, 1)
    assert.equal(results[0]?.source_id, source)
    assert.equal(results[0]?.page_number, 3)
  } finally { cleanup(config, db) }
})

test('Chinese queries match via character bigrams even though FTS5 does not tokenize CJK', () => {
  const config = testConfig(), db = testDb(config)
  try {
    const project = createProject(db)
    const source = createSource(db, project, '[Page 5]\n本文讨论机器学习的基本原理与注意力机制。')
    const retrieval = new RetrievalService(db)
    retrieval.index(source, '[Page 5]\n本文讨论机器学习的基本原理与注意力机制。')
    const phrase = retrieval.search(project, '机器学习')
    assert.equal(phrase.length, 1)
    assert.equal(phrase[0]?.source_id, source)
    assert.equal(phrase[0]?.page_number, 5)
    const sentence = retrieval.search(project, '这篇文章的机器学习原理是什么')
    assert.equal(sentence.length, 1)
    assert.equal(sentence[0]?.source_id, source)
  } finally { cleanup(config, db) }
})
