const R2Storage = require('./r2-storage');
const sharp = require('sharp'); // For image processing
const path = require('path');

class MediaHandler {
    constructor(database) {
        this.r2 = new R2Storage();
        this.db = database;
        
        // Supported file types
        this.supportedImages = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
        this.supportedVideos = ['.mp4', '.webm', '.mov', '.avi'];
        this.maxFileSizeMB = {
            image: 10, // 10MB max for images
            video: 100 // 100MB max for videos
        };
    }

    /**
     * Process and upload media file
     * @param {Buffer} fileBuffer - File data
     * @param {string} originalFilename - Original filename
     * @param {string} mimeType - MIME type
     * @param {number} userId - User ID
     * @param {number} entryId - Timeline entry ID
     * @returns {Promise<object>} Upload result
     */
    async processAndUpload(fileBuffer, originalFilename, mimeType, userId, entryId) {
        try {
            const extension = path.extname(originalFilename).toLowerCase();
            const fileSizeMB = fileBuffer.length / (1024 * 1024);
            
            // Determine media type
            let mediaType;
            if (this.supportedImages.includes(extension)) {
                mediaType = 'image';
            } else if (this.supportedVideos.includes(extension)) {
                mediaType = 'video';
            } else {
                throw new Error(`Unsupported file type: ${extension}`);
            }
            
            // Check file size limits
            if (fileSizeMB > this.maxFileSizeMB[mediaType]) {
                throw new Error(`File too large. Max size for ${mediaType}: ${this.maxFileSizeMB[mediaType]}MB`);
            }
            
            // Get user info and check media upload permission
            const user = await this.db.getUserById(userId);
            if (!user) throw new Error('User not found');
            
            const permission = this.checkMediaUploadPermission(userId, fileSizeMB, user.tier, user.storage_used_mb);
            if (!permission.allowed) {
                throw new Error(permission.reason);
            }
            
            let processedBuffer = fileBuffer;
            let dimensions = {};
            let thumbnailKey = null;
            
            // Process images
            if (mediaType === 'image') {
                const result = await this.processImage(fileBuffer);
                processedBuffer = result.buffer;
                dimensions = result.dimensions;
            }
            
            // Process videos (generate thumbnail)
            if (mediaType === 'video') {
                dimensions = await this.getVideoDimensions(fileBuffer);
                // TODO: Generate video thumbnail using FFmpeg
                // thumbnailKey = await this.generateVideoThumbnail(fileBuffer, userId);
            }
            
            // Upload to R2
            const uploadResult = await this.r2.uploadFile(
                processedBuffer,
                originalFilename,
                mimeType,
                userId
            );
            
            // Save to database
            const mediaId = await this.db.createMediaAttachment({
                entry_id: entryId,
                media_type: mediaType,
                filename: path.basename(uploadResult.key),
                original_filename: originalFilename,
                file_size_mb: uploadResult.size / (1024 * 1024),
                r2_key: uploadResult.key,
                thumbnail_r2_key: thumbnailKey,
                width: dimensions.width,
                height: dimensions.height,
                duration: dimensions.duration || null
            });
            
            // Update user storage usage
            await this.db.updateUserStorageUsage(userId, user.storage_used_mb + (uploadResult.size / (1024 * 1024)));
            
            return {
                id: mediaId,
                url: uploadResult.url,
                mediaType,
                dimensions,
                fileSize: uploadResult.size
            };
            
        } catch (error) {
            console.error('Media processing error:', error);
            throw error;
        }
    }

    /**
     * Process image: optimize, resize if needed
     * @param {Buffer} imageBuffer - Original image buffer
     * @returns {Promise<{buffer: Buffer, dimensions: object}>}
     */
    async processImage(imageBuffer) {
        try {
            const image = sharp(imageBuffer);
            const metadata = await image.metadata();
            
            // Resize if too large (max 2048px on longest side)
            const maxDimension = 2048;
            let resizeOptions = {};
            
            if (metadata.width > maxDimension || metadata.height > maxDimension) {
                resizeOptions = {
                    width: metadata.width > metadata.height ? maxDimension : null,
                    height: metadata.height > metadata.width ? maxDimension : null,
                    withoutEnlargement: true
                };
            }
            
            // Process image: resize, optimize quality
            const processedBuffer = await image
                .resize(resizeOptions)
                .jpeg({ quality: 85, progressive: true }) // Convert to JPEG for smaller size
                .toBuffer();
            
            const finalMetadata = await sharp(processedBuffer).metadata();
            
            return {
                buffer: processedBuffer,
                dimensions: {
                    width: finalMetadata.width,
                    height: finalMetadata.height
                }
            };
        } catch (error) {
            console.error('Image processing error:', error);
            throw new Error('Failed to process image');
        }
    }

    /**
     * Get video dimensions (placeholder - would use FFmpeg in production)
     * @param {Buffer} videoBuffer - Video buffer
     * @returns {Promise<object>} Video dimensions
     */
    async getVideoDimensions(videoBuffer) {
        // TODO: Implement with FFmpeg
        // For now, return placeholder dimensions
        return {
            width: 1920,
            height: 1080,
            duration: 60 // seconds
        };
    }

    /**
     * Delete media file and update user storage
     * @param {number} mediaId - Media attachment ID
     * @param {number} userId - User ID
     * @returns {Promise<boolean>}
     */
    async deleteMedia(mediaId, userId) {
        try {
            // Get media info
            const media = await this.db.getMediaAttachment(mediaId);
            if (!media || media.entry.user_id !== userId) {
                throw new Error('Media not found or access denied');
            }
            
            // Delete from R2
            await this.r2.deleteFile(media.r2_key);
            if (media.thumbnail_r2_key) {
                await this.r2.deleteFile(media.thumbnail_r2_key);
            }
            
            // Delete from database
            await this.db.deleteMediaAttachment(mediaId);
            
            // Update user storage usage
            const user = await this.db.getUserById(userId);
            await this.db.updateUserStorageUsage(userId, user.storage_used_mb - media.file_size_mb);
            
            return true;
        } catch (error) {
            console.error('Media deletion error:', error);
            throw error;
        }
    }

    /**
     * Get media URL (signed URL for private access)
     * @param {number} mediaId - Media attachment ID
     * @param {number} userId - User ID
     * @returns {Promise<string>} Media URL
     */
    async getMediaUrl(mediaId, userId) {
        try {
            const media = await this.db.getMediaAttachment(mediaId);
            if (!media || media.entry.user_id !== userId) {
                throw new Error('Media not found or access denied');
            }
            
            // For public buckets, return direct URL
            // For private buckets, return signed URL
            return await this.r2.getSignedUrl(media.r2_key);
        } catch (error) {
            console.error('Get media URL error:', error);
            throw error;
        }
    }
}

module.exports = MediaHandler;
