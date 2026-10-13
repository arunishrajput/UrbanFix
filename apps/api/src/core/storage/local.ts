import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config';
import type { StorageDriver } from './index';

/** Stores files on local disk; the API serves them from /uploads. */
export class LocalStorage implements StorageDriver {
  private resolve(key: string) {
    const full = path.resolve(config.UPLOAD_DIR, key);
    if (!full.startsWith(path.resolve(config.UPLOAD_DIR) + path.sep)) throw new Error('invalid storage key');
    return full;
  }

  async put(key: string, body: Buffer) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }

  get(key: string) {
    return readFile(this.resolve(key));
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }

  url(key: string) {
    return `${config.PUBLIC_API_URL}/uploads/${key}`;
  }
}
