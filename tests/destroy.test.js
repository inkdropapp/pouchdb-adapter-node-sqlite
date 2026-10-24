const fs = require('node:fs')

describe('test.destroy.js-sqlite3', function () {
  var dbs = {}

  function files(name) {
    return ['', '-wal', '-shm'].map(
      suffix => 'tmp/' + name + '.sqlite' + suffix
    )
  }

  beforeEach(function () {
    dbs.name = testUtils.adapterUrl('sqlite3', 'testdb')
  })

  afterEach(function (done) {
    testUtils.cleanup([dbs.name], done)
  })

  it('removes the database files on destroy', async function () {
    var db = new PouchDB(dbs.name)
    await db.put({ _id: 'doc' })
    fs.existsSync(files(dbs.name)[0]).should.equal(true)

    await db.destroy()
    for (const file of files(dbs.name)) {
      fs.existsSync(file).should.equal(false, file)
    }
  })

  it('removes the files of a database opened by another instance', async function () {
    var db1 = new PouchDB(dbs.name)
    var db2 = new PouchDB(dbs.name)
    await db1.put({ _id: 'doc' })
    await db2.info()

    await db2.destroy()
    for (const file of files(dbs.name)) {
      fs.existsSync(file).should.equal(false, file)
    }
  })

  it('keeps the connection open while another instance uses it', async function () {
    var db1 = new PouchDB(dbs.name)
    var db2 = new PouchDB(dbs.name)
    await db1.put({ _id: 'doc' })

    await db1.close()
    const doc = await db2.get('doc')
    doc._id.should.equal('doc')
  })

  it('reopens a database once every instance has closed it', async function () {
    var db1 = new PouchDB(dbs.name)
    var db2 = new PouchDB(dbs.name)
    await db1.put({ _id: 'doc' })

    await db1.close()
    await db2.close()
    // closing twice must not release a newer instance's reference
    await db1.close().catch(() => {})

    var db3 = new PouchDB(dbs.name)
    var db4 = new PouchDB(dbs.name)
    await db3.close()
    const doc = await db4.get('doc')
    doc._id.should.equal('doc')
  })

  it('removes the view databases of a deleted design doc on viewCleanup', async function () {
    var db = new PouchDB(dbs.name)
    await db.put({ _id: 'doc', foo: 'bar' })
    const ddoc = await db.put({
      _id: '_design/index',
      views: { foo: { map: 'function (doc) { emit(doc.foo) }' } }
    })
    await db.query('index/foo')
    const viewFiles = () =>
      fs
        .readdirSync('tmp')
        .filter(name => name.startsWith(dbs.name + '-mrview-'))
    viewFiles().length.should.be.above(0)

    await db.remove('_design/index', ddoc.rev)
    await db.viewCleanup()
    viewFiles().should.deep.equal([])
  })

  it('starts empty when recreated after destroy', async function () {
    var db = new PouchDB(dbs.name)
    await db.put({ _id: 'doc' })
    await db.destroy()

    var recreated = new PouchDB(dbs.name)
    const info = await recreated.info()
    info.doc_count.should.equal(0)
  })

  it('rejects writes through another instance after destroy', async function () {
    var db1 = new PouchDB(dbs.name)
    var db2 = new PouchDB(dbs.name)
    await db1.info()
    await db2.destroy()

    await db1.put({ _id: 'doc' }).should.be.rejected
  })
})
