import SqlPouchCore from './core'
import type { OpenDatabaseOptions } from './openDatabase'

function SQLite3Pouch(opts: OpenDatabaseOptions, callback: (err: any) => void) {
  try {
    // @ts-ignore
    SqlPouchCore.call(this, opts, callback)
  } catch (err) {
    callback(err)
  }
}

// Set static properties
SQLite3Pouch.valid = function () {
  return true
}
SQLite3Pouch.use_prefix = false

export default function sqlite3Plugin(PouchDB: any) {
  PouchDB.adapter('sqlite3', SQLite3Pouch, true)
}
