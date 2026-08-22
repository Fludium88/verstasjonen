import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll } from 'vitest';

const previousDatabaseFile = process.env.VAERSTASJONEN_DB_FILE;
const isolatedDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vaerstasjonen-vitest-'));
process.env.VAERSTASJONEN_DB_FILE = path.join(isolatedDataDir, 'database.json');

afterAll(async () => {
  // Cancel the database singleton's delayed save before removing its temp area.
  const { resetDbForTests } = await import('../src/lib/db');
  resetDbForTests();
  fs.rmSync(isolatedDataDir, { recursive: true, force: true });

  if (previousDatabaseFile === undefined) {
    delete process.env.VAERSTASJONEN_DB_FILE;
  } else {
    process.env.VAERSTASJONEN_DB_FILE = previousDatabaseFile;
  }
});

