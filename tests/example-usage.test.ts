import testUtils from './test-utils'

describe('Example Test Suite using Test Utils', () => {
  let db: PouchDB.Database

  beforeEach(() => {
    // Create a test database
    db = testUtils.db.createTestDB()
  })

  afterEach(async () => {
    // Clean up the database
    await testUtils.db.destroyDB(db)
  })

  describe('Document Operations', () => {
    test('should create and retrieve documents using test utils', async () => {
      // Create a test document
      const doc = testUtils.doc.createDoc('test-1', { name: 'Test Document' })
      await db.put(doc)

      // Assert document exists
      await testUtils.assert.shouldExist(db, 'test-1')

      // Assert document count
      await testUtils.assert.shouldHaveDocCount(db, 1)
    })

    test('should handle bulk operations', async () => {
      // Create multiple documents
      const docs = testUtils.doc.createDocs(10)
      await db.bulkDocs(docs)

      // Assert using allDocs helper
      await testUtils.assert.shouldHaveAllDocs(db, 10)
    })

    test('should handle attachments', async () => {
      // Create document with attachment
      const doc = testUtils.doc.createDocWithAttachment(
        'doc-with-file',
        'test.txt',
        'Hello, World!',
        'text/plain'
      )
      await db.put(doc)

      // Assert attachment exists and matches
      await testUtils.assert.shouldHaveAttachment(
        db,
        'doc-with-file',
        'test.txt',
        'Hello, World!'
      )
    })

    test('should handle multiple attachments', async () => {
      // Create document with multiple attachments
      const doc = testUtils.doc.createDocWithAttachments('multi-attach', [
        { name: 'file1.txt', data: 'Content 1', contentType: 'text/plain' },
        {
          name: 'file2.json',
          data: JSON.stringify({ key: 'value' }),
          contentType: 'application/json'
        },
        {
          name: 'binary.dat',
          data: testUtils.data.randomBinary(100),
          contentType: 'application/octet-stream'
        }
      ])

      await db.put(doc)

      const retrieved = await db.get('multi-attach', { attachments: true })
      expect(Object.keys(retrieved._attachments)).toHaveLength(3)
    })
  })

  describe('Error Handling', () => {
    test('should handle missing document errors', async () => {
      await testUtils.assert.shouldNotExist(db, 'non-existent')

      // Using error utilities
      await testUtils.error.shouldRejectWith(
        db.get('non-existent'),
        testUtils.error.isMissingError
      )
    })

    test('should handle conflict errors', async () => {
      const doc = testUtils.doc.createDoc('conflict-test')
      await db.put(doc)

      // Try to put same document again without _rev
      await testUtils.error.shouldRejectWith(
        db.put(doc),
        testUtils.error.isConflictError
      )
    })
  })

  describe('Performance Testing', () => {
    test('should measure operation performance', async () => {
      // Measure single operation
      const { result, duration } = await testUtils.perf.measureTime(
        async () => {
          const docs = testUtils.doc.createDocs(100)
          return await db.bulkDocs(docs)
        }
      )

      expect(result).toHaveLength(100)
      expect(duration).toBeGreaterThan(0)
      console.log(`Bulk insert took ${duration}ms`)
    })

    test('should run benchmarks', async () => {
      // Prepare test data
      const docs = testUtils.doc.createDocs(10)
      await db.bulkDocs(docs)

      // Benchmark read operations
      const benchmark = await testUtils.perf.benchmark(
        'Random document read',
        async () => {
          const randomId = `doc-${Math.floor(Math.random() * 10)
            .toString()
            .padStart(10, '0')}`
          await db.get(randomId)
        },
        50
      )

      console.log(
        `Benchmark results: avg=${benchmark.avg}ms, min=${benchmark.min}ms, max=${benchmark.max}ms`
      )
    })
  })

  describe('SQLite Specific Features', () => {
    test('should get SQLite info', async () => {
      await db.put(testUtils.doc.createDoc())

      const info = await testUtils.sqlite.getSQLiteInfo(db)
      expect(info.encoding).toBeDefined()
      expect(info.version).toBeDefined()
    })

    test('should check database file size', async () => {
      const largeDoc = testUtils.data.largeDoc('large-1', 100) // 100KB document
      await db.put(largeDoc)

      const fileSize = testUtils.sqlite.getDBFileSize(db.name)
      expect(fileSize).toBeGreaterThan(0)
    })
  })

  describe('Advanced Testing Scenarios', () => {
    test('should handle nested documents', async () => {
      const nestedDoc = testUtils.data.nestedDoc('nested-1', 5)
      await db.put(nestedDoc)

      const retrieved = await db.get('nested-1')
      expect(retrieved.structure.level).toBe(5)
      expect(
        retrieved.structure.nested.nested.nested.nested.nested.value
      ).toBeDefined()
    })

    test('should retry failed operations', async () => {
      let attempts = 0
      const flakeyOperation = async () => {
        attempts++
        if (attempts < 3) {
          throw new Error('Temporary failure')
        }
        return { success: true }
      }

      const result = await testUtils.async.retry(flakeyOperation, 5, 10)
      expect(result.success).toBe(true)
      expect(attempts).toBe(3)
    })

    test('should run operations with concurrency limit', async () => {
      const tasks = Array.from({ length: 20 }, (_, i) => async () => {
        const doc = testUtils.doc.createDoc(`concurrent-${i}`)
        return await db.put(doc)
      })

      const results = await testUtils.async.parallelLimit(tasks, 5)
      expect(results).toHaveLength(20)

      await testUtils.assert.shouldHaveDocCount(db, 20)
    })
  })
})
