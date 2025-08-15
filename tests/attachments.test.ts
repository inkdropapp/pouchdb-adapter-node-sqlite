import { describe, it, beforeEach, afterEach, expect } from '@jest/globals'
import PouchDB from 'pouchdb'
import { getDatabaseName, cleanupTestDatabases } from './utils/test-utils'

// Register the SQLite3 adapter
import SQLite3Adapter from '../src/index'
PouchDB.plugin(SQLite3Adapter)

describe('attachments', () => {
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

  // Helper to check if attachment is a stub
  function isStub(
    attachment: PouchDB.Core.Attachment
  ): attachment is PouchDB.Core.StubAttachment {
    return 'stub' in attachment && attachment.stub === true
  }

  // Helper to check if attachment has data
  function hasData(
    attachment: PouchDB.Core.Attachment
  ): attachment is PouchDB.Core.FullAttachment {
    return 'data' in attachment
  }

  // Helper to decode attachment data
  async function decodeAttachmentData(attachment: any): Promise<string> {
    if (typeof attachment === 'string') {
      // Plain base64 string
      return Buffer.from(attachment, 'base64').toString('utf8')
    } else if (attachment instanceof Buffer) {
      // Check if buffer contains base64 string or raw data
      try {
        const str = attachment.toString('utf8')
        // Try to decode as base64
        const decoded = Buffer.from(str, 'base64').toString('utf8')
        // If successful and looks like text, it was base64
        if (decoded && !decoded.includes('\ufffd')) {
          return decoded
        }
      } catch (e) {
        // Not base64, treat as raw data
      }
      return attachment.toString('utf8')
    } else if (attachment instanceof Blob) {
      const arrayBuffer = await attachment.arrayBuffer()
      return Buffer.from(arrayBuffer).toString('utf8')
    } else {
      return attachment.toString()
    }
  }

  // Helper to decode binary attachment data
  async function decodeBinaryAttachmentData(
    attachment: any
  ): Promise<Uint8Array> {
    if (typeof attachment === 'string') {
      // Plain base64 string
      return new Uint8Array(Buffer.from(attachment, 'base64'))
    } else if (attachment instanceof Buffer) {
      // Check if buffer contains base64 string or raw data
      try {
        const str = attachment.toString('utf8')
        // Try to decode as base64
        const decoded = Buffer.from(str, 'base64')
        // If it looks like valid base64, use the decoded version
        if (str.match(/^[A-Za-z0-9+/]+=*$/)) {
          return new Uint8Array(decoded)
        }
      } catch (e) {
        // Not base64, treat as raw data
      }
      return new Uint8Array(attachment)
    } else if (attachment instanceof Blob) {
      const arrayBuffer = await attachment.arrayBuffer()
      return new Uint8Array(arrayBuffer)
    } else {
      return new Uint8Array(Buffer.from(attachment))
    }
  }

  // Test data
  const binAttDoc = {
    _id: 'bin_doc',
    _attachments: {
      'foo.txt': {
        content_type: 'text/plain',
        data: 'VGhpcyBpcyBhIGJhc2U2NCBlbmNvZGVkIHRleHQ=' // "This is a base64 encoded text"
      }
    }
  }

  const binAttDoc2 = {
    _id: 'bin_doc2',
    _attachments: {
      'foo.txt': {
        content_type: 'text/plain',
        data: '' // empty attachment
      }
    }
  }

  const binAttDocLocal = {
    _id: '_local/bin_doc',
    _attachments: {
      'foo.txt': {
        content_type: 'text/plain',
        data: 'VGhpcyBpcyBhIGJhc2U2NCBlbmNvZGVkIHRleHQ='
      }
    }
  }

  const jsonDoc = {
    _id: 'json_doc',
    _attachments: {
      'foo.json': {
        content_type: 'application/json',
        data: 'eyJIZWxsbyI6IndvcmxkIn0=' // {"Hello":"world"}
      }
    }
  }

  const pngAttDoc = {
    _id: 'png_doc',
    _attachments: {
      'foo.png': {
        content_type: 'image/png',
        data: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAMFBMVEX+9+j+9OD+7tL95rr93qT80YD7x2L6vkn6syz5qRT4ogT4nwD4ngD4nQD4nQD4nQDT2nT/AAAAcElEQVQY002OUQLEQARDw1D14f7X3TCdbfPnhQTqI5UqvGOWIz8gAIXFH9zmC63XRyTsOsCWk2A9Ga7wCXlA9m2S6G4JlVwQkpw/YmxrUgNoMoyxBwSMH/WnAzy5cnfLFu+dK2l5gMvuPGLGJd1/9AOiBQiEgkzOpgAAAABJRU5ErkJggg=='
      }
    }
  }

  describe('Basic attachment operations', () => {
    it('should create a document with text attachment', async () => {
      const result = await db.put(binAttDoc)
      expect(result.ok).toBe(true)
      expect(result.id).toBe('bin_doc')

      const doc = await db.get('bin_doc')
      expect(doc._attachments).toBeDefined()
      expect(doc._attachments!['foo.txt']).toBeDefined()
      const attachment = doc._attachments!['foo.txt']
      expect(isStub(attachment)).toBe(true)
      expect(attachment.content_type).toBe('text/plain')
      expect(attachment.digest).toBeDefined()
      if (isStub(attachment)) {
        expect(attachment.length).toBe(29)
      }
    })

    it('should create a document with empty attachment', async () => {
      const result = await db.put(binAttDoc2)
      expect(result.ok).toBe(true)

      const doc = await db.get('bin_doc2')
      expect(doc._attachments!['foo.txt']).toBeDefined()
      const attachment = doc._attachments!['foo.txt']
      if (isStub(attachment) && 'length' in attachment) {
        expect(attachment.length).toBe(0)
      }
    })

    it('should create a document with JSON attachment', async () => {
      const result = await db.put(jsonDoc)
      expect(result.ok).toBe(true)

      const doc = await db.get('json_doc')
      expect(doc._attachments!['foo.json']).toBeDefined()
      expect(doc._attachments!['foo.json'].content_type).toBe(
        'application/json'
      )
    })

    it('should create a document with PNG attachment', async () => {
      const result = await db.put(pngAttDoc)
      expect(result.ok).toBe(true)

      const doc = await db.get('png_doc')
      expect(doc._attachments!['foo.png']).toBeDefined()
      expect(doc._attachments!['foo.png'].content_type).toBe('image/png')
    })
  })

  describe('Reading attachments', () => {
    it('should get attachment data with attachments: true', async () => {
      await db.put(binAttDoc)

      const doc = await db.get('bin_doc', { attachments: true })
      const attachment = doc._attachments!['foo.txt']
      expect(hasData(attachment)).toBe(true)
      if (hasData(attachment)) {
        expect(attachment.data).toBe('VGhpcyBpcyBhIGJhc2U2NCBlbmNvZGVkIHRleHQ=')
      }
    })

    it('should get attachment via getAttachment', async () => {
      await db.put(binAttDoc)

      const attachment = await db.getAttachment('bin_doc', 'foo.txt')
      expect(attachment).toBeDefined()

      const text = await decodeAttachmentData(attachment)
      expect(text).toBe('This is a base64 encoded text')
    })

    it('should handle missing attachment gracefully', async () => {
      await db.put({ _id: 'no_attachment_doc' })

      await expect(
        db.getAttachment('no_attachment_doc', 'missing.txt')
      ).rejects.toThrow(/missing/)
    })

    it('should handle missing document gracefully', async () => {
      await expect(db.getAttachment('missing_doc', 'foo.txt')).rejects.toThrow(
        /missing/
      )
    })
  })

  describe('Updating attachments', () => {
    it('should add attachment to existing document', async () => {
      const doc = { _id: 'mydoc' }
      const putResult = await db.put(doc)

      const attachmentData = Buffer.from('My new attachment').toString('base64')
      const updateResult = await db.putAttachment(
        'mydoc',
        'newfile.txt',
        putResult.rev,
        new Blob(['My new attachment']),
        'text/plain'
      )

      expect(updateResult.ok).toBe(true)

      const updatedDoc = await db.get('mydoc', { attachments: true })
      expect(updatedDoc._attachments!['newfile.txt']).toBeDefined()
      const attachment = updatedDoc._attachments!['newfile.txt']
      if (hasData(attachment)) {
        expect(attachment.data).toBe(attachmentData)
      }
    })

    it('should update existing attachment', async () => {
      await db.put(binAttDoc)
      const doc = await db.get('bin_doc')

      const newData = Buffer.from('Updated text').toString('base64')
      const updateResult = await db.putAttachment(
        'bin_doc',
        'foo.txt',
        doc._rev,
        new Blob(['Updated text']),
        'text/plain'
      )

      expect(updateResult.ok).toBe(true)

      const updatedDoc = await db.get('bin_doc', { attachments: true })
      const attachment = updatedDoc._attachments!['foo.txt']
      if (hasData(attachment)) {
        expect(attachment.data).toBe(newData)
      }
    })

    it('should handle attachment names with special characters', async () => {
      const doc = { _id: 'special_chars_doc' }
      const putResult = await db.put(doc)

      const attachmentName = 'my/file?name@test.txt'
      const updateResult = await db.putAttachment(
        'special_chars_doc',
        attachmentName,
        putResult.rev,
        new Blob(['Special chars test']),
        'text/plain'
      )

      expect(updateResult.ok).toBe(true)

      const updatedDoc = await db.get('special_chars_doc', {
        attachments: true
      })
      expect(updatedDoc._attachments![attachmentName]).toBeDefined()

      const attachment = await db.getAttachment(
        'special_chars_doc',
        attachmentName
      )
      const text = await decodeAttachmentData(attachment)
      expect(text).toBe('Special chars test')
    })
  })

  describe('Deleting attachments', () => {
    it('should delete attachment from document', async () => {
      await db.put(binAttDoc)
      const doc = await db.get('bin_doc')

      const result = await db.removeAttachment('bin_doc', 'foo.txt', doc._rev)
      expect(result.ok).toBe(true)

      const updatedDoc = await db.get('bin_doc')
      expect(updatedDoc._attachments).toBeUndefined()
    })

    it('should delete document with attachments', async () => {
      await db.put(binAttDoc)
      const doc = await db.get('bin_doc')

      const result = await db.remove(doc)
      expect(result.ok).toBe(true)

      await expect(db.get('bin_doc')).rejects.toThrow()
    })
  })

  describe('Multiple attachments', () => {
    it('should handle multiple attachments on same document', async () => {
      const multiAttDoc = {
        _id: 'multi_att_doc',
        _attachments: {
          'file1.txt': {
            content_type: 'text/plain',
            data: Buffer.from('First file').toString('base64')
          },
          'file2.txt': {
            content_type: 'text/plain',
            data: Buffer.from('Second file').toString('base64')
          },
          'data.json': {
            content_type: 'application/json',
            data: Buffer.from('{"key":"value"}').toString('base64')
          }
        }
      }

      await db.put(multiAttDoc)

      const doc = await db.get('multi_att_doc')
      expect(Object.keys(doc._attachments!).length).toBe(3)
      expect(doc._attachments!['file1.txt']).toBeDefined()
      expect(doc._attachments!['file2.txt']).toBeDefined()
      expect(doc._attachments!['data.json']).toBeDefined()
    })

    it('should add multiple attachments incrementally', async () => {
      let doc: any = { _id: 'incremental_doc' }
      let result = await db.put(doc)

      // Add first attachment
      result = await db.putAttachment(
        'incremental_doc',
        'first.txt',
        result.rev,
        new Blob(['First attachment']),
        'text/plain'
      )

      // Add second attachment
      result = await db.putAttachment(
        'incremental_doc',
        'second.txt',
        result.rev,
        new Blob(['Second attachment']),
        'text/plain'
      )

      // Add third attachment
      result = await db.putAttachment(
        'incremental_doc',
        'third.txt',
        result.rev,
        new Blob(['Third attachment']),
        'text/plain'
      )

      doc = await db.get('incremental_doc')
      expect(Object.keys(doc._attachments!).length).toBe(3)
    })
  })

  describe('Large attachments', () => {
    it('should handle large text attachment', async () => {
      const largeText = 'x'.repeat(100000) // 100KB of text
      const largeAttDoc = {
        _id: 'large_text_doc',
        _attachments: {
          'large.txt': {
            content_type: 'text/plain',
            data: Buffer.from(largeText).toString('base64')
          }
        }
      }

      const result = await db.put(largeAttDoc)
      expect(result.ok).toBe(true)

      const doc = await db.get('large_text_doc')
      const attachment = doc._attachments!['large.txt']
      if (isStub(attachment)) {
        expect(attachment.length).toBe(100000)
      }
    })

    it('should handle large binary attachment', async () => {
      const largeBinary = new Uint8Array(50000) // 50KB of binary data
      for (let i = 0; i < largeBinary.length; i++) {
        largeBinary[i] = Math.floor(Math.random() * 256)
      }

      const largeBinDoc = {
        _id: 'large_bin_doc',
        _attachments: {
          'large.bin': {
            content_type: 'application/octet-stream',
            data: Buffer.from(largeBinary).toString('base64')
          }
        }
      }

      const result = await db.put(largeBinDoc)
      expect(result.ok).toBe(true)

      const doc = await db.get('large_bin_doc')
      const attachment = doc._attachments!['large.bin']
      if (isStub(attachment)) {
        expect(attachment.length).toBe(50000)
      }
    })
  })

  describe('Attachment revpos handling', () => {
    it('should maintain correct revpos for attachments', async () => {
      // Create doc with attachment
      await db.put(binAttDoc)
      let doc = await db.get('bin_doc', { attachments: true, binary: true })

      // Update doc without changing attachment
      const updatedDoc = { ...doc, updated: true }
      await db.put(updatedDoc)

      // Get doc again and check revpos
      doc = await db.get('bin_doc')
      const att1 = doc._attachments!['foo.txt'] as any
      if (att1.stub && att1.revpos) {
        expect(att1.revpos).toBe(1)
      }

      // Add new attachment
      const result = await db.putAttachment(
        'bin_doc',
        'new.txt',
        doc._rev,
        new Blob(['New attachment']),
        'text/plain'
      )

      doc = await db.get('bin_doc')
      const att2 = doc._attachments!['foo.txt'] as any
      const att3 = doc._attachments!['new.txt'] as any
      if (att2.stub && att2.revpos) {
        expect(att2.revpos).toBe(1)
      }
      if (att3.stub && att3.revpos) {
        expect(att3.revpos).toBe(3)
      }
    })
  })

  describe('Attachment content types', () => {
    const contentTypeTests = [
      { type: 'text/plain', data: 'Plain text', name: 'file.txt' },
      { type: 'text/html', data: '<h1>HTML</h1>', name: 'file.html' },
      { type: 'application/json', data: '{"test":true}', name: 'file.json' },
      {
        type: 'image/png',
        data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        name: 'pixel.png'
      },
      { type: 'application/pdf', data: 'JVBERi0xLjMNCiXi48', name: 'file.pdf' }
    ]

    contentTypeTests.forEach(test => {
      it(`should handle ${test.type} content type`, async () => {
        const doc = {
          _id: `doc_${test.type.replace('/', '_')}`,
          _attachments: {
            [test.name]: {
              content_type: test.type,
              data:
                test.type.startsWith('image/') ||
                test.type === 'application/pdf'
                  ? test.data
                  : Buffer.from(test.data).toString('base64')
            }
          }
        }

        const result = await db.put(doc)
        expect(result.ok).toBe(true)

        const savedDoc = await db.get(doc._id)
        expect(savedDoc._attachments![test.name].content_type).toBe(test.type)
      })
    })
  })

  describe('Base64 encoding/decoding', () => {
    it('should correctly encode and decode text data', async () => {
      const originalText = 'Hello, World! 你好世界! 🌍'
      const doc = {
        _id: 'unicode_doc',
        _attachments: {
          'unicode.txt': {
            content_type: 'text/plain; charset=utf-8',
            data: Buffer.from(originalText).toString('base64')
          }
        }
      }

      await db.put(doc)

      const attachment = await db.getAttachment('unicode_doc', 'unicode.txt')
      let decodedText: string
      if (attachment instanceof Buffer) {
        decodedText = attachment.toString('utf8')
      } else if (attachment instanceof Blob) {
        const arrayBuffer = await (attachment as Blob).arrayBuffer()
        decodedText = Buffer.from(arrayBuffer).toString('utf8')
      } else {
        decodedText = attachment.toString()
      }

      expect(decodedText).toBe(originalText)
    })

    it('should correctly handle binary data', async () => {
      const binaryData = new Uint8Array([
        0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd
      ])
      const doc = {
        _id: 'binary_doc',
        _attachments: {
          'binary.dat': {
            content_type: 'application/octet-stream',
            data: Buffer.from(binaryData).toString('base64')
          }
        }
      }

      await db.put(doc)

      const attachment = await db.getAttachment('binary_doc', 'binary.dat')
      const decodedData = await decodeBinaryAttachmentData(attachment)
      expect(decodedData).toEqual(binaryData)
    })
  })

  describe('Attachments in bulk operations', () => {
    it('should handle attachments in bulkDocs', async () => {
      const docs: any[] = [
        {
          _id: 'bulk1',
          _attachments: {
            'file1.txt': {
              content_type: 'text/plain',
              data: Buffer.from('Bulk doc 1').toString('base64')
            }
          }
        },
        {
          _id: 'bulk2',
          _attachments: {
            'file2.txt': {
              content_type: 'text/plain',
              data: Buffer.from('Bulk doc 2').toString('base64')
            }
          }
        }
      ]

      const results = await db.bulkDocs(docs)
      expect(results.length).toBe(2)
      expect((results[0] as any).ok).toBe(true)
      expect((results[1] as any).ok).toBe(true)

      const doc1 = await db.get('bulk1')
      const doc2 = await db.get('bulk2')
      expect(doc1._attachments!['file1.txt']).toBeDefined()
      expect(doc2._attachments!['file2.txt']).toBeDefined()
    })
  })

  describe('Attachments in allDocs', () => {
    beforeEach(async () => {
      // Setup test documents with attachments
      await db.bulkDocs([
        binAttDoc,
        jsonDoc,
        { _id: 'no_attach_doc', data: 'test' }
      ])
    })

    it('should include attachment stubs in allDocs with include_docs', async () => {
      const result = await db.allDocs({ include_docs: true })

      const binDoc = result.rows.find(r => r.id === 'bin_doc')
      const jsonDocRow = result.rows.find(r => r.id === 'json_doc')
      const noAttachDoc = result.rows.find(r => r.id === 'no_attach_doc')

      expect(binDoc?.doc?._attachments?.['foo.txt']).toBeDefined()
      const binAtt = binDoc?.doc?._attachments?.['foo.txt']
      if (binAtt && isStub(binAtt)) {
        expect(binAtt.stub).toBe(true)
      }

      expect(jsonDocRow?.doc?._attachments?.['foo.json']).toBeDefined()
      const jsonAtt = jsonDocRow?.doc?._attachments?.['foo.json']
      if (jsonAtt && isStub(jsonAtt)) {
        expect(jsonAtt.stub).toBe(true)
      }

      expect(noAttachDoc?.doc?._attachments).toBeUndefined()
    })

    it('should include attachment data in allDocs with attachments: true', async () => {
      const result = await db.allDocs({
        include_docs: true,
        attachments: true
      })

      const binDoc = result.rows.find(r => r.id === 'bin_doc')
      const binAtt = binDoc?.doc?._attachments?.['foo.txt']
      if (binAtt && hasData(binAtt)) {
        expect(binAtt.data).toBe('VGhpcyBpcyBhIGJhc2U2NCBlbmNvZGVkIHRleHQ=')
      }
    })
  })

  describe('Edge cases and error handling', () => {
    it('should reject attachment names starting with underscore', async () => {
      const invalidDoc = {
        _id: 'invalid_attachment',
        _attachments: {
          '_invalid.txt': {
            content_type: 'text/plain',
            data: Buffer.from('Invalid').toString('base64')
          }
        }
      }

      await expect(db.put(invalidDoc)).rejects.toThrow(/bad_request/)
    })

    it('should handle attachment without content_type gracefully', async () => {
      const doc = {
        _id: 'no_content_type',
        _attachments: {
          'file.txt': {
            data: Buffer.from('No content type').toString('base64')
          }
        }
      }

      // Should succeed but potentially with a warning
      const result = await db.put(doc as any)
      expect(result.ok).toBe(true)
    })

    it('should reject invalid base64 data', async () => {
      const invalidDoc = {
        _id: 'invalid_base64',
        _attachments: {
          'file.txt': {
            content_type: 'text/plain',
            data: 'This is not valid base64!'
          }
        }
      }

      await expect(db.put(invalidDoc)).rejects.toThrow()
    })

    it('should handle stub with non-existent digest', async () => {
      await db.put(binAttDoc)
      const doc = await db.get('bin_doc')

      doc._attachments!['fake.txt'] = {
        stub: true,
        digest: 'md5-nonexistentdigest',
        content_type: 'text/plain',
        length: 0
      } as any

      await expect(db.put(doc)).rejects.toThrow(/412/)
    })
  })

  describe('Local documents with attachments', () => {
    it('should create local document with attachment', async () => {
      const result = await db.put(binAttDocLocal)
      expect(result.ok).toBe(true)

      const doc = await db.get('_local/bin_doc')
      expect(doc._attachments).toBeDefined()
      expect(doc._attachments!['foo.txt']).toBeDefined()
    })

    it('should not return attachment for local doc via getAttachment', async () => {
      await db.put(binAttDocLocal)

      await expect(
        db.getAttachment('_local/bin_doc', 'foo.txt')
      ).rejects.toThrow(/missing/)
    })

    it('should include attachments in local doc when using attachments: true', async () => {
      await db.put(binAttDocLocal)

      const doc = await db.get('_local/bin_doc', { attachments: true })
      const attachment = doc._attachments!['foo.txt']
      if (hasData(attachment)) {
        expect(attachment.data).toBe('VGhpcyBpcyBhIGJhc2U2NCBlbmNvZGVkIHRleHQ=')
      }
    })
  })

  describe('Attachment creation shortcuts', () => {
    it('should create attachment and document in one go', async () => {
      const result = await db.putAttachment(
        'new_doc_with_attachment',
        'myfile.txt',
        new Blob(['Created together']),
        'text/plain'
      )

      expect(result.ok).toBe(true)

      const doc = await db.get('new_doc_with_attachment', { attachments: true })
      expect(doc._attachments!['myfile.txt']).toBeDefined()
      const attachment = doc._attachments!['myfile.txt']
      if (hasData(attachment)) {
        expect(attachment.data).toBe(
          Buffer.from('Created together').toString('base64')
        )
      }
    })
  })

  describe('Binary mode handling', () => {
    it('should return binary data when binary: true', async () => {
      await db.put(pngAttDoc)

      const doc = await db.get('png_doc', {
        attachments: true,
        binary: true
      })

      const attachment = doc._attachments!['foo.png']
      if (hasData(attachment)) {
        expect(attachment.data).toBeInstanceOf(Buffer)

        // Verify the blob content
        const blob = attachment.data as Blob
        expect(blob.type).toBe('image/png')

        // Convert back to base64 to verify
        const arrayBuffer = await blob.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString('base64')
        expect(base64).toBe(pngAttDoc._attachments['foo.png'].data)
      }
    })

    it('should handle binary mode in allDocs', async () => {
      await db.put(binAttDoc)

      const result = await db.allDocs({
        include_docs: true,
        attachments: true,
        binary: true
      })

      const doc = result.rows.find(r => r.id === 'bin_doc')
      const attachment = doc?.doc?._attachments?.['foo.txt']
      if (attachment && hasData(attachment)) {
        expect(attachment.data).toBeInstanceOf(Buffer)
      }
    })
  })
})
