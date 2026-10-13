import { config } from '../../config';
import { LocalStorage } from './local';
import { S3Storage } from './s3';

export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** Public URL for a stored object. */
  url(key: string): string;
}

export const storage: StorageDriver = config.STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage();
