import { describe, it, beforeEach, afterEach, expect } from '@jest/globals'
import PouchDB from 'pouchdb'
import { getDatabaseName, cleanupTestDatabases } from './utils/test-utils'

// Register the SQLite3 adapter
import SQLite3Adapter from '../src/index'
PouchDB.plugin(SQLite3Adapter)

// Type helpers for allDocs with keys results
interface AllDocsKeyRow {
  key: string
  error?: 'not_found'
  id?: string
  value?: {
    rev: string
    deleted?: boolean
  }
  doc?: any
}

interface AllDocsNormalRow {
  id: string
  key: string
  value: {
    rev: string
    deleted?: boolean
  }
  doc?: any
}

function isErrorRow(
  row: AllDocsKeyRow | AllDocsNormalRow
): row is AllDocsKeyRow & { error: 'not_found' } {
  return 'error' in row && row.error === 'not_found'
}

function isNormalRow(
  row: AllDocsKeyRow | AllDocsNormalRow
): row is AllDocsNormalRow {
  return 'id' in row && !('error' in row)
}

describe('all_docs', () => {
  let dbName: string
  let db: PouchDB.Database

  beforeEach(() => {
    dbName = getDatabaseName()
    db = new PouchDB(dbName, { adapter: 'sqlite3' })
  })

  afterEach(async () => {
    await cleanupTestDatabases()
  })

  const origDocs = [
    { _id: '0', a: 1, b: 1 },
    { _id: '3', a: 4, b: 16 },
    { _id: '1', a: 2, b: 4 },
    { _id: '2', a: 3, b: 9 }
  ]

  it('Testing all docs', async () => {
    await db.bulkDocs(origDocs)

    const result = await db.allDocs()
    const rows = result.rows
    expect(result.total_rows).toBe(4)

    for (let i = 0; i < rows.length; i++) {
      expect(rows[i].id).toMatch(/^[0-3]$/)
    }

    const all = await db.allDocs({
      startkey: '2',
      include_docs: true
    })
    expect(all.rows).toHaveLength(2)
    expect(all.rows[0].id).toBe('2')

    const opts = {
      startkey: 'org.couchdb.user:',
      endkey: 'org.couchdb.user;'
    }
    const raw = await db.allDocs(opts)
    expect(raw.rows).toHaveLength(0)
  })

  it('Testing allDocs opts.keys', async () => {
    function keyFunc(doc: any) {
      return doc.key
    }

    await db.bulkDocs(origDocs)

    let keys = ['3', '1']
    let result = (await db.allDocs({
      keys
    })) as PouchDB.Core.AllDocsResponse<{}> & {
      rows: (AllDocsKeyRow | AllDocsNormalRow)[]
    }
    expect(result.rows.map(keyFunc)).toEqual(keys)

    keys = ['2', '0', '1000']
    result = (await db.allDocs({
      keys
    })) as PouchDB.Core.AllDocsResponse<{}> & {
      rows: (AllDocsKeyRow | AllDocsNormalRow)[]
    }
    expect(result.rows.map(keyFunc)).toEqual(keys)
    const errorRow = result.rows[2]
    if (isErrorRow(errorRow)) {
      expect(errorRow.error).toBe('not_found')
    }

    result = (await db.allDocs({
      keys,
      descending: true
    })) as PouchDB.Core.AllDocsResponse<{}> & {
      rows: (AllDocsKeyRow | AllDocsNormalRow)[]
    }
    expect(result.rows.map(keyFunc)).toEqual(['1000', '0', '2'])
    const firstRow = result.rows[0]
    if (isErrorRow(firstRow)) {
      expect(firstRow.error).toBe('not_found')
    }

    // Should throw error with both keys and startkey
    await expect(
      db.allDocs({
        keys,
        startkey: 'a'
      } as any)
    ).rejects.toThrow()

    // Should throw error with both keys and endkey
    await expect(
      db.allDocs({
        keys,
        endkey: 'a'
      } as any)
    ).rejects.toThrow()

    // Empty keys array
    result = (await db.allDocs({
      keys: []
    })) as PouchDB.Core.AllDocsResponse<{}> & {
      rows: (AllDocsKeyRow | AllDocsNormalRow)[]
    }
    expect(result.rows).toHaveLength(0)

    // Test with deleted doc
    const doc = await db.get('2')
    await db.remove(doc)

    result = (await db.allDocs({
      keys,
      include_docs: true
    })) as PouchDB.Core.AllDocsResponse<{}> & {
      rows: (AllDocsKeyRow | AllDocsNormalRow)[]
    }
    expect(result.rows.map(keyFunc)).toEqual(keys)
    const deletedRow = result.rows[keys.indexOf('2')]
    if (isNormalRow(deletedRow)) {
      expect(deletedRow.value.deleted).toBe(true)
      expect(deletedRow.doc).toBeNull()
    }
  })

  it('Testing allDocs opts.keys with skip', async () => {
    await db.bulkDocs(origDocs)

    const res = (await db.allDocs({
      keys: ['3', '1'],
      skip: 1
    })) as PouchDB.Core.AllDocsResponse<{}> & {
      rows: (AllDocsKeyRow | AllDocsNormalRow)[]
    }
    expect(res.total_rows).toBe(4)
    expect(res.rows).toHaveLength(1)
    const firstRow = res.rows[0]
    if (isNormalRow(firstRow)) {
      expect(firstRow.id).toBe('1')
    }
  })

  it('Testing allDocs opts.keys with limit', async () => {
    await db.bulkDocs(origDocs)

    let res = (await db.allDocs({
      keys: ['3', '1'],
      limit: 1
    })) as PouchDB.Core.AllDocsResponse<{}> & {
      rows: (AllDocsKeyRow | AllDocsNormalRow)[]
    }
    expect(res.total_rows).toBe(4)
    expect(res.rows).toHaveLength(1)
    const firstRow = res.rows[0]
    if (isNormalRow(firstRow)) {
      expect(firstRow.id).toBe('3')
    }

    res = (await db.allDocs({
      keys: ['0', '2'],
      limit: 3
    })) as PouchDB.Core.AllDocsResponse<{}> & {
      rows: (AllDocsKeyRow | AllDocsNormalRow)[]
    }
    expect(res.rows).toHaveLength(2)
    const row0 = res.rows[0]
    const row1 = res.rows[1]
    if (isNormalRow(row0)) {
      expect(row0.id).toBe('0')
    }
    if (isNormalRow(row1)) {
      expect(row1.id).toBe('2')
    }
  })

  it('Testing allDocs invalid opts.keys', async () => {
    await expect(db.allDocs({ keys: 1234 as any })).rejects.toThrow()
  })

  it('Testing include docs', async () => {
    await db.bulkDocs(origDocs)

    const changes = (await db.changes({
      include_docs: true
    })) as any

    changes.results.forEach((row: any) => {
      if (row.id === '0') {
        expect(row.doc.a).toBe(1)
      }
    })
  })

  it('Testing conflicts', async () => {
    await db.bulkDocs(origDocs)

    // Add conflicts
    const conflictDoc1 = {
      _id: '3',
      _rev: '2-aa01552213fafa022e6167113ed01087',
      value: 'X'
    }
    const conflictDoc2 = {
      _id: '3',
      _rev: '2-ff01552213fafa022e6167113ed01087',
      value: 'Z'
    }

    await db.put(conflictDoc1, { new_edits: false } as any)
    await db.put(conflictDoc2, { new_edits: false } as any)

    const winRev = await db.get('3')
    expect(winRev._rev).toBe(conflictDoc2._rev)

    const res = await db.allDocs({
      include_docs: true,
      conflicts: true
    })

    const row = res.rows[3]
    expect(res.rows).toHaveLength(4)
    expect(row.key).toBe('3')
    expect(row.id).toBe('3')
    expect(row.value.rev).toBe(winRev._rev)
    expect(row.doc!._rev).toBe(winRev._rev)
    expect(row.doc!._id).toBe('3')
    expect(row.doc!._conflicts).toBeInstanceOf(Array)
    expect(row.doc!._conflicts).toHaveLength(2)
    expect(row.doc!._conflicts![0]).toBe(conflictDoc1._rev)
  })

  it('test basic collation', async () => {
    const docs = [
      { _id: 'z', foo: 'z' },
      { _id: 'a', foo: 'a' }
    ]
    await db.bulkDocs(docs)

    const result = await db.allDocs({
      startkey: 'z',
      endkey: 'z'
    })
    expect(result.rows).toHaveLength(1)
  })

  it('3883 start_key end_key aliases', async () => {
    const docs = [
      { _id: 'a', foo: 'a' },
      { _id: 'z', foo: 'z' }
    ]
    await db.bulkDocs(docs)

    const result = await db.allDocs({ start_key: 'z', end_key: 'z' } as any)
    expect(result.rows).toHaveLength(1)
  })

  it('test total_rows with a variety of criteria', async () => {
    const docs: any[] = [
      { _id: '0' },
      { _id: '1' },
      { _id: '2' },
      { _id: '3' },
      { _id: '4' },
      { _id: '5' },
      { _id: '6' },
      { _id: '7' },
      { _id: '8' },
      { _id: '9' }
    ]

    const bulkRes = await db.bulkDocs(docs)
    docs[3]._deleted = true
    docs[7]._deleted = true
    docs[3]._rev = bulkRes[3].rev
    docs[7]._rev = bulkRes[7].rev

    await db.remove(docs[3] as any)
    await db.remove(docs[7] as any)

    let res = await db.allDocs()
    expect(res.rows).toHaveLength(8)
    expect(res.total_rows).toBe(8)

    res = await db.allDocs({ startkey: '5', endkey: 'z' })
    expect(res.rows).toHaveLength(4)
    expect(res.total_rows).toBe(8)

    res = await db.allDocs({ startkey: '5', skip: 2, limit: 10 })
    expect(res.rows).toHaveLength(2)
    expect(res.total_rows).toBe(8)

    res = await db.allDocs({ startkey: '5', limit: 0 })
    expect(res.rows).toHaveLength(0)
    expect(res.total_rows).toBe(8)

    res = (await db.allDocs({
      keys: ['5'],
      limit: 0
    })) as PouchDB.Core.AllDocsResponse<{}> & {
      rows: (AllDocsKeyRow | AllDocsNormalRow)[]
    }
    expect(res.rows).toHaveLength(0)
    expect(res.total_rows).toBe(8)

    res = await db.allDocs({ limit: 0 })
    expect(res.rows).toHaveLength(0)
    expect(res.total_rows).toBe(8)

    res = await db.allDocs({ startkey: '5', descending: true, skip: 1 })
    expect(res.rows).toHaveLength(4)
    expect(res.total_rows).toBe(8)

    res = await db.allDocs({ startkey: '5', endkey: 'z' })
    expect(res.rows).toHaveLength(4)
    expect(res.total_rows).toBe(8)

    res = await db.allDocs({ startkey: '5', endkey: '5' })
    expect(res.rows).toHaveLength(1)
    expect(res.total_rows).toBe(8)

    res = await db.allDocs({ startkey: '5', endkey: '4' })
    expect(res.rows).toHaveLength(0)
    expect(res.total_rows).toBe(8)

    res = await db.allDocs({ startkey: '5', endkey: '4', descending: true })
    expect(res.rows).toHaveLength(2)
    expect(res.total_rows).toBe(8)

    res = await db.allDocs({ startkey: '3', endkey: '7', descending: false })
    expect(res.rows).toHaveLength(3)
    expect(res.total_rows).toBe(8)

    res = await db.allDocs({ startkey: '7', endkey: '3', descending: true })
    expect(res.rows).toHaveLength(3)
    expect(res.total_rows).toBe(8)

    res = await db.allDocs({ startkey: '', endkey: '0' })
    expect(res.rows).toHaveLength(1)
    expect(res.total_rows).toBe(8)

    res = (await db.allDocs({
      keys: ['0', '1', '3']
    })) as PouchDB.Core.AllDocsResponse<{}> & {
      rows: (AllDocsKeyRow | AllDocsNormalRow)[]
    }
    expect(res.rows).toHaveLength(3)
    expect(res.total_rows).toBe(8)

    res = (await db.allDocs({
      keys: ['0', '1', '0', '2', '1', '1']
    })) as PouchDB.Core.AllDocsResponse<{}> & {
      rows: (AllDocsKeyRow | AllDocsNormalRow)[]
    }
    expect(res.rows).toHaveLength(6)
    expect(res.rows.map(row => row.key)).toEqual(['0', '1', '0', '2', '1', '1'])
    expect(res.total_rows).toBe(8)

    res = (await db.allDocs({
      keys: []
    })) as PouchDB.Core.AllDocsResponse<{}> & {
      rows: (AllDocsKeyRow | AllDocsNormalRow)[]
    }
    expect(res.rows).toHaveLength(0)
    expect(res.total_rows).toBe(8)

    res = (await db.allDocs({
      keys: ['7']
    })) as PouchDB.Core.AllDocsResponse<{}> & {
      rows: (AllDocsKeyRow | AllDocsNormalRow)[]
    }
    expect(res.rows).toHaveLength(1)
    expect(res.total_rows).toBe(8)

    res = await db.allDocs({ key: '3' })
    expect(res.rows).toHaveLength(0)
    expect(res.total_rows).toBe(8)

    res = await db.allDocs({ key: '2' })
    expect(res.rows).toHaveLength(1)
    expect(res.total_rows).toBe(8)

    res = await db.allDocs({ key: 'z' })
    expect(res.rows).toHaveLength(0)
    expect(res.total_rows).toBe(8)
  })

  it('test total_rows with a variety of criteria * 100', async () => {
    const docs: any[] = []
    for (let i = 0; i < 1000; ++i) {
      docs.push({ _id: i.toString().padStart(5, '0') })
    }

    const res = await db.bulkDocs(docs)
    const deletes: any[] = []

    for (let i = 300; i < 400; ++i) {
      docs[i]._deleted = true
      docs[i]._rev = res[i].rev
      deletes.push(docs[i])
    }
    for (let i = 700; i < 800; ++i) {
      docs[i]._deleted = true
      docs[i]._rev = res[i].rev
      deletes.push(docs[i])
    }

    const deleted = await Promise.all(deletes.map(doc => db.remove(doc as any)))
    expect(deleted).toHaveLength(200)

    let result = await db.allDocs()
    expect(result.rows).toHaveLength(800)
    expect(result.total_rows).toBe(800)

    result = await db.allDocs({ startkey: '00500', endkey: 'z' })
    expect(result.rows).toHaveLength(400)
    expect(result.total_rows).toBe(800)

    result = await db.allDocs({ startkey: '00500', skip: 200, limit: 1000 })
    expect(result.rows).toHaveLength(200)
    expect(result.total_rows).toBe(800)

    result = await db.allDocs({ startkey: '00500', limit: 0 })
    expect(result.rows).toHaveLength(0)
    expect(result.total_rows).toBe(800)

    result = (await db.allDocs({
      keys: ['00500'],
      limit: 0
    })) as PouchDB.Core.AllDocsResponse<{}> & {
      rows: (AllDocsKeyRow | AllDocsNormalRow)[]
    }
    expect(result.rows).toHaveLength(0)
    expect(result.total_rows).toBe(800)

    result = await db.allDocs({ limit: 0 })
    expect(result.rows).toHaveLength(0)
    expect(result.total_rows).toBe(800)

    result = await db.allDocs({ startkey: '00500', descending: true, skip: 1 })
    expect(result.rows).toHaveLength(400)
    expect(result.total_rows).toBe(800)

    result = await db.allDocs({ startkey: '00500', endkey: 'z' })
    expect(result.rows).toHaveLength(400)
    expect(result.total_rows).toBe(800)

    result = await db.allDocs({ startkey: '00500', endkey: '00500' })
    expect(result.rows).toHaveLength(1)
    expect(result.total_rows).toBe(800)

    result = await db.allDocs({ startkey: '00500', endkey: '00400' })
    expect(result.rows).toHaveLength(0)
    expect(result.total_rows).toBe(800)

    result = await db.allDocs({
      startkey: '00599',
      endkey: '00400',
      descending: true
    })
    expect(result.rows).toHaveLength(200)
    expect(result.total_rows).toBe(800)

    result = await db.allDocs({
      startkey: '00599',
      endkey: '00400',
      descending: true,
      inclusive_end: false
    })
    expect(result.rows).toHaveLength(199)
    expect(result.total_rows).toBe(800)

    result = await db.allDocs({
      startkey: '00300',
      endkey: '00799',
      descending: false
    })
    expect(result.rows).toHaveLength(300)
    expect(result.total_rows).toBe(800)

    result = await db.allDocs({
      startkey: '00300',
      endkey: '00799',
      descending: false,
      inclusive_end: false
    })
    expect(result.rows).toHaveLength(300)
    expect(result.total_rows).toBe(800)

    result = await db.allDocs({
      startkey: '00799',
      endkey: '00300',
      descending: true
    })
    expect(result.rows).toHaveLength(300)
    expect(result.total_rows).toBe(800)

    result = await db.allDocs({ startkey: '', endkey: '00000' })
    expect(result.rows).toHaveLength(1)
    expect(result.total_rows).toBe(800)

    result = (await db.allDocs({
      keys: ['00000', '00100', '00300']
    })) as PouchDB.Core.AllDocsResponse<{}> & {
      rows: (AllDocsKeyRow | AllDocsNormalRow)[]
    }
    expect(result.rows).toHaveLength(3)
    expect(result.total_rows).toBe(800)

    result = (await db.allDocs({
      keys: ['00000', '00100', '00000', '00200', '00100', '00100']
    })) as PouchDB.Core.AllDocsResponse<{}> & {
      rows: (AllDocsKeyRow | AllDocsNormalRow)[]
    }
    expect(result.rows).toHaveLength(6)
    expect(result.rows.map(row => row.key)).toEqual([
      '00000',
      '00100',
      '00000',
      '00200',
      '00100',
      '00100'
    ])
    expect(result.total_rows).toBe(800)

    result = (await db.allDocs({
      keys: []
    })) as PouchDB.Core.AllDocsResponse<{}> & {
      rows: (AllDocsKeyRow | AllDocsNormalRow)[]
    }
    expect(result.rows).toHaveLength(0)
    expect(result.total_rows).toBe(800)

    result = (await db.allDocs({
      keys: ['00700']
    })) as PouchDB.Core.AllDocsResponse<{}> & {
      rows: (AllDocsKeyRow | AllDocsNormalRow)[]
    }
    expect(result.rows).toHaveLength(1)
    expect(result.total_rows).toBe(800)

    result = await db.allDocs({ key: '00300' })
    expect(result.rows).toHaveLength(0)
    expect(result.total_rows).toBe(800)

    result = await db.allDocs({ key: '00200' })
    expect(result.rows).toHaveLength(1)
    expect(result.total_rows).toBe(800)

    result = await db.allDocs({ key: 'z' })
    expect(result.rows).toHaveLength(0)
    expect(result.total_rows).toBe(800)
  })

  it('test total_rows with both skip and limit', async () => {
    const docs = [
      { _id: 'w', foo: 'w' },
      { _id: 'x', foo: 'x' },
      { _id: 'y', foo: 'y' },
      { _id: 'z', foo: 'z' }
    ]
    await db.bulkDocs(docs)

    let res = await db.allDocs({ startkey: 'x', limit: 1, skip: 1 })
    expect(res.total_rows).toBe(4)
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].id).toBe('y')

    const xDoc = await db.get('x')
    await db.remove(xDoc)

    res = await db.allDocs({ startkey: 'w', limit: 2, skip: 1 })
    expect(res.total_rows).toBe(3)
    expect(res.rows).toHaveLength(2)
    expect(res.rows[0].id).toBe('y')
  })

  it('test limit option and total_rows', async () => {
    const docs = [
      { _id: 'z', foo: 'z' },
      { _id: 'a', foo: 'a' }
    ]
    await db.bulkDocs(docs)

    const res = await db.allDocs({
      startkey: 'a',
      endkey: 'z',
      limit: 1
    })
    expect(res.total_rows).toBe(2)
    expect(res.rows).toHaveLength(1)
  })

  it('test escaped startkey/endkey', async () => {
    const id1 = '"weird id!" a'
    const id2 = '"weird id!" z'
    const docs = [
      {
        _id: id1,
        foo: 'a'
      },
      {
        _id: id2,
        foo: 'z'
      }
    ]
    await db.bulkDocs(docs)

    const res = await db.allDocs({
      startkey: id1,
      endkey: id2
    })
    expect(res.total_rows).toBe(2)
  })

  it('test "key" option', async () => {
    await db.bulkDocs([{ _id: '0' }, { _id: '1' }, { _id: '2' }])

    const res = await db.allDocs({ key: '1' })
    expect(res.rows).toHaveLength(1)

    // Should throw error with both key and keys
    await expect(
      db.allDocs({
        key: '1',
        keys: ['1', '2']
      } as any)
    ).rejects.toThrow()

    // key with startkey and endkey doesn't throw but behavior is weird
    await db.allDocs({
      key: '1',
      startkey: '1'
    })

    await db.allDocs({
      key: '1',
      endkey: '1'
    })
  })

  it('test inclusive_end=false', async () => {
    const docs = [{ _id: '1' }, { _id: '2' }, { _id: '3' }, { _id: '4' }]
    await db.bulkDocs(docs)

    let res = await db.allDocs({
      startkey: '',
      endkey: '2',
      inclusive_end: false
    })
    expect(res.rows).toHaveLength(1)

    res = await db.allDocs({ startkey: '', endkey: '1', inclusive_end: false })
    expect(res.rows).toHaveLength(0)

    res = await db.allDocs({ inclusive_end: false, endkey: '1', startkey: '0' })
    expect(res.rows).toHaveLength(0)

    res = await db.allDocs({ startkey: '', endkey: '5', inclusive_end: false })
    expect(res.rows).toHaveLength(4)

    res = await db.allDocs({ startkey: '', endkey: '4', inclusive_end: false })
    expect(res.rows).toHaveLength(3)

    res = await db.allDocs({ inclusive_end: false, endkey: '4', startkey: '3' })
    expect(res.rows).toHaveLength(1)

    res = await db.allDocs({
      startkey: '9',
      endkey: '1',
      descending: true,
      inclusive_end: false
    })
    expect(res.rows).toHaveLength(3)

    res = await db.allDocs({ startkey: '', endkey: '4', inclusive_end: true })
    expect(res.rows).toHaveLength(4)

    res = await db.allDocs({
      descending: true,
      startkey: '3',
      endkey: '2',
      inclusive_end: false
    })
    expect(res.rows).toHaveLength(1)
  })

  it('test descending with startkey/endkey', async () => {
    await db.bulkDocs([
      { _id: 'a' },
      { _id: 'b' },
      { _id: 'c' },
      { _id: 'd' },
      { _id: 'e' }
    ])

    let res = await db.allDocs({
      descending: true,
      startkey: 'd',
      endkey: 'b'
    })
    let ids = res.rows.map(x => x.id)
    expect(ids).toEqual(['d', 'c', 'b'])

    res = await db.allDocs({
      descending: true,
      startkey: 'd',
      endkey: 'b',
      inclusive_end: false
    })
    ids = res.rows.map(x => x.id)
    expect(ids).toEqual(['d', 'c'])

    res = await db.allDocs({
      descending: true,
      startkey: 'd',
      endkey: 'a',
      skip: 1,
      limit: 2
    })
    ids = res.rows.map(x => x.id)
    expect(ids).toEqual(['c', 'b'])

    res = await db.allDocs({
      descending: true,
      startkey: 'd',
      endkey: 'a',
      skip: 1
    })
    ids = res.rows.map(x => x.id)
    expect(ids).toEqual(['c', 'b', 'a'])
  })

  it('#3082 test wrong num results returned', async () => {
    const docs = []
    for (let i = 0; i < 1000; i++) {
      docs.push({})
    }

    let lastkey: string | undefined
    const allkeys: string[] = []

    async function paginate(): Promise<void> {
      const opts: any = { include_docs: true, limit: 100 }
      if (lastkey) {
        opts.startkey = lastkey
        opts.skip = 1
      }
      const res = await db.allDocs(opts)
      if (!res.rows.length) {
        return
      }
      if (lastkey) {
        expect(res.rows[0].key > lastkey).toBe(true)
      }
      expect(res.rows).toHaveLength(100)
      lastkey = res.rows[res.rows.length - 1].key
      allkeys.push(lastkey)
      return paginate()
    }

    await db.bulkDocs(docs)
    await paginate()

    // Try running all queries at once to try to isolate race condition
    await Promise.all(
      allkeys.map(async key => {
        const res = await db.allDocs({
          limit: 100,
          include_docs: true,
          startkey: key,
          skip: 1
        })
        if (!res.rows.length) {
          return
        }
        expect(res.rows[0].key > key).toBe(true)
        expect(res.rows).toHaveLength(100)
      })
    )
  })

  it('test empty db', async () => {
    const res = await db.allDocs()
    expect(res.rows).toHaveLength(0)
    expect(res.total_rows).toBe(0)
  })

  it('test after db close', async () => {
    await db.close()
    await expect(db.allDocs()).rejects.toThrow('database is closed')
  })

  it('test unicode ids and revs', async () => {
    const id = 'baz\u0000'
    const res = await db.put({ _id: id })
    const rev = res.rev

    const doc = await db.get(id)
    expect(doc._id).toBe(id)
    expect(doc._rev).toBe(rev)

    const allDocsRes = (await db.allDocs({
      keys: [id]
    })) as PouchDB.Core.AllDocsResponse<{}> & {
      rows: (AllDocsKeyRow | AllDocsNormalRow)[]
    }
    expect(allDocsRes.rows).toHaveLength(1)
    const row = allDocsRes.rows[0]
    if (isNormalRow(row)) {
      expect(row.value.rev).toBe(rev)
    }
  })

  it('5793 _conflicts should not exist if no conflicts', async () => {
    await db.put({
      _id: '0',
      a: 1
    })

    const result = await db.allDocs({
      include_docs: true,
      conflicts: true
    })

    expect(result.rows[0].doc!._conflicts).toBeUndefined()
  })

  it('#6230 Test allDocs opts update_seq: false', async () => {
    await db.bulkDocs(origDocs)

    const result = await db.allDocs({
      update_seq: false
    })

    expect(result.rows).toHaveLength(4)
    expect((result as any).update_seq).toBeUndefined()
  })

  it('#6230 Test allDocs opts update_seq: true', async () => {
    await db.bulkDocs(origDocs)

    const result = await db.allDocs({
      update_seq: true
    })

    expect(result.rows).toHaveLength(4)
    expect((result as any).update_seq).toBeDefined()

    const updateSeq = (result as any).update_seq
    expect(typeof updateSeq === 'number' || typeof updateSeq === 'string').toBe(
      true
    )

    function normalizeSeq(seq: any): number {
      try {
        if (typeof seq === 'string' && seq.indexOf('-') > 0) {
          return parseInt(seq.substring(0, seq.indexOf('-')))
        }
        return seq
      } catch (err) {
        return seq
      }
    }

    const normSeq = normalizeSeq(updateSeq)
    expect(typeof normSeq).toBe('number')
  })

  it('#6230 Test allDocs opts with update_seq missing', async () => {
    await db.bulkDocs(origDocs)

    const result = await db.allDocs()

    expect(result.rows).toHaveLength(4)
    expect((result as any).update_seq).toBeUndefined()
  })

  it('allDocs with attachments', async () => {
    const docs: PouchDB.Core.PutDocument<{}>[] = [
      {
        _id: 'doc1',
        _attachments: {
          'foo.txt': {
            content_type: 'text/plain',
            data: Buffer.from('Hello world').toString('base64')
          }
        }
      },
      {
        _id: 'doc2',
        _attachments: {
          'bar.txt': {
            content_type: 'text/plain',
            data: Buffer.from('Goodbye world').toString('base64')
          }
        }
      }
    ]

    await db.bulkDocs(docs)

    const result = await db.allDocs({
      include_docs: true,
      attachments: true
    })

    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].doc!._attachments!['foo.txt']).toBeDefined()
    expect(
      (result.rows[0].doc!._attachments!['foo.txt'] as any).data
    ).toBeDefined()
    expect(result.rows[1].doc!._attachments!['bar.txt']).toBeDefined()
    expect(
      (result.rows[1].doc!._attachments!['bar.txt'] as any).data
    ).toBeDefined()
  })

  it('allDocs with local documents', async () => {
    // Create some regular docs
    await db.bulkDocs([{ _id: 'regular1' }, { _id: 'regular2' }])

    // Create some local docs
    await db.put({ _id: '_local/doc1', data: 'local1' })
    await db.put({ _id: '_local/doc2', data: 'local2' })

    // allDocs should not return local docs by default
    const result = await db.allDocs()
    expect(result.rows).toHaveLength(2)
    expect(result.rows.every(row => !row.id.startsWith('_local/'))).toBe(true)

    // Trying to get local docs with keys should work
    const localResult = (await db.allDocs({
      keys: ['_local/doc1', '_local/doc2'],
      include_docs: true
    })) as PouchDB.Core.AllDocsResponse<{}> & {
      rows: (AllDocsKeyRow | AllDocsNormalRow)[]
    }
    expect(localResult.rows).toHaveLength(2)
    const row0 = localResult.rows[0]
    const row1 = localResult.rows[1]
    if (isNormalRow(row0)) {
      expect(row0.doc).toBeDefined()
      expect(row0.doc!.data).toBe('local1')
    }
    if (isNormalRow(row1)) {
      expect(row1.doc).toBeDefined()
      expect(row1.doc!.data).toBe('local2')
    }
  })

  it('allDocs with complex keys handling', async () => {
    const complexDocs = [
      { _id: 'foo/bar' },
      { _id: 'foo\\bar' },
      { _id: 'foo bar' },
      { _id: 'foo\tbar' },
      { _id: 'foo\nbar' },
      { _id: 'foo"bar' },
      { _id: "foo'bar" },
      { _id: 'foo,bar' },
      { _id: 'foo;bar' },
      { _id: 'foo:bar' },
      { _id: 'foo.bar' },
      { _id: 'foo-bar' },
      { _id: 'foo_bar' },
      { _id: 'foo+bar' },
      { _id: 'foo=bar' },
      { _id: 'foo?bar' },
      { _id: 'foo&bar' },
      { _id: 'foo#bar' },
      { _id: 'foo%bar' },
      { _id: 'foo@bar' },
      { _id: 'foo!bar' },
      { _id: 'foo*bar' },
      { _id: 'foo(bar' },
      { _id: 'foo)bar' },
      { _id: 'foo[bar' },
      { _id: 'foo]bar' },
      { _id: 'foo{bar' },
      { _id: 'foo}bar' },
      { _id: 'foo<bar' },
      { _id: 'foo>bar' },
      { _id: 'foo|bar' }
    ]

    await db.bulkDocs(complexDocs)

    const result = await db.allDocs()
    expect(result.rows).toHaveLength(complexDocs.length)

    // Test fetching each one individually
    for (const doc of complexDocs) {
      const singleResult = (await db.allDocs({
        keys: [doc._id]
      })) as PouchDB.Core.AllDocsResponse<{}> & {
        rows: (AllDocsKeyRow | AllDocsNormalRow)[]
      }
      expect(singleResult.rows).toHaveLength(1)
      const row = singleResult.rows[0]
      if (isNormalRow(row)) {
        expect(row.id).toBe(doc._id)
      }
      if ('error' in row) {
        expect(row.error).toBeUndefined()
      }
    }
  })

  it('allDocs with large result sets', async () => {
    const largeDocCount = 10000
    const docs = []

    for (let i = 0; i < largeDocCount; i++) {
      docs.push({
        _id: i.toString().padStart(10, '0'),
        index: i,
        data: 'x'.repeat(100)
      })
    }

    // Bulk insert in batches to avoid memory issues
    const batchSize = 1000
    for (let i = 0; i < docs.length; i += batchSize) {
      await db.bulkDocs(docs.slice(i, i + batchSize))
    }

    // Test getting all docs
    const allResult = await db.allDocs()
    expect(allResult.total_rows).toBe(largeDocCount)
    expect(allResult.rows).toHaveLength(largeDocCount)

    // Test pagination
    let offset = 0
    const pageSize = 100
    let totalFetched = 0

    while (offset < largeDocCount) {
      const pageResult = await db.allDocs({
        limit: pageSize,
        skip: offset
      })

      const expectedCount = Math.min(pageSize, largeDocCount - offset)
      expect(pageResult.rows).toHaveLength(expectedCount)
      expect(pageResult.total_rows).toBe(largeDocCount)

      totalFetched += pageResult.rows.length
      offset += pageSize
    }

    expect(totalFetched).toBe(largeDocCount)
  }, 30000) // Increase timeout for large dataset test
})
