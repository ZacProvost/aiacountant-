# OCR Items Detection Fix

## Problem
Items were not being detected from receipts. The OCR was extracting totals, taxes, and vendor information correctly, but individual line items with prices were not being captured.

## Root Cause Analysis
The item extraction patterns were too strict and didn't account for the various formats that OCR.space returns. Receipts can have items formatted in many different ways:
- "Item Name $10.99"
- "Item Name 10.99"
- "1 Item Name $10.99"
- Item name on one line, price on next line
- Tab-separated format
- Multiple spaces between name and price

## Changes Made

### 1. Enhanced Item Extraction Patterns (`services/ocrService.ts`)

**Added 5 different extraction patterns:**

1. **Pattern 1 (Enhanced)**: Item name and price on same line
   - Now handles: "Item $10.99", "Item 10.99", "Item10.99", "1 Item $10.99"
   - More flexible regex that doesn't require exact spacing

2. **Pattern 2**: Quantity and item name on one line, price on next line
   - Handles receipts where quantity is on the item line

3. **Pattern 3**: Item name on one line, quantity and price on next line
   - Handles receipts where price is on a separate line

4. **Pattern 4 (NEW)**: Item name on one line, price on next line (no quantity)
   - Handles simple two-line format: "Item Name" followed by "$10.99"

5. **Pattern 5 (NEW)**: Tab-separated or multiple spaces
   - Handles: "Item Name    10.99" (multiple spaces or tabs)

### 2. Improved Filtering

- Better exclusion of summary lines (taxes, totals, etc.)
- Prevents false positives (numbers, prices without names)
- Removes duplicates more intelligently
- Increased name length limit from 100 to 150 characters

### 3. Enhanced Section Detection

- Better detection of item section boundaries
- Added more markers: "serveur", "merci", "thank"
- More flexible fallback to use first 70% of lines if boundaries not found

### 4. Added Debugging Logs

- Logs extracted items to console: `[OCR] Extracted X items: [...]`
- Logs raw OCR text if no items found
- Logs OCR.space response format for debugging

### 5. OCR.space Configuration

- Verified OCR.space is configured for full text extraction (not just numbers)
- Engine 2 is used (best for receipts)
- Language set to English (can be extended to French)

## Testing

### How to Test

1. **Upload a receipt** with a message
2. **Check browser console** for:
   - `[OCR.space] Extracted text (first 500 chars):` - See what OCR returned
   - `[OCR] Extracted X items:` - See what items were found
   - If no items: `[OCR] No items extracted. Raw text sample:` - Debug why

3. **Ask the AI questions**:
   - "Quels articles sont sur ce reçu?"
   - "Combien coûte [nom d'article]?"
   - "Liste tous les articles avec leurs prix"

### Expected Behavior

- Items should now be extracted from most receipt formats
- Console will show exactly what was extracted
- AI should be able to answer questions about individual items
- Items are included in the `[reçu: ...]` context sent to AI

### Debugging

If items still aren't detected:

1. **Check console logs**:
   - What does `[OCR.space] Extracted text` show?
   - Is the text formatted correctly?
   - Are item names and prices visible in the raw text?

2. **Check item section detection**:
   - Look at `[OCR] Lines in item section:` in console
   - Are the item lines in the detected section?

3. **Check patterns**:
   - Do the lines match any of the 5 patterns?
   - Try adjusting patterns if receipts have unique formats

## Technical Details

### Item Extraction Logic Flow

1. **Identify item section**: Find lines between header (table/date) and summary (subtotal/taxes)
2. **Apply 5 patterns**: Try each pattern on each line
3. **Filter invalid items**: Remove summary lines, duplicates, invalid entries
4. **Log results**: Console output for debugging
5. **Return items**: Include in `receiptOcrData.items`

### Item Format in AI Context

Items are sent to AI in this format:
```
articles=[Item1:10.99; Item2:15.50; Item3:5.00]
```

The AI can then answer questions like:
- "Quels articles sont sur ce reçu?" → Lists all items
- "Combien coûte Item1?" → "10.99$"
- "Quel est le prix total des articles?" → Sums all item prices

## Next Steps

If items are still not detected after this fix:

1. **Share console logs** showing:
   - The raw OCR text
   - The detected item section lines
   - Any error messages

2. **Try different OCR engine**:
   - OCR.space Engine 1 (change `OCREngine` to `1`)
   - Or use Tesseract.js fallback (remove API key)

3. **Custom pattern matching**:
   - If receipts have a very specific format, we can add custom patterns

## Files Modified

- `services/ocrService.ts` - Enhanced item extraction with 5 patterns and better filtering

