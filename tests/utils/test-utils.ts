import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Store database names to clean up after tests
const testDatabases: string[] = []

/**
 * Generate a unique database name for testing
 */
export function getDatabaseName(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const dbName = path.join(os.tmpdir(), `test-db-${timestamp}-${random}.db`)
  testDatabases.push(dbName)
  return dbName
}

/**
 * Clean up all test databases
 */
export async function cleanupTestDatabases(): Promise<void> {
  for (const dbName of testDatabases) {
    try {
      // Remove the main database file
      if (fs.existsSync(dbName)) {
        fs.unlinkSync(dbName)
      }
      // Remove SQLite auxiliary files
      if (fs.existsSync(`${dbName}-wal`)) {
        fs.unlinkSync(`${dbName}-wal`)
      }
      if (fs.existsSync(`${dbName}-shm`)) {
        fs.unlinkSync(`${dbName}-shm`)
      }
    } catch (err) {
      // Ignore errors during cleanup
    }
  }
  // Clear the array
  testDatabases.length = 0
}

/**
 * Clean up a specific database
 */
export async function cleanupDatabase(dbName: string): Promise<void> {
  try {
    // Remove the main database file
    if (fs.existsSync(dbName)) {
      fs.unlinkSync(dbName)
    }
    // Remove SQLite auxiliary files
    if (fs.existsSync(`${dbName}-wal`)) {
      fs.unlinkSync(`${dbName}-wal`)
    }
    if (fs.existsSync(`${dbName}-shm`)) {
      fs.unlinkSync(`${dbName}-shm`)
    }
  } catch (err) {
    // Ignore errors during cleanup
  }
}

/**
 * Error constants similar to the ones in PouchDB tests
 */
export const errors = {
  MISSING_ID: {
    message: 'Document is missing an ID or has an invalid ID'
  },
  DOC_VALIDATION: {
    message: 'Document validation error'
  },
  RESERVED_ID: {
    status: 400,
    message: 'Reserved document ID'
  }
}
