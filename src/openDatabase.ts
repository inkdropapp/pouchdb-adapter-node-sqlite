import Database from 'better-sqlite3'
import { TransactionQueue } from './transactionQueue'

export type OpenDatabaseOptions = Database.Options & {
  name: string
  revs_limit?: number
  auto_compaction?: boolean
  deterministic_revs?: boolean
}
type OpenDatabaseResult =
  | {
      db: InstanceType<typeof Database>
      transactionQueue: TransactionQueue
    }
  | {
      error: Error
    }

const cachedDatabases = new Map<string, OpenDatabaseResult>()

function openDBSafely(opts: OpenDatabaseOptions): OpenDatabaseResult {
  try {
    // Extract Database.Options from our extended options
    const { name, revs_limit, ...dbOptions } = opts

    // Ensure database can be created if it doesn't exist
    if (dbOptions.readonly === undefined) {
      dbOptions.readonly = false
    }

    const db = new Database(name, dbOptions)
    const transactionQueue = new TransactionQueue(db)
    return { db, transactionQueue }
  } catch (err: any) {
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
  return cachedResult
}

export function closeDB(name: string) {
  const cachedResult = cachedDatabases.get(name)
  if (cachedResult) {
    if ('db' in cachedResult) {
      cachedResult.db.close()
    }
    cachedDatabases.delete(name)
  }
}

export default openDB
