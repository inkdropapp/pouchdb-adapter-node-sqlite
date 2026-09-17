# pouchdb-adapter-node-sqlite

PouchDB adapter using the Node.js built-in `node:sqlite` module for Electron and NodeJS applications. No native addon to rebuild per Electron/Node ABI.

Requires Node.js 24.16 or later (Electron 43.7+). Earlier `node:sqlite` builds truncate TEXT values at the first NUL byte on read, which corrupts binary attachments.

## Installation

```bash
npm install pouchdb-adapter-sqlite3
```

## Usage

```javascript
const PouchDB = require('pouchdb')
const sqliteAdapter = require('pouchdb-adapter-node-sqlite')

// Register the adapter
PouchDB.plugin(sqliteAdapter)

// Create a database using the SQLite3 adapter
const db = new PouchDB('mydb', { adapter: 'sqlite3' })

// Use it like any other PouchDB instance
db.put({
  _id: 'mydoc',
  title: 'Hello SQLite'
})
  .then(() => {
    return db.get('mydoc')
  })
  .then(doc => {
    console.log(doc)
  })
```

## Features

- Uses the built-in `node:sqlite` module: zero native dependencies, nothing to rebuild for Electron
- Opens databases in WAL mode with `synchronous = NORMAL`
- Compatible with PouchDB 9.x
- Supports all standard PouchDB operations
- Stores data in SQLite database files

## Options

Besides the standard PouchDB options, any [`DatabaseSync` option](https://nodejs.org/api/sqlite.html#new-databasesyncpath-options) can be passed (e.g. `readOnly`, `timeout`). The busy timeout defaults to 5000 ms. The better-sqlite3 spellings `readonly` and `fileMustExist` are still accepted for backwards compatibility.

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test
```

## License

MIT

Copyright (c) 2025 Takuya Matsuyama, all rights reserved.
