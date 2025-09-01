const chai = (global.chai = require('chai'))
chaiAsPromised = require('chai-as-promised')
global.should = chai.should()
global.assert = chai.assert
const PouchDB = require('pouchdb')
global.testUtils = require('./utils')

chai.use(chaiAsPromised.default)

// Register the SQLite3 adapter
const SQLite3Adapter = require('../lib/index').default
PouchDB.plugin(SQLite3Adapter)
global.PouchDB = PouchDB.defaults({
  adapter: 'sqlite3',
  prefix: 'tmp/'
})

const debug = require('debug')
debug.enable('pouch-sqlite:*')
