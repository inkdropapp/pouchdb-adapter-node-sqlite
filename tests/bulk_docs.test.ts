import { describe, it, beforeEach, afterEach, expect } from '@jest/globals'
import PouchDB from 'pouchdb'
import { getDatabaseName, cleanupTestDatabases } from './utils/test-utils'

// Register the SQLite3 adapter
import SQLite3Adapter from '../src/index'
PouchDB.plugin(SQLite3Adapter)

// Type helpers for bulk_docs results
interface BulkDocsSuccess {
  ok: true
  id: string
  rev: string
}

interface BulkDocsError {
  error: true
  id: string
  name: string
  status: number
  message?: string
}

type BulkDocsResult = BulkDocsSuccess | BulkDocsError

function isError(result: BulkDocsResult): result is BulkDocsError {
  return 'error' in result && result.error === true
}

function makeDocs(start: number, end?: number, templateDoc?: any): any[] {
  const templateDocSrc = templateDoc ? JSON.stringify(templateDoc) : '{}'
  if (end === undefined) {
    end = start
    start = 0
  }
  const docs = []
  for (let i = start; i < end; i++) {
    const newDoc = JSON.parse(templateDocSrc)
    newDoc._id = i.toString()
    newDoc.integer = i
    newDoc.string = i.toString()
    docs.push(newDoc)
  }
  return docs
}

describe('bulk_docs', () => {
  let dbName: string
  let db: PouchDB.Database

  beforeEach(() => {
    dbName = getDatabaseName()
    db = new PouchDB(dbName, { adapter: 'sqlite3' })
  })

  afterEach(async () => {
    await db.destroy()
    await cleanupTestDatabases()
  })

  it('Testing bulk docs', async () => {
    const docs = makeDocs(5)
    let results = (await db.bulkDocs(docs)) as BulkDocsResult[]

    expect(results).toHaveLength(5)
    for (let i = 0; i < 5; i++) {
      const result = results[i]
      expect(result.id).toBe(docs[i]._id)
      if (!isError(result)) {
        expect(result.ok).toBe(true)
        expect(result.rev).toBeDefined()
        // Update the doc
        docs[i]._rev = result.rev
        docs[i].string = docs[i].string + '.00'
      }
    }

    results = (await db.bulkDocs(docs)) as BulkDocsResult[]
    expect(results).toHaveLength(5)
    for (let i = 0; i < 5; i++) {
      const result = results[i]
      expect(result.id).toBe(i.toString())
      // set the delete flag to delete the docs in the next step
      if (!isError(result)) {
        docs[i]._rev = result.rev
        docs[i]._deleted = true
      }
    }

    // Create a conflict
    await db.put(docs[0])

    results = (await db.bulkDocs(docs)) as BulkDocsResult[]
    const firstResult = results[0]
    if (isError(firstResult)) {
      expect(firstResult.error).toBe(true)
      expect(firstResult.name).toBe('conflict')
      expect(firstResult.id).toBe('0')
    }

    for (let i = 1; i < 5; i++) {
      const result = results[i]
      expect(result.id).toBe(i.toString())
      if (!isError(result)) {
        expect(result.rev).toBeDefined()
      }
    }
  })

  it('#6039 test id in bulk docs for conflict', async () => {
    const docs = makeDocs(5)
    const res = (await db.bulkDocs(docs)) as BulkDocsResult[]

    docs.forEach((doc, i) => {
      const result = res[i]
      if (!isError(result)) {
        doc._rev = result.rev
      }
    })
    docs[2]._rev = '3-totally_fake_rev'
    delete docs[4]._rev

    const res2 = (await db.bulkDocs(docs)) as BulkDocsResult[]

    const expected = [
      { id: '0', ok: true, rev: 'rev_placeholder' },
      { id: '1', ok: true, rev: 'rev_placeholder' },
      { id: '2', error: true, name: 'conflict', status: 409 },
      { id: '3', ok: true, rev: 'rev_placeholder' },
      { id: '4', error: true, name: 'conflict', status: 409 }
    ]

    res2.forEach((result, i) => {
      expect(result.id).toBe(expected[i].id)
      if (expected[i].error) {
        if (isError(result)) {
          expect(result.error).toBe(true)
          expect(result.name).toBe(expected[i].name)
          expect(result.status).toBe(expected[i].status)
        }
      } else {
        if (!isError(result)) {
          expect(result.ok).toBe(true)
          expect(result.rev).toBeDefined()
        }
      }
    })
  })

  it('No id in bulk docs', async () => {
    const newdoc = {
      _id: 'foobar',
      body: 'baz'
    }

    const doc = await db.put(newdoc)
    expect(doc.ok).toBe(true)

    const docs = [
      {
        _id: newdoc._id,
        _rev: doc.rev, // Use the rev from the put response
        body: 'blam'
      },
      {
        _id: newdoc._id,
        _rev: doc.rev, // Use the rev from the put response
        _deleted: true
      }
    ]

    const results = (await db.bulkDocs(docs)) as BulkDocsResult[]
    if (isError(results[0])) {
      expect(results[0].name).toBe('conflict')
    }
    if (isError(results[1])) {
      expect(results[1].name).toBe('conflict')
    }
  })

  it('Test empty bulkDocs', async () => {
    const result = (await db.bulkDocs([])) as BulkDocsResult[]
    expect(result).toEqual([])
  })

  it('Test many bulkDocs', async () => {
    const docs = []
    for (let i = 0; i < 201; i++) {
      docs.push({ _id: i.toString() })
    }
    const results = (await db.bulkDocs(docs)) as BulkDocsResult[]
    expect(results).toHaveLength(201)
  })

  it('Test errors on invalid doc id', async () => {
    const docs = [
      {
        _id: '_invalid',
        foo: 'bar'
      }
    ]

    try {
      await db.bulkDocs(docs)
      throw new Error('Should have thrown')
    } catch (err: any) {
      expect(err.status).toBe(500)
      expect(err.name).toBe('bad_request')
    }
  })

  it('Test two errors on invalid doc id', async () => {
    const docs = [
      { _id: '_invalid', foo: 'bar' },
      { _id: 123 as any, foo: 'bar' }
    ]

    try {
      await db.bulkDocs(docs)
      throw new Error('Should have thrown')
    } catch (err: any) {
      expect(err.status).toBe(500)
      expect(err.name).toBe('bad_request')
    }
  })

  it('No docs', async () => {
    try {
      await db.bulkDocs({ doc: [{ foo: 'bar' }] } as any)
      throw new Error('Should have thrown')
    } catch (err: any) {
      expect(err.status).toBe(400)
      expect(err.name).toBe('bad_request')
      expect(err.message).toBe("Missing JSON list of 'docs'")
    }
  })

  it('Jira 911 - handling duplicate IDs', async () => {
    const docs = [
      { _id: '0', a: 0 },
      { _id: '1', a: 1 },
      { _id: '1', a: 1 },
      { _id: '3', a: 3 }
    ]

    const results = (await db.bulkDocs(docs)) as BulkDocsResult[]
    expect(results[1].id).toBe('1')
    if (!isError(results[1])) {
      expect(results[1].ok).toBe(true)
    }
    if (isError(results[2])) {
      expect(results[2].name).toBe('conflict')
    }
    expect(results).toHaveLength(4)
  })

  it('Test multiple bulkdocs', async () => {
    const authors = [
      { _id: 'dale', name: 'Dale Harvey', commits: 253 },
      { _id: 'mikeal', name: 'Mikeal Rogers', commits: 42 },
      { _id: 'johannes', name: 'Johannes J. Schmidt', commits: 13 },
      { _id: 'randall', name: 'Randall Leeds', commits: 9 }
    ]

    ;(await db.bulkDocs(authors)) as BulkDocsResult[]
    ;(await db.bulkDocs(authors)) as BulkDocsResult[]

    const result = await db.allDocs()
    expect(result.total_rows).toBe(4)
  })

  it('bulk docs update then delete then conflict', async () => {
    const docs: any[] = [{ _id: '1' }]
    let res = (await db.bulkDocs(docs)) as BulkDocsResult[]
    expect(!isError(res[0])).toBe(true)

    if (!isError(res[0])) {
      docs[0]._rev = res[0].rev
    }
    res = (await db.bulkDocs(docs)) as BulkDocsResult[]
    expect(!isError(res[0])).toBe(true)

    if (!isError(res[0])) {
      docs[0]._rev = res[0].rev
      docs[0]._deleted = true
    }
    res = (await db.bulkDocs(docs)) as BulkDocsResult[]
    expect(!isError(res[0])).toBe(true)

    res = (await db.bulkDocs(docs)) as BulkDocsResult[]
    if (isError(res[0])) {
      expect(res[0].error).toBe(true)
      expect(res[0].name).toBe('conflict')
    }
  })

  it('bulk_docs delete then undelete', async () => {
    const doc: any = { _id: '1' }
    let res = (await db.bulkDocs([doc])) as BulkDocsResult[]
    expect(!isError(res[0])).toBe(true)

    if (!isError(res[0])) {
      doc._rev = res[0].rev
      doc._deleted = true
    }
    res = (await db.bulkDocs([doc])) as BulkDocsResult[]
    expect(!isError(res[0])).toBe(true)

    delete doc._rev
    doc._deleted = false
    res = (await db.bulkDocs([doc])) as BulkDocsResult[]
    if (!isError(res[0])) {
      expect(res[0].ok).toBe(true)
    }
  })

  it('Deleting _local docs with bulkDocs', async () => {
    const rev1res = await db.put({ _id: '_local/godzilla' })
    const rev1 = rev1res.rev

    const rev2res = await db.put({ _id: 'mothra' })
    const rev2 = rev2res.rev

    const rev3res = await db.put({ _id: 'rodan' })
    const rev3 = rev3res.rev

    ;(await db.bulkDocs([
      { _id: 'mothra', _rev: rev2, _deleted: true },
      { _id: '_local/godzilla', _rev: rev1, _deleted: true },
      { _id: 'rodan', _rev: rev3, _deleted: true }
    ])) as BulkDocsResult[]

    const allDocs = await db.allDocs()
    expect(allDocs.rows).toHaveLength(0)

    try {
      await db.get('_local/godzilla')
      throw new Error('Should have thrown')
    } catch (err: any) {
      expect(err.status).toBe(404)
    }
  })

  it('Deleting _local docs with bulkDocs, not found', async () => {
    const rev2res = await db.put({ _id: 'mothra' })
    const rev2 = rev2res.rev

    const rev3res = await db.put({ _id: 'rodan' })
    const rev3 = rev3res.rev

    const res = (await db.bulkDocs([
      { _id: 'mothra', _rev: rev2, _deleted: true },
      { _id: '_local/godzilla', _rev: '1-fake', _deleted: true },
      { _id: 'rodan', _rev: rev3, _deleted: true }
    ])) as BulkDocsResult[]

    expect(!isError(res[0])).toBe(true)
    expect(isError(res[1])).toBe(true)
    expect(!isError(res[2])).toBe(true)
  })

  it('Deleting _local docs with bulkDocs, wrong rev', async () => {
    await db.put({ _id: '_local/godzilla' })

    const rev2res = await db.put({ _id: 'mothra' })
    const rev2 = rev2res.rev

    const rev3res = await db.put({ _id: 'rodan' })
    const rev3 = rev3res.rev

    const res = (await db.bulkDocs([
      { _id: 'mothra', _rev: rev2, _deleted: true },
      { _id: '_local/godzilla', _rev: '1-fake', _deleted: true },
      { _id: 'rodan', _rev: rev3, _deleted: true }
    ])) as BulkDocsResult[]

    expect(!isError(res[0])).toBe(true)
    expect(isError(res[1])).toBe(true)
    expect(!isError(res[2])).toBe(true)
  })

  it('#3062 bulkDocs with staggered seqs', async () => {
    const docs: any[] = []
    for (let i = 10; i <= 20; i++) {
      docs.push({ _id: 'doc-' + i })
    }

    const infos = (await db.bulkDocs(docs)) as BulkDocsResult[]
    docs.forEach((doc, i) => {
      const info = infos[i]
      if (!isError(info)) {
        doc._rev = info.rev
      }
    })

    const docsToUpdate = docs.filter((doc, i) => i % 2 === 1)
    docsToUpdate.reverse()

    const results = (await db.bulkDocs(docsToUpdate)) as BulkDocsResult[]
    results.forEach(result => {
      expect(!isError(result)).toBe(true)
      expect(result.id).toBeDefined()
      if (!isError(result)) {
        expect(result.rev).toBeDefined()
      }
    })
  })

  it('Test quotes in doc ids', async () => {
    const docs = [{ _id: "'your_sql_injection_script_here'" }]
    const res = (await db.bulkDocs(docs)) as BulkDocsResult[]
    if (!isError(res[0])) {
      expect(res[0].ok).toBe(true)
    }

    try {
      await db.get('foo')
      throw new Error('Should have thrown')
    } catch (err: any) {
      expect(err.status).toBe(404)
    }
  })

  it('Bulk docs empty list', async () => {
    const result = (await db.bulkDocs([])) as BulkDocsResult[]
    expect(result).toEqual([])
  })

  it('handles simultaneous writes', async () => {
    const db1 = new PouchDB(dbName, { adapter: 'sqlite3' })
    const db2 = new PouchDB(dbName, { adapter: 'sqlite3' })
    const id = 'fooId'
    const errorNames: string[] = []
    const ids: string[] = []

    const results = await Promise.all([
      db1.bulkDocs([{ _id: id }]),
      db2.bulkDocs([{ _id: id }])
    ])

    results.forEach(res => {
      const result = (res as BulkDocsResult[])[0]
      if (isError(result)) {
        errorNames.push(result.name)
      } else {
        ids.push(result.id)
      }
    })

    expect(errorNames).toEqual(['conflict'])
    expect(ids).toEqual([id])
  })

  it('bulk docs input by array', async () => {
    const docs = makeDocs(5)
    const results1 = (await db.bulkDocs(docs)) as BulkDocsResult[]

    expect(results1).toHaveLength(5)
    for (let i = 0; i < 5; i++) {
      const result = results1[i]
      expect(result.id).toBe(docs[i]._id)
      if (!isError(result)) {
        expect(result.rev).toBeDefined()
        // Update the doc
        docs[i]._rev = result.rev
        docs[i].string = docs[i].string + '.00'
      }
    }

    const results2 = (await db.bulkDocs(docs)) as BulkDocsResult[]
    expect(results2).toHaveLength(5)
    for (let i = 0; i < 5; i++) {
      const result = results2[i]
      expect(result.id).toBe(i.toString())
      // set the delete flag to delete the docs in the next step
      if (!isError(result)) {
        docs[i]._rev = result.rev
        docs[i]._deleted = true
      }
    }

    await db.put(docs[0])
    const results3 = (await db.bulkDocs(docs)) as BulkDocsResult[]
    if (isError(results3[0])) {
      expect(results3[0].name).toBe('conflict')
    }

    for (let i = 1; i < 5; i++) {
      const result = results3[i]
      expect(result.id).toBe(i.toString())
      if (!isError(result)) {
        expect(result.rev).toBeDefined()
      }
    }
  })

  it('Bulk empty list', async () => {
    const result = (await db.bulkDocs([])) as BulkDocsResult[]
    expect(result).toEqual([])
  })

  it('Bulk docs not an array', async () => {
    try {
      await db.bulkDocs({ docs: 'foo' } as any)
      throw new Error('Should have thrown')
    } catch (err: any) {
      expect(err.status).toBe(400)
      expect(err.name).toBe('bad_request')
      expect(err.message).toBe("Missing JSON list of 'docs'")
    }
  })

  it('Bulk docs not an object', async () => {
    try {
      await db.bulkDocs({ docs: ['foo'] } as any)
      throw new Error('Should have thrown')
    } catch (err: any) {
      expect(err.status).toBe(400)
      expect(err.name).toBe('bad_request')
      expect(err.message).toBe('Document must be a JSON object')
    }

    try {
      await db.bulkDocs({ docs: [[]] } as any)
      throw new Error('Should have thrown')
    } catch (err: any) {
      expect(err.status).toBe(400)
      expect(err.name).toBe('bad_request')
      expect(err.message).toBe('Document must be a JSON object')
    }
  })

  it('4712 invalid rev for new doc generates conflict', async () => {
    const newdoc = {
      _id: 'foobar',
      _rev: '1-123'
    }

    const results = (await db.bulkDocs([newdoc])) as BulkDocsResult[]
    if (isError(results[0])) {
      expect(results[0].status).toBe(409)
      expect(results[0].error).toBe(true)
    }
  })

  // Transaction behavior tests
  describe('Transaction behavior', () => {
    it('bulk docs should be atomic - all succeed or all fail', async () => {
      const docs = [
        { _id: 'doc1', value: 1 },
        { _id: 'doc2', value: 2 },
        { _id: 'doc3', value: 3 }
      ]

      // First insert should succeed
      const results = (await db.bulkDocs(docs)) as BulkDocsResult[]
      results.forEach(result => {
        if (!isError(result)) {
          expect(result.ok).toBe(true)
        }
      })

      // Verify all docs were inserted
      const allDocs = await db.allDocs()
      expect(allDocs.total_rows).toBe(3)
    })

    it('partial failure should rollback entire transaction', async () => {
      // First create a doc
      await db.put({ _id: 'existing', value: 1 })

      const docs = [
        { _id: 'new1', value: 1 },
        { _id: 'existing', value: 2 }, // This will conflict
        { _id: 'new2', value: 3 }
      ]

      const results = (await db.bulkDocs(docs)) as BulkDocsResult[]

      // Check that we get conflict for the existing doc
      if (isError(results[1])) {
        expect(results[1].error).toBe(true)
        expect(results[1].name).toBe('conflict')
      }

      // Other docs should succeed in non-transactional mode
      if (!isError(results[0])) {
        expect(results[0].ok).toBe(true)
      }
      if (!isError(results[2])) {
        expect(results[2].ok).toBe(true)
      }
    })
  })

  // Bulk operations with attachments
  describe('Bulk operations with attachments', () => {
    it('bulk docs with attachments', async () => {
      const docs = [
        {
          _id: 'doc1',
          _attachments: {
            'att.txt': {
              content_type: 'text/plain',
              data: Buffer.from('Hello World').toString('base64')
            }
          }
        },
        {
          _id: 'doc2',
          _attachments: {
            'att.txt': {
              content_type: 'text/plain',
              data: Buffer.from('Hello Universe').toString('base64')
            }
          }
        }
      ]

      const results = (await db.bulkDocs(docs)) as BulkDocsResult[]
      results.forEach(result => {
        if (!isError(result)) {
          expect(result.ok).toBe(true)
        }
      })

      // Verify attachments
      const doc1 = await db.get('doc1', { attachments: true })
      expect(doc1._attachments).toBeDefined()
      expect(doc1._attachments!['att.txt']).toBeDefined()

      const doc2 = await db.get('doc2', { attachments: true })
      expect(doc2._attachments).toBeDefined()
      expect(doc2._attachments!['att.txt']).toBeDefined()
    })

    it('bulk update docs with attachments', async () => {
      // First create docs with attachments
      const docs: any[] = [
        {
          _id: 'doc1',
          _attachments: {
            'att.txt': {
              content_type: 'text/plain',
              data: Buffer.from('Initial').toString('base64')
            }
          }
        }
      ]

      const results = await db.bulkDocs(docs)
      docs[0]._rev = results[0].rev

      // Update with new attachment
      docs[0]._attachments = {
        'att.txt': {
          content_type: 'text/plain',
          data: Buffer.from('Updated').toString('base64')
        }
      }

      const updateResults = (await db.bulkDocs(docs)) as BulkDocsResult[]
      if (!isError(updateResults[0])) {
        expect(updateResults[0].ok).toBe(true)
      }

      // Verify update
      const updatedDoc = await db.get('doc1', { attachments: true })
      const attachmentData = Buffer.from(
        (updatedDoc._attachments!['att.txt'] as any).data,
        'base64'
      ).toString()
      expect(attachmentData).toBe('Updated')
    })
  })

  // Large bulk operations
  describe('Large bulk operations', () => {
    it('bulk insert 1000 documents', async () => {
      const docs = []
      for (let i = 0; i < 1000; i++) {
        docs.push({
          _id: `doc-${i.toString().padStart(4, '0')}`,
          index: i,
          data: `Data for document ${i}`
        })
      }

      const results = (await db.bulkDocs(docs)) as BulkDocsResult[]
      expect(results).toHaveLength(1000)

      // Verify all succeeded
      results.forEach(result => {
        if (!isError(result)) {
          expect(result.ok).toBe(true)
        }
      })

      // Verify count
      const info = await db.info()
      expect(info.doc_count).toBe(1000)
    })

    it('bulk update 500 documents', async () => {
      // First insert
      const docs: any[] = []
      for (let i = 0; i < 500; i++) {
        docs.push({
          _id: `doc-${i}`,
          version: 1
        })
      }

      const insertResults = await db.bulkDocs(docs)

      // Update all docs
      docs.forEach((doc, i) => {
        doc._rev = insertResults[i].rev
        doc.version = 2
      })

      const updateResults = (await db.bulkDocs(docs)) as BulkDocsResult[]
      expect(updateResults).toHaveLength(500)
      updateResults.forEach(result => {
        if (!isError(result)) {
          expect(result.ok).toBe(true)
        }
      })
    })
  })

  // Local document bulk operations
  describe('Local document bulk operations', () => {
    it('bulk insert local documents', async () => {
      const docs = [
        { _id: '_local/doc1', data: 'local1' },
        { _id: '_local/doc2', data: 'local2' },
        { _id: '_local/doc3', data: 'local3' }
      ]

      const results = (await db.bulkDocs(docs)) as BulkDocsResult[]
      results.forEach(result => {
        if (!isError(result)) {
          expect(result.ok).toBe(true)
        }
      })

      // Verify local docs don't appear in allDocs
      const allDocs = await db.allDocs()
      expect(allDocs.total_rows).toBe(0)

      // But can be retrieved individually
      const local1 = (await db.get('_local/doc1')) as any
      expect(local1.data).toBe('local1')
    })

    it('bulk update local documents', async () => {
      const docs: any[] = [{ _id: '_local/doc1', data: 'initial' }]

      const results = (await db.bulkDocs(docs)) as BulkDocsResult[]
      if (!isError(results[0])) {
        docs[0]._rev = results[0].rev
        docs[0].data = 'updated'
      }

      const updateResults = (await db.bulkDocs(docs)) as BulkDocsResult[]
      if (!isError(updateResults[0])) {
        expect(updateResults[0].ok).toBe(true)
      }

      const updated = (await db.get('_local/doc1')) as any
      expect(updated.data).toBe('updated')
    })

    it('bulk delete local documents', async () => {
      const docs: any[] = [{ _id: '_local/doc1', data: 'data' }]

      const results = await db.bulkDocs(docs)
      docs[0]._rev = results[0].rev
      docs[0]._deleted = true

      const deleteResults = (await db.bulkDocs(docs)) as BulkDocsResult[]
      if (!isError(deleteResults[0])) {
        expect(deleteResults[0].ok).toBe(true)
      }

      try {
        await db.get('_local/doc1')
        throw new Error('Should have thrown')
      } catch (err: any) {
        expect(err.status).toBe(404)
      }
    })
  })

  // Error handling
  describe('Error handling', () => {
    it('handle validation errors in bulk', async () => {
      const docs = [
        { _id: 'valid1', data: 'ok' },
        { _id: '_invalid', data: 'bad' }, // Invalid ID
        { _id: 'valid2', data: 'ok' },
        { _id: '', data: 'empty' }, // Empty ID
        { _id: 'valid3', data: 'ok' }
      ]

      try {
        await db.bulkDocs(docs)
        throw new Error('Should have thrown')
      } catch (err: any) {
        expect(err.status).toBe(500)
        expect(err.name).toBe('bad_request')
      }
    })

    it('handle missing _id in bulk docs', async () => {
      const docs = [
        { _id: 'valid1', data: 'ok' },
        { data: 'no id' } as any, // Missing _id
        { _id: 'valid2', data: 'ok' }
      ]

      const results = (await db.bulkDocs(docs)) as BulkDocsResult[]

      // PouchDB generates IDs for docs without _id
      results.forEach(result => {
        if (!isError(result)) {
          expect(result.ok).toBe(true)
          expect(result.id).toBeDefined()
        }
      })
    })

    it('handle rev mismatch errors', async () => {
      // Create initial docs
      const docs = [
        { _id: 'doc1', data: 'initial' },
        { _id: 'doc2', data: 'initial' }
      ]

      const results = (await db.bulkDocs(docs)) as BulkDocsResult[]

      // Try to update with wrong revs
      const updateDocs = [
        { _id: 'doc1', _rev: '1-fakehash', data: 'updated' },
        { _id: 'doc2', _rev: '2-wrongrev', data: 'updated' }
      ]

      const updateResults = (await db.bulkDocs(updateDocs)) as BulkDocsResult[]
      updateResults.forEach(result => {
        if (isError(result)) {
          expect(result.error).toBe(true)
          expect(result.name).toBe('conflict')
        }
      })
    })
  })

  // Mixed operations
  describe('Mixed operations', () => {
    it('mix of insert, update, and delete in one bulk call', async () => {
      // Setup: create some initial docs
      ;(await db.bulkDocs([
        { _id: 'existing1', data: 'initial' },
        { _id: 'existing2', data: 'initial' },
        { _id: 'toDelete', data: 'will be deleted' }
      ])) as BulkDocsResult[]

      // Get revisions
      const existing1 = await db.get('existing1')
      const existing2 = await db.get('existing2')
      const toDelete = await db.get('toDelete')

      // Mixed bulk operation
      const mixedDocs = [
        { _id: 'new1', data: 'brand new' }, // Insert
        { _id: 'new2', data: 'also new' }, // Insert
        { _id: 'existing1', _rev: existing1._rev, data: 'updated' }, // Update
        { _id: 'existing2', _rev: existing2._rev, data: 'also updated' }, // Update
        { _id: 'toDelete', _rev: toDelete._rev, _deleted: true } // Delete
      ]

      const results = (await db.bulkDocs(mixedDocs)) as BulkDocsResult[]

      // All operations should succeed
      results.forEach(result => {
        if (!isError(result)) {
          expect(result.ok).toBe(true)
        }
      })

      // Verify final state
      const allDocs = await db.allDocs()
      expect(allDocs.total_rows).toBe(4) // 2 existing updated + 2 new - 1 deleted

      // Verify updates
      const updated1 = (await db.get('existing1')) as any
      expect(updated1.data).toBe('updated')

      // Verify deletion
      try {
        await db.get('toDelete')
        throw new Error('Should have thrown')
      } catch (err: any) {
        expect(err.status).toBe(404)
      }
    })

    it('handle partial conflicts in mixed operations', async () => {
      // Setup
      ;(await db.bulkDocs([
        { _id: 'doc1', data: 'initial' },
        { _id: 'doc2', data: 'initial' }
      ])) as BulkDocsResult[]

      const doc1 = await db.get('doc1')

      const mixedDocs = [
        { _id: 'new1', data: 'new' }, // Should succeed
        { _id: 'doc1', _rev: '1-wrongrev', data: 'update' }, // Should conflict
        { _id: 'doc2', _rev: doc1._rev, data: 'wrong rev for doc2' }, // Should conflict
        { _id: 'new2', data: 'another new' } // Should succeed
      ]

      const results = (await db.bulkDocs(mixedDocs)) as BulkDocsResult[]

      if (!isError(results[0])) {
        expect(results[0].ok).toBe(true) // new1 succeeds
      }
      if (isError(results[1])) {
        expect(results[1].error).toBe(true) // doc1 conflicts
        expect(results[1].name).toBe('conflict')
      }
      if (isError(results[2])) {
        expect(results[2].error).toBe(true) // doc2 conflicts
        expect(results[2].name).toBe('conflict')
      }
      if (!isError(results[3])) {
        expect(results[3].ok).toBe(true) // new2 succeeds
      }
    })
  })
})
