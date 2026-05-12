// asentum-indexer · SQLite schema, migrations, and query helpers.
//
// milkie · 2026

import Database from 'better-sqlite3';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

export function openDb(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS txs (
      hash TEXT PRIMARY KEY,
      block_number INTEGER NOT NULL,
      block_hash TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      from_addr TEXT NOT NULL,
      to_addr TEXT,
      value TEXT NOT NULL,
      gas_used INTEGER,
      status INTEGER,
      has_input INTEGER NOT NULL DEFAULT 0,
      contract_created TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_txs_block ON txs(block_number DESC);

    CREATE TABLE IF NOT EXISTS address_txs (
      address TEXT NOT NULL,
      tx_hash TEXT NOT NULL,
      block_number INTEGER NOT NULL,
      role TEXT NOT NULL,
      PRIMARY KEY (address, tx_hash, role)
    );
    CREATE INDEX IF NOT EXISTS idx_addr_block ON address_txs(address, block_number DESC);

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export function getMeta(db, key) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setMeta(db, key, value) {
  db.prepare(
    'INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, String(value));
}

export function insertBlockTxs(db, block, receipts) {
  // Atomic. All txs for one block commit in a single SQLite transaction.
  const insertTx = db.prepare(`
    INSERT OR REPLACE INTO txs
      (hash, block_number, block_hash, timestamp, from_addr, to_addr, value, gas_used, status, has_input, contract_created)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertAddrTx = db.prepare(`
    INSERT OR IGNORE INTO address_txs (address, tx_hash, block_number, role)
    VALUES (?, ?, ?, ?)
  `);

  const blockNum = parseInt(block.number, 16);
  const timestamp = parseInt(block.timestamp, 16);

  const trx = db.transaction(() => {
    for (const tx of block.transactions || []) {
      const receipt = receipts[tx.hash.toLowerCase()] || null;
      const status = receipt ? parseInt(receipt.status, 16) : null;
      const gasUsed = receipt?.gasUsed ? parseInt(receipt.gasUsed, 16) : null;
      const contractCreated = receipt?.contractAddress
        ? receipt.contractAddress.toLowerCase()
        : null;
      const fromAddr = tx.from.toLowerCase();
      const toAddr = tx.to ? tx.to.toLowerCase() : null;
      const value = BigInt(tx.value || '0x0').toString(10);
      const hasInput = tx.input && tx.input !== '0x' ? 1 : 0;

      insertTx.run(
        tx.hash.toLowerCase(),
        blockNum,
        block.hash.toLowerCase(),
        timestamp,
        fromAddr,
        toAddr,
        value,
        gasUsed,
        status,
        hasInput,
        contractCreated,
      );

      insertAddrTx.run(fromAddr, tx.hash.toLowerCase(), blockNum, 'from');
      if (toAddr) insertAddrTx.run(toAddr, tx.hash.toLowerCase(), blockNum, 'to');
      if (contractCreated) {
        insertAddrTx.run(contractCreated, tx.hash.toLowerCase(), blockNum, 'created');
      }
    }
  });
  trx();
}

export function txsForAddress(db, address, { page = 1, size = 25, role = null } = {}) {
  const addr = address.toLowerCase();
  const offset = (Math.max(1, page) - 1) * size;
  const where = role ? 'WHERE at.address = ? AND at.role = ?' : 'WHERE at.address = ?';
  const params = role ? [addr, role, size, offset] : [addr, size, offset];

  const rows = db.prepare(`
    SELECT t.*, at.role
    FROM address_txs at
    JOIN txs t ON t.hash = at.tx_hash
    ${where}
    ORDER BY at.block_number DESC, t.hash DESC
    LIMIT ? OFFSET ?
  `).all(...params);

  const totalRow = db.prepare(`
    SELECT COUNT(*) AS n FROM address_txs at ${where}
  `).get(...(role ? [addr, role] : [addr]));

  return { rows, total: totalRow.n, page, size };
}

export function statsForAddress(db, address) {
  const addr = address.toLowerCase();
  const sent = db.prepare(
    'SELECT COUNT(*) AS n FROM address_txs WHERE address = ? AND role = ?'
  ).get(addr, 'from').n;
  const received = db.prepare(
    'SELECT COUNT(*) AS n FROM address_txs WHERE address = ? AND role = ?'
  ).get(addr, 'to').n;
  const created = db.prepare(
    'SELECT COUNT(*) AS n FROM address_txs WHERE address = ? AND role = ?'
  ).get(addr, 'created').n;
  return { sent, received, contractsCreated: created };
}

export function indexHealth(db) {
  const lastIndexed = parseInt(getMeta(db, 'last_indexed_block') || '-1', 10);
  const totalTxs = db.prepare('SELECT COUNT(*) AS n FROM txs').get().n;
  const distinctAddresses = db.prepare(
    'SELECT COUNT(DISTINCT address) AS n FROM address_txs'
  ).get().n;
  return { lastIndexedBlock: lastIndexed, totalTxs, distinctAddresses };
}
