import { createError, WSQ_ERROR } from 'pouchdb-errors'
import { guardedConsole } from 'pouchdb-utils'
import {
  DOC_STORE,
  BY_SEQ_STORE,
  ATTACH_STORE,
  ATTACH_AND_SEQ_STORE,
  META_STORE
} from './constants'
import type { Transaction } from './transactionQueue'

function stringifyDoc(doc: Record<string, any>): string {
  // don't bother storing the id/rev. it uses lots of space,
  // in persistent map/reduce especially
  delete doc._id
  delete doc._rev
  return JSON.stringify(doc)
}

function unstringifyDoc(
  doc: string,
  id: string,
  rev: string
): Record<string, any> {
  const parsedDoc = JSON.parse(doc)
  parsedDoc._id = id
  parsedDoc._rev = rev
  return parsedDoc
}

// question mark groups IN queries, e.g. 3 -> '(?,?,?)'
function qMarks(num: number): string {
  let s = '('
  while (num--) {
    s += '?'
    if (num) {
      s += ','
    }
  }
  return s + ')'
}

function select(
  selector: string,
  table: string | string[],
  joiner?: string | null,
  where?: string | string[],
  orderBy?: string
): string {
  return (
    'SELECT ' +
    selector +
    ' FROM ' +
    (typeof table === 'string' ? table : table.join(' JOIN ')) +
    (joiner ? ' ON ' + joiner : '') +
    (where
      ? ' WHERE ' + (typeof where === 'string' ? where : where.join(' AND '))
      : '') +
    (orderBy ? ' ORDER BY ' + orderBy : '')
  )
}

async function compactRevs(
  revs: string[],
  docId: string,
  tx: Transaction
): Promise<void> {
  if (!revs.length) {
    return
  }

  const seqs: number[] = []

  async function deleteOrphans() {
    // find orphaned attachment digests

    if (!seqs.length) {
      return
    }

    let sql =
      'SELECT DISTINCT digest AS digest FROM ' +
      ATTACH_AND_SEQ_STORE +
      ' WHERE seq IN ' +
      qMarks(seqs.length)

    let res = await tx.execute(sql, seqs)
    const digestsToCheck: string[] = []
    if (res.rows) {
      for (let i = 0; i < res.rows.length; i++) {
        digestsToCheck.push(res.rows[i]!.digest as string)
      }
    }
    if (!digestsToCheck.length) {
      return
    }

    sql =
      'DELETE FROM ' +
      ATTACH_AND_SEQ_STORE +
      ' WHERE seq IN (' +
      seqs.map(() => '?').join(',') +
      ')'
    await tx.execute(sql, seqs)
    sql =
      'SELECT digest FROM ' +
      ATTACH_AND_SEQ_STORE +
      ' WHERE digest IN (' +
      digestsToCheck.map(() => '?').join(',') +
      ')'
    res = await tx.execute(sql, digestsToCheck)
    const nonOrphanedDigests = new Set<string>()
    if (res.rows) {
      for (let i = 0; i < res.rows.length; i++) {
        nonOrphanedDigests.add(res.rows[i]!.digest as string)
      }
    }
    for (const digest of digestsToCheck) {
      if (nonOrphanedDigests.has(digest)) {
        continue
      }
      await tx.execute(
        'DELETE FROM ' + ATTACH_AND_SEQ_STORE + ' WHERE digest=?',
        [digest]
      )
      await tx.execute('DELETE FROM ' + ATTACH_STORE + ' WHERE digest=?', [
        digest
      ])
    }
  }

  // collect the seqs for the revs being compacted and drop their by-seq rows
  for (const rev of revs) {
    const sql = 'SELECT seq FROM ' + BY_SEQ_STORE + ' WHERE doc_id=? AND rev=?'

    const res = await tx.execute(sql, [docId, rev])
    if (!res.rows?.length) {
      // already deleted
      continue
    }
    const seq = res.rows[0]!.seq as number
    seqs.push(seq)

    await tx.execute('DELETE FROM ' + BY_SEQ_STORE + ' WHERE seq=?', [seq])
  }

  // now that all by-seq rows are gone, clean up any orphaned attachments
  await deleteOrphans()
}

async function countDocs(tx: Transaction): Promise<number> {
  const sql = select(
    'COUNT(' + DOC_STORE + ".id) AS 'num'",
    [DOC_STORE, BY_SEQ_STORE],
    BY_SEQ_STORE + '.seq = ' + DOC_STORE + '.winningseq',
    BY_SEQ_STORE + '.deleted=0'
  )
  const result = await tx.execute(sql, [])
  return (result.rows[0]!.num as number) || 0
}

async function getLastSeq(tx: Transaction): Promise<number> {
  const sql =
    "SELECT COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'by-sequence'), 0) AS seq"
  const result = await tx.execute(sql, [])
  return (result.rows[0]!.seq as number) || 0
}

async function getStoredDocCount(tx: Transaction): Promise<number | null> {
  const result = await tx.execute(
    'SELECT doc_count, doc_count_seq FROM ' + META_STORE,
    []
  )
  const row = result.rows[0]
  if (!row || row.doc_count == null || row.doc_count_seq == null) {
    return null
  }
  const lastSeq = await getLastSeq(tx)
  return row.doc_count_seq === lastSeq ? (row.doc_count as number) : null
}

async function getDocCount(tx: Transaction): Promise<number> {
  const stored = await getStoredDocCount(tx)
  return stored !== null ? stored : countDocs(tx)
}

async function refreshDocCount(tx: Transaction): Promise<number> {
  const docCount = await countDocs(tx)
  const lastSeq = await getLastSeq(tx)
  await tx.execute(
    'UPDATE ' + META_STORE + ' SET doc_count = ?, doc_count_seq = ?',
    [docCount, lastSeq]
  )
  return docCount
}

export function handleSQLiteError(
  event: Error,
  callback?: (error: any) => void
) {
  guardedConsole('error', 'SQLite threw an error', event)
  if (event.constructor && event.constructor.name === 'PouchError') {
    if (callback) callback(event)
    return event
  }

  // event may actually be a SQLError object, so report is as such
  const errorNameMatch =
    event && event.constructor.toString().match(/function ([^(]+)/)
  const errorName = (errorNameMatch && errorNameMatch[1]) || event.name
  const errorReason = event.message
  const error = createError(WSQ_ERROR, errorReason, errorName)
  error.name = errorName
  error.message = errorReason
  if (callback) callback(error)
  return error
}

export {
  stringifyDoc,
  unstringifyDoc,
  qMarks,
  select,
  compactRevs,
  countDocs,
  getLastSeq,
  getStoredDocCount,
  getDocCount,
  refreshDocCount
}
