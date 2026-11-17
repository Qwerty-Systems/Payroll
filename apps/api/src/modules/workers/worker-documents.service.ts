import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantTransactionService } from '../../database/tenant-transaction.service';
import { ObjectStorageService } from '../storage/object-storage.service';

const DOCUMENT_TYPES = new Set(['identity','contract','tax','bank','qualification','other']);
type UploadFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };

@Injectable()
export class WorkerDocumentsService {
  constructor(
    private readonly tenantDb: TenantTransactionService,
    private readonly storage: ObjectStorageService,
  ) {}

  private validateFile(file: UploadFile): void {
    if (!file?.buffer || !Buffer.isBuffer(file.buffer) || file.size < 1 || file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('Choose a file between 1 byte and 10 MB.');
    }
    const b = file.buffer;
    const valid =
      (file.mimetype === 'application/pdf' && b.subarray(0,5).toString() === '%PDF-') ||
      (file.mimetype === 'image/jpeg' && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
      (file.mimetype === 'image/png' && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ||
      (file.mimetype === 'image/webp' && b.subarray(0,4).toString() === 'RIFF' && b.subarray(8,12).toString() === 'WEBP');
    if (!valid) throw new BadRequestException('File content does not match an accepted PDF, JPEG, PNG or WebP type.');
  }

  async list(tenantId: string, workerId: string) {
    return this.tenantDb.run(tenantId, async m => {
      const worker = await m.query('SELECT id FROM workers WHERE tenant_id=$1 AND id=$2', [tenantId,workerId]);
      if (!worker.length) throw new NotFoundException('Worker not found.');
      return m.query(
        'SELECT id,worker_id AS "workerId",document_type AS "documentType",original_name AS "originalName",content_type AS "contentType",size_bytes AS "sizeBytes",uploaded_by AS "uploadedBy",created_at AS "createdAt" FROM worker_documents WHERE tenant_id=$1 AND worker_id=$2 ORDER BY created_at DESC',
        [tenantId,workerId],
      );
    });
  }

  async upload(tenantId: string, actorId: string, workerId: string, documentType: string, file: UploadFile) {
    if (!DOCUMENT_TYPES.has(documentType)) throw new BadRequestException('Select a valid worker document type.');
    this.validateFile(file);
    const name = file.originalname.split(/[\\/]/).pop()?.replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,180);
    if (!name) throw new BadRequestException('The uploaded file must have a valid filename.');
    const worker = await this.tenantDb.run(tenantId, async m => {
      const rows = await m.query('SELECT id FROM workers WHERE tenant_id=$1 AND id=$2', [tenantId,workerId]);
      if (!rows.length) throw new NotFoundException('Worker not found.');
      return rows[0];
    });
    const stored = await this.storage.putPrivateObject({
      body: file.buffer, contentType: file.mimetype, tenantId, folder: 'worker-documents',
    });
    try {
      return await this.tenantDb.run(tenantId, async m => {
        const rows = await m.query(
          'INSERT INTO worker_documents(tenant_id,worker_id,document_type,original_name,content_type,object_key,size_bytes,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,worker_id AS "workerId",document_type AS "documentType",original_name AS "originalName",content_type AS "contentType",size_bytes AS "sizeBytes",created_at AS "createdAt"',
          [tenantId,worker.id,documentType,name,file.mimetype,stored.key,stored.size,actorId],
        );
        await m.query(
          "INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'worker.document.uploaded','worker_document',$3,$4::jsonb)",
          [tenantId,actorId,rows[0].id,JSON.stringify({workerId,documentType,contentType:file.mimetype,sizeBytes:stored.size})],
        );
        return rows[0];
      });
    } catch (error) {
      await this.storage.deletePrivateObject(stored.key).catch(() => undefined);
      throw error;
    }
  }

  async createDownloadUrl(tenantId: string, workerId: string, documentId: string) {
    const rows = await this.tenantDb.run(tenantId, async m => m.query(
      'SELECT object_key AS "objectKey",original_name AS "originalName" FROM worker_documents WHERE tenant_id=$1 AND worker_id=$2 AND id=$3',
      [tenantId,workerId,documentId],
    ));
    if (!rows.length) throw new NotFoundException('Worker document not found.');
    return { url: await this.storage.createPrivateDownloadUrl(rows[0].objectKey, 180), fileName: rows[0].originalName, expiresIn: 180 };
  }
}
