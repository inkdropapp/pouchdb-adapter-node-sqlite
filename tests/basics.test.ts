import { describe, it, beforeEach, afterEach, expect } from '@jest/globals'
import PouchDB from 'pouchdb'
import { getDatabaseName, cleanupTestDatabases } from './utils/test-utils'

// Register the SQLite3 adapter
import SQLite3Adapter from '../src/index'
PouchDB.plugin(SQLite3Adapter)

describe('basics', () => {
  let dbName: string

  beforeEach(() => {
    dbName = getDatabaseName()
  })

  afterEach(async () => {
    await cleanupTestDatabases()
  })

  it('Create a pouch without new keyword', () => {
    const db = (PouchDB as any)(dbName, { adapter: 'sqlite3' })
    expect(db).toBeInstanceOf(PouchDB)
  })

  it('Name is accessible via instance', () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    expect(db.name).toBe(dbName)
  })

  it('Create a pouch with + in name', async () => {
    const db = new PouchDB(dbName + '+suffix', { adapter: 'sqlite3' })
    await db.info()
    await db.destroy()
  })

  it('Creating Pouch without name will throw', () => {
    expect(() => {
      new (PouchDB as any)()
    }).toThrow()
  })

  it('Create a pouch with urlencoded name', async () => {
    const db = new PouchDB(dbName + 'some%2Ftest', { adapter: 'sqlite3' })
    await db.info()
    await db.destroy()
  })

  it('destroy a pouch', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    await db.destroy()
  })

  it('throw useful error if method called on stale instance', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })

    await db.put({ _id: 'cleanTest' })
    await db.destroy()

    await expect(db.get('cleanTest')).rejects.toThrow()
  })

  it('Add a doc', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const result = await db.post({ test: 'somestuff' })
    expect(result.ok).toBe(true)
  })

  it('Get invalid id', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    await expect(db.get(1234 as any)).rejects.toThrow()
  })

  it('Missing doc should contain ID in error object', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    try {
      await db.get('abc-123')
    } catch (err: any) {
      expect(err.docId).toBe('abc-123')
      expect(err.status).toBe(404)
    }
  })

  it('PUTed Conflicted doc should contain ID in error object', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const info = await db.post({})
    const savedDocId = info.id

    try {
      await db.put({ _id: savedDocId })
    } catch (err: any) {
      expect(err.status).toBe(409)
      expect(err.docId).toBe(savedDocId)
    }
  })

  it('POSTed Conflicted doc should contain ID in error object', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const info = await db.post({})
    const savedDocId = info.id

    try {
      await db.post({ _id: savedDocId })
    } catch (err: any) {
      expect(err.status).toBe(409)
      expect(err.docId).toBe(savedDocId)
    }
  })

  it('Add a doc with a promise', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    await db.post({ test: 'somestuff' })
  })

  it('Add a doc with opts object', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    await db.post({ test: 'somestuff' }, {})
  })

  it('Modify a doc', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const info = await db.post({ test: 'somestuff' })
    const info2 = await db.put({
      _id: info.id,
      _rev: info.rev,
      another: 'test'
    })
    expect(info.rev).not.toBe(info2.rev)
  })

  it('Modifying a doc that has rewritten content', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const doc: any = {
      _id: 'foo',
      'something.that': null,
      'needs-to-be': false,
      'rewritten!': true
    }

    const info = await db.put(doc)
    doc._rev = info.rev
    doc.foo = 'bar'

    const info2 = await db.put(doc)
    doc._rev = info2.rev

    const dbDoc = await db.get('foo')
    expect(dbDoc).toEqual(doc)
  })

  it('Read db id', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const id = await (db as any).id()
    expect(typeof id).toBe('string')
  })

  it('Close db', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    await db.info()
    await db.close()
  })

  it('Modify a doc with incorrect rev', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const info = await db.post({ test: 'somestuff' })
    const nDoc = {
      _id: info.id,
      _rev: info.rev + 'broken',
      another: 'test'
    }
    await expect(db.put(nDoc)).rejects.toThrow()
  })

  it('Remove doc', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const info = await db.post({ test: 'somestuff' })
    await db.remove({
      test: 'somestuff',
      _id: info.id,
      _rev: info.rev
    } as any)
    await expect(db.get(info.id)).rejects.toThrow()
  })

  it('Remove doc with new syntax', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const info = await db.post({ test: 'somestuff' })
    await db.remove(info.id, info.rev)
    await expect(db.get(info.id)).rejects.toThrow()
  })

  it('Doc removal leaves only stub', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    await db.put({ _id: 'foo', value: 'test' })
    const doc = await db.get('foo')
    const res = await db.remove(doc)
    const deletedDoc = await db.get('foo', { rev: res.rev })
    expect(deletedDoc).toEqual({
      _id: res.id,
      _rev: res.rev,
      _deleted: true
    })
  })

  it('Remove doc twice with specified id', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    await db.put({ _id: 'specifiedId', test: 'somestuff' })
    const doc = await db.get('specifiedId')
    await db.remove(doc)
    await db.put({ _id: 'specifiedId', test: 'somestuff2' })
    const doc2 = await db.get('specifiedId')
    await db.remove(doc2)
  })

  it('Delete document without id', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    await expect(db.remove({ test: 'ing' } as any)).rejects.toThrow()
  })

  it('Delete document with many args', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const doc = { _id: 'foo' }
    const info = await db.put(doc)
    await db.remove(doc._id, info.rev, {})
  })

  it('Delete doc with id + rev + no opts', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const doc = { _id: 'foo' }
    const info = await db.put(doc)
    await db.remove(doc._id, info.rev)
  })

  it('Delete doc with doc + opts', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const doc: any = { _id: 'foo' }
    const info = await db.put(doc)
    doc._rev = info.rev
    await db.remove(doc, {})
  })

  it('Delete doc with rev in opts', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const doc = { _id: 'foo' }
    const info = await db.put(doc)
    await db.remove(doc._id, info.rev)
  })

  it('Bulk docs', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const infos = await db.bulkDocs([
      { test: 'somestuff' },
      { test: 'another' }
    ])
    expect(infos.length).toBe(2)
    expect((infos[0] as any).ok).toBe(true)
    expect((infos[1] as any).ok).toBe(true)
  })

  it('Basic checks', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const info = await db.info()
    const updateSeq = info.update_seq
    const doc = { _id: '0', a: 1, b: 1 }
    expect(info.doc_count).toBe(0)

    const res = await db.put(doc)
    expect(res.ok).toBe(true)
    expect(res).toHaveProperty('id')
    expect(res).toHaveProperty('rev')

    const info2 = await db.info()
    expect(info2.doc_count).toBe(1)
    expect(info2.update_seq).not.toBe(updateSeq)

    const fetchedDoc = await db.get(doc._id)
    expect(fetchedDoc._id).toBe(res.id)
    expect(fetchedDoc._rev).toBe(res.rev)

    const docWithRevs = await db.get(doc._id, { revs_info: true })
    expect(docWithRevs._revs_info![0].status).toBe('available')
  })

  it('update with invalid rev', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const info = await db.post({ test: 'somestuff' })
    await expect(
      db.put({
        _id: info.id,
        _rev: 'undefined',
        another: 'test'
      })
    ).rejects.toThrow(/bad_request/)
  })

  it('Doc validation', async () => {
    const bad_docs = [
      { _zing: 4 },
      { _zoom: 'hello' },
      { zane: 'goldfish', _fan: 'something smells delicious' },
      { _bing: { 'wha?': 'soda can' } }
    ]
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    await expect(db.bulkDocs(bad_docs)).rejects.toThrow(/Bad special document member/)
  })

  it('Replication fields', async () => {
    const doc = {
      _replication_id: 'test',
      _replication_state: 'triggered',
      _replication_state_time: 1,
      _replication_stats: {}
    }
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const resp = await db.post(doc)
    const doc2 = (await db.get(resp.id)) as any
    expect(doc2._replication_id).toBe('test')
    expect(doc2._replication_state).toBe('triggered')
    expect(doc2._replication_state_time).toBe(1)
    expect(doc2._replication_stats).toEqual({})
  })

  it('Allows _access field in documents', async () => {
    const doc = {
      _access: ['alice']
    }
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const resp = await db.post(doc)
    const doc2 = (await db.get(resp.id)) as any
    expect(doc2._access).toEqual(['alice'])
  })

  it('Testing valid id', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    await expect(
      db.post({
        _id: 123 as any,
        test: 'somestuff'
      })
    ).rejects.toThrow()
  })

  it('Put doc without _id should fail', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    await expect(db.put({ test: 'somestuff' } as any)).rejects.toThrow(
      /_id is required for puts/
    )
  })

  it('Put doc with bad reserved id should fail', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    await expect(
      db.put({
        _id: '_i_test',
        test: 'somestuff'
      })
    ).rejects.toThrow()
  })

  it('update_seq persists', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    await db.post({ test: 'somestuff' })
    await db.close()

    const db2 = new PouchDB(dbName, { adapter: 'sqlite3' })
    const info = await db2.info()
    expect(info.update_seq).not.toBe(0)
    expect(info.doc_count).toBe(1)
  })

  it('deletions persists', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const doc = { _id: 'staticId', contents: 'stuff' }

    async function writeAndDelete() {
      const info = await db.put(doc)
      await db.remove({ _id: info.id, _rev: info.rev })
    }

    await writeAndDelete()
    await writeAndDelete()
    await db.put(doc)
    const details = await db.get(doc._id, { conflicts: true })
    expect(details).not.toHaveProperty('_conflicts')
  })

  it('should not store raw Dates', async () => {
    const date = new Date()
    const date2 = new Date()
    const date3 = new Date()
    const origDocs = [
      { _id: '1', mydate: date },
      { _id: '2', array: [date2] },
      { _id: '3', deep: { deeper: { deeperstill: date3 } } }
    ]
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    await db.bulkDocs(origDocs)
    const res = await db.allDocs({ include_docs: true })
    const docs = res.rows.map((row: any) => {
      delete row.doc._rev
      return row.doc
    })
    expect(docs).toEqual([
      { _id: '1', mydate: date.toJSON() },
      { _id: '2', array: [date2.toJSON()] },
      { _id: '3', deep: { deeper: { deeperstill: date3.toJSON() } } }
    ])
    expect(origDocs[0].mydate).toBeInstanceOf(Date)
    expect((origDocs[1] as any).array[0]).toBeInstanceOf(Date)
    expect((origDocs[2] as any).deep.deeper.deeperstill).toBeInstanceOf(Date)
  })

  it('Create a db with a reserved name', async () => {
    const db = new PouchDB('__proto__', { adapter: 'sqlite3' })
    await db.info()
    await db.destroy()
  })

  describe('Should error when document is not an object', () => {
    const badDocs = [
      undefined,
      null,
      [],
      [{ _id: 'foo' }, { _id: 'bar' }],
      'this is not an object',
      String('this is not an object')
    ]

    badDocs.forEach((badDoc, idx) => {
      it(`should error for .post() #${idx}`, async () => {
        const db = new PouchDB(dbName, { adapter: 'sqlite3' })
        await expect(db.post(badDoc as any)).rejects.toThrow(
          /Document must be a JSON object/
        )
      })

      it(`should error for .put() #${idx}`, async () => {
        const db = new PouchDB(dbName, { adapter: 'sqlite3' })
        await expect(db.put(badDoc as any)).rejects.toThrow(
          /Document must be a JSON object/
        )
      })

      it(`should error for .bulkDocs() #${idx}`, async () => {
        const db = new PouchDB(dbName, { adapter: 'sqlite3' })
        await expect(db.bulkDocs([badDoc as any])).rejects.toThrow(
          /Document must be a JSON object/
        )
      })
    })
  })

  it('Test instance update_seq updates correctly', async () => {
    const db1 = new PouchDB(dbName, { adapter: 'sqlite3' })
    const db2 = new PouchDB(dbName, { adapter: 'sqlite3' })
    await db1.post({ a: 'doc' })
    const db1Info = await db1.info()
    const db2Info = await db2.info()
    expect(db1Info.update_seq).not.toBe(0)
    expect(db2Info.update_seq).not.toBe(0)
  })

  it('Fail to fetch a doc after db was deleted', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const db2 = new PouchDB(dbName, { adapter: 'sqlite3' })
    const doc = { _id: 'foodoc' }
    const doc2 = { _id: 'foodoc2' }
    await db.put(doc)
    await db2.put(doc2)
    const docs = await db.allDocs()
    expect(docs.total_rows).toBe(2)
    await db.destroy()
    const db3 = new PouchDB(dbName, { adapter: 'sqlite3' })
    await expect(db3.get(doc._id)).rejects.toThrow(/not_found/)
  })

  it('Cant add docs with empty ids', async () => {
    const docs = [
      {},
      { _id: null },
      { _id: undefined },
      { _id: '' },
      { _id: {} },
      { _id: '_underscored_id' }
    ]
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    for (const doc of docs) {
      await expect(db.put(doc as any)).rejects.toThrow()
    }
  })

  it('Test doc with percent in ID', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const doc = {
      foo: 'bar',
      _id: 'foo%bar'
    }
    const res = await db.put(doc)
    expect(res.id).toBe('foo%bar')
    expect(doc.foo).toBe('bar')
    const fetchedDoc = await db.get('foo%bar')
    expect(fetchedDoc._id).toBe('foo%bar')
    const allDocsRes = await db.allDocs({ include_docs: true })
    const x = allDocsRes.rows[0]
    expect(x.id).toBe('foo%bar')
    expect(x.doc!._id).toBe('foo%bar')
    expect(x.key).toBe('foo%bar')
    expect(x.doc!._rev).toBeDefined()
  })

  it('db.info should give auto_compaction = false', async () => {
    const db = new PouchDB(dbName, {
      adapter: 'sqlite3',
      auto_compaction: false
    })
    const info = (await db.info()) as any
    expect(info.auto_compaction).toBe(false)
  })

  it('db.info should give auto_compaction = true', async () => {
    const db = new PouchDB(dbName, {
      adapter: 'sqlite3',
      auto_compaction: true
    })
    const info = (await db.info()) as any
    expect(info.auto_compaction).toBe(true)
  })

  it('db.info should give adapter name', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const info = (await db.info()) as any
    expect(info.adapter).toBe('sqlite3')
  })

  it('db.info should give correct doc_count', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    let info = await db.info()
    expect(info.doc_count).toBe(0)
    await db.bulkDocs([{ _id: '1' }, { _id: '2' }, { _id: '3' }])
    info = await db.info()
    expect(info.doc_count).toBe(3)
    const doc = await db.get('1')
    await db.remove(doc)
    info = await db.info()
    expect(info.doc_count).toBe(2)
  })

  it('putting returns {ok: true}', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const info1 = await db.put({ _id: '_local/foo' })
    expect(info1.ok).toBe(true)
    const info2 = await db.put({ _id: 'quux' })
    expect(info2.ok).toBe(true)
    const info3 = await db.bulkDocs([{ _id: '_local/bar' }, { _id: 'baz' }])
    expect(info3).toHaveLength(2)
    expect((info3[0] as any).ok).toBe(true)
    expect((info3[1] as any).ok).toBe(true)
    const info4 = await db.post({})
    expect(info4.ok).toBe(true)
  })

  it('issue 2779, deleted docs, old revs COUCHDB-292', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const resp = await db.put({ _id: 'foo' })
    const rev = resp.rev
    await db.remove('foo', rev)
    await expect(db.get('foo')).rejects.toThrow()
    await expect(db.put({ _id: 'foo', _rev: rev })).rejects.toThrow()
  })

  it('issue 2888, successive deletes and writes', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })

    async function checkNumRevisions(num: number) {
      const fullDocs = (await db.get('foo', {
        open_revs: 'all',
        revs: true
      })) as any[]
      expect(fullDocs[0].ok._revisions.ids).toHaveLength(num)
    }

    const resp = await db.put({ _id: 'foo' })
    let rev = resp.rev
    await checkNumRevisions(1)
    await db.remove('foo', rev)
    await checkNumRevisions(2)
    const res = await db.put({ _id: 'foo' })
    rev = res.rev
    await checkNumRevisions(3)
    await db.remove('foo', rev)
    await checkNumRevisions(4)
  })

  it('Docs save "null" value', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    await db.put({ _id: 'doc', foo: null })
    const doc = (await db.get('doc')) as any
    expect(typeof doc.foo).toBe('object')
    expect(doc.foo).toBeNull()
    expect(Object.keys(doc).sort()).toEqual(['_id', '_rev', 'foo'])
  })

  it('3968, keeps all object fields', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const doc: any = {
      _id: 'x',
      type: 'testdoc',
      watch: 1,
      unwatch: 1,
      constructor: 1,
      toString: 1,
      toSource: 1,
      toLocaleString: 1,
      propertyIsEnumerable: 1,
      isPrototypeOf: 1,
      hasOwnProperty: 1
    }
    await db.put(doc)
    const savedDoc = (await db.get(doc._id)) as any
    expect(doc._rev).toBeUndefined()
    expect(doc._rev_tree).toBeUndefined()
    delete savedDoc._rev
    expect(savedDoc).toEqual(doc)
  })

  it('4712 invalid rev for new doc generates conflict', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const newdoc = {
      _id: 'foobar',
      _rev: '1-123'
    }
    await expect(db.put(newdoc)).rejects.toThrow(/conflict/)
  })

  it('test info() after db close', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    await db.close()
    await expect(db.info()).rejects.toThrow(/database is closed/)
  })

  it('test get() after db close', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    await db.close()
    await expect(db.get('foo')).rejects.toThrow(/database is closed/)
  })

  it('test close() after db close', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    await db.close()
    await expect(db.close()).rejects.toThrow(/database is closed/)
  })

  it('should allow unicode doc ids', async () => {
    const db = new PouchDB(dbName, { adapter: 'sqlite3' })
    const ids = [
      // "PouchDB is awesome" in Japanese, contains 1-3 byte chars
      '\u30d1\u30a6\u30c1\u30e5DB\u306f\u6700\u9ad8\u3060',
      '\u03B2', // 2-byte utf-8 char: 3b2
      '\uD843\uDF2D', // exotic 4-byte utf-8 char: 20f2d
      '\u0000foo\u0000bar\u0001baz\u0002quux', // like mapreduce
      '\u0000',
      '\u30d1'
    ]
    for (const id of ids) {
      const doc: any = { _id: id, foo: 'bar' }
      const info = await db.put(doc)
      doc._rev = info.rev
      await db.put(doc)
      const resp = await db.get(id)
      expect(resp._id).toBe(id)
    }
  })

  describe('illegal rev values', () => {
    const generateRevs = [
      () => '-format',
      () => 'bad-format',
      () => '1-ok-bad',
      () => ({}),
      () => ({ toString: '2-abc' }),
      () => ({ toString: '2-abc', indexOf: 777 }),
      () => ({ toString: '2-abc', indexOf: () => -1000 }),
      () => ({ toString: '2-abc', indexOf: () => -1000, substring: 'hi' }),
      () => ({
        toString: '2-abc',
        indexOf: () => -1000,
        substring: () => 'hi'
      }),
      () => ({ toString: () => '2-abc' }),
      () => ({ toString: () => '2-abc', indexOf: 777 }),
      () => ({ toString: () => '2-abc', indexOf: () => 12 }),
      () => ({ toString: () => '2-abc', indexOf: () => 12, substring: 'hi' }),
      () => ({
        toString: () => '2-abc',
        indexOf: () => 12,
        substring: () => 'hi'
      }),
      ({ rev }: any) => ({ toString: rev }),
      ({ rev }: any) => ({ toString: rev, indexOf: 777 }),
      ({ rev }: any) => ({ toString: rev, indexOf: () => -1000 }),
      ({ rev }: any) => ({
        toString: rev,
        indexOf: () => -1000,
        substring: 'hi'
      }),
      ({ rev }: any) => ({
        toString: rev,
        indexOf: () => -1000,
        substring: () => 'hi'
      }),
      ({ rev }: any) => ({ toString: () => rev }),
      ({ rev }: any) => ({ toString: () => rev, indexOf: 777 }),
      ({ rev }: any) => ({ toString: () => rev, indexOf: () => 12 }),
      ({ rev }: any) => ({
        toString: () => rev,
        indexOf: () => 12,
        substring: 'hi'
      }),
      ({ rev }: any) => ({
        toString: () => rev,
        indexOf: () => 12,
        substring: () => 'hi'
      })
    ]

    generateRevs.forEach((generateRev, idx) => {
      it(`post doc with illegal rev value #${idx}`, async () => {
        const db = new PouchDB(dbName, { adapter: 'sqlite3' })
        await expect(
          db.post({
            _rev: generateRev({ rev: '1-valid' }) as any,
            another: 'test'
          })
        ).rejects.toThrow(/Invalid rev format/)
      })

      it(`Modify a doc with illegal rev value #${idx}`, async () => {
        const db = new PouchDB(dbName, { adapter: 'sqlite3' })
        const info = await db.post({ test: 'somestuff' })
        await expect(
          db.put({
            _id: info.id,
            _rev: generateRev(info) as any,
            another: 'test'
          })
        ).rejects.toThrow(/Invalid rev format/)
      })

      it(`bulkDocs with illegal rev value #${idx} (existing doc)`, async () => {
        const db = new PouchDB(dbName, { adapter: 'sqlite3' })
        const info = await db.post({ test: 'somestuff' })
        await expect(
          db.bulkDocs([
            {
              _id: info.id,
              _rev: generateRev(info) as any,
              another: 'test'
            }
          ])
        ).rejects.toThrow(/Invalid rev format/)
      })

      it(`bulkDocs with illegal rev value #${idx} (new doc)`, async () => {
        const db = new PouchDB(dbName, { adapter: 'sqlite3' })
        await expect(
          db.bulkDocs([
            {
              _id: '1',
              _rev: generateRev({ rev: '1_valid' }) as any,
              another: 'test'
            }
          ])
        ).rejects.toThrow(/Invalid rev format/)
      })
    })
  })
})
