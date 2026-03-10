import path from 'node:path';
import sharp from 'sharp';

export interface ThumbnailOptions {
  size: number;
  format: 'webp' | 'png' | 'jpeg';
  quality: number;
}

export interface ThumbnailResult {
  filename: string;
  width: number;
  height: number;
  format: 'webp' | 'png' | 'jpeg';
}

export class ThumbnailService {
  public async createThumbnail(assetDir: string, originalPath: string, options: ThumbnailOptions): Promise<ThumbnailResult> {
    const filename = `thumbnail.${options.format === 'jpeg' ? 'jpg' : options.format}`;
    const targetPath = path.join(assetDir, filename);

    const transformer = sharp(originalPath).resize(options.size, options.size, {
      fit: 'cover',
      position: 'centre'
    });

    if (options.format === 'png') {
      await transformer.png({ quality: options.quality }).toFile(targetPath);
    } else if (options.format === 'jpeg') {
      await transformer.jpeg({ quality: options.quality }).toFile(targetPath);
    } else {
      await transformer.webp({ quality: options.quality }).toFile(targetPath);
    }

    const metadata = await sharp(targetPath).metadata();
    return {
      filename,
      width: metadata.width ?? options.size,
      height: metadata.height ?? options.size,
      format: options.format
    };
  }
}
