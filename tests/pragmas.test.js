const { DatabaseSync } = require('node:sqlite')
const { TransactionQueue } = require('../lib/transactionQueue')

function pragma(db, name) {
  const row = db.prepare('PRAGMA ' + name).get()
  return row[name]
}

describe('test.pragmas.js-sqlite3', function () {
  var dbs = {}

  beforeEach(function () {
    dbs.name = testUtils.adapterUrl('sqlite3', 'testdb')
  })

  afterEach(function (done) {
    testUtils.cleanup([dbs.name], done)
  })

  it('opens the connection in WAL mode with synchronous NORMAL', function () {
    var raw = new DatabaseSync(':memory:')
    try {
      new TransactionQueue(raw)
      // journal_mode reads back as "memory" for an in-memory database, so only
      // the per-connection synchronous level can be checked here
      pragma(raw, 'synchronous').should.equal(1)
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
        var raw = new DatabaseSync('tmp/' + dbs.name + '.sqlite')
        try {
          pragma(raw, 'journal_mode').should.equal('wal')
        } finally {
          raw.close()
        }
      })
  })
})
