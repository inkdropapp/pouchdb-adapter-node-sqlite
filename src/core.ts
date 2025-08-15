import Database from 'better-sqlite3'
import {
  clone,
  pick,
  filterChange,
  changesHandler as Changes,
  uuid
} from 'pouchdb-utils'
import {
  collectConflicts,
  traverseRevTree,
  latest as getLatest
} from 'pouchdb-merge'
import { safeJsonParse, safeJsonStringify } from 'pouchdb-json'
import {
  binaryStringToBlobOrBuffer as binStringToBlob,
  btoa
} from 'pouchdb-binary-utils'

import sqliteBulkDocs from './bulkDocs'

import { MISSING_DOC, REV_CONFLICT, createError } from 'pouchdb-errors'

import {
  ADAPTER_VERSION,
  DOC_STORE,
  BY_SEQ_STORE,
  ATTACH_STORE,
  LOCAL_STORE,
  META_STORE,
  ATTACH_AND_SEQ_STORE
} from './constants'

import {
  qMarks,
  stringifyDoc,
  unstringifyDoc,
  select,
  compactRevs,
  handleSQLiteError
} from './utils'

const BY_SEQ_STORE_DELETED_INDEX_SQL =
  "CREATE INDEX IF NOT EXISTS 'by-seq-deleted-idx' ON " +
  BY_SEQ_STORE +
  ' (seq, deleted)'
const BY_SEQ_STORE_DOC_ID_REV_INDEX_SQL =
  "CREATE UNIQUE INDEX IF NOT EXISTS 'by-seq-doc-id-rev' ON " +
  BY_SEQ_STORE +
  ' (doc_id, rev)'
const DOC_STORE_WINNINGSEQ_INDEX_SQL =
  "CREATE INDEX IF NOT EXISTS 'doc-winningseq-idx' ON " +
  DOC_STORE +
  ' (winningseq)'
const ATTACH_AND_SEQ_STORE_SEQ_INDEX_SQL =
  "CREATE INDEX IF NOT EXISTS 'attach-seq-seq-idx' ON " +
  ATTACH_AND_SEQ_STORE +
  ' (seq)'
const ATTACH_AND_SEQ_STORE_ATTACH_INDEX_SQL =
  "CREATE UNIQUE INDEX IF NOT EXISTS 'attach-seq-digest-idx' ON " +
  ATTACH_AND_SEQ_STORE +
  ' (digest, seq)'

const DOC_STORE_AND_BY_SEQ_JOINER =
  BY_SEQ_STORE + '.seq = ' + DOC_STORE + '.winningseq'

const SELECT_DOCS =
  BY_SEQ_STORE +
  '.seq AS seq, ' +
  BY_SEQ_STORE +
  '.deleted AS deleted, ' +
  BY_SEQ_STORE +
  '.json AS data, ' +
  BY_SEQ_STORE +
  '.rev AS rev, ' +
  DOC_STORE +
  '.json AS metadata'

const sqliteChanges = new (Changes as any)()

const dbStores: { [key: string]: Database.Database } = {}

function SqlPouch(this: any, opts: any, callback: (err: any) => void) {
  const api = this
  let instanceId: string
  let encoding = 'UTF-8'
  api.auto_compaction = false

  api._name = opts.name

  const dbPath = opts.name.endsWith('.sqlite') ? opts.name : opts.name + '.sqlite'
  
  const db = new Database(dbPath)
  dbStores[api._name] = db
  db.pragma('journal_mode = WAL')

  setup()

  function setup() {
    db.transaction(() => {
      checkEncoding()
      fetchVersion()
    })()
    callback(null)
  }

  function checkEncoding() {
    const res = db.prepare("SELECT HEX('a') AS hex").get() as any
    encoding = res.hex.length === 2 ? 'UTF-8' : 'UTF-16'
  }

  function fetchVersion() {
    const sql = "SELECT sql FROM sqlite_master WHERE tbl_name = '" + META_STORE.replace(/"/g, '') + "'"
    const result = db.prepare(sql).all()
    
    if (!result.length) {
      onGetVersion(0)
    } else if (!/db_version/.test((result[0] as any).sql)) {
      db.prepare('ALTER TABLE ' + META_STORE + ' ADD COLUMN db_version INTEGER').run()
      onGetVersion(1)
    } else {
      const resDBVer = db.prepare('SELECT db_version FROM ' + META_STORE).get() as any
      onGetVersion(resDBVer?.db_version || 0)
    }
  }

  function onGetVersion(dbVersion: number) {
    if (dbVersion === 0) {
      createInitialSchema()
    } else {
      runMigrations(dbVersion)
    }
  }

  function createInitialSchema() {
    const schemas = [
      'CREATE TABLE IF NOT EXISTS ' + META_STORE + ' (dbid, db_version INTEGER)',
      'CREATE TABLE IF NOT EXISTS ' + ATTACH_STORE + ' (digest UNIQUE, escaped TINYINT(1), body BLOB)',
      'CREATE TABLE IF NOT EXISTS ' + ATTACH_AND_SEQ_STORE + ' (digest, seq INTEGER)',
      'CREATE TABLE IF NOT EXISTS ' + DOC_STORE + ' (id unique, json, winningseq, max_seq INTEGER UNIQUE, rev)',
      'CREATE TABLE IF NOT EXISTS ' + BY_SEQ_STORE + ' (seq INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, json, deleted TINYINT(1), doc_id, rev)',
      'CREATE TABLE IF NOT EXISTS ' + LOCAL_STORE + ' (id UNIQUE, rev, json)'
    ]

    schemas.forEach(sql => db.prepare(sql).run())
    
    db.prepare(ATTACH_AND_SEQ_STORE_SEQ_INDEX_SQL).run()
    db.prepare(ATTACH_AND_SEQ_STORE_ATTACH_INDEX_SQL).run()
    db.prepare(DOC_STORE_WINNINGSEQ_INDEX_SQL).run()
    db.prepare(BY_SEQ_STORE_DELETED_INDEX_SQL).run()
    db.prepare(BY_SEQ_STORE_DOC_ID_REV_INDEX_SQL).run()
    
    const initSeq = 'INSERT INTO ' + META_STORE + ' (db_version, dbid) VALUES (?,?)'
    instanceId = uuid()
    db.prepare(initSeq).run(ADAPTER_VERSION, instanceId)
  }

  function runMigrations(dbVersion: number) {
    const migrated = dbVersion < ADAPTER_VERSION
    if (migrated) {
      db.prepare('UPDATE ' + META_STORE + ' SET db_version = ' + ADAPTER_VERSION).run()
    }
    const result = db.prepare('SELECT dbid FROM ' + META_STORE).get() as any
    instanceId = result.dbid
  }

  api._remote = false

  api._id = (callback: (err: any, id?: string) => void) => {
    callback(null, instanceId)
  }

  api._info = (callback: (err: any, info?: any) => void) => {
    try {
      const seq = getMaxSeq()
      const docCount = countDocs()
      callback(null, {
        doc_count: docCount,
        update_seq: seq,
        sqlite_encoding: encoding
      })
    } catch (e: any) {
      handleSQLiteError(e, callback)
    }
  }

  api._bulkDocs = (
    req: any,
    reqOpts: any,
    callback: (err: any, response?: any) => void
  ) => {
    sqliteBulkDocs(
      { revs_limit: opts.revs_limit },
      req,
      reqOpts,
      api,
      db,
      (fn: Function) => {
        const tx = db.transaction(fn as any)
        return tx()
      },
      sqliteChanges,
      callback
    )
  }

  api._get = (
    id: string,
    opts: any,
    callback: (err: any, response?: any) => void
  ) => {
    let doc: any
    let metadata: any

    const finish = (err: any) => {
      callback(err, { doc, metadata })
    }

    let sql: string
    let sqlArgs: any[]

    if (!opts.rev) {
      sql = select(
        SELECT_DOCS,
        [DOC_STORE, BY_SEQ_STORE],
        DOC_STORE_AND_BY_SEQ_JOINER,
        DOC_STORE + '.id=?'
      )
      sqlArgs = [id]
    } else if (opts.latest) {
      latest(id, opts.rev, (latestRev: string) => {
        opts.latest = false
        opts.rev = latestRev
        api._get(id, opts, callback)
      }, finish)
      return
    } else {
      sql = select(
        SELECT_DOCS,
        [DOC_STORE, BY_SEQ_STORE],
        DOC_STORE + '.id=' + BY_SEQ_STORE + '.doc_id',
        [BY_SEQ_STORE + '.doc_id=?', BY_SEQ_STORE + '.rev=?']
      )
      sqlArgs = [id, opts.rev]
    }

    try {
      const results = db.prepare(sql).all(...sqlArgs)
      if (!results.length) {
        const missingErr = createError(MISSING_DOC, 'missing')
        return finish(missingErr)
      }
      const item = results[0] as any
      metadata = safeJsonParse(item.metadata)
      if (item.deleted && !opts.rev) {
        const deletedErr = createError(MISSING_DOC, 'deleted')
        return finish(deletedErr)
      }
      doc = unstringifyDoc(item.data, metadata.id, item.rev || metadata.rev)
      finish(null)
    } catch (e) {
      finish(e)
    }
  }

  api._allDocs = (opts: any, callback: (err: any, response?: any) => void) => {
    const results: any[] = []

    const start = 'startkey' in opts ? opts.startkey : false
    const end = 'endkey' in opts ? opts.endkey : false
    const key = 'key' in opts ? opts.key : false
    const keys = 'keys' in opts ? opts.keys : false
    const descending = 'descending' in opts ? opts.descending : false
    let limit = 'limit' in opts ? opts.limit : -1
    const offset = 'skip' in opts ? opts.skip : 0
    const inclusiveEnd = opts.inclusive_end !== false

    const sqlArgs: any[] = []
    const criteria: string[] = []

    if (key !== false) {
      criteria.push(DOC_STORE + '.id = ?')
      sqlArgs.push(key)
    } else if (start !== false || end !== false) {
      if (start !== false) {
        criteria.push(DOC_STORE + '.id ' + (descending ? '<=' : '>=') + ' ?')
        sqlArgs.push(start)
      }
      if (end !== false) {
        let comparator = descending ? '>' : '<'
        if (inclusiveEnd) {
          comparator += '='
        }
        criteria.push(DOC_STORE + '.id ' + comparator + ' ?')
        sqlArgs.push(end)
      }
    }

    if (!keys) {
      criteria.push(BY_SEQ_STORE + '.deleted = 0')
    }

    try {
      const totalRows = countDocs()
      const updateSeq = opts.update_seq ? getMaxSeq() : undefined

      if (limit === 0) {
        limit = 1
      }

      const sql =
        select(
          SELECT_DOCS,
          [DOC_STORE, BY_SEQ_STORE],
          DOC_STORE_AND_BY_SEQ_JOINER,
          criteria,
          DOC_STORE + '.id ' + (descending ? 'DESC' : 'ASC')
        ) +
        ' LIMIT ' + limit +
        ' OFFSET ' + offset

      const rows = db.prepare(sql).all(...sqlArgs)

      for (let i = 0, l = rows.length; i < l; i++) {
        const item = rows[i] as any
        const metadata = safeJsonParse(item.metadata)
        const id = metadata.id
        const data = unstringifyDoc(item.data, id, item.rev)
        const winningRev = data._rev
        const doc: any = {
          id: id,
          key: id,
          value: { rev: winningRev }
        }
        if (opts.include_docs) {
          doc.doc = data
          doc.doc._rev = winningRev
          if (opts.conflicts) {
            const conflicts = collectConflicts(metadata)
            if (conflicts.length) {
              doc.doc._conflicts = conflicts
            }
          }
          fetchAttachmentsIfNecessary(doc.doc, opts, api)
        }
        if (item.deleted) {
          if (keys) {
            doc.value.deleted = true
            doc.doc = null
          } else {
            continue
          }
        }
        results.push(doc)
      }

      const returnVal: any = {
        total_rows: totalRows,
        offset: opts.skip,
        rows: results
      }

      if (opts.update_seq) {
        returnVal.update_seq = updateSeq
      }
      callback(null, returnVal)
    } catch (e: any) {
      handleSQLiteError(e, callback)
    }
  }

  api._changes = (opts: any): any => {
    opts = clone(opts)

    if (opts.continuous) {
      const id = api._name + ':' + uuid()
      sqliteChanges.addListener(api._name, id, api, opts)
      sqliteChanges.notify(api._name)
      return {
        cancel: () => {
          sqliteChanges.removeListener(api._name, id)
        }
      }
    }

    const descending = opts.descending
    opts.since = opts.since && !descending ? opts.since : 0
    let limit = 'limit' in opts ? opts.limit : -1
    if (limit === 0) {
      limit = 1
    }

    const results: any[] = []
    let numResults = 0

    const fetchChanges = () => {
      const selectStmt =
        DOC_STORE + '.json AS metadata, ' +
        DOC_STORE + '.max_seq AS maxSeq, ' +
        BY_SEQ_STORE + '.json AS winningDoc, ' +
        BY_SEQ_STORE + '.rev AS winningRev '
      const from = DOC_STORE + ' JOIN ' + BY_SEQ_STORE
      const joiner =
        DOC_STORE + '.id=' + BY_SEQ_STORE + '.doc_id' +
        ' AND ' + DOC_STORE + '.winningseq=' + BY_SEQ_STORE + '.seq'
      const criteria = ['maxSeq > ?']
      const sqlArgs = [opts.since]

      if (opts.doc_ids) {
        criteria.push(DOC_STORE + '.id IN ' + qMarks(opts.doc_ids.length))
        sqlArgs.push(...opts.doc_ids)
      }

      const orderBy = 'maxSeq ' + (descending ? 'DESC' : 'ASC')
      let sql = select(selectStmt, from, joiner, criteria, orderBy)
      const filter = filterChange(opts)

      if (!opts.view && !opts.filter) {
        sql += ' LIMIT ' + limit
      }

      let lastSeq = opts.since || 0

      try {
        const result = db.prepare(sql).all(...sqlArgs)

        for (let i = 0, l = result.length; i < l; i++) {
          const item = result[i] as any
          const metadata = safeJsonParse(item.metadata)
          lastSeq = item.maxSeq

          const doc = unstringifyDoc(item.winningDoc, metadata.id, item.winningRev)
          const change = opts.processChange(doc, metadata, opts)
          change.seq = item.maxSeq

          const filtered = filter(change)
          if (typeof filtered === 'object') {
            return opts.complete(filtered)
          }

          if (filtered) {
            numResults++
            if (opts.return_docs) {
              results.push(change)
            }
            if (opts.attachments && opts.include_docs) {
              fetchAttachmentsIfNecessary(doc, opts, api, () => opts.onChange(change))
            } else {
              opts.onChange(change)
            }
          }
          if (numResults === limit) {
            break
          }
        }

        if (!opts.continuous) {
          opts.complete(null, {
            results,
            last_seq: lastSeq
          })
        }
      } catch (e: any) {
        handleSQLiteError(e, opts.complete)
      }
    }

    fetchChanges()
  }

  api._close = (callback: (err?: any) => void) => {
    if (db) {
      db.close()
      delete dbStores[api._name]
    }
    callback()
  }

  api._getAttachment = (
    _docId: string,
    _attachId: string,
    attachment: any,
    opts: any,
    callback: (err: any, response?: any) => void
  ) => {
    let res: any
    const digest = attachment.digest
    const type = attachment.content_type
    const sql = 'SELECT escaped, body AS body FROM ' + ATTACH_STORE + ' WHERE digest=?'
    const row = db.prepare(sql).get(digest) as any
    
    if (row) {
      const data = row.body
      if (opts.binary) {
        res = binStringToBlob(data, type)
      } else {
        res = data // Already base64 encoded
      }
      callback(null, res)
    } else {
      callback(createError(MISSING_DOC))
    }
  }

  api._getRevisionTree = (
    docId: string,
    callback: (err: any, rev_tree?: any) => void
  ) => {
    const sql = 'SELECT json AS metadata FROM ' + DOC_STORE + ' WHERE id = ?'
    const result = db.prepare(sql).get(docId) as any
    if (!result) {
      callback(createError(MISSING_DOC))
    } else {
      const data = safeJsonParse(result.metadata)
      callback(null, data.rev_tree)
    }
  }

  api._doCompaction = (
    docId: string,
    revs: string[],
    callback: (err?: any) => void
  ) => {
    if (!revs.length) {
      return callback()
    }
    
    db.transaction(() => {
      try {
        const sql = 'SELECT json AS metadata FROM ' + DOC_STORE + ' WHERE id = ?'
        const result = db.prepare(sql).get(docId) as any
        const metadata = safeJsonParse(result.metadata)
        
        traverseRevTree(
          metadata.rev_tree,
          (
            _isLeaf: boolean,
            pos: number,
            revHash: string,
            _ctx: any,
            opts: any
          ) => {
            const rev = pos + '-' + revHash
            if (revs.indexOf(rev) !== -1) {
              opts.status = 'missing'
            }
          }
        )
        
        const updateSql = 'UPDATE ' + DOC_STORE + ' SET json = ? WHERE id = ?'
        db.prepare(updateSql).run(safeJsonStringify(metadata), docId)
        
        compactRevs(revs, docId, db)
      } catch (e: any) {
        handleSQLiteError(e, callback)
      }
    })()
    callback()
  }

  api._getLocal = (id: string, callback: (err: any, doc?: any) => void) => {
    try {
      const sql = 'SELECT json, rev FROM ' + LOCAL_STORE + ' WHERE id=?'
      const res = db.prepare(sql).get(id) as any
      if (res) {
        const doc = unstringifyDoc(res.json, id, res.rev)
        callback(null, doc)
      } else {
        callback(createError(MISSING_DOC))
      }
    } catch (e: any) {
      handleSQLiteError(e, callback)
    }
  }

  api._putLocal = (
    doc: any,
    opts: any,
    callback: (err: any, response?: any) => void
  ) => {
    if (typeof opts === 'function') {
      callback = opts
      opts = {}
    }
    delete doc._revisions
    const oldRev = doc._rev
    const id = doc._id
    let newRev: string
    if (!oldRev) {
      newRev = doc._rev = '0-1'
    } else {
      newRev = doc._rev = '0-' + (parseInt(oldRev.split('-')[1], 10) + 1)
    }
    const json = stringifyDoc(doc)

    try {
      let sql: string
      let values: any[]
      if (oldRev) {
        sql = 'UPDATE ' + LOCAL_STORE + ' SET rev=?, json=? WHERE id=? AND rev=?'
        values = [newRev, json, id, oldRev]
      } else {
        sql = 'INSERT INTO ' + LOCAL_STORE + ' (id, rev, json) VALUES (?,?,?)'
        values = [id, newRev, json]
      }
      const res = db.prepare(sql).run(...values)
      if (res.changes) {
        const ret = { ok: true, id: id, rev: newRev }
        callback(null, ret)
      } else {
        callback(createError(REV_CONFLICT))
      }
    } catch (e: any) {
      handleSQLiteError(e, callback)
    }
  }

  api._removeLocal = (
    doc: any,
    opts: any,
    callback: (err: any, response?: any) => void
  ) => {
    if (typeof opts === 'function') {
      callback = opts
      opts = {}
    }

    try {
      const sql = 'DELETE FROM ' + LOCAL_STORE + ' WHERE id=? AND rev=?'
      const params = [doc._id, doc._rev]
      const res = db.prepare(sql).run(...params)
      if (!res.changes) {
        return callback(createError(MISSING_DOC))
      }
      const ret = { ok: true, id: doc._id, rev: '0-0' }
      callback(null, ret)
    } catch (e: any) {
      handleSQLiteError(e, callback)
    }
  }

  api._destroy = (_opts: any, callback: (err: any, response?: any) => void) => {
    sqliteChanges.removeAllListeners(api._name)
    
    db.transaction(() => {
      try {
        const stores = [
          DOC_STORE,
          BY_SEQ_STORE,
          ATTACH_STORE,
          META_STORE,
          LOCAL_STORE,
          ATTACH_AND_SEQ_STORE
        ]
        stores.forEach((store) => {
          db.prepare('DROP TABLE IF EXISTS ' + store).run()
        })
        callback(null, { ok: true })
      } catch (e: any) {
        handleSQLiteError(e, callback)
      }
    })()
  }

  function fetchAttachmentsIfNecessary(
    doc: any,
    opts: any,
    api: any,
    cb?: () => void
  ) {
    const attachments = Object.keys(doc._attachments || {})
    if (!attachments.length) {
      return cb && cb()
    }
    let numDone = 0

    const checkDone = () => {
      if (++numDone === attachments.length && cb) {
        cb()
      }
    }

    const fetchAttachment = (doc: any, att: string) => {
      const attObj = doc._attachments[att]
      const attOpts = { binary: opts.binary }
      api._getAttachment(doc._id, att, attObj, attOpts, (_: any, data: any) => {
        doc._attachments[att] = Object.assign(
          pick(attObj, ['digest', 'content_type']),
          { data }
        )
        checkDone()
      })
    }

    attachments.forEach((att) => {
      if (opts.attachments && opts.include_docs) {
        fetchAttachment(doc, att)
      } else {
        doc._attachments[att].stub = true
        checkDone()
      }
    })
  }

  function getMaxSeq(): number {
    const sql = 'SELECT MAX(seq) AS seq FROM ' + BY_SEQ_STORE
    const res = db.prepare(sql).get() as any
    return res.seq || 0
  }

  function countDocs(): number {
    const sql = select(
      'COUNT(' + DOC_STORE + ".id) AS 'num'",
      [DOC_STORE, BY_SEQ_STORE],
      DOC_STORE_AND_BY_SEQ_JOINER,
      BY_SEQ_STORE + '.deleted=0'
    )
    const result = db.prepare(sql).get() as any
    return result.num || 0
  }

  function latest(
    id: string,
    rev: string,
    callback: (latestRev: string) => void,
    finish: (err: any) => void
  ) {
    const sql = select(
      SELECT_DOCS,
      [DOC_STORE, BY_SEQ_STORE],
      DOC_STORE_AND_BY_SEQ_JOINER,
      DOC_STORE + '.id=?'
    )
    const sqlArgs = [id]

    const results = db.prepare(sql).all(...sqlArgs)
    if (!results.length) {
      const err = createError(MISSING_DOC, 'missing')
      return finish(err)
    }
    const item = results[0] as any
    const metadata = safeJsonParse(item.metadata)
    callback(getLatest(rev, metadata))
  }
}

export default SqlPouch