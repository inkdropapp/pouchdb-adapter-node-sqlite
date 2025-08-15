import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import PouchDB from 'pouchdb'
import { testUtils } from './test-utils'

describe('Get operations', () => {
  let db: PouchDB.Database
  const dbName = 'test-get-db'

  beforeEach(async () => {
    db = testUtils.db.createTestDB(dbName)
  })

  afterEach(async () => {
    await testUtils.db.destroyDB(db)
  })

  const origDocs = [
    { _id: '0', a: 1, b: 1 },
    { _id: '3', a: 4, b: 16 },
    { _id: '1', a: 2, b: 4 },
    { _id: '2', a: 3, b: 9 }
  ]

  // Basic get operations
  it('should get a document', async () => {
    const response = await db.post({ test: 'somestuff' })
    const doc: any = await db.get(response.id)

    expect(doc).toHaveProperty('test')
    expect(doc.test).toBe('somestuff')

    // Test getting non-existent document
    await expect(db.get(response.id + 'asdf')).rejects.toMatchObject({
      status: 404,
      name: 'not_found',
      message: 'missing',
      reason: 'missing'
    })
  })

  it('should get a design document', async () => {
    const designDoc = {
      _id: '_design/someid',
      test: 'somestuff'
    }
    const response = await db.put(designDoc)
    const doc: any = await db.get(response.id)

    expect(doc).toHaveProperty('test')
    expect(doc.test).toBe('somestuff')

    // Test getting non-existent design document
    await expect(db.get(response.id + 'asdf')).rejects.toMatchObject({
      status: 404,
      name: 'not_found',
      message: 'missing'
    })
  })

  it('should check error of deleted document', async () => {
    const response = await db.post({ test: 'somestuff' })
    await db.remove(response.id, response.rev)

    await expect(db.get(response.id)).rejects.toMatchObject({
      status: 404,
      name: 'not_found'
    })
  })

  it('should get revisions of removed doc', async () => {
    // Create DB with auto_compaction disabled
    const tempDb = testUtils.db.createTestDBWithOptions('temp-get-revs', {
      auto_compaction: false
    })

    try {
      const response = await tempDb.post({ test: 'somestuff' })
      const rev = response.rev

      await tempDb.remove({
        _id: response.id,
        _rev: response.rev
      } as any)

      // Should still be able to get the old revision
      const doc: any = await tempDb.get(response.id, { rev })
      expect(doc).toBeDefined()
      expect(doc.test).toBe('somestuff')
    } finally {
      await testUtils.db.destroyDB(tempDb)
    }
  })

  it('should test basic revision handling', async () => {
    const response1 = await db.post({ test: 'somestuff' })

    const response2 = await db.put({
      _id: response1.id,
      _rev: response1.rev,
      another: 'test1'
    })

    const response3 = await db.put({
      _id: response1.id,
      _rev: response2.rev,
      last: 'test2'
    })

    // Get latest version
    const doc: any = await db.get(response1.id)
    expect(doc._rev).toBe(response3.rev)
    expect(doc.last).toBe('test2')
  })

  it('should handle parallelized gets with 409s/404s', async () => {
    const numSimultaneous = 20
    const numDups = 3
    const tasks: string[] = []

    for (let i = 0; i < numSimultaneous; i++) {
      const key = Math.random().toString()
      for (let j = 0; j < numDups; j++) {
        tasks.push(key)
      }
    }

    async function getDocWithDefault(
      db: PouchDB.Database,
      id: string,
      defaultDoc: any
    ) {
      try {
        return await db.get(id)
      } catch (err: any) {
        if (err.status !== 404) {
          throw err
        }
        defaultDoc._id = id
        try {
          await db.put(defaultDoc)
        } catch (err: any) {
          if (err.status !== 409) {
            // conflict
            throw err
          }
        }
        return await db.get(id)
      }
    }

    const results = await Promise.all(
      tasks.map(task => getDocWithDefault(db, task, { foo: 'bar' }))
    )

    expect(results).toHaveLength(tasks.length)
    results.forEach((result: any) => {
      expect(result.foo).toBe('bar')
    })
  })

  it('should retrieve old revision', async () => {
    const tempDb = testUtils.db.createTestDBWithOptions('temp-old-rev', {
      auto_compaction: false
    })

    try {
      const response1 = await tempDb.post({ version: 'first' })
      const response2 = await tempDb.put({
        _id: response1.id,
        _rev: response1.rev,
        version: 'second'
      })

      // Get old revision
      const oldRev: any = await tempDb.get(response1.id, { rev: response1.rev })
      expect(oldRev.version).toBe('first')

      // Try to get non-existent revision
      await expect(
        tempDb.get(response1.id, { rev: '1-nonexistentRev' })
      ).rejects.toBeDefined()
    } finally {
      await testUtils.db.destroyDB(tempDb)
    }
  })

  it('should test get with attachments', async () => {
    const docId = 'doc-with-attachment'
    const attachmentName = 'test.txt'
    const attachmentData = 'Hello, World!'

    const doc = testUtils.doc.createDocWithAttachment(
      docId,
      attachmentName,
      attachmentData,
      'text/plain'
    )

    await db.put(doc)

    // Get without attachments
    const docWithoutAttachments = await db.get(docId)
    expect(docWithoutAttachments._attachments).toBeDefined()
    expect(
      (docWithoutAttachments._attachments![attachmentName] as any).stub
    ).toBe(true)

    // Get with attachments
    const docWithAttachments = await db.get(docId, { attachments: true })
    expect(docWithAttachments._attachments).toBeDefined()
    expect(
      (docWithAttachments._attachments![attachmentName] as any).data
    ).toBeDefined()

    const decodedData = Buffer.from(
      (docWithAttachments._attachments![attachmentName] as any).data,
      'base64'
    ).toString()
    expect(decodedData).toBe(attachmentData)
  })

  it('should test get local documents', async () => {
    const localDoc = {
      _id: '_local/test',
      data: 'local data'
    }

    await db.put(localDoc)

    const retrieved: any = await db.get('_local/test')
    expect(retrieved.data).toBe('local data')

    // Test non-existent local doc
    await expect(db.get('_local/nonexistent')).rejects.toMatchObject({
      status: 404,
      name: 'not_found'
    })
  })

  it('should get document with conflicts option', async () => {
    // Create a simple document
    const response = await db.post({ value: 'original' })

    // Get with conflicts option (should not have conflicts for simple case)
    const doc: any = await db.get(response.id, { conflicts: true })
    expect(doc.value).toBe('original')
    expect(doc._conflicts).toBeUndefined() // No conflicts for a simple document
  })

  it('should handle batch get operations', async () => {
    // Create multiple documents
    await writeDocs(db, origDocs)

    // Get all documents individually
    const results = await Promise.all(origDocs.map(doc => db.get(doc._id)))

    expect(results).toHaveLength(origDocs.length)
    results.forEach((result: any, index) => {
      const origDoc = origDocs.find(d => d._id === result._id)
      expect(result.a).toBe(origDoc!.a)
      expect(result.b).toBe(origDoc!.b)
    })
  })

  it('should handle get with invalid id', async () => {
    // Test various invalid IDs
    const invalidIds = ['', null, undefined, 123, {}, []]

    for (const invalidId of invalidIds) {
      await expect(db.get(invalidId as any)).rejects.toBeDefined()
    }
  })

  it('should get document with revs option', async () => {
    const response1 = await db.post({ test: 'first' })

    const response2 = await db.put({
      _id: response1.id,
      _rev: response1.rev,
      test: 'second'
    })

    // Get with revs option
    const doc: any = await db.get(response1.id, { revs: true })
    expect(doc._revisions).toBeDefined()
    expect(doc._revisions.start).toBeGreaterThanOrEqual(1)
    expect(doc._revisions.ids).toBeInstanceOf(Array)
    expect(doc._revisions.ids.length).toBeGreaterThanOrEqual(1)
  })

  it('should get document with revs_info option', async () => {
    const response1 = await db.post({ test: 'first' })

    await db.put({
      _id: response1.id,
      _rev: response1.rev,
      test: 'second'
    })

    // Get with revs_info option
    const doc: any = await db.get(response1.id, { revs_info: true })
    expect(doc._revs_info).toBeDefined()
    expect(doc._revs_info).toBeInstanceOf(Array)
    expect(doc._revs_info.length).toBeGreaterThanOrEqual(1)

    // Check structure of revs_info
    doc._revs_info.forEach((info: any) => {
      expect(info).toHaveProperty('rev')
      expect(info).toHaveProperty('status')
    })
  })

  it('should handle multiple attachments', async () => {
    const docId = 'doc-with-multiple-attachments'
    const attachments = [
      { name: 'file1.txt', data: 'Content 1', contentType: 'text/plain' },
      { name: 'file2.txt', data: 'Content 2', contentType: 'text/plain' },
      {
        name: 'file3.json',
        data: '{"test": true}',
        contentType: 'application/json'
      }
    ]

    const doc = testUtils.doc.createDocWithAttachments(docId, attachments)
    await db.put(doc)

    // Get with attachments
    const retrieved = await db.get(docId, { attachments: true })
    expect(retrieved._attachments).toBeDefined()

    attachments.forEach(att => {
      expect(retrieved._attachments![att.name]).toBeDefined()
      const decodedData = Buffer.from(
        (retrieved._attachments![att.name] as any).data,
        'base64'
      ).toString()
      expect(decodedData).toBe(att.data)
    })
  })
})

// Helper function to write docs sequentially
async function writeDocs(db: PouchDB.Database, docs: any[]): Promise<void> {
  for (const doc of docs) {
    await db.put(doc)
  }
}
