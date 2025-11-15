/**
 * Receipt image handling service
 * Handles uploading, compressing, and managing receipt images in Supabase Storage
 */

import { supabase } from './supabaseClient';
import { logger } from './logging';

const STORAGE_BUCKET = 'receipts';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

/**
 * Compresses an image file to reduce storage size
 */
async function compressImage(file: File, maxWidth: number = 1200, quality: number = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Impossible de créer le contexte canvas'));
      return;
    }

    img.onload = () => {
      // Calculate new dimensions
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      // Draw and compress
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Échec de la compression de l\'image'));
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => reject(new Error('Échec du chargement de l\'image'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Generates a unique filename for a receipt
 */
function generateReceiptFilename(userId: string, expenseId: string, extension: string): string {
  const timestamp = Date.now();
  return `${userId}/${expenseId}_${timestamp}.${extension}`;
}

/**
 * Validates a file for upload
 */
function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `Le fichier est trop volumineux. Taille maximale: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'Type de fichier non autorisé. Utilisez JPEG, PNG ou WebP.',
    };
  }

  return { valid: true };
}

export const receiptService = {
  /**
   * Uploads a receipt image to Supabase Storage
   * Returns the public URL of the uploaded image
   */
  async uploadReceipt(file: File, expenseId: string): Promise<string> {
    try {
      // Get current user
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error('Utilisateur non connecté');
      }

      const userId = session.user.id;

      // Validate file
      const validation = validateFile(file);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      logger.info('Uploading receipt', {
        expenseId,
        fileSize: file.size,
        fileType: file.type,
      });

      // Compress image
      const compressedBlob = await compressImage(file);
      const compressedFile = new File([compressedBlob], file.name, {
        type: 'image/jpeg',
      });

      logger.info('Image compressed', {
        originalSize: file.size,
        compressedSize: compressedFile.size,
        compressionRatio: ((1 - compressedFile.size / file.size) * 100).toFixed(1) + '%',
      });

      // Generate filename
      const extension = 'jpg'; // Always save as JPEG after compression
      const filename = generateReceiptFilename(userId, expenseId, extension);

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filename, compressedFile, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (error) {
        logger.error('Receipt upload failed', { error: error.message }, error);
        throw new Error(`Échec de l'upload: ${error.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(filename);

      logger.info('Receipt uploaded successfully', {
        expenseId,
        path: data.path,
        url: urlData.publicUrl,
      });

      return urlData.publicUrl;
    } catch (error) {
      logger.error('Receipt upload error', {}, error);
      throw error;
    }
  },

  /**
   * Deletes a receipt image from storage
   */
  async deleteReceipt(imageUrl: string): Promise<void> {
    try {
      // Extract path from URL
      const url = new URL(imageUrl);
      const pathParts = url.pathname.split(`/${STORAGE_BUCKET}/`);
      if (pathParts.length < 2) {
        throw new Error('URL de reçu invalide');
      }

      const filePath = pathParts[1];

      logger.info('Deleting receipt', { path: filePath });

      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([filePath]);

      if (error) {
        logger.error('Receipt deletion failed', { error: error.message }, error);
        throw new Error(`Échec de la suppression: ${error.message}`);
      }

      logger.info('Receipt deleted successfully', { path: filePath });
    } catch (error) {
      logger.error('Receipt deletion error', {}, error);
      // Don't throw - deletion failures shouldn't block other operations
    }
  },

  /**
   * Generates a thumbnail from a receipt image
   */
  async generateThumbnail(file: File): Promise<string> {
    try {
      const thumbnailBlob = await compressImage(file, 300, 0.7);
      return URL.createObjectURL(thumbnailBlob);
    } catch (error) {
      logger.error('Thumbnail generation failed', {}, error);
      throw new Error('Impossible de générer la miniature');
    }
  },

  /**
   * Gets the storage usage for a user's receipts
   */
  async getStorageUsage(): Promise<{ used: number; limit: number }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        return { used: 0, limit: 0 };
      }

      const userId = session.user.id;

      // List all files for the user
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list(userId);

      if (error) {
        logger.error('Failed to get storage usage', { error: error.message }, error);
        return { used: 0, limit: 0 };
      }

      // Calculate total size
      const totalSize = data.reduce((sum, file) => sum + (file.metadata?.size || 0), 0);

      // Limit is typically 50MB for free tier, but this should come from config
      const limit = 50 * 1024 * 1024;

      return {
        used: totalSize,
        limit,
      };
    } catch (error) {
      logger.error('Storage usage check error', {}, error);
      return { used: 0, limit: 0 };
    }
  },
};

/**
 * Helper function to convert a File/Blob to base64 (for local storage fallback)
 */
export async function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Échec de la conversion en base64'));
      }
    };
    reader.onerror = () => reject(new Error('Échec de la lecture du fichier'));
    reader.readAsDataURL(file);
  });
}

/**
 * Helper function to convert base64 to Blob
 */
export function base64ToBlob(base64: string): Blob {
  const parts = base64.split(',');
  const contentType = parts[0].split(':')[1].split(';')[0];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const uInt8Array = new Uint8Array(rawLength);

  for (let i = 0; i < rawLength; i++) {
    uInt8Array[i] = raw.charCodeAt(i);
  }

  return new Blob([uInt8Array], { type: contentType });
}


