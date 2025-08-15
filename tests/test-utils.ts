import PouchDB from 'pouchdb'
import sqlitePlugin from '../src/index'
import * as fs from 'fs'
import * as path from 'path'

// Register the SQLite plugin
PouchDB.plugin(sqlitePlugin)

/**
 * Test utilities for PouchDB SQLite3 adapter
 */

// Database management utilities
export const dbUtils = {
  /**
   * Create a new test database with SQLite adapter
   */
  createTestDB: (name?: string): PouchDB.Database => {
    const dbName = name || `test-db-${Math.random().toString(36).substring(7)}`
    return new PouchDB(dbName, { adapter: 'sqlite3' })
  },

  /**
   * Create a test database with custom options
   */
  createTestDBWithOptions: (
    name: string,
    options: any = {}
  ): PouchDB.Database => {
    return new PouchDB(name, { adapter: 'sqlite3', ...options })
  },

  /**
   * Destroy a database and clean up SQLite files
   */
  destroyDB: async (db: PouchDB.Database): Promise<void> => {
    const dbName = db.name
    await db.destroy()

    // Clean up SQLite files
    const dbPath = path.resolve(process.cwd(), `${dbName}.sqlite`)
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath)
    }
  },

  /**
   * Cleanup multiple databases
   */
  cleanup: async (dbs: PouchDB.Database[]): Promise<void> => {
    await Promise.all(dbs.map(db => dbUtils.destroyDB(db)))
  },

  /**
   * Create a database with a specific path (useful for testing file locations)
   */
  createDBWithPath: (dbPath: string): PouchDB.Database => {
    return new PouchDB(dbPath, { adapter: 'sqlite3' })
  },

  /**
   * Check if a SQLite database file exists
   */
  dbFileExists: (dbName: string): boolean => {
    const dbPath = path.resolve(process.cwd(), `${dbName}.sqlite`)
    return fs.existsSync(dbPath)
  }
}

// Document generation utilities
export const docUtils = {
  /**
   * Generate a test document with an ID
   */
  createDoc: (id?: string, data?: any): any => {
    return {
      _id: id || `doc-${Math.random().toString(36).substring(7)}`,
      created: new Date().toISOString(),
      ...data
    }
  },

  /**
   * Generate multiple test documents
   */
  createDocs: (count: number, prefix = 'doc'): any[] => {
    return Array.from({ length: count }, (_, i) => ({
      _id: `${prefix}-${i.toString().padStart(10, '0')}`,
      index: i,
      created: new Date().toISOString()
    }))
  },

  /**
   * Create a document with attachments
   */
  createDocWithAttachment: (
    id: string,
    attachmentName: string,
    attachmentData: string | Buffer,
    contentType = 'text/plain'
  ): any => {
    const data = Buffer.isBuffer(attachmentData)
      ? attachmentData.toString('base64')
      : Buffer.from(attachmentData).toString('base64')

    return {
      _id: id,
      _attachments: {
        [attachmentName]: {
          content_type: contentType,
          data
        }
      }
    }
  },

  /**
   * Create a document with multiple attachments
   */
  createDocWithAttachments: (
    id: string,
    attachments: Array<{
      name: string
      data: string | Buffer
      contentType: string
    }>
  ): any => {
    const _attachments: any = {}

    attachments.forEach(att => {
      const data = Buffer.isBuffer(att.data)
        ? att.data.toString('base64')
        : Buffer.from(att.data).toString('base64')

      _attachments[att.name] = {
        content_type: att.contentType,
        data
      }
    })

    return { _id: id, _attachments }
  },

  /**
   * Create a conflicted document structure for testing
   */
  createConflictedDoc: (id: string, revisions: string[]): any => {
    return {
      _id: id,
      _rev: revisions[0],
      _conflicts: revisions.slice(1)
    }
  }
}

// Assertion helpers
export const assertUtils = {
  /**
   * Assert that a document exists in the database
   */
  shouldExist: async (db: PouchDB.Database, id: string): Promise<void> => {
    const doc = await db.get(id)
    expect(doc).toBeDefined()
    expect(doc._id).toBe(id)
  },

  /**
   * Assert that a document does not exist
   */
  shouldNotExist: async (db: PouchDB.Database, id: string): Promise<void> => {
    await expect(db.get(id)).rejects.toThrow(/missing/)
  },

  /**
   * Assert document count in database
   */
  shouldHaveDocCount: async (
    db: PouchDB.Database,
    expectedCount: number
  ): Promise<void> => {
    const info = await db.info()
    expect(info.doc_count).toBe(expectedCount)
  },

  /**
   * Assert all docs response
   */
  shouldHaveAllDocs: async (
    db: PouchDB.Database,
    expectedCount: number,
    options: PouchDB.Core.AllDocsOptions = {}
  ): Promise<void> => {
    const result = await db.allDocs(options)
    expect(result.total_rows).toBe(expectedCount)
    expect(result.rows).toHaveLength(expectedCount)
  },

  /**
   * Assert attachment exists and matches data
   */
  shouldHaveAttachment: async (
    db: PouchDB.Database,
    docId: string,
    attachmentName: string,
    expectedData?: string | Buffer
  ): Promise<void> => {
    const doc = await db.get(docId, { attachments: true })
    expect(doc._attachments).toBeDefined()
    expect(doc._attachments![attachmentName]).toBeDefined()

    if (expectedData) {
      const attachmentData = Buffer.from(
        (doc._attachments![attachmentName] as any).data,
        'base64'
      )
      const expected = Buffer.isBuffer(expectedData)
        ? expectedData
        : Buffer.from(expectedData)
      expect(attachmentData).toEqual(expected)
    }
  }
}

// Error utilities
export const errorUtils = {
  /**
   * Check if error is a 404 missing document error
   */
  isMissingError: (error: any): boolean => {
    return error.status === 404 && error.reason === 'missing'
  },

  /**
   * Check if error is a conflict error
   */
  isConflictError: (error: any): boolean => {
    return error.status === 409 && error.reason === 'Document update conflict'
  },

  /**
   * Check if error is a bad request error
   */
  isBadRequestError: (error: any): boolean => {
    return error.status === 400
  },

  /**
   * Assert that a promise rejects with specific error
   */
  shouldRejectWith: async (
    promise: Promise<any>,
    errorChecker: (error: any) => boolean
  ): Promise<void> => {
    try {
      await promise
      throw new Error('Expected promise to reject')
    } catch (error) {
      expect(errorChecker(error)).toBe(true)
    }
  }
}

// SQLite specific utilities
export const sqliteUtils = {
  /**
   * Get SQLite database file size
   */
  getDBFileSize: (dbName: string): number => {
    const dbPath = path.resolve(process.cwd(), `${dbName}.sqlite`)
    if (!fs.existsSync(dbPath)) {
      return 0
    }
    const stats = fs.statSync(dbPath)
    return stats.size
  },

  /**
   * Check if vacuum is needed (file size significantly larger than actual data)
   */
  shouldVacuum: async (
    db: PouchDB.Database,
    threshold = 0.5
  ): Promise<boolean> => {
    const info = await db.info()
    const fileSize = sqliteUtils.getDBFileSize(db.name)

    // This is a simplified check - in reality, you'd need to query SQLite directly
    // to get accurate data size vs file size
    return fileSize > 1024 * 1024 && info.doc_count < 100
  },

  /**
   * Get SQLite version info from database
   */
  getSQLiteInfo: async (db: PouchDB.Database): Promise<any> => {
    const info = await db.info()
    return {
      encoding: (info as any).sqlite_encoding || (info as any).websql_encoding,
      pageSize: (info as any).sqlite_page_size,
      pageCount: (info as any).sqlite_page_count,
      version: (info as any).sqlite_version
    }
  }
}

// Test data generators
export const testDataGenerators = {
  /**
   * Generate random string
   */
  randomString: (length: number): string => {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let result = ''
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  },

  /**
   * Generate binary data
   */
  randomBinary: (size: number): Buffer => {
    const buffer = Buffer.alloc(size)
    for (let i = 0; i < size; i++) {
      buffer[i] = Math.floor(Math.random() * 256)
    }
    return buffer
  },

  /**
   * Generate a large document for testing size limits
   */
  largeDoc: (id: string, sizeInKB: number): any => {
    const data = testDataGenerators.randomString(sizeInKB * 1024)
    return {
      _id: id,
      largeField: data
    }
  },

  /**
   * Generate nested document structure
   */
  nestedDoc: (id: string, depth: number): any => {
    const createNested = (d: number): any => {
      if (d === 0) {
        return { value: testDataGenerators.randomString(10) }
      }
      return {
        level: d,
        nested: createNested(d - 1),
        data: testDataGenerators.randomString(20)
      }
    }

    return {
      _id: id,
      structure: createNested(depth)
    }
  }
}

// Utility functions for async operations
export const asyncUtils = {
  /**
   * Wait for a condition to be true
   */
  waitFor: async (
    condition: () => Promise<boolean>,
    timeout = 5000,
    interval = 100
  ): Promise<void> => {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return
      }
      await new Promise(resolve => setTimeout(resolve, interval))
    }

    throw new Error('Timeout waiting for condition')
  },

  /**
   * Retry an operation multiple times
   */
  retry: async <T>(
    operation: () => Promise<T>,
    maxAttempts = 3,
    delay = 100
  ): Promise<T> => {
    let lastError: any

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delay * attempt))
        }
      }
    }

    throw lastError
  },

  /**
   * Execute operations in parallel with limit
   */
  parallelLimit: async <T>(
    tasks: Array<() => Promise<T>>,
    limit: number
  ): Promise<T[]> => {
    const results: T[] = []
    const executing: Promise<void>[] = []

    for (const task of tasks) {
      const promise = task().then(result => {
        results.push(result)
      })

      executing.push(promise)

      if (executing.length >= limit) {
        await Promise.race(executing)
        executing.splice(
          executing.findIndex(p => p === promise),
          1
        )
      }
    }

    await Promise.all(executing)
    return results
  }
}

// Performance testing utilities
export const perfUtils = {
  /**
   * Measure operation time
   */
  measureTime: async <T>(
    operation: () => Promise<T>
  ): Promise<{ result: T; duration: number }> => {
    const start = process.hrtime.bigint()
    const result = await operation()
    const end = process.hrtime.bigint()
    const duration = Number(end - start) / 1_000_000 // Convert to milliseconds

    return { result, duration }
  },

  /**
   * Run performance benchmark
   */
  benchmark: async (
    name: string,
    operation: () => Promise<any>,
    iterations = 100
  ): Promise<{ name: string; avg: number; min: number; max: number }> => {
    const times: number[] = []

    for (let i = 0; i < iterations; i++) {
      const { duration } = await perfUtils.measureTime(operation)
      times.push(duration)
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length
    const min = Math.min(...times)
    const max = Math.max(...times)

    return { name, avg, min, max }
  }
}

// Export all utilities as a single object for convenience
export const testUtils = {
  db: dbUtils,
  doc: docUtils,
  assert: assertUtils,
  error: errorUtils,
  sqlite: sqliteUtils,
  data: testDataGenerators,
  async: asyncUtils,
  perf: perfUtils
}

// Default export for easy importing
export default testUtils
