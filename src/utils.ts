import { safeJsonStringify, safeJsonParse } from 'pouchdb-json'

export function qMarks(num: number): string {
  let accum = '?'
  for (let i = 1; i < num; i++) {
    accum += ', ?'
  }
  return accum
}

export function stringifyDoc(doc: any): string {
  delete doc._id
  delete doc._rev
  return safeJsonStringify(doc)
}

export function unstringifyDoc(doc: string, id: string, rev: string): any {
  const parsed = safeJsonParse(doc)
  parsed._id = id
  parsed._rev = rev
  return parsed
}

export function select(
  selectStmt: string,
  from: string | string[],
  joiner?: string,
  where?: string | string[],
  orderBy?: string
): string {
  return (
    'SELECT ' +
    selectStmt +
    ' FROM ' +
    (typeof from === 'string' ? from : from.join(' JOIN ')) +
    (joiner ? ' ON ' + joiner : '') +
    (where
      ? ' WHERE ' +
        (typeof where === 'string' ? where : where.join(' AND '))
      : '') +
    (orderBy ? ' ORDER BY ' + orderBy : '')
  )
}

export function compactRevs(revs: string[], docId: string, db: any): void {
  const pairs: Array<[string, string]> = []
  revs.forEach(function (rev) {
    const idx = rev.indexOf('-')
    const prefix = rev.substring(0, idx)
    const suffix = rev.substring(idx + 1)
    pairs.push([prefix, suffix])
  })

  const sqlArgs: any[] = []
  pairs.forEach(function (pair) {
    sqlArgs.push(docId)
    sqlArgs.push(pair[0])
    sqlArgs.push(pair[1])
  })

  const sql =
    'DELETE FROM "by-sequence" WHERE doc_id=? AND rev IN (' +
    pairs.map(() => '(? || "-" || ?)').join(', ') +
    ')'

  db.run(sql, ...sqlArgs)
}

export function handleSQLiteError(err: any, callback?: Function) {
  if (callback) {
    return callback(err)
  }
  throw err
}