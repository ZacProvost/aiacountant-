/**
 * Receipt OCR Edge Function
 * Processes receipt images using OCR and stores data in Supabase
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';
import { corsHeaders } from '../_shared/cors.ts';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const requestSchema = z.object({
  image: z.string(), // base64 encoded image
  userId: z.string().uuid(),
  ocrMethod: z.enum(['ocrspace', 'tesseract']).optional(),
  autoCreate: z.boolean().optional().default(false),
});

interface OCRSpaceResult {
  ParsedResults?: Array<{
    ParsedText: string;
    TextOrientation?: string;
  }>;
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string[];
}

interface ParsedReceipt {
  vendor?: string;
  date?: string;
  total?: number;
  items?: Array<{ name: string; price: number }>;
  category?: string;
  rawText: string;
  subtotal?: number;
  tax?: {
    gst?: number;
    pst?: number;
    qst?: number;
    hst?: number;
    total?: number;
  };
}

/**
 * Extract text using OCR.space API
 */
async function extractTextWithOCRSpace(base64Image: string): Promise<{ text: string; confidence: number }> {
  const apiKey = Deno.env.get('OCR_SPACE_API_KEY');
  
  if (!apiKey) {
    throw new Error('OCR_SPACE_API_KEY not configured');
  }

  const formData = new FormData();
  formData.append('base64Image', base64Image);
  formData.append('apikey', apiKey);
  formData.append('language', 'eng');
  formData.append('isOverlayRequired', 'false');
  formData.append('detectOrientation', 'true');
  formData.append('scale', 'true');
  formData.append('OCREngine', '2');

  const response = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`OCR.space API error: ${response.statusText}`);
  }

  const result: OCRSpaceResult = await response.json();

  if (result.IsErroredOnProcessing) {
    throw new Error(result.ErrorMessage?.[0] || 'OCR processing failed');
  }

  const text = result.ParsedResults?.[0]?.ParsedText || '';
  const confidence = result.ParsedResults?.[0]?.TextOrientation === '0' ? 0.9 : 0.7;

  return { text, confidence };
}

/**
 * Parse OCR text to extract receipt information
 */
function parseReceiptText(text: string): ParsedReceipt {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  
  const result: ParsedReceipt = {
    rawText: text,
  };

  // Extract vendor (exclude table numbers, dates, etc.)
  const vendorLine = lines.find(line => 
    line.length > 2 && 
    line.length < 50 &&
    !line.match(/^\d+[\s,.\-\/]+\d+/) && // Not a date
    !line.match(/^table\s*#/i) && // Not table number
    !line.match(/^\d+\s*client/i) // Not client count
  );
  if (vendorLine) {
    result.vendor = vendorLine;
  }

  // Extract date (skip time-only matches)
  const datePatterns = [
    /(\d{1,2}[\s,.\-\/]+\d{1,2}[\s,.\-\/]+\d{2,4})/i,
    /(\d{4}[\s,.\-\/]+\d{1,2}[\s,.\-\/]+\d{1,2})/i,
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,.\-]+\d{1,2}[\s,.\-]+\d{2,4}/i,
  ];
  
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match && !match[0].match(/^\d{1,2}:\d{2}$/)) {
      result.date = match[0].trim();
      break;
    }
  }

  // Extract subtotal
  const subtotalPatterns = [
    /(?:sous[- ]?total|sub[- ]?total|subtotal)[\s:]*\$?\s*(\d+[.,]\d{2})/i,
  ];

  for (const pattern of subtotalPatterns) {
    const match = text.match(pattern);
    if (match) {
      const amountStr = match[1].replace(',', '.');
      const value = parseFloat(amountStr);
      if (value > 0 && value < 100000) {
        result.subtotal = value;
        break;
      }
    }
  }

  // Extract tax information
  const tax: { gst?: number; pst?: number; qst?: number; hst?: number; total?: number } = {};

  // GST/TPS
  const gstPatterns = [
    /(?:g\.?\s*s\.?\s*t\.?|t\.?\s*p\.?\s*s\.?|gst|tps)[\s:]*\$?\s*(\d+[.,]\d{2})/i,
    /t\.?p\.?s\.?\s*(\d+[.,]\d{2})/i,
    /(\d+[.,]\d{2})\s*(?:g\.?\s*s\.?\s*t\.?|t\.?\s*p\.?\s*s\.?|gst|tps)/i,
  ];
  for (const pattern of gstPatterns) {
    const match = text.match(pattern);
    if (match) {
      const amountStr = match[1].replace(',', '.');
      const value = parseFloat(amountStr);
      if (value > 0 && value < 10000) {
        tax.gst = value;
        break;
      }
    }
  }

  // QST/TVQ
  const qstPatterns = [
    /(?:q\.?\s*s\.?\s*t\.?|t\.?\s*v\.?\s*q\.?|qst|tvq)[\s:]*\$?\s*(\d+[.,]\d{2})/i,
    /t\.?v\.?q\.?\s*(\d+[.,]\d{2})/i,
    /(\d+[.,]\d{2})\s*(?:q\.?\s*s\.?\s*t\.?|t\.?\s*v\.?\s*q\.?|qst|tvq)/i,
  ];
  for (const pattern of qstPatterns) {
    const match = text.match(pattern);
    if (match) {
      const amountStr = match[1].replace(',', '.');
      const value = parseFloat(amountStr);
      if (value > 0 && value < 10000) {
        tax.qst = value;
        break;
      }
    }
  }

  // PST/TVP
  const pstPatterns = [
    /(?:p\.?\s*s\.?\s*t\.?|t\.?\s*v\.?\s*p\.?|pst|tvp)[\s:]*\$?\s*(\d+[.,]\d{2})/i,
    /t\.?v\.?p\.?\s*(\d+[.,]\d{2})/i,
    /(\d+[.,]\d{2})\s*(?:p\.?\s*s\.?\s*t\.?|t\.?\s*v\.?\s*p\.?|pst|tvp)/i,
  ];
  for (const pattern of pstPatterns) {
    const match = text.match(pattern);
    if (match) {
      const amountStr = match[1].replace(',', '.');
      const value = parseFloat(amountStr);
      if (value > 0 && value < 10000) {
        tax.pst = value;
        break;
      }
    }
  }

  // Calculate total tax
  if (tax.gst || tax.pst || tax.qst || tax.hst) {
    let totalTax = 0;
    if (tax.gst) totalTax += tax.gst;
    if (tax.pst) totalTax += tax.pst;
    if (tax.qst) totalTax += tax.qst;
    if (tax.hst) totalTax += tax.hst;
    if (totalTax > 0) {
      tax.total = totalTax;
    }
  }

  if (Object.keys(tax).length > 0) {
    result.tax = tax;
  }

  // Extract total - prioritize TOTAL label
  const totalWithLabelPatterns = [
    /(?:total|montant|sum|balance|amount due)[\s:]+(\d+[.,]\d{2})/i,
    /(?:total|montant)[\s:]+(\d+[.,]\d{2})/i,
    /total\s*:\s*(\d+[.,]\d{2})/i,
    /total\s+(\d+[.,]\d{2})/i,
  ];

  let foundTotal: number | null = null;
  for (const pattern of totalWithLabelPatterns) {
    const match = text.match(pattern);
    if (match) {
      const amountStr = match[1].replace(',', '.');
      const value = parseFloat(amountStr);
      if (value > 0 && value < 1000000) {
        foundTotal = value;
        break;
      }
    }
  }

  // Fallback: use largest amount, but validate against subtotal + taxes
  if (!foundTotal) {
    const amounts = text.match(/\$?\s*(\d+[.,]\d{2})/g);
    if (amounts) {
      const numbers = amounts
        .map(a => {
          const numStr = a.replace(/[$,\s]/g, '').replace(',', '.');
          return parseFloat(numStr);
        })
        .filter(n => !isNaN(n) && n > 0 && n < 1000000);
      
      if (numbers.length > 0) {
        const sorted = numbers.sort((a, b) => b - a);
        if (result.subtotal || tax.total) {
          const expectedTotal = (result.subtotal || 0) + (tax.total || 0);
          foundTotal = sorted.find(n => Math.abs(n - expectedTotal) < 10) || sorted[0];
        } else {
          foundTotal = sorted[0];
        }
      }
    }
  }

  if (foundTotal) {
    result.total = foundTotal;
  }

  // Extract line items - improved multi-line handling
  const items: Array<{ name: string; price: number }> = [];
  
  // Identify item section boundaries
  let itemSectionStart = -1;
  let itemSectionEnd = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toLowerCase();
    if (line.includes('table') || line.includes('heure') || line.includes('date')) {
      itemSectionStart = i + 1;
    }
    if (line.includes('sous-total') || line.includes('subtotal') || 
        line.includes('t.p.s') || line.includes('t.v.q') ||
        line.includes('total') || line.includes('montant')) {
      if (itemSectionEnd === -1) {
        itemSectionEnd = i;
      }
    }
  }
  
  if (itemSectionStart === -1) itemSectionStart = 0;
  if (itemSectionEnd === -1) itemSectionEnd = Math.floor(lines.length * 0.7);
  
  const itemSection = lines.slice(itemSectionStart, itemSectionEnd);
  
  for (let i = 0; i < itemSection.length; i++) {
    const line = itemSection[i];
    const nextLine = itemSection[i + 1];
    
    // Pattern 1: Item name and price on same line
    let itemMatch = line.match(/^(\d+\s+)?(.+?)\s+\$?\s*(\d+[.,]\d{2})$/);
    if (itemMatch) {
      const name = itemMatch[2].trim();
      const price = parseFloat(itemMatch[3].replace(',', '.'));
      
      if (!name.match(/^(sous[- ]?total|subtotal|t\.?p\.?s|t\.?v\.?q|total|montant|tax|taxe)/i) &&
          name.length > 2 && name.length < 100 && price > 0 && price < 10000) {
        items.push({ name, price });
        continue;
      }
    }
    
    // Pattern 2: Quantity and name on one line, price on next
    if (nextLine) {
      const quantityMatch = line.match(/^(\d+)\s+(.+)$/);
      const priceMatch = nextLine.match(/^\$?\s*(\d+[.,]\d{2})$/);
      
      if (quantityMatch && priceMatch) {
        const name = quantityMatch[2].trim();
        const price = parseFloat(priceMatch[1].replace(',', '.'));
        
        if (!name.match(/^(table|heure|date|client)/i) &&
            name.length > 2 && name.length < 100 && price > 0 && price < 10000) {
          items.push({ name, price });
          i++;
          continue;
        }
      }
    }
  }
  
  // Remove duplicates
  const uniqueItems = items.filter((item, index, self) => {
    return index === self.findIndex((t) => t.name === item.name && t.price === item.price) &&
           !item.name.match(/^(sous[- ]?total|subtotal|t\.?p\.?s|t\.?v\.?q|total|montant|tax|taxe|facture)/i);
  });
  
  if (uniqueItems.length > 0) {
    result.items = uniqueItems;
  }

  // Guess category
  if (result.vendor) {
    const vendor = result.vendor.toLowerCase();
    if (vendor.match(/restaurant|cafe|coffee|food|pizza|burger|aux vivres/)) {
      result.category = 'Restauration';
    } else if (vendor.match(/hotel|motel|inn|lodging/)) {
      result.category = 'Hébergement';
    } else if (vendor.match(/gas|station|fuel|petro|shell|esso/)) {
      result.category = 'Carburant';
    } else if (vendor.match(/home|depot|hardware|construction|rona|bmr/)) {
      result.category = 'Matériaux';
    } else if (vendor.match(/office|staples|bureau/)) {
      result.category = 'Fournitures';
    }
  }

  return result;
}

/**
 * Store receipt image in Supabase Storage
 */
async function storeReceiptImage(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  base64Image: string
): Promise<string> {
  // Extract file extension from base64 data URL
  const matches = base64Image.match(/^data:image\/(\w+);base64,/);
  const extension = matches?.[1] || 'jpg';
  
  // Remove data URL prefix
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
  
  // Convert base64 to Uint8Array
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Generate unique filename
  const filename = `${userId}/${crypto.randomUUID()}.${extension}`;

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from('receipts')
    .upload(filename, bytes, {
      contentType: `image/${extension}`,
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload receipt: ${error.message}`);
  }

  return data.path;
}

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse and validate request
    const body = await req.json();
    const { image, userId, ocrMethod, autoCreate } = requestSchema.parse(body);

    // Extract text using OCR
    let ocrText: string;
    let confidence: number;

    if (ocrMethod === 'ocrspace') {
      const result = await extractTextWithOCRSpace(image);
      ocrText = result.text;
      confidence = result.confidence;
    } else {
      // For tesseract, the OCR is done client-side, so we expect the text to be provided
      throw new Error('Tesseract OCR should be performed client-side');
    }

    // Parse receipt data
    const parsed = parseReceiptText(ocrText);

    // Store receipt image
    const receiptPath = await storeReceiptImage(supabase, userId, image);

    // Auto-create expense if requested
    if (autoCreate && parsed.total) {
      const expenseId = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const expenseDate = parsed.date || new Date().toISOString().split('T')[0];

      const { error: insertError } = await supabase
        .from('expenses')
        .insert({
          id: expenseId,
          user_id: userId,
          name: parsed.vendor || 'Dépense de reçu',
          amount: parsed.total,
          category: parsed.category || 'Autre',
          date: expenseDate,
          vendor: parsed.vendor,
          receipt_path: receiptPath,
          notes: `Créé automatiquement depuis le reçu. Confiance OCR: ${(confidence * 100).toFixed(0)}%`,
        });

      if (insertError) {
        console.error('Failed to create expense:', insertError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        parsed,
        receiptPath,
        confidence,
        method: ocrMethod || 'ocrspace',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Receipt OCR error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});




