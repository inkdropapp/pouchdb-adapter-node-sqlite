const chai = (global.chai = require('chai'))
chaiAsPromised = require('chai-as-promised')
global.should = chai.should()
global.assert = chai.assert
const PouchDB = (global.PouchDB = require('pouchdb'))
global.testUtils = require('./utils')

chai.use(chaiAsPromised.default)

// Register the SQLite3 adapter
const SQLite3Adapter = require('../lib/index')
PouchDB.plugin(SQLite3Adapter)
