// Supabase Edge Function: speech-to-text
// Secure proxy for Google Cloud Speech-to-Text API for French language recognition

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { resolveAllowedOrigin } from "../_shared/cors.ts"
import { handleOptions, jsonResponse } from "../_shared/http.ts"
import { getOptionalEnvVar } from "../_shared/env.ts"
import { createLogger } from "../_shared/logger.ts"
import { HttpError, normaliseError } from "../_shared/errors.ts"

const logger = createLogger("speech-to-text")

interface SpeechRequest {
  audio: string // Base64 encoded audio data
  sampleRate?: number // Audio sample rate (default: 16000)
  languageCode?: string // Language code (default: fr-CA)
  encoding?: string // Audio encoding (default: WEBM_OPUS)
}

interface GoogleSpeechResponse {
  results: Array<{
    alternatives: Array<{
      transcript: string
      confidence: number
    }>
    isFinal: boolean
  }>
}

serve(async (req) => {
  const origin = resolveAllowedOrigin(req.headers.get("origin"))

  if (req.method === "OPTIONS") {
    return handleOptions(origin)
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      { status: 405, origin }
    )
  }

  try {
    const googleApiKey = getOptionalEnvVar("GOOGLE_SPEECH_API_KEY")
    
    if (!googleApiKey) {
      logger.warn("Google Speech API key not configured, falling back to Web Speech API")
      return jsonResponse(
        { 
          error: "Speech-to-text service not configured",
          fallback: "web-speech-api"
        },
        { status: 503, origin }
      )
    }

    const body: SpeechRequest = await req.json()
    const { audio, sampleRate = 16000, languageCode = "fr-CA", encoding = "WEBM_OPUS" } = body

    if (!audio) {
      return jsonResponse(
        { error: "Audio data is required" },
        { status: 400, origin }
      )
    }

    // Prepare Google Cloud Speech-to-Text API request
    // Audio content should be base64 encoded string directly
    const googleRequest = {
      config: {
        encoding: encoding,
        sampleRateHertz: sampleRate,
        languageCode: languageCode,
        alternativeLanguageCodes: ["fr-FR"], // Fallback to France French
        enableAutomaticPunctuation: true,
        enableWordTimeOffsets: false,
        model: "latest_long", // Best model for longer conversations
        useEnhanced: true, // Use enhanced model for better accuracy
      },
      audio: {
        content: audio // Base64 encoded audio string
      }
    }

    // Call Google Cloud Speech-to-Text API
    const googleResponse = await fetch(
      `https://speech.googleapis.com/v1/speech:recognize?key=${googleApiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(googleRequest),
      }
    )

    if (!googleResponse.ok) {
      const errorText = await googleResponse.text()
      logger.error("Google Speech API error", { status: googleResponse.status, error: errorText })
      
      if (googleResponse.status === 403) {
        return jsonResponse(
          { error: "Speech-to-text service authentication failed" },
          { status: 503, origin }
        )
      }
      
      return jsonResponse(
        { error: "Speech recognition failed", details: errorText },
        { status: 500, origin }
      )
    }

    const googleData: GoogleSpeechResponse = await googleResponse.json()

    // Extract transcript from Google response
    const transcripts: string[] = []
    let isFinal = false

    if (googleData.results && googleData.results.length > 0) {
      for (const result of googleData.results) {
        if (result.alternatives && result.alternatives.length > 0) {
          transcripts.push(result.alternatives[0].transcript)
          if (result.isFinal) {
            isFinal = true
          }
        }
      }
    }

    const fullTranscript = transcripts.join(" ").trim()

    return jsonResponse(
      {
        transcript: fullTranscript,
        isFinal: isFinal,
        confidence: googleData.results[0]?.alternatives[0]?.confidence ?? 0,
      },
      { origin }
    )

  } catch (error) {
    logger.error("Speech-to-text error", error)
    return jsonResponse(
      { error: normaliseError(error).message },
      { status: 500, origin }
    )
  }
})

