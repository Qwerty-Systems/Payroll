import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Post, Req, UploadedFile, UseInterceptors, Body } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { TenantPermissions } from '../auth/tenant-access.decorator';
import { WorkerDocumentsService } from './worker-documents.service';

type TenantRequest = Request & { tenant: { id: string; userId: string } };
type UploadedWorkerFile = { buffer: Buffer; originalname: string; mimetype: string; size: number };

@Controller('tenant/workers/:workerId/documents')
export class WorkerDocumentsController {
  constructor(private readonly documents: WorkerDocumentsService) {}

  @Get()
  @TenantPermissions('workers.read')
  list(@Req() req: TenantRequest, @Param('workerId',ParseUUIDPipe) workerId: string) {
    return this.documents.list(req.tenant.id,workerId);
  }

  @Post()
  @TenantPermissions('workers.manage')
  @UseInterceptors(FileInterceptor('file',{ limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: (_req,file,callback) => {
    const allowed = ['application/pdf','image/jpeg','image/png','image/webp'];
    callback(allowed.includes(file.mimetype) ? null : new BadRequestException('Only PDF, JPEG, PNG and WebP files are accepted.'),allowed.includes(file.mimetype));
  }}))
  upload(
    @Req() req: TenantRequest,
    @Param('workerId',ParseUUIDPipe) workerId: string,
    @UploadedFile() file: UploadedWorkerFile | undefined,
    @Body('documentType') documentType: string,
  ) {
    if (!file) throw new BadRequestException('Attach a document file.');
    return this.documents.upload(req.tenant.id,req.tenant.userId,workerId,documentType,file);
  }

  @Get(':documentId/download')
  @TenantPermissions('workers.read')
  download(
    @Req() req: TenantRequest,
    @Param('workerId',ParseUUIDPipe) workerId: string,
    @Param('documentId',ParseUUIDPipe) documentId: string,
  ) {
    return this.documents.createDownloadUrl(req.tenant.id,workerId,documentId);
  }
}
