const chai = (global.chai = require('chai'))
chaiAsPromised = require('chai-as-promised')
global.should = chai.should()
global.assert = chai.assert

const PouchDB = require('pouchdb-core')
const HttpPouch = require('pouchdb-adapter-http')
const mapreduce = require('pouchdb-mapreduce')
const replication = require('pouchdb-replication')

PouchDB.plugin(HttpPouch).plugin(mapreduce).plugin(replication)

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

global.testUtils = require('./utils')
