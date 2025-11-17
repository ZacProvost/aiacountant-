/**
 * OCR Service for receipt text extraction
 * Server-side OCR only - uses Supabase Edge Function with AI-powered parsing
 */

export interface OCRResult {
  success: boolean;
  text: string;
  confidence?: number;
  error?: string;
  method: 'enhanced' | 'ocrspace' | 'tesseract';
}

export interface ParsedReceipt {
  vendor?: string;
  date?: string;
  total?: number;
  items?: Array<{
    name: string;
    price: number;
    quantity?: number;
    unitPrice?: number;
  }>;
  category?: string;
  rawText: string;
  tax?: {
    gst?: number;
    pst?: number;
    qst?: number;
    hst?: number;
    total?: number;
  };
  subtotal?: number;
}

/**
 * Load an image file into an HTMLImageElement
 */
async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  const url = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Resize and compress an image for OCR and upload.
 * - Accepts large images and downscales to a maximum dimension
 * - Converts to JPEG for best OCR compatibility
 * - Targets ~1-2 MB output size depending on original
 */
export async function prepareImageForOCR(
  file: File,
  options: { maxDimension?: number; quality?: number } = {}
): Promise<File> {
  const { maxDimension = 2000, quality = 0.85 } = options;

  // If the file is already a JPEG/PNG/WebP and reasonably small (<5MB), keep as-is
  if (
    /image\/(jpeg|jpg|png|webp)/i.test(file.type) &&
    file.size <= 5 * 1024 * 1024
  ) {
    return file;
  }

  // Try to decode using the browser; if it fails (e.g., HEIC), we will throw
  const img = await loadImageFromFile(file);

  const { naturalWidth: width, naturalHeight: height } = img;
  if (!width || !height) {
    throw new Error('Image invalide');
  }

  const scale =
    Math.max(width, height) > maxDimension
      ? maxDimension / Math.max(width, height)
      : 1;
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Contexte canvas indisponible');
  }
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob(
      (b) => resolve(b || new Blob()),
      'image/jpeg',
      quality
    )
  );

  const optimized = new File([blob], (file.name || 'receipt') + '.jpg', {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
  return optimized;
}

/**
 * Process receipt using enhanced server-side OCR with AI-powered parsing
 * This is the PRIMARY and ONLY method for receipt processing
 * @param imageFile - File object
 * @param userId - User ID (required for server-side processing)
 * @returns Parsed receipt data with enhanced accuracy
 */
export async function processReceiptEnhanced(
  imageFile: File | string,
  userId: string
): Promise<ParsedReceipt & { ocrResult: OCRResult; receiptPath?: string }> {
  try {
    const { supabase } = await import('./supabaseClient');
    
    // Convert file to base64 if needed
    let base64Image: string;
    if (typeof imageFile === 'string') {
      base64Image = imageFile;
    } else {
      base64Image = await fileToBase64(imageFile);
    }

    console.log('[OCR] Calling enhanced server-side OCR for user:', userId);
    console.log('[OCR] Image data length:', base64Image.length, 'chars');
    console.log('[OCR] Image preview:', base64Image.substring(0, 50) + '...');

    // Ensure base64Image is properly formatted
    let processedImage = base64Image;
    if (!base64Image.startsWith('data:image')) {
      // Add data URL prefix if missing
      processedImage = `data:image/jpeg;base64,${base64Image}`;
    }

    // Call enhanced OCR Edge Function
    const { data, error } = await supabase.functions.invoke('receipt-ocr-enhanced', {
      body: {
        image: processedImage,
        userId,
        autoCreate: false,
      },
    });

    if (error) {
      console.error('[OCR] Enhanced OCR failed:', error);
      throw new Error(error.message || 'Échec de l\'OCR serveur');
    }

    if (!data || !data.success) {
      throw new Error(data?.error || 'Échec de l\'extraction OCR');
    }

    const parsed = data.parsed;
    const receiptPath = data.receiptPath || undefined;
    const confidence = data.confidence || 0.8;

    console.log('[OCR] Enhanced OCR complete:', {
      hasVendor: !!parsed.vendor,
      hasTotal: !!parsed.total,
      hasItems: !!parsed.items,
      itemsCount: parsed.items?.length || 0,
      confidence: (confidence * 100).toFixed(0) + '%'
    });

    return {
      ...parsed,
      ocrResult: {
        success: true,
        text: parsed.rawText || '',
        confidence,
        method: 'enhanced' as const,
      },
      receiptPath,
    };
  } catch (error) {
    console.error('[OCR] processReceiptEnhanced error:', error);
    // No fallback - server-side OCR is required
    throw new Error(
      error instanceof Error 
        ? `Échec de l'OCR serveur: ${error.message}` 
        : 'Échec de l\'OCR serveur. Veuillez réessayer.'
    );
  }
}

/**
 * Convert File to base64 string
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // Remove data URL prefix if present
      const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
      resolve(`data:${file.type};base64,${base64Data}`);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Validate image file for OCR processing
 */
export function validateReceiptImage(file: File): { valid: boolean; error?: string } {
  // Allow large inputs; we will downscale later. Hard cap to prevent memory issues.
  const maxSize = 25 * 1024 * 1024; // 25MB cap to avoid OOM
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Format d\'image non supporté. Utilisez JPEG, PNG ou WebP.',
    };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'Image trop volumineuse. Maximum 25MB.',
    };
  }

  return { valid: true };
}
