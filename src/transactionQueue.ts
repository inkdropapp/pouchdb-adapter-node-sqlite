import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import { logger } from './debug'

/**
 * better-sqlite3 bound `undefined` as NULL; node:sqlite throws
 * "Provided value cannot be bound". Normalise so callers keep the old
 * behaviour.
 */
function toBindParams(params?: any[]): SQLInputValue[] {
  if (!params) return []
  return params.map(p => (p === undefined ? null : p))
}

function isRowReturningSql(sql: string): boolean {
  const head = sql.trimStart().slice(0, 6).toUpperCase()
  return head.startsWith('SELECT') || head.startsWith('PRAGMA')
}

export interface TransactionResult {
  rows: any[]
  rowsAffected: number
  insertId?: number
}

export interface Transaction {
  execute: (sql: string, params?: any[]) => Promise<TransactionResult>
  commit: () => { rowsAffected: number }
  rollback: () => { rowsAffected: number }
}

export interface PendingTransaction {
  readonly: boolean
  start: (tx: Transaction) => Promise<void>
  finish: () => void
}

export class TransactionQueue {
  queue: PendingTransaction[] = []
  inProgress = false
  db: DatabaseSync

  constructor(db: DatabaseSync) {
    this.db = db
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA synchronous = NORMAL')
  }

  private executeSql(sql: string, params?: any[]): TransactionResult {
    const stmt = this.db.prepare(sql)
    const bindParams = toBindParams(params)
    if (isRowReturningSql(sql)) {
      return {
        rows: stmt.all(...bindParams),
        rowsAffected: 0,
        insertId: undefined
      }
    }
    const info = stmt.run(...bindParams)
    return {
      rows: [],
      rowsAffected: Number(info.changes) || 0,
      insertId: Number(info.lastInsertRowid) || undefined
    }
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
            logger.debug('---> read transaction start!')
            await this.runReadTransaction(tx.start)
          } else {
            logger.debug('---> write transaction start!')
            await this.runWriteTransaction(tx.start)
          }
        } catch (err) {
          logger.error('Transaction error:', err)
          throw err
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

  private async runWriteTransaction(fn: (tx: Transaction) => Promise<void>) {
    let isFinalized = false
    let isRolledBack = false

    const txObject: Transaction = {
      execute: async (
        sql: string,
        params?: any[]
      ): Promise<TransactionResult> => {
        if (isFinalized) {
          throw new Error('Cannot execute on finalized transaction')
        }
        try {
          return this.executeSql(sql, params)
        } catch (err) {
          logger.error('SQL execution error:', err)
          throw err
        }
      },
      commit: () => {
        if (isFinalized) {
          throw new Error('Transaction already finalized')
        }
        this.db.exec('COMMIT')
        isFinalized = true
        return { rowsAffected: 0 }
      },
      rollback: () => {
        if (isFinalized) {
          throw new Error('Transaction already finalized')
        }
        this.db.exec('ROLLBACK')
        isFinalized = true
        isRolledBack = true
        return { rowsAffected: 0 }
      }
    }

    // Start transaction
    this.db.exec('BEGIN IMMEDIATE')

    try {
      await fn(txObject)

      // Auto-commit if not finalized
      if (!isFinalized) {
        txObject.commit()
      }
    } catch (err) {
      // Auto-rollback on error if not finalized
      if (!isFinalized) {
        try {
          txObject.rollback()
        } catch (rollbackErr) {
          logger.error('Rollback failed:', rollbackErr)
        }
      }
      throw err
    }
  }

  private async runReadTransaction(fn: (tx: Transaction) => Promise<void>) {
    const txObject: Transaction = {
      execute: async (
        sql: string,
        params?: any[]
      ): Promise<TransactionResult> => {
        try {
          return this.executeSql(sql, params)
        } catch (err) {
          logger.error('SQL execution error:', err)
          throw err
        }
      },
      commit: () => ({ rowsAffected: 0 }),
      rollback: () => ({ rowsAffected: 0 })
    }

    // For read-only operations, we don't need explicit transactions
    // but we run them in the queue to maintain order
    await fn(txObject)
  }

  async push(fn: (tx: Transaction) => Promise<void>) {
    return new Promise<void>((resolve, reject) => {
      this.queue.push({
        readonly: false,
        start: tx => {
          return fn(tx).then(resolve, reject)
        },
        finish: () => {}
      })
      this.run()
    })
  }

  async pushReadOnly(fn: (tx: Transaction) => Promise<void>) {
    return new Promise<void>((resolve, reject) => {
      this.queue.push({
        readonly: true,
        start: tx => {
          return fn(tx).then(resolve, reject)
        },
        finish: () => {}
      })
      this.run()
    })
  }
}
