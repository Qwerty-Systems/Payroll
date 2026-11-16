import { Injectable, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

const ALLOWED_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

@Injectable()
export class ObjectStorageService {
  private readonly bucket = process.env.SEAWEEDFS_BUCKET ?? process.env.S3_BUCKET ?? '';
  private readonly client?: S3Client;

  constructor() {
    const endpointHost = process.env.SEAWEEDFS_ENDPOINT;
    const endpoint = process.env.S3_ENDPOINT ?? (endpointHost
      ? `${process.env.SEAWEEDFS_USE_SSL === 'true' ? 'https' : 'http'}://${endpointHost}:${process.env.SEAWEEDFS_PORT ?? 8333}`
      : undefined);
    const accessKeyId = process.env.SEAWEEDFS_ACCESS_KEY ?? process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.SEAWEEDFS_SECRET_KEY ?? process.env.S3_SECRET_ACCESS_KEY;
    if (endpoint && accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        endpoint,
        region: process.env.S3_REGION ?? 'us-east-1',
        forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
        credentials: { accessKeyId, secretAccessKey },
        requestChecksumCalculation: 'WHEN_REQUIRED',
      });
    }
  }

  isConfigured(): boolean { return Boolean(this.client && this.bucket); }

  async check(): Promise<'connected' | 'not_configured'> {
    if (!this.client || !this.bucket) return 'not_configured';
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return 'connected';
    } catch {
      throw new ServiceUnavailableException('Object storage is unavailable.');
    }
  }

  async putPrivateObject(input: { body: Buffer; contentType: string; tenantId: string; folder: string }): Promise<{ key: string; size: number }> {
    if (!this.client || !this.bucket) throw new ServiceUnavailableException('Object storage is not configured.');
    if (!ALLOWED_TYPES.has(input.contentType)) throw new BadRequestException('Unsupported file type.');
    if (!Buffer.isBuffer(input.body) || input.body.length === 0 || input.body.length > 10 * 1024 * 1024) {
      throw new BadRequestException('File must be between 1 byte and 10 MB.');
    }
    if (!/^[0-9a-f-]{36}$/i.test(input.tenantId) || !/^[a-z0-9-]{1,40}$/i.test(input.folder)) {
      throw new BadRequestException('Invalid storage scope.');
    }
    const key = `private/tenants/${input.tenantId}/${input.folder}/${randomUUID()}`;
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: input.body,
      ContentType: input.contentType, ContentLength: input.body.length,
      Metadata: { tenantid: input.tenantId },
    }));
    return { key, size: input.body.length };
  }

  async createPrivateDownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
    if (!this.client || !this.bucket) throw new ServiceUnavailableException('Object storage is not configured.');
    if (!key.startsWith('private/tenants/') || key.includes('..')) throw new BadRequestException('Invalid private object key.');
    const ttl = Math.min(Math.max(expiresInSeconds, 30), 900);
    return getSignedUrl(this.client, new GetObjectCommand({
      Bucket: this.bucket, Key: key,
    }), { expiresIn: ttl });
  }

  async deletePrivateObject(key: string): Promise<void> {
    if (!this.client || !this.bucket) throw new ServiceUnavailableException('Object storage is not configured.');
    if (!key.startsWith('private/tenants/') || key.includes('..')) throw new BadRequestException('Invalid private object key.');
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
