const Database = require('better-sqlite3')
const { TransactionQueue } = require('../lib/transactionQueue')

describe('test.pragmas.js-sqlite3', function () {
  var dbs = {}

  beforeEach(function () {
    dbs.name = testUtils.adapterUrl('sqlite3', 'testdb')
  })

  afterEach(function (done) {
    testUtils.cleanup([dbs.name], done)
  })

  it('opens the connection in WAL mode with synchronous NORMAL', function () {
    var raw = new Database(':memory:')
    try {
      new TransactionQueue(raw)
      // journal_mode reads back as "memory" for an in-memory database, so only
      // the per-connection synchronous level can be checked here
      raw.pragma('synchronous', { simple: true }).should.equal(1)
    } finally {
      raw.close()
    }
  })

  it('leaves the database file in WAL mode', function () {
    var db = new PouchDB(dbs.name)
    return db
      .put({ _id: 'doc' })
      .then(function () {
        return db.close()
      })
      .then(function () {
        var raw = new Database('tmp/' + dbs.name + '.sqlite')
        try {
          raw.pragma('journal_mode', { simple: true }).should.equal('wal')
        } finally {
          raw.close()
        }
      })
  })
})
