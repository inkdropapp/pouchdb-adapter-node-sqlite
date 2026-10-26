import { existsSync } from 'node:fs'
import { DatabaseSync, type DatabaseSyncOptions } from 'node:sqlite'
import { TransactionQueue } from './transactionQueue'

/**
 * better-sqlite3 waited up to 5 s on SQLITE_BUSY by default, whereas
 * node:sqlite defaults to 0 ms (fail immediately). Keep the old behaviour
 * unless the caller sets `timeout` explicitly.
 */
const DEFAULT_BUSY_TIMEOUT_MS = 5000

export type OpenDatabaseOptions = DatabaseSyncOptions & {
  name: string
  revs_limit?: number
  auto_compaction?: boolean
  deterministic_revs?: boolean
  /** @deprecated Use `readOnly` (node:sqlite spelling). Kept for callers written against better-sqlite3. */
  readonly?: boolean
  /** @deprecated better-sqlite3 option; throws ENOENT-style error when the file is missing. */
  fileMustExist?: boolean
}
export type OpenDatabaseResult =
  | {
      db: DatabaseSync
      transactionQueue: TransactionQueue
      /** The number of open PouchDB instances sharing this connection */
      refs: number
    }
  | {
      error: Error
    }

const cachedDatabases = new Map<string, OpenDatabaseResult>()

function toDatabaseSyncOptions(opts: OpenDatabaseOptions): DatabaseSyncOptions {
  const {
    name: _name,
    revs_limit: _revsLimit,
    auto_compaction: _autoCompaction,
    deterministic_revs: _deterministicRevs,
    readonly,
    fileMustExist: _fileMustExist,
    ...rest
  } = opts

  // PouchDB forwards every constructor option (adapter, prefix, ...) here.
  // node:sqlite ignores unknown keys but validates the types of known ones,
  // so only pass through what it understands.
  const dbOptions: DatabaseSyncOptions = {}
  const knownKeys: (keyof DatabaseSyncOptions)[] = [
    'open',
    'readOnly',
    'enableForeignKeyConstraints',
    'enableDoubleQuotedStringLiterals',
    'allowExtension',
    'timeout',
    'readBigInts',
    'returnArrays',
    'allowBareNamedParameters',
    'allowUnknownNamedParameters'
  ]
  for (const key of knownKeys) {
    if (rest[key] !== undefined) {
      ;(dbOptions as any)[key] = rest[key]
    }
  }
  if (dbOptions.readOnly === undefined) {
    dbOptions.readOnly = readonly ?? false
  }
  if (dbOptions.timeout === undefined) {
    dbOptions.timeout = DEFAULT_BUSY_TIMEOUT_MS
  }
  return dbOptions
}

function openDBSafely(opts: OpenDatabaseOptions): OpenDatabaseResult {
  try {
    if (opts.fileMustExist && !existsSync(opts.name)) {
      throw new Error('unable to open database file')
    }
    const db = new DatabaseSync(opts.name, toDatabaseSyncOptions(opts))
    const transactionQueue = new TransactionQueue(db)
    return { db, transactionQueue, refs: 0 }
  } catch (err: any) {
    err.message += ': ' + opts.name
    return { error: err }
  }
}

function openDB(opts: OpenDatabaseOptions) {
  let cachedResult: OpenDatabaseResult | undefined = cachedDatabases.get(
    opts.name
  )
  if (!cachedResult) {
    cachedResult = openDBSafely(opts)
    cachedDatabases.set(opts.name, cachedResult)
  }
  if ('db' in cachedResult) cachedResult.refs++
  return cachedResult
}

/**
 * Releases one reference to a connection and closes it once no instance
 * uses it.
 *
 * @param name - The cache key `openDB` was called with (`<name>.sqlite`)
 * @param opened - The result `openDB` returned. Ignored when stale, i.e.
 *   already force-closed or replaced by a reopen.
 * @param options.force - Close the connection even while other instances
 *   use it. `destroy` needs this before deleting the file, since Windows
 *   refuses to delete an open file.
 */
export function closeDB(
  name: string,
  opened: OpenDatabaseResult,
  { force = false }: { force?: boolean } = {}
) {
  const cachedResult = cachedDatabases.get(name)
  if (cachedResult !== opened) return
  if ('db' in cachedResult) {
    cachedResult.refs--
    if (cachedResult.refs > 0 && !force) return
    if (cachedResult.db.isOpen) cachedResult.db.close()
  }
  cachedDatabases.delete(name)
}

export default openDB
