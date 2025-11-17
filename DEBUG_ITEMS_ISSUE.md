# Debugging Items Detection Issue

## Problem
AI says: "Le reçu fourni ne comporte pas de liste d'articles, donc je ne peux pas te dire quels articles y figurent"

This means items are either:
1. Not being extracted by OCR
2. Not being stored in receiptOcrData
3. Not being sent to AI
4. Not being recognized by AI

## Step-by-Step Debugging

### Step 1: Check OCR Extraction

**After uploading a receipt, check browser console (F12) for:**

1. **OCR.space extraction:**
   ```
   [OCR.space] Extracted text (first 500 chars): ...
   ```
   - Does this show the receipt text?
   - Can you see item names and prices in the text?

2. **Item extraction:**
   ```
   [OCR] ✅ Extracted X items: [...]
   ```
   OR
   ```
   [OCR] ❌ No items extracted. Raw text sample: ...
   ```

   **If you see "❌ No items extracted":**
   - Check what the raw text shows
   - Check what lines are in the item section
   - The fallback extraction should have run - did it find anything?

### Step 2: Check Receipt Context Sent to AI

**When sending the initial message with receipt, check console for:**

```
📋 Receipt context sent to AI: ...
📦 Receipt OCR Data: {...}
✅ Items found: X items [...]
```

OR

```
⚠️ No items in receiptOcrData!
```

**If you see "⚠️ No items in receiptOcrData!":**
- Items weren't extracted by OCR
- Check Step 1 to see why OCR didn't extract items

**If you see "✅ Items found: X items":**
- Items were extracted!
- Check the receipt context - does it include `articles=[...]`?

### Step 3: Check Conversation History (For Follow-up Questions)

**When asking a follow-up question, check console for:**

```
📝 Conversation history - Message ... has X items: [...]
✅ Conversation history includes items in receipt context
```

**If you DON'T see these logs:**
- Items aren't in the message's receiptOcrData
- The message might not have been saved with items

### Step 4: Check What AI Receives

The AI should receive receipt context in this format:
```
[reçu: chemin_reçu=... ; fournisseur=AUX VIVRES, sous_total=31.00, TPS=1.55, TVQ=2.77, total=35.32, date=..., articles=[60LS CHILI GR:10.00; MEKONG CHAP:10.50; BOMBAY BANANE 12:4.50; JUS POMME 12oz:6.00]]
```

**Check the console log "📋 Receipt context sent to AI:" - does it include `articles=[...]`?**

## Common Issues

### Issue 1: Items Not Extracted
**Symptoms:**
- Console shows: `[OCR] ❌ No items extracted`
- Console shows: `⚠️ No items in receiptOcrData!`

**Possible Causes:**
- OCR.space didn't extract text properly
- Receipt format is very unusual
- Item section boundaries not detected

**Solution:**
- Check `[OCR.space] Extracted text` - is text being extracted?
- Check `[OCR] Lines in item section` - are item lines in the section?
- Share console logs for custom pattern matching

### Issue 2: Items Extracted But Not Sent
**Symptoms:**
- Console shows: `[OCR] ✅ Extracted X items`
- Console shows: `⚠️ No items in receiptOcrData!` when sending to AI

**Possible Causes:**
- OCR completed after AI call (2-second timeout)
- Items not stored in message

**Solution:**
- Check if items appear in `finalOcrData` after OCR completes
- Items should be updated in the message for future questions

### Issue 3: Items Sent But AI Doesn't See Them
**Symptoms:**
- Console shows: `✅ Items found: X items`
- Console shows receipt context with `articles=[...]`
- AI still says no items

**Possible Causes:**
- AI system prompt not clear enough
- Items format not recognized by AI

**Solution:**
- Check the exact format in console log
- Verify AI proxy function is deployed with latest system prompt

## What to Share for Debugging

If items still aren't working, share:

1. **Console logs showing:**
   - `[OCR.space] Extracted text (first 500 chars)`
   - `[OCR] ✅ Extracted X items` OR `[OCR] ❌ No items extracted`
   - `📋 Receipt context sent to AI:`
   - `📦 Receipt OCR Data:`

2. **Screenshot of:**
   - Browser console (F12)
   - The receipt image you're testing with

3. **What you see:**
   - Does OCR extract text? (check `[OCR.space] Extracted text`)
   - Are items extracted? (check `[OCR] ✅ Extracted X items`)
   - Are items in receipt context? (check `📋 Receipt context sent to AI`)

## Quick Test

1. **Upload receipt** with message "Test receipt"
2. **Open console (F12)**
3. **Look for these logs in order:**
   - `[OCR.space] Extracted text` - Should show receipt text
   - `[OCR] ✅ Extracted X items` - Should show items found
   - `📋 Receipt context sent to AI` - Should include `articles=[...]`
4. **Ask AI:** "Quels articles sont sur ce reçu?"
5. **Check console again:**
   - `📝 Conversation history - Message ... has X items` - Should show items in history

If any step fails, that's where the issue is!

