# Test Utilities for PouchDB SQLite3 Adapter

This directory contains comprehensive test utilities designed specifically for testing the PouchDB SQLite3 adapter with Jest and TypeScript.

## Overview

The `test-utils.ts` file provides a collection of utilities organized into several categories:

### 1. Database Utilities (`testUtils.db`)

- `createTestDB()` - Create a test database with auto-generated name
- `createTestDBWithOptions()` - Create database with custom options
- `destroyDB()` - Properly destroy database and clean up SQLite files
- `cleanup()` - Clean up multiple databases at once
- `dbFileExists()` - Check if SQLite file exists

### 2. Document Utilities (`testUtils.doc`)

- `createDoc()` - Generate test documents with optional data
- `createDocs()` - Generate multiple test documents
- `createDocWithAttachment()` - Create documents with single attachment
- `createDocWithAttachments()` - Create documents with multiple attachments
- `createConflictedDoc()` - Create documents with conflicts for testing

### 3. Assertion Helpers (`testUtils.assert`)

- `shouldExist()` - Assert document exists in database
- `shouldNotExist()` - Assert document doesn't exist
- `shouldHaveDocCount()` - Assert specific document count
- `shouldHaveAllDocs()` - Assert allDocs response
- `shouldHaveAttachment()` - Assert attachment exists and matches data

### 4. Error Utilities (`testUtils.error`)

- `isMissingError()` - Check for 404 errors
- `isConflictError()` - Check for 409 conflicts
- `shouldRejectWith()` - Assert promise rejection with specific error

### 5. SQLite Specific Utilities (`testUtils.sqlite`)

- `getDBFileSize()` - Get SQLite file size
- `shouldVacuum()` - Check if database needs vacuum
- `getSQLiteInfo()` - Get SQLite-specific information

### 6. Test Data Generators (`testUtils.data`)

- `randomString()` - Generate random strings
- `randomBinary()` - Generate random binary data
- `largeDoc()` - Generate large documents for size testing
- `nestedDoc()` - Generate deeply nested documents

### 7. Async Utilities (`testUtils.async`)

- `waitFor()` - Wait for condition with timeout
- `retry()` - Retry operations with backoff
- `parallelLimit()` - Execute operations with concurrency limit

### 8. Performance Utilities (`testUtils.perf`)

- `measureTime()` - Measure operation duration
- `benchmark()` - Run performance benchmarks

## Usage Examples

### Basic Document Testing

```typescript
import testUtils from './test-utils'

describe('My Test Suite', () => {
  let db: PouchDB.Database

  beforeEach(() => {
    db = testUtils.db.createTestDB()
  })

  afterEach(async () => {
    await testUtils.db.destroyDB(db)
  })

  test('should create and verify document', async () => {
    const doc = testUtils.doc.createDoc('test-1', { name: 'Test' })
    await db.put(doc)

    await testUtils.assert.shouldExist(db, 'test-1')
    await testUtils.assert.shouldHaveDocCount(db, 1)
  })
})
```

### Attachment Testing

```typescript
test('should handle attachments', async () => {
  const doc = testUtils.doc.createDocWithAttachment(
    'doc-1',
    'file.txt',
    'Hello, World!',
    'text/plain'
  )
  await db.put(doc)

  await testUtils.assert.shouldHaveAttachment(
    db,
    'doc-1',
    'file.txt',
    'Hello, World!'
  )
})
```

### Error Handling

```typescript
test('should handle errors correctly', async () => {
  await testUtils.error.shouldRejectWith(
    db.get('non-existent'),
    testUtils.error.isMissingError
  )
})
```

### Performance Testing

```typescript
test('should measure performance', async () => {
  const benchmark = await testUtils.perf.benchmark(
    'Bulk insert',
    async () => {
      const docs = testUtils.doc.createDocs(100)
      await db.bulkDocs(docs)
    },
    10 // iterations
  )

  console.log(`Average time: ${benchmark.avg}ms`)
})
```

### SQLite Specific Testing

```typescript
test('should check SQLite specifics', async () => {
  const info = await testUtils.sqlite.getSQLiteInfo(db)
  expect(info.encoding).toBe('UTF-8')

  const fileSize = testUtils.sqlite.getDBFileSize(db.name)
  expect(fileSize).toBeGreaterThan(0)
})
```

## Best Practices

1. **Always clean up databases** - Use `afterEach` to destroy test databases
2. **Use descriptive test names** - The utilities generate unique IDs automatically
3. **Test error conditions** - Use error utilities to verify proper error handling
4. **Consider performance** - Use performance utilities for critical operations
5. **Test attachments thoroughly** - Binary and text attachments behave differently

## Integration with Existing Tests

These utilities are designed to work alongside the existing PouchDB test suite. They provide SQLite-specific functionality while maintaining compatibility with standard PouchDB testing patterns.
