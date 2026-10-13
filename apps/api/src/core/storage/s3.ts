import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from '../../config';
import type { StorageDriver } from './index';

/** S3-compatible object storage (AWS S3, Cloudflare R2, MinIO). */
export class S3Storage implements StorageDriver {
  private client: S3Client;
  private bucket: string;

  constructor() {
    if (!config.S3_BUCKET || !config.S3_PUBLIC_URL) {
      throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET and S3_PUBLIC_URL');
    }
    this.bucket = config.S3_BUCKET;
    this.client = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT,
      forcePathStyle: Boolean(config.S3_ENDPOINT),
      // S3-compatible stores (Supabase, B2, older MinIO) may reject the CRC32 checksum
      // headers newer SDKs add by default; only send checksums when an operation needs one.
      ...(config.S3_ENDPOINT && {
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      }),
      credentials:
        config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }

  async get(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  url(key: string) {
    return `${config.S3_PUBLIC_URL!.replace(/\/$/, '')}/${key}`;
  }
}
