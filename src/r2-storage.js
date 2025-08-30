const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const path = require('path');

class R2Storage {
    constructor() {
        this.client = new S3Client({
            region: 'auto',
            endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
                secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
            },
        });
        this.bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'timal-media';
    }

    /**
     * Upload a file to R2 storage
     * @param {Buffer} fileBuffer - File data as buffer
     * @param {string} originalFilename - Original filename
     * @param {string} mimeType - File MIME type
     * @param {number} userId - User ID for organizing files
     * @returns {Promise<{key: string, url: string, size: number}>}
     */
    async uploadFile(fileBuffer, originalFilename, mimeType, userId) {
        try {
            // Generate unique filename
            const timestamp = Date.now();
            const randomId = crypto.randomBytes(8).toString('hex');
            const extension = path.extname(originalFilename);
            const sanitizedName = path.basename(originalFilename, extension)
                .replace(/[^a-zA-Z0-9-_]/g, '_')
                .substring(0, 50);
            
            const key = `users/${userId}/${timestamp}_${randomId}_${sanitizedName}${extension}`;
            
            // Upload to R2
            const command = new PutObjectCommand({
                Bucket: this.bucketName,
                Key: key,
                Body: fileBuffer,
                ContentType: mimeType,
                Metadata: {
                    originalFilename: originalFilename,
                    uploadedBy: userId.toString(),
                    uploadedAt: new Date().toISOString()
                }
            });

            const result = await this.client.send(command);
            
            // Generate public URL (R2 supports public URLs if bucket is public)
            const publicUrl = `https://pub-${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.dev/${key}`;
            
            return {
                key: key,
                url: publicUrl,
                size: fileBuffer.length,
                etag: result.ETag
            };
        } catch (error) {
            console.error('R2 upload error:', error);
            throw new Error(`Failed to upload file: ${error.message}`);
        }
    }

    /**
     * Generate a signed URL for private file access
     * @param {string} key - R2 object key
     * @param {number} expiresIn - URL expiration in seconds (default: 1 hour)
     * @returns {Promise<string>} Signed URL
     */
    async getSignedUrl(key, expiresIn = 3600) {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            });

            const signedUrl = await getSignedUrl(this.client, command, { expiresIn });
            return signedUrl;
        } catch (error) {
            console.error('R2 signed URL error:', error);
            throw new Error(`Failed to generate signed URL: ${error.message}`);
        }
    }

    /**
     * Delete a file from R2 storage
     * @param {string} key - R2 object key
     * @returns {Promise<boolean>} Success status
     */
    async deleteFile(key) {
        try {
            const command = new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            });

            await this.client.send(command);
            return true;
        } catch (error) {
            console.error('R2 delete error:', error);
            throw new Error(`Failed to delete file: ${error.message}`);
        }
    }

    /**
     * Get file metadata without downloading
     * @param {string} key - R2 object key
     * @returns {Promise<object>} File metadata
     */
    async getFileMetadata(key) {
        try {
            const command = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            });

            // This will get metadata without downloading the file body
            const response = await this.client.send(command);
            
            return {
                contentType: response.ContentType,
                contentLength: response.ContentLength,
                lastModified: response.LastModified,
                etag: response.ETag,
                metadata: response.Metadata
            };
        } catch (error) {
            console.error('R2 metadata error:', error);
            throw new Error(`Failed to get file metadata: ${error.message}`);
        }
    }

    // Note: Storage quota checking moved to MediaHandler class
    // R2Storage now focuses purely on file operations
}

module.exports = R2Storage;
