import SqlPouchCore from './core'

function SQLitePouch(opts: any, callback: (err: any) => void) {
  try {
    // @ts-ignore
    SqlPouchCore.call(this, opts, callback)
  } catch (err) {
    callback(err)
  }
}

SQLitePouch.valid = function () {
  return true
}
SQLitePouch.use_prefix = false

export default function sqlitePlugin(PouchDB: any) {
  PouchDB.adapter('sqlite3', SQLitePouch, true)
}