# Receipt OCR Setup Guide

This guide explains how to set up and use the receipt scanning and OCR (Optical Character Recognition) functionality in Fiscalia.

## Overview

Fiscalia includes a powerful receipt scanning system that automatically extracts information from receipt images using OCR technology. The system supports two methods:

1. **OCR.space API** - Cloud-based OCR with high accuracy (25,000 free requests/month)
2. **Tesseract.js** - Client-side OCR that works offline (100% free, unlimited)

## Features

- 📷 **Camera Capture** - Take photos of receipts directly in the app
- 📁 **File Upload** - Upload existing receipt images
- 🤖 **Automatic Extraction** - Extracts vendor, amount, date, and line items
- 🏷️ **Smart Categorization** - Suggests expense categories based on vendor
- 💾 **Cloud Storage** - Stores receipt images securely in Supabase
- 🔒 **Privacy** - All data is encrypted and user-isolated

## Setup Instructions

### 1. OCR.space API Setup (Recommended)

OCR.space provides the best accuracy with a generous free tier:

1. **Get a Free API Key:**
   - Visit [https://ocr.space/ocrapi](https://ocr.space/ocrapi)
   - Sign up for a free account (no credit card required)
   - You'll receive an API key immediately
   - Free tier: 25,000 requests/month

2. **Add API Key to Environment:**
   
   Create or update your `.env` file:
   ```bash
   VITE_OCR_SPACE_API_KEY=your_api_key_here
   ```

3. **That's it!** The app will automatically use OCR.space when the key is present.

### 2. Tesseract.js Fallback (Always Available)

Tesseract.js is already installed and works automatically:

- No setup required
- Works offline
- Used automatically if OCR.space is not configured
- Slightly lower accuracy but still very good

### 3. Supabase Storage Setup

Receipt images are stored in Supabase Storage:

1. **Run the Migration:**
   ```bash
   npx supabase migration up
   ```
   
   This creates the `receipts` storage bucket with proper security policies.

2. **Verify Storage Bucket:**
   - Go to your Supabase dashboard
   - Navigate to Storage
   - You should see a `receipts` bucket
   - Bucket is private with Row Level Security enabled

### 4. Deploy Supabase Edge Function

Deploy the receipt OCR edge function:

```bash
npx supabase functions deploy receipt-ocr
```

Set the OCR.space API key as an environment secret:

```bash
npx supabase secrets set OCR_SPACE_API_KEY=your_api_key_here
```

## Usage

### In the App

1. **Add New Expense:**
   - Click "Ajouter une dépense" in the Expenses screen
   - Click "Scanner un reçu" button
   
2. **Scan Receipt:**
   - Choose "Prendre une photo" to use your camera
   - Or "Télécharger une image" to upload an existing image
   
3. **Capture:**
   - Point your camera at the receipt
   - Make sure it's well-lit and flat
   - Click "Capturer"
   
4. **Auto-Fill:**
   - The app will process the receipt
   - Form fields will be automatically filled with extracted data
   - Review and adjust as needed
   - Click "Ajouter la dépense"

### Tips for Best Results

- ✅ Ensure good lighting (no shadows)
- ✅ Avoid glare and reflections
- ✅ Capture the entire receipt
- ✅ Keep the receipt flat and straight
- ✅ Use a dark background for contrast
- ❌ Avoid blurry or out-of-focus images
- ❌ Don't fold or crumple the receipt

## API Reference

### OCR Service

The OCR service is available in `services/ocrService.ts`:

```typescript
import { processReceipt, extractReceiptText, parseReceiptText } from './services/ocrService';

// Process a receipt image
const result = await processReceipt(imageFile, ocrSpaceApiKey);

// Result contains:
// - vendor: string
// - date: string
// - total: number
// - items: Array<{ name: string, price: number }>
// - category: string (suggested)
// - rawText: string
// - ocrResult: OCRResult (success, confidence, method)
```

### Receipt Scanner Component

The component is available at `components/ReceiptScanner.tsx`:

```typescript
import { ReceiptScanner } from './components/ReceiptScanner';

<ReceiptScanner
  onReceiptProcessed={(data) => {
    console.log('Extracted data:', data);
  }}
  onClose={() => setShowScanner(false)}
  autoCreateExpense={false}
/>
```

### Supabase Edge Function

The edge function is available at `/receipt-ocr`:

```typescript
// POST /receipt-ocr
{
  "image": "data:image/jpeg;base64,...",
  "userId": "user-uuid",
  "ocrMethod": "ocrspace", // or "tesseract"
  "autoCreate": false // Set to true to auto-create expense
}

// Response
{
  "success": true,
  "parsed": {
    "vendor": "Store Name",
    "date": "2025-11-16",
    "total": 42.50,
    "category": "Restauration",
    "rawText": "...",
    "items": [...]
  },
  "receiptPath": "user-id/receipt-uuid.jpg",
  "confidence": 0.92,
  "method": "ocrspace"
}
```

## Storage Structure

Receipts are stored in Supabase Storage with this structure:

```
receipts/
  ├── user-id-1/
  │   ├── uuid-1.jpg
  │   ├── uuid-2.png
  │   └── ...
  ├── user-id-2/
  │   └── ...
```

### Security Policies

- Users can only upload to their own folder
- Users can only view their own receipts
- Receipt paths are stored in the `expenses` table
- RLS policies ensure data isolation

## Supported Languages

Currently optimized for:
- 🇺🇸 English
- 🇨🇦 French (Canada)

To add more languages, update the OCR service configuration.

## Supported File Formats

- JPEG / JPG
- PNG
- WebP
- Maximum size: 5MB

## Troubleshooting

### Camera Not Working

**Problem:** "Impossible d'accéder à la caméra"

**Solutions:**
1. Check browser permissions (Settings > Privacy > Camera)
2. Ensure you're using HTTPS (required for camera access)
3. Try a different browser (Chrome, Safari, Firefox)

### Poor OCR Accuracy

**Problem:** Extracted data is incorrect

**Solutions:**
1. Ensure good lighting conditions
2. Take a clear, focused photo
3. Try OCR.space API for better accuracy
4. Manually correct the extracted data

### Upload Failed

**Problem:** "Failed to upload receipt"

**Solutions:**
1. Check internet connection
2. Verify Supabase is configured correctly
3. Check file size (max 5MB)
4. Ensure file format is supported

### API Key Not Working

**Problem:** OCR.space returns errors

**Solutions:**
1. Verify API key is correct in `.env`
2. Check if you've exceeded free tier (25,000/month)
3. Restart development server after adding key
4. System will fallback to Tesseract.js automatically

## Cost Breakdown

### OCR.space (Recommended)
- **Free Tier:** 25,000 requests/month
- **Cost:** $0.00 (within free tier)
- **Overage:** System automatically falls back to Tesseract.js

### Tesseract.js (Fallback)
- **Cost:** $0.00 (100% free)
- **Limitations:** Runs in browser, slightly slower

### Supabase Storage
- **Free Tier:** 1GB storage
- **Cost:** $0.00 (within free tier)
- Assuming average receipt is 100KB, you can store ~10,000 receipts

### Total Monthly Cost
- **Within limits:** $0.00
- **No credit card required**
- **No hidden fees**

## Performance

### OCR.space
- Average processing time: 2-4 seconds
- Accuracy: 95-98%
- Works online only

### Tesseract.js
- Average processing time: 5-10 seconds
- Accuracy: 85-92%
- Works offline

## Privacy & Security

- All receipts are encrypted in transit (HTTPS)
- Stored in private Supabase bucket with RLS
- OCR.space does not store images
- Tesseract.js processes locally in browser
- No third-party access to your data

## Roadmap

Future enhancements:
- [ ] Batch processing multiple receipts
- [ ] Improved line item extraction
- [ ] Multi-language support
- [ ] Receipt categorization ML model
- [ ] Export receipts as PDF
- [ ] Receipt search by OCR text

## Support

If you encounter issues:
1. Check this documentation
2. Review browser console for errors
3. Verify environment variables
4. Check Supabase logs
5. Open an issue on GitHub

## Additional Resources

- [OCR.space API Documentation](https://ocr.space/OCRAPI)
- [Tesseract.js Documentation](https://tesseract.projectnaptha.com/)
- [Supabase Storage Documentation](https://supabase.com/docs/guides/storage)
- [Fiscalia Architecture](./ARCHITECTURE.md)




