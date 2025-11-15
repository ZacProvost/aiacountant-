// Supabase Edge Function: conversation-memory
// Manages conversation memory summarization and context persistence for AI conversations

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1"
import { resolveAllowedOrigin } from "../_shared/cors.ts"
import { handleOptions, jsonResponse } from "../_shared/http.ts"
import { getEnvVar, getOptionalEnvVar } from "../_shared/env.ts"
import { createLogger } from "../_shared/logger.ts"
import { HttpError, normaliseError } from "../_shared/errors.ts"
import { checkRateLimit, RATE_LIMITS } from "../_shared/rateLimit.ts"

interface MessageRecord {
  id: string
  sender: string
  text: string
  timestamp: string
  retain: boolean
}

interface MemoryRequest {
  conversationId: string
  forceUpdate?: boolean
}

interface MemoryResponse {
  conversationId: string
  memorySummary: string
  messageCount: number
  updated: boolean
}

/**
 * Summarize conversation history into a concise memory summary
 * This preserves important context while reducing token usage
 */
const generateMemorySummary = async (
  messages: MessageRecord[],
  existingMemory: string | null,
  aiModel: string,
  apiUrl: string,
  apiKey: string | null,
  logger: ReturnType<typeof createLogger>
): Promise<string> => {
  // Filter to important messages or recent ones
  const importantMessages = messages.filter(msg => msg.retain)
  const recentMessages = messages.slice(-20) // Last 20 messages
  
  // Combine important and recent (dedupe)
  const messageSet = new Set([...importantMessages, ...recentMessages])
  const messagesToSummarize = Array.from(messageSet).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
  
  // Build conversation text
  const conversationText = messagesToSummarize
    .map(msg => `${msg.sender === 'user' ? 'Utilisateur' : 'Fiscalia'}: ${msg.text}`)
    .join('\n')
  
  // Create summarization prompt
  const systemPrompt = `Tu es un assistant qui analyse des conversations financières et crée des résumés concis.

TÂCHE: Résume cette conversation en conservant:
1. Les informations financières importantes (montants exacts, noms de contrats, dépenses mentionnés)
2. Les préférences et décisions de l'utilisateur
3. Le contexte des discussions en cours et les entités récemment mentionnées
4. Les questions non résolues ou actions en attente

FORMAT DU RÉSUMÉ:
- 3-5 phrases maximum
- Français conversationnel
- Focus sur les faits et décisions importantes avec détails précis
- Inclure les noms exacts des contrats/dépenses récemment créés ou modifiés
- Ignorer les salutations et politesses

${existingMemory ? `\nRÉSUMÉ PRÉCÉDENT (à mettre à jour avec nouvelles infos):\n${existingMemory}\n` : ''}`

  const userPrompt = `Voici la conversation récente à résumer:\n\n${conversationText}\n\nRésume cette conversation en conservant les informations essentielles.`
  
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout
    
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`
    }
    
    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3, // Lower temperature for more focused summaries
        max_tokens: 300, // Limit summary length
      }),
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      const errorText = await response.text()
      logger.error("AI summarization failed", { status: response.status, error: errorText })
      throw new Error(`AI summarization failed: ${response.status}`)
    }
    
    const data = await response.json()
    const summary = data?.choices?.[0]?.message?.content?.trim() || ""
    
    if (!summary) {
      logger.warn("Empty summary from AI")
      // Fallback: Create basic summary from recent messages
      return `Conversation récente: ${messagesToSummarize.length} messages échangés sur la gestion financière.`
    }
    
    return summary
    
  } catch (error) {
    logger.error("Failed to generate memory summary", {
      error: error instanceof Error ? error.message : String(error)
    })
    
    // Fallback: Create basic summary
    const userMessages = messagesToSummarize.filter(m => m.sender === 'user')
    const topics = new Set<string>()
    
    userMessages.forEach(msg => {
      const text = msg.text.toLowerCase()
      if (text.includes('contrat') || text.includes('job')) topics.add('contrats')
      if (text.includes('dépense') || text.includes('expense')) topics.add('dépenses')
      if (text.includes('revenu') || text.includes('revenue')) topics.add('revenus')
      if (text.includes('rapport') || text.includes('report')) topics.add('rapports')
    })
    
    const topicList = Array.from(topics).join(', ') || 'gestion financière'
    return `${existingMemory ? existingMemory + ' ' : ''}Discussion récente sur: ${topicList}. ${messagesToSummarize.length} messages échangés.`
  }
}

serve(async (req) => {
  let originHeader: string | null = null
  let origin: string | null = null
  let responseOrigin: string | null = null
  
  try {
    originHeader = req.headers.get("origin")
    origin = resolveAllowedOrigin(originHeader)
    responseOrigin = origin ?? null
    
    if (req.method === "OPTIONS") {
      return handleOptions(origin)
    }
    if (!origin && originHeader) {
      return jsonResponse({ error: "Origin not allowed" }, { status: 403, origin: "null" })
    }
  } catch (corsError) {
    console.error("[conversation-memory] CORS resolution error:", corsError)
    const fallbackOrigin = originHeader || "*"
    return jsonResponse(
      { error: "Internal server error", detail: "CORS configuration error" },
      { origin: fallbackOrigin, status: 500 }
    )
  }

  const correlationId = req.headers.get("x-correlation-id") ?? crypto.randomUUID()
  const logger = createLogger({ correlationId, function: "conversation-memory" })
  const startedAt = performance.now()
  let userId: string | undefined

  try {
    if (req.method !== "POST") {
      throw new HttpError("Méthode non autorisée.", 405)
    }

    const supabaseUrl = getEnvVar("SUPABASE_URL")
    const serviceKey = getEnvVar("SUPABASE_SERVICE_ROLE_KEY")
    
    let payload: MemoryRequest
    try {
      payload = await req.json()
    } catch {
      throw new HttpError("Corps JSON invalide.", 400)
    }

    if (!payload.conversationId || typeof payload.conversationId !== "string") {
      throw new HttpError("conversationId is required", 400)
    }

    const authorization = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? ""
    const supabase = createClient(supabaseUrl, serviceKey, {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    })

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) {
      throw new HttpError("Unauthorized", 401, { detail: userError?.message })
    }

    userId = userData.user.id

    // Check rate limit (more lenient than AI proxy)
    checkRateLimit(userId, 'conversation-memory', {
      maxRequests: 30,
      windowMs: 60000, // 30 requests per minute
    })

    // Fetch conversation
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id, memory_summary, updated_at")
      .eq("id", payload.conversationId)
      .eq("user_id", userId)
      .maybeSingle()

    if (convError) {
      logger.error("Failed to fetch conversation", { error: convError.message })
      throw new HttpError("Failed to fetch conversation", 500)
    }

    if (!conversation) {
      throw new HttpError("Conversation not found", 404)
    }

    // Check if we need to update memory
    // Update if: forced, no existing memory, or last update was > 5 minutes ago
    const needsUpdate = payload.forceUpdate ||
      !conversation.memory_summary ||
      (new Date().getTime() - new Date(conversation.updated_at).getTime() > 5 * 60 * 1000)

    if (!needsUpdate) {
      logger.info("Memory summary is recent, skipping update")
      return jsonResponse(
        {
          conversationId: payload.conversationId,
          memorySummary: conversation.memory_summary || "",
          messageCount: 0,
          updated: false,
        },
        { origin: responseOrigin }
      )
    }

    // Fetch messages for this conversation
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("id, sender, text, timestamp, retain")
      .eq("conversation_id", payload.conversationId)
      .order("timestamp", { ascending: true })

    if (messagesError) {
      logger.error("Failed to fetch messages", { error: messagesError.message })
      throw new HttpError("Failed to fetch messages", 500)
    }

    if (!messages || messages.length === 0) {
      logger.info("No messages to summarize")
      return jsonResponse(
        {
          conversationId: payload.conversationId,
          memorySummary: conversation.memory_summary || "",
          messageCount: 0,
          updated: false,
        },
        { origin: responseOrigin }
      )
    }

    // Determine AI provider configuration
    const useLmStudio = Deno.env.get("USE_LM_STUDIO") === "true"
    const useGroq = Deno.env.get("GROQ_API_KEY") && !useLmStudio
    const lmStudioUrl = Deno.env.get("LM_STUDIO_URL") ?? "http://192.168.0.103:1234"
    const model = Deno.env.get("AI_MEMORY_MODEL") ?? 
                  Deno.env.get("AI_PROXY_MODEL") ?? 
                  (useLmStudio ? "google/gemma-3-12b" : "nvidia/nemotron-nano-9b-v2:free")
    
    const apiUrl = useLmStudio 
      ? `${lmStudioUrl}/v1/chat/completions`
      : useGroq
        ? "https://api.groq.com/openai/v1/chat/completions"
        : "https://openrouter.ai/api/v1/chat/completions"
    
    const apiKey = useGroq 
      ? Deno.env.get("GROQ_API_KEY")
      : useLmStudio 
        ? null 
        : getOptionalEnvVar("OPENROUTER_API_KEY")

    logger.info("Generating memory summary", {
      conversationId: payload.conversationId,
      messageCount: messages.length,
      model,
      provider: useLmStudio ? "LM Studio" : useGroq ? "Groq" : "OpenRouter"
    })

    // Generate new memory summary
    const memorySummary = await generateMemorySummary(
      messages as MessageRecord[],
      conversation.memory_summary,
      model,
      apiUrl,
      apiKey,
      logger
    )

    // Update conversation with new memory
    const { error: updateError } = await supabase
      .from("conversations")
      .update({ 
        memory_summary: memorySummary,
        updated_at: new Date().toISOString()
      })
      .eq("id", payload.conversationId)
      .eq("user_id", userId)

    if (updateError) {
      logger.error("Failed to update memory summary", { error: updateError.message })
      throw new HttpError("Failed to update memory summary", 500)
    }

    logger.info("Memory summary updated successfully", {
      conversationId: payload.conversationId,
      summaryLength: memorySummary.length,
      messageCount: messages.length
    })

    const durationMs = performance.now() - startedAt

    return jsonResponse(
      {
        conversationId: payload.conversationId,
        memorySummary,
        messageCount: messages.length,
        updated: true,
        durationMs: Math.round(durationMs)
      } as MemoryResponse & { durationMs: number },
      { origin: responseOrigin }
    )

  } catch (error) {
    const normalised = normaliseError(error)
    const durationMs = performance.now() - startedAt
    
    if (logger) {
      logger.error("conversation-memory failure", {
        error: normalised.message,
        status: normalised.status,
        detail: normalised.detail,
        durationMs: Math.round(durationMs)
      })
    } else {
      console.error("[conversation-memory] Error:", normalised.message, normalised.detail)
    }
    
    const corsOrigin = responseOrigin ?? (originHeader || null)
    return jsonResponse(
      { error: normalised.message, detail: normalised.detail, correlationId },
      { origin: corsOrigin, status: normalised.status ?? 500 },
    )
  }
})

