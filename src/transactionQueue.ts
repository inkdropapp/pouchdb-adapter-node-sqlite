import Database from 'better-sqlite3'
import { logger } from './debug'

export interface TransactionResult {
  rows: any[]
  rowsAffected: number
  insertId?: number
}

export interface Transaction {
  execute: (sql: string, params?: any[]) => Promise<TransactionResult>
  commit: () => Promise<{ rowsAffected: number }>
  rollback: () => Promise<{ rowsAffected: number }>
}

export interface PendingTransaction {
  readonly: boolean
  start: (tx: Transaction) => Promise<void>
  finish: () => void
}

export class TransactionQueue {
  queue: PendingTransaction[] = []
  inProgress = false
  db: InstanceType<typeof Database>

  constructor(db: InstanceType<typeof Database>) {
    this.db = db
    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL')
  }

  run() {
    if (this.inProgress) {
      // Transaction is already in process bail out
      return
    }

    if (this.queue.length) {
      this.inProgress = true
      const tx = this.queue.shift()

      if (!tx) {
        throw new Error('Could not get a operation on database')
      }

      setImmediate(async () => {
        try {
          if (tx.readonly) {
            logger.debug('---> transaction start!')
            await this.runTransaction(tx.start, false)
          } else {
            logger.debug('---> write transaction start!')
            await this.runTransaction(tx.start, true)
          }
        } finally {
          logger.debug(
            '<--- transaction finished! queue.length:',
            this.queue.length
          )
          tx.finish()
          this.inProgress = false
          if (this.queue.length) this.run()
        }
      })
    } else {
      this.inProgress = false
    }
  }

  /**
   * Creates a function that always runs inside a transaction.
   *
   * NOTE: The PouchDB adapter expects async transactions,
   * but better-sqlite3 only supports synchronous transactions.
   * Since we can't easily change all the PouchDB adapter code to be synchronous,
   * we need to stick with manual transaction control using BEGIN/COMMIT/ROLLBACK.
   */
  private async runTransaction(
    fn: (tx: Transaction) => Promise<void>,
    write: boolean
  ) {
    const executeSQL = (sql: string, params?: any[]): TransactionResult => {
      try {
        const stmt = this.db.prepare(sql)
        let result: any[]
        let info: any

        if (
          sql.trim().toUpperCase().startsWith('SELECT') ||
          sql.trim().toUpperCase().startsWith('PRAGMA')
        ) {
          result = params ? stmt.all(...params) : stmt.all()
          info = { changes: 0, lastInsertRowid: 0 }
        } else {
          info = params ? stmt.run(...params) : stmt.run()
          result = []
        }

        return {
          rows: result,
          rowsAffected: info.changes || 0,
          insertId: Number(info.lastInsertRowid) || undefined
        }
      } catch (err) {
        logger.error('SQL execution error:', err)
        throw err
      }
    }

    const txObject: Transaction = {
      execute: async (sql: string, params?: any[]) => {
        return Promise.resolve(executeSQL(sql, params))
      },
      commit: async () => Promise.resolve({ rowsAffected: 0 }),
      rollback: async () => {
        if (write) {
          throw new Error('ROLLBACK')
        }
        return Promise.resolve({ rowsAffected: 0 })
      }
    }

    if (write) {
      // Manual transaction control for write operations
      // We can't use better-sqlite3's transaction() because it doesn't support async functions
      this.db.exec('BEGIN')
      try {
        await fn(txObject)
        this.db.exec('COMMIT')
      } catch (err: any) {
        this.db.exec('ROLLBACK')
        if (err.message !== 'ROLLBACK') {
          throw err
        }
      }
    } else {
      // For read-only operations, just execute directly
      await fn(txObject)
    }
  }

  async push(fn: (tx: Transaction) => Promise<void>) {
    return new Promise<void>(resolve => {
      this.queue.push({ readonly: false, start: fn, finish: resolve })
      this.run()
    })
  }

  async pushReadOnly(fn: (tx: Transaction) => Promise<void>) {
    return new Promise<void>(resolve => {
      this.queue.push({ readonly: true, start: fn, finish: resolve })
      this.run()
    })
  }
}

