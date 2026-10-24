const { DatabaseSync } = require('node:sqlite')
const { TransactionQueue } = require('../lib/transactionQueue')

describe('test.transaction_queue.js', function () {
  var db, queue

  beforeEach(function () {
    db = new DatabaseSync(':memory:')
    queue = new TransactionQueue(db)
    db.exec('CREATE TABLE t (v INTEGER)')
  })

  afterEach(function () {
    if (db.isOpen) db.close()
  })

  function count() {
    return db.prepare('SELECT COUNT(*) AS n FROM t').get().n
  }

  it('resolves after the transaction is committed', async function () {
    await queue.push(async tx => {
      await tx.execute('INSERT INTO t VALUES (1)')
    })
    db.isTransaction.should.equal(false)
    count().should.equal(1)
  })

  it('rolls back and rejects when the callback throws', async function () {
    await queue
      .push(async tx => {
        await tx.execute('INSERT INTO t VALUES (1)')
        throw new Error('deliberate')
      })
      .should.be.rejectedWith('deliberate')
    count().should.equal(0)
  })

  it('rejects instead of hanging when the connection is closed', async function () {
    db.close()
    await queue.push(async () => {}).should.be.rejected
    await queue.pushReadOnly(async tx => {
      await tx.execute('SELECT 1')
    }).should.be.rejected
  })

  it('keeps running the queue after a failed transaction', async function () {
    const failed = queue.push(async () => {
      throw new Error('deliberate')
    })
    const next = queue.push(async tx => {
      await tx.execute('INSERT INTO t VALUES (1)')
    })
    await failed.should.be.rejected
    await next
    count().should.equal(1)
  })
})
