import { useState, useRef, useEffect } from 'react';
import { validateReceiptImage, ParsedReceipt, OCRResult } from '../services/ocrService';
import { authService } from '../services/authService';
import { supabase } from '../services/supabaseClient';
import type { User } from '@supabase/supabase-js';

interface ReceiptScannerProps {
  onReceiptProcessed?: (data: ParsedReceipt & { ocrResult: OCRResult; receiptPath?: string }) => void;
  onClose?: () => void;
  autoCreateExpense?: boolean;
}

/**
 * ReceiptScanner Component
 * Allows users to capture or upload receipt images and process them with OCR
 */
export function ReceiptScanner({ onReceiptProcessed, onClose, autoCreateExpense = false }: ReceiptScannerProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [useCamera, setUseCamera] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Get current user
  useEffect(() => {
    authService.getUser().then(setUser);
  }, []);

  /**
   * Start camera stream
   */
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setUseCamera(true);
      setError(null);
    } catch (err) {
      setError('Impossible d\'accéder à la caméra. Veuillez vérifier les permissions.');
      console.error('Camera error:', err);
    }
  };

  /**
   * Stop camera stream
   */
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setUseCamera(false);
  };

  /**
   * Capture photo from camera
   */
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      
      const file = new File([blob], 'receipt.jpg', { type: 'image/jpeg' });
      await handleImageFile(file);
      stopCamera();
    }, 'image/jpeg', 0.9);
  };

  /**
   * Handle file selection from input
   */
  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleImageFile(file);
  };

  /**
   * Process uploaded or captured image
   */
  const handleImageFile = async (file: File) => {
    setError(null);
    
    // Validate image
    const validation = validateReceiptImage(file);
    if (!validation.valid) {
      setError(validation.error || 'Image invalide');
      return;
    }

    // Show preview
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    setIsProcessing(true);

    try {
      // Resize/compress large images before OCR and upload
      const prepared = await (async () => {
        try {
          const { prepareImageForOCR } = await import('../services/ocrService');
          return await prepareImageForOCR(file);
        } catch {
          return file;
        }
      })();

      // Use server-side OCR only (requires authenticated user)
      if (!user) {
        setError('Vous devez être connecté pour analyser un reçu.');
        setIsProcessing(false);
        return;
      }

      // Use enhanced server-side OCR (includes AI-powered parsing)
      const { processReceiptEnhanced } = await import('../services/ocrService');
      const result = await processReceiptEnhanced(prepared, user.id);
      const receiptPath = result.receiptPath;
      
      if (!result.ocrResult.success) {
        throw new Error(result.ocrResult.error || 'Échec de l\'extraction du texte');
      }

      // Auto-create expense if enabled and we have enough data
      if (autoCreateExpense && result.total && user) {
        try {
          const expenseId = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const expenseDate = result.date || new Date().toISOString().split('T')[0];

          const { error: insertError } = await supabase
            .from('expenses')
            .insert({
              id: expenseId,
              user_id: user.id,
              name: result.vendor || 'Dépense de reçu',
              amount: result.total,
              category: result.category || 'Autre',
              date: expenseDate,
              vendor: result.vendor,
              receipt_path: receiptPath,
              notes: `Créé automatiquement depuis le reçu. Confiance: ${((result.ocrResult.confidence || 0) * 100).toFixed(0)}%`,
            });

          if (insertError) {
            console.error('Failed to create expense:', insertError);
          }
        } catch (createErr) {
          console.error('Expense creation error:', createErr);
        }
      }

      onReceiptProcessed?.({ ...result, receiptPath });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors du traitement du reçu');
      console.error('Receipt processing error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Clean up on unmount
   */
  const handleClose = () => {
    stopCamera();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    onClose?.();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Scanner un reçu</h2>
            <button
              onClick={handleClose}
              className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
              aria-label="Fermer"
            >
              ×
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {!useCamera && !previewUrl && (
            <div className="space-y-4">
              <p className="text-gray-600">
                Prenez une photo ou téléchargez une image de votre reçu pour l'analyser automatiquement.
              </p>

              <div className="flex gap-4">
                <button
                  onClick={startCamera}
                  disabled={isProcessing}
                  className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  📷 Prendre une photo
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                  className="flex-1 bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  📁 Télécharger une image
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileInput}
                className="hidden"
              />

              <div className="text-sm text-gray-500 mt-4">
                <p className="font-medium mb-2">💡 Conseils pour de meilleurs résultats :</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Assurez-vous que le reçu est bien éclairé</li>
                  <li>Évitez les ombres et les reflets</li>
                  <li>Capturez l'intégralité du reçu</li>
                  <li>Gardez le reçu à plat et lisible</li>
                </ul>
              </div>
            </div>
          )}

          {useCamera && (
            <div className="space-y-4">
              <div className="relative bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-auto"
                />
              </div>

              <div className="flex gap-4">
                <button
                  onClick={capturePhoto}
                  disabled={isProcessing}
                  className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  📸 Capturer
                </button>

                <button
                  onClick={stopCamera}
                  disabled={isProcessing}
                  className="flex-1 bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {previewUrl && (
            <div className="space-y-4">
              <div className="relative bg-gray-100 rounded-lg overflow-hidden">
                <img
                  src={previewUrl}
                  alt="Aperçu du reçu"
                  className="w-full h-auto"
                />
              </div>

              {isProcessing && (
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <p className="mt-2 text-gray-600">Analyse du reçu en cours...</p>
                  <p className="text-sm text-gray-500">Cela peut prendre quelques secondes</p>
                </div>
              )}

              {!isProcessing && (
                <button
                  onClick={() => {
                    setPreviewUrl(null);
                    setError(null);
                  }}
                  className="w-full bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 font-medium"
                >
                  Recommencer
                </button>
              )}
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>
      </div>
    </div>
  );
}

