import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

export interface StorageConfig {
  type: 'local' | 's3';
  localPath?: string;
  s3Bucket?: string;
  s3Region?: string;
}

export interface UploadResult {
  storagePath: string;
  publicUrl?: string;
}

export class StorageService {
  private config: StorageConfig;

  constructor(config: StorageConfig) {
    this.config = config;
  }

  async uploadFile(buffer: Buffer, filename: string, _mimeType: string): Promise<UploadResult> {
    const uniqueFilename = `${randomUUID()}-${filename}`;

    if (this.config.type === 's3' && this.config.s3Bucket) {
      const key = `documents/${uniqueFilename}`;

      return {
        storagePath: key,
        publicUrl: `https://${this.config.s3Bucket}.s3.amazonaws.com/${key}`,
      };
    }

    const localDir = this.config.localPath || './uploads/documents';
    try {
      await fs.mkdir(localDir, { recursive: true });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'EEXIST') {
        throw new Error(`Failed to create storage directory: ${err.message}`);
      }
    }

    const filePath = path.join(localDir, uniqueFilename);
    await fs.writeFile(filePath, buffer);

    return {
      storagePath: filePath,
    };
  }

  async getFile(storagePath: string): Promise<Buffer> {
    if (this.config.type === 's3' && this.config.s3Bucket) {
      throw new Error('S3 storage not yet implemented');
    }

    return fs.readFile(storagePath);
  }

  async deleteFile(storagePath: string): Promise<void> {
    if (this.config.type === 's3' && this.config.s3Bucket) {
      throw new Error('S3 storage not yet implemented');
    }

    try {
      await fs.unlink(storagePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  getSignedDownloadUrl(storagePath: string, _expiresIn = 3600): Promise<string> {
    if (this.config.type === 's3' && this.config.s3Bucket) {
      return Promise.reject(new Error('S3 storage not yet implemented'));
    }

    return Promise.resolve(storagePath);
  }
}
