import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const DATA_DIR = path.resolve('data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const emptyDb = { users: [], chats: [], messages: [], files: [] };

export async function ensureDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(DB_FILE); }
  catch {
    const admin = {
      id: randomUUID(),
      name: 'NOVA Admin',
      email: 'admin@nova.local',
      passwordHash: await bcrypt.hash('Admin@12345', 12),
      accountType: 'admin',
      studentId: '',
      role: 'admin',
      createdAt: new Date().toISOString()
    };
    await writeDb({ ...emptyDb, users: [admin] });
  }
}

export async function readDb() {
  try {
    return JSON.parse(await fs.readFile(DB_FILE, 'utf8'));
  } catch {
    await ensureDb();
    return JSON.parse(await fs.readFile(DB_FILE, 'utf8'));
  }
}

export async function writeDb(db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
  await fs.rename(tmp, DB_FILE);
}
