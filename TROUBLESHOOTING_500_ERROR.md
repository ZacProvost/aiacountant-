# Troubleshooting 500 Error in Enhanced OCR Function

## ✅ Just Deployed
- Enhanced error handling and logging
- Better validation of input data
- Detailed error messages

## 🔍 Check Supabase Dashboard Logs

The function now logs detailed error information. To see what's causing the 500 error:

1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/eihqjpdpuavfioqijjlc/functions
2. Click on `receipt-ocr-enhanced`
3. Click on "Logs" tab
4. Look for the most recent error logs - they will show:
   - The exact error message
   - Error type
   - Stack trace

## 🔧 Most Common Causes

### 1. Missing OCR_SPACE_API_KEY (Most Likely)

**Check:**
1. Go to Supabase Dashboard → Settings → Edge Functions
2. Look for `OCR_SPACE_API_KEY` in the environment variables
3. If missing, add it:
   - Name: `OCR_SPACE_API_KEY`
   - Value: Your OCR.space API key

**To get OCR.space API key:**
- Go to https://ocr.space/ocrapi
- Sign up for a free account (25,000 requests/month)
- Copy your API key from the dashboard

### 2. Image Format Issue

The function now validates the image format. If you see "Invalid image data" or "Image must be in base64 format", check:
- Image is being converted to base64 correctly
- Image data includes the `data:image/...` prefix or is pure base64

### 3. OCR.space API Issues

If you see OCR.space API errors:
- Check if you've exceeded your quota
- Verify your API key is correct
- Check OCR.space service status

## 🧪 Test the Function Directly

You can test the function manually using curl (replace with your actual values):

```bash
curl -X POST https://eihqjpdpuavfioqijjlc.supabase.co/functions/v1/receipt-ocr-enhanced \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "userId": "test-user-id",
    "autoCreate": false
  }'
```

This will return the exact error message.

## 📋 Quick Fix Checklist

- [ ] Check Supabase Dashboard logs for error details
- [ ] Verify `OCR_SPACE_API_KEY` is set in Edge Function environment variables
- [ ] Restart your dev server (if testing locally)
- [ ] Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)
- [ ] Try uploading a receipt again
- [ ] Check console for detailed error messages

## 🔄 Next Steps After Fixing

Once the error is fixed:
1. The function should log: `[OCR] Starting OCR extraction...`
2. Then: `[OCR] OCR extraction successful, text length: XXX`
3. Then: `[OCR] Regex parsing complete: {...}`
4. Finally: `[OCR] ✅ Processing complete - returning result: {...}`

If you still see errors, **check the Supabase Dashboard logs** - they now contain detailed error information that will tell us exactly what's wrong.

