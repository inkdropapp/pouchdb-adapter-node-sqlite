# pouchdb-adapter-node-sqlite

PouchDB adapter using better-sqlite3 for Electron and NodeJS applications.

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

- Uses better-sqlite3 for improved performance in Electron apps
- Compatible with PouchDB 9.x
- Supports all standard PouchDB operations
- Stores data in SQLite database files

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

