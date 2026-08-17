const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'radiocalico.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const dbExisted = fs.existsSync(DB_PATH);
const db = new sqlite3.Database(DB_PATH);

if (!dbExisted) {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema, (err) => {
    if (err) throw err;
  });
}

module.exports = db;
