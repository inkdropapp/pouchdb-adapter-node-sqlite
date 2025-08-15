import { uuid } from 'pouchdb-utils'
import crypto from 'crypto'
import { safeJsonParse, safeJsonStringify } from 'pouchdb-json'
import { createError } from 'pouchdb-errors'
import { isLocalId } from 'pouchdb-merge'

import {
  DOC_STORE,
  BY_SEQ_STORE,
  LOCAL_STORE,
  ATTACH_STORE,
  ATTACH_AND_SEQ_STORE
} from './constants'

import { stringifyDoc } from './utils'
import type Database from 'better-sqlite3'

function insertDoc(
  docInfo: any,
  winningRev: string,
  winningRevIsDeleted: boolean,
  newRevIsDeleted: boolean,
  isUpdate: boolean,
  delta: number,
  resultsIdx: number,
  callback: Function,
  db: Database.Database
) {
  const doc = docInfo.data
  const id = doc._id
  const oldRev = doc._rev
  const docId = isLocalId(id) ? null : id
  // const newSeq = isUpdate ? docInfo.winningSeq : null

  // Calculate new revision first
  let newRev: string
  if (docInfo.metadata.rev) {
    const revParts = docInfo.metadata.rev.split('-')
    const revNum = parseInt(revParts[0]) + 1
    const hash = uuid().replace(/-/g, '').substring(0, 32)
    newRev = revNum + '-' + hash
  } else {
    const hash = uuid().replace(/-/g, '').substring(0, 32)
    newRev = '1-' + hash
  }
  
  // Process attachments first to get digests
  const attachments = Object.keys(doc._attachments || {})
  const docToStore = Object.assign({}, doc)
  
  if (attachments.length > 0) {
    docToStore._attachments = {}
    attachments.forEach(key => {
      const att = doc._attachments[key]
      if (!att.stub && att.data) {
        // Calculate digest for new attachments
        const md5 = crypto.createHash('md5')
        md5.update(Buffer.from(att.data, 'base64'))
        att.digest = 'md5-' + md5.digest('hex')
        att.length = Buffer.from(att.data, 'base64').length
        att.revpos = parseInt(newRev.split('-')[0])
      }
      // Store metadata only in document
      docToStore._attachments[key] = {
        content_type: att.content_type,
        digest: att.digest,
        length: att.length,
        revpos: att.revpos,
        stub: true
      }
    })
  }
  
  const json = stringifyDoc(docToStore)

  let insertSql: string
  if (newRevIsDeleted) {
    insertSql = 'INSERT INTO ' + BY_SEQ_STORE + 
      ' (doc_id, rev, json, deleted) VALUES (?, ?, ?, 1);'
  } else {
    insertSql = 'INSERT INTO ' + BY_SEQ_STORE + 
      ' (doc_id, rev, json, deleted) VALUES (?, ?, ?, 0);'
  }

  const insertStmt = db.prepare(insertSql)
  try {
    const result = insertStmt.run(docId, newRev || oldRev, json)
    const seq = result.lastInsertRowid as number

    if (isLocalId(id)) {
      const localSql = 'INSERT OR REPLACE INTO ' + LOCAL_STORE + 
        ' (id, rev, json) VALUES (?, ?, ?);'
      db.prepare(localSql).run(id, newRev || oldRev, json)
      resultsIdx++
      callback()
      return
    }

    // Update metadata with new revision
    docInfo.metadata.rev = newRev
    docInfo.metadata.seq = seq

    const metadataToStore = {
      id: id,
      rev_tree: [{pos: 1, ids: [newRev.split('-')[1], {}, []]}],
      rev: newRev,
      deleted: newRevIsDeleted ? 1 : 0,
      seq: seq
    }

    const metadataStr = safeJsonStringify(metadataToStore)
    let sql: string

    if (isUpdate) {
      sql = 'UPDATE ' + DOC_STORE + ' SET json=?, max_seq=?, rev=?, winningseq=? WHERE id=?'
      db.prepare(sql).run(metadataStr, seq, newRev, seq, id)
    } else {
      sql = 'INSERT INTO ' + DOC_STORE + ' (id, winningseq, max_seq, json, rev) VALUES (?, ?, ?, ?, ?)'
      db.prepare(sql).run(id, seq, seq, metadataStr, newRev)
    }

    docInfo.metadata.seq = seq

    // Save attachments if any
    if (attachments.length === 0) {
      finish()
    } else {
      let attachmentsSaved = 0
      const totalAttachments = attachments.length
      
      const checkDone = () => {
        attachmentsSaved++
        if (attachmentsSaved === totalAttachments) {
          finish()
        }
      }
      
      attachments.forEach(key => {
        const attachment = doc._attachments[key]
        if (!attachment.stub && attachment.data) {
          const data = attachment.data
          saveAttachment(attachment, key, newRev, seq, data, checkDone, db)
        } else {
          checkDone()
        }
      })
    }

    function finish() {
      resultsIdx++
      callback()
    }
  } catch (err) {
    callback(err)
  }
}

function saveAttachment(
  attachment: any, 
  key: string, 
  rev: string, 
  seq: number, 
  data: string, 
  callback: Function,
  db: Database.Database
) {
  const digest = attachment.digest
  const escaped = 0 // Not escaped for now
  
  try {
    // Store attachment data
    const insertAttachSql = 'INSERT OR IGNORE INTO ' + ATTACH_STORE + ' (digest, escaped, body) VALUES (?, ?, ?)'
    db.prepare(insertAttachSql).run(digest, escaped, data)
    
    // Link attachment to document sequence
    const insertAttachSeqSql = 'INSERT INTO ' + ATTACH_AND_SEQ_STORE + ' (digest, seq) VALUES (?, ?)'
    db.prepare(insertAttachSeqSql).run(digest, seq)
    
    callback()
  } catch (err) {
    callback(err)
  }
}

export default function(
  dbOpts: any,
  req: any,
  opts: any,
  api: any,
  db: Database.Database,
  transaction: Function,
  Changes: any,
  callback: Function
) {
  // const newEdits = opts.new_edits !== false
  const userDocs = req.docs
  const docsToInsert = userDocs.length
  const docInfos: any[] = new Array(docsToInsert)
  const allDocInfos: any[] = [] // Keep a copy for completion
  const docInfoErrors: any[] = []
  const resultsIdx = 0

  userDocs.forEach(function(doc: any, i: number) {
    if (!doc._id) {
      doc._id = uuid()
    }
    const docInfo = {
      data: doc,
      metadata: {
        id: doc._id,
        rev: null,
        rev_tree: null
      }
    }
    docInfos[i] = docInfo
    allDocInfos[i] = docInfo
  })

  transaction(function() {
    const fetchExistingSql = 'SELECT json FROM ' + DOC_STORE + ' WHERE id = ?'
    const fetchExistingStmt = db.prepare(fetchExistingSql)

    docInfos.forEach(function(docInfo: any) {
      const id = docInfo.data._id
      const isLocal = isLocalId(id)

      if (isLocal) {
        const existingDoc = db.prepare('SELECT rev, json FROM ' + LOCAL_STORE + ' WHERE id = ?').get(id)
        
        if (existingDoc) {
          const doc = existingDoc as any
          docInfo.metadata.rev = doc.rev
          docInfo.metadata.rev_tree = [{
            pos: parseInt(doc.rev.split('-')[0], 10),
            ids: [doc.rev.split('-')[1], {}, []]
          }]
        } else {
          docInfo.metadata.rev = '0-1'
          docInfo.metadata.rev_tree = [{
            pos: 1,
            ids: ['1', {}, []]
          }]
        }
      } else {
        const existingDoc = fetchExistingStmt.get(id)
        
        if (existingDoc) {
          const doc = existingDoc as any
          const metadata = safeJsonParse(doc.json)
          docInfo.metadata = metadata
          // Check if the incoming document has the correct revision
          if (docInfo.data._rev && docInfo.data._rev !== metadata.rev) {
            docInfoErrors[docInfos.indexOf(docInfo)] = createError('REV_CONFLICT')
          }
        } else {
          docInfo.metadata.rev = null
          docInfo.metadata.rev_tree = []
        }
      }
    })

    processDocs()

    function processDocs() {
      if (!docInfos.length) {
        return complete()
      }
      
      const currentDoc = docInfos.shift()
      const isUpdate = currentDoc.metadata.rev !== null
      const isDeleted = currentDoc.data._deleted === true
      insertDoc(
        currentDoc,
        currentDoc.metadata.rev,
        false,
        isDeleted,
        isUpdate,
        0,
        resultsIdx,
        function() {
          processDocs()
        },
        db
      )
    }

    function complete() {
      const results: any[] = []
      
      allDocInfos.forEach(function(docInfo: any, idx: number) {
        if (docInfoErrors[idx]) {
          results.push(docInfoErrors[idx])
        } else {
          results.push({
            ok: true,
            id: docInfo.metadata.id,
            rev: docInfo.metadata.rev
          })
        }
      })

      Changes.notify(api._name)
      callback(null, results)
    }
  })
}