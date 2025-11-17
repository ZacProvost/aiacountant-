# Receipt OCR Integration - Quick Setup

This document provides a quick overview of the receipt OCR functionality that has been integrated into Fiscalia.

## What Was Added

### 1. Free OCR Services Integration
- **OCR.space API** - Cloud-based OCR (25,000 free requests/month)
- **Tesseract.js** - Client-side OCR fallback (100% free, unlimited)

### 2. New Files Created

#### Services
- `services/ocrService.ts` - OCR and receipt parsing logic
  - Extract text from receipt images
  - Parse vendor, amount, date, line items
  - Smart category suggestions
  - Support for both OCR methods

#### Components
- `components/ReceiptScanner.tsx` - Receipt capture interface
  - Camera photo capture
  - File upload support
  - Real-time preview
  - Auto-fill expense form

#### Supabase Functions
- `supabase/functions/receipt-ocr/index.ts` - Edge function for server-side OCR
  - Process receipt images
  - Store in Supabase Storage
  - Auto-create expenses (optional)

#### Database
- `supabase/migrations/20251116000000_receipts_storage.sql`
  - Storage bucket for receipt images
  - Row Level Security policies
  - Helper functions for receipt URLs

#### Documentation
- `docs/RECEIPT-OCR-GUIDE.md` - Complete setup and usage guide
- Updated `docs/env-variables-guide.md` with OCR configuration
- Updated `README.md` with receipt scanning feature

## Quick Start

### Step 1: Install Dependencies
Dependencies are already installed (Tesseract.js is in package.json).

### Step 2: Get Free OCR.space API Key (Optional but Recommended)

1. Visit https://ocr.space/ocrapi
2. Sign up for free (no credit card required)
3. Copy your API key
4. Add to your `.env` file:
   ```
   VITE_OCR_SPACE_API_KEY=your_key_here
   ```

**Note:** If you skip this step, Tesseract.js will work automatically as a fallback (still free!).

### Step 3: Run Database Migration

```bash
npx supabase migration up
```

This creates the `receipts` storage bucket with proper security.

### Step 4: Deploy Edge Function (Optional)

```bash
# Set API key as secret (if using OCR.space)
npx supabase secrets set OCR_SPACE_API_KEY=your_key_here

# Deploy the function
npx supabase functions deploy receipt-ocr
```

### Step 5: Start Using It!

1. Run your app: `npm run dev`
2. Go to "Dépenses" (Expenses)
3. Click "Ajouter une dépense"
4. Click "Scanner un reçu"
5. Take a photo or upload an image
6. Watch the form auto-fill! ✨

## How It Works

```
User takes photo → OCR Service → Parse receipt → Auto-fill form
                       ↓
              (OCR.space or Tesseract.js)
                       ↓
            Upload to Supabase Storage
                       ↓
              Store expense in database
```

## Features

✅ **Camera Capture** - Take photos directly in the app
✅ **File Upload** - Upload existing receipt images  
✅ **Auto-Extraction** - Vendor, amount, date, items
✅ **Smart Categories** - Suggests expense category
✅ **Cloud Storage** - Securely stores in Supabase
✅ **Privacy First** - User-isolated with RLS
✅ **Offline Support** - Tesseract.js works without internet
✅ **100% Free** - No credit card required for basic use

## Supported Formats

- JPEG, PNG, WebP
- Maximum size: 5MB
- English and French receipts
- Both printed and handwritten

## Cost Analysis

### With OCR.space (Recommended)
- Free tier: 25,000 requests/month
- Typical usage: ~100 receipts/month
- **Cost: $0.00** ✅

### With Tesseract.js Only
- Unlimited requests
- Runs in browser
- **Cost: $0.00** ✅

### Supabase Storage
- Free tier: 1GB
- Average receipt: 100KB
- Can store ~10,000 receipts
- **Cost: $0.00** ✅

### Total Monthly Cost
**$0.00** - Completely free! 🎉

## Tips for Best Results

📸 Good lighting (avoid shadows)  
📸 Flat receipt (no folds)  
📸 Full receipt in frame  
📸 Dark background for contrast  
📸 Clear focus (not blurry)

## Next Steps

1. Read the full guide: `docs/RECEIPT-OCR-GUIDE.md`
2. Configure environment: `docs/env-variables-guide.md`
3. Test with a receipt!

## Support

Having issues? Check:
- Browser console for errors
- Supabase logs for function errors
- Camera permissions in browser settings
- API key is correctly set in `.env`

For detailed troubleshooting, see `docs/RECEIPT-OCR-GUIDE.md`.

---

**Enjoy automatic receipt scanning!** 🎉📷




