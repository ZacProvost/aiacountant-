# Receipt Image Display Analysis

## Problem Statement

When a chat message with a receipt is first sent, the image does not appear immediately. There's a delay because:
1. OCR processing happens synchronously before the image is displayed
2. When refreshing or returning to the page, images don't appear because only `receiptPath` is stored, requiring signed URL generation

## Current Flow Analysis

### When Sending a Message with Receipt (components.tsx:2833-3027)

1. **Message Creation** (line 2862-2870):
   - Creates user message with `receiptImage: currentReceipt?.preview` (blob URL)
   - Immediately adds message to chat (line 2877)

2. **Upload to Storage** (line 2880-2906):
   - Uploads receipt file to Supabase Storage
   - Gets `receiptPath` and `receiptUrl`

3. **OCR Processing** (line 2908-2967):
   - Runs OCR synchronously (blocks UI)
   - Extracts receipt data

4. **Message Update** (line 2973-2994):
   - Updates message with `receiptPath` and `receiptOcrData`
   - **Issue**: `receiptImage` is set to `receiptUrl` but this happens AFTER OCR completes

### When Displaying Messages (components.tsx:1027-1142)

1. **UserMessageBubble Component** (line 1027):
   - Checks if `message.receiptImage` exists and is valid (line 1034)
   - If not, generates signed URL from `receiptPath` (line 1040-1066)
   - Shows loading state while generating URL (line 1081-1092)
   - Displays image once URL is ready (line 1093-1138)

### Issues Identified

1. **Initial Display Delay**:
   - OCR processing happens synchronously (line 2908-2967)
   - Image update happens after OCR completes
   - User sees message bubble but no image until OCR finishes

2. **Refresh/Return Delay**:
   - Database only stores `receiptPath`, not `receiptImage` (line 2970-2971)
   - When loading from database, `receiptImage` is missing
   - Component must generate signed URL, causing delay

3. **Blob URL Lifecycle**:
   - Blob URLs (`URL.createObjectURL`) are revoked when component unmounts
   - When returning to page, blob URL is no longer valid
   - Must rely on `receiptPath` to generate new URL

## Solution Strategy

### 1. Immediate Image Display
- Keep blob URL in `receiptImage` for instant display
- Don't wait for OCR or upload to show image
- Process OCR and upload in background

### 2. Persistent Image URLs
- Store both `receiptPath` (for persistence) AND `receiptImage` (for display)
- When loading from database, immediately generate signed URL
- Cache signed URLs to avoid regeneration

### 3. Background Processing
- Move OCR processing to background (non-blocking)
- Update message with OCR data when ready
- Don't block image display on OCR completion

### 4. Optimistic Updates
- Show image immediately using blob URL
- Update with permanent URL when upload completes
- Handle failures gracefully

## Implementation Plan

1. **Modify `handleSendWithReceipt`**:
   - Keep blob URL in message for immediate display
   - Process OCR and upload in background (don't await)
   - Update message asynchronously when ready

2. **Modify `UserMessageBubble`**:
   - Prioritize `receiptImage` if it exists
   - Generate signed URL from `receiptPath` only if `receiptImage` is missing
   - Cache signed URLs to avoid regeneration

3. **Database Schema**:
   - Ensure `receiptImage` is stored in database (currently only `receiptPath` is stored)
   - Store public URL or signed URL for persistence

4. **Message Loading**:
   - When loading messages from database, immediately generate signed URLs
   - Pre-generate URLs for all messages with receipts
   - Cache URLs to avoid repeated generation

