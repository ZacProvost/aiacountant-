# Receipt Image Display Fix - Summary

## Problem
When a chat message with a receipt was first sent, the image did not appear immediately. There was a delay because:
1. OCR processing happened synchronously before the image was displayed
2. When refreshing or returning to the page, images didn't appear because only `receiptPath` was stored, requiring signed URL generation

## Solution Implemented

### 1. Background Processing (components.tsx:2880-3004)
- **Changed**: OCR and upload now happen in the background (non-blocking)
- **Result**: Image displays immediately using blob URL while processing happens asynchronously
- **Key Changes**:
  - Message is created immediately with blob URL (`receiptImage: currentReceipt?.preview`)
  - Upload and OCR processing moved to async IIFE that doesn't block
  - Message is updated with permanent URL and OCR data when ready

### 2. Improved UserMessageBubble (components.tsx:1027-1074)
- **Changed**: Better handling of image URLs with priority system
- **Result**: Images display instantly when available, fallback to signed URL generation only when needed
- **Key Changes**:
  - Priority 1: Use `receiptImage` if it exists (blob, data, or HTTP URL) - instant display
  - Priority 2: Generate signed URL from `receiptPath` only if `receiptImage` is missing
  - Handles blob URLs, data URLs, and HTTP URLs immediately

### 3. Pre-generate URLs on Load (services/dataService.ts:51-78)
- **Changed**: Generate public URLs immediately when loading messages from database
- **Result**: Images appear instantly when returning to page or refreshing
- **Key Changes**:
  - `mapMessageFromDb` now generates public URL from `receiptPath` immediately
  - Public URL works for public buckets
  - UserMessageBubble generates signed URL as fallback if public URL fails (for private buckets)

## Flow After Fix

### When Sending a Message with Receipt:
1. **Immediate** (0ms): Message created with blob URL → Image displays instantly
2. **Background** (async): Upload receipt to storage
3. **Background** (async): Process OCR
4. **Background** (async): Update message with permanent URL and OCR data

### When Loading Messages from Database:
1. **Immediate** (0ms): Public URL generated from `receiptPath` → Image displays instantly
2. **Fallback** (if needed): If public URL fails, UserMessageBubble generates signed URL

## Benefits
- ✅ Images display immediately when sending messages
- ✅ Images display immediately when refreshing/returning to page
- ✅ OCR processing doesn't block UI
- ✅ No delay for image display
- ✅ Works for both public and private storage buckets
- ✅ Graceful fallback if public URL fails

## Technical Details

### Blob URL Lifecycle
- Blob URLs are created when user attaches receipt (`URL.createObjectURL`)
- Blob URL is used for immediate display in message
- When upload completes, blob URL is replaced with permanent public URL
- Blob URL remains valid until page refresh (then public URL is used)

### Database Storage
- Only `receipt_path` is stored in database (not `receipt_image`)
- Public URL is generated from `receipt_path` when loading messages
- This reduces database size while ensuring instant display

### Error Handling
- If upload fails, blob URL continues to work
- If OCR fails, image still displays
- If public URL fails, signed URL is generated as fallback
- All errors are logged but don't block image display

