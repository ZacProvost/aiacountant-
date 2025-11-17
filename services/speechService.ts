import { getSupabaseEdgeUrl } from './supabaseClient';

type SpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  grammars?: SpeechGrammarList;
  serviceURI?: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  onstart?: () => void;
  onspeechstart?: () => void;
  onspeechend?: () => void;
  onsoundstart?: () => void;
  onsoundend?: () => void;
  onaudiostart?: () => void;
  onaudioend?: () => void;
  onnomatch?: (event: SpeechRecognitionEvent) => void;
};

type SpeechGrammarList = {
  addFromString: (string: string, weight?: number) => void;
  addFromURI: (src: string, weight?: number) => void;
  length: number;
};

type SpeechRecognitionEvent = {
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionResultList = {
  length: number;
  [index: number]: SpeechRecognitionResult;
};

type SpeechRecognitionResult = {
  isFinal: boolean;
  [index: number]: {
    transcript: string;
  };
};

type SpeechRecognitionErrorEvent = {
  error: string;
};

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
    SpeechGrammarList: new () => SpeechGrammarList;
    webkitSpeechGrammarList: new () => SpeechGrammarList;
  }
}

let recognitionInstance: SpeechRecognition | null = null;

// Normalize Canadian French transcript for better accuracy
const normalizeTranscript = (transcript: string): string => {
  let normalized = transcript.trim();
  
  if (!normalized) return '';
  
  // Fix common recognition errors for Canadian French numbers
  normalized = normalized.replace(/\bsoixante\s+dix\b/gi, 'soixante-dix');
  normalized = normalized.replace(/\bquatre\s+vingt\s+dix\b/gi, 'quatre-vingt-dix');
  normalized = normalized.replace(/\bquatre\s+vingt\b/gi, 'quatre-vingt');
  
  // Fix spacing issues in numbers
  normalized = normalized.replace(/\b(\d{1,3})\s+(\d{3})\b/g, '$1$2');
  
  // Canadian French currency terms
  normalized = normalized.replace(/\bpiasse\b/gi, 'piasses');
  normalized = normalized.replace(/\bdollard\b/gi, 'dollars');
  normalized = normalized.replace(/\bdollars?\s+canadien(ne)?s?\b/gi, 'dollars');
  
  // Normalize currency symbols and amounts
  normalized = normalized.replace(/\b(\d+)\s+dollars?\b/gi, '$1 dollars');
  normalized = normalized.replace(/\b(\d+)\s+piasses?\b/gi, '$1 piasses');
  
  // Fix common misrecognitions in numbers
  normalized = normalized.replace(/\bun\s+(\d{2,})\b/gi, '$1');
  
  // Fix spacing around punctuation (French style)
  normalized = normalized.replace(/\s+([.,!?;:])/g, '$1');
  normalized = normalized.replace(/([.,!?;:])\s*/g, '$1 ');
  
  // Normalize common Canadian French phrases
  normalized = normalized.replace(/\bça\s+va\b/gi, 'ça va');
  normalized = normalized.replace(/\bcomment\s+ça\s+va\b/gi, 'comment ça va');
  normalized = normalized.replace(/\bc\s+est\s+correct\b/gi, "c'est correct");
  
  // Fix common word splitting issues
  normalized = normalized.replace(/\bqu\s+est\s+ce\s+que\b/gi, "qu'est-ce que");
  normalized = normalized.replace(/\bqu\s+est\b/gi, "qu'est");
  normalized = normalized.replace(/\bc\s+est\b/gi, "c'est");
  
  // Fix capitalization - capitalize first letter
  if (normalized.length > 0) {
    normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
  
  return normalized.trim();
};

// Improved Web Speech API implementation - PRIMARY METHOD
const startWebSpeechRecognition = (
  onResult: (transcript: string, isFinal: boolean) => void,
  onError: (error: string) => void
): SpeechRecognition | null => {
  if (!speechService.isSupported()) {
    onError('Speech recognition is not supported in this browser');
    return null;
  }

  try {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    // Optimize for Canadian French with improved settings
    recognition.continuous = true;
    recognition.interimResults = true;
    // Try fr-CA first, fallback to fr-FR if needed
    recognition.lang = 'fr-CA';
    recognition.maxAlternatives = 3; // Balance between accuracy and performance

    let accumulatedTranscript = '';

    // Improved result handling - accumulate results properly
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Build full transcript from all results
      let fullTranscript = '';
      let hasFinalResult = false;
      
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        
        // Use the first (most confident) alternative
        const transcript = result[0]?.transcript || '';
        
        if (transcript) {
          fullTranscript += transcript;
          // Add space between results if not the last one
          if (i < event.results.length - 1) {
            fullTranscript += ' ';
          }
        }
        
        if (result.isFinal) {
          hasFinalResult = true;
        }
      }
      
      // Normalize the transcript for Canadian French
      const normalizedTranscript = normalizeTranscript(fullTranscript);
      
      // Update accumulated transcript and call callback
      if (normalizedTranscript) {
        accumulatedTranscript = normalizedTranscript;
        onResult(normalizedTranscript, hasFinalResult);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      let errorMessage = 'Erreur de reconnaissance vocale';
      switch (event.error) {
        case 'no-speech':
          // Don't show error for no-speech, just continue listening
          return;
        case 'audio-capture':
          errorMessage = 'Impossible de capturer l\'audio';
          break;
        case 'not-allowed':
          errorMessage = 'Permission de microphone refusée';
          break;
        case 'network':
          errorMessage = 'Erreur réseau';
          break;
        case 'aborted':
          return; // User stopped, don't show error
        case 'language-not-supported':
          errorMessage = 'Langue française non supportée';
          break;
        default:
          errorMessage = `Erreur: ${event.error}`;
      }
      onError(errorMessage);
    };

    recognition.onstart = () => {
      console.log('Speech recognition started for Canadian French');
    };

    recognition.onspeechstart = () => {
      console.log('Speech detected');
    };

    recognition.onspeechend = () => {
      console.log('Speech ended');
    };

    recognition.onnomatch = () => {
      // Continue listening even if no match found
      console.log('No speech match found - continuing to listen');
    };

    recognition.onend = () => {
      // Don't auto-restart - let user control when to stop
      // This prevents issues with continuous listening
      if (recognitionInstance === recognition) {
        recognitionInstance = null;
      }
    };

    recognition.start();
    recognitionInstance = recognition;
    return recognition;
  } catch (error) {
    onError('Impossible d\'initialiser la reconnaissance vocale');
    console.error('Speech recognition error:', error);
    return null;
  }
};

export const speechService = {
  isSupported: (): boolean => {
    return (
      typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition) !== undefined
    );
  },

  normalizeTranscript,

  startListening: (
    onResult: (transcript: string, isFinal: boolean) => void,
    onError: (error: string) => void
  ): SpeechRecognition | null => {
    // Use Web Speech API as primary method (free and works well)
    return startWebSpeechRecognition(onResult, onError);
  },

  stopListening: (): void => {
    if (recognitionInstance) {
      try {
        recognitionInstance.stop();
      } catch (error) {
        console.error('Error stopping recognition:', error);
      }
      recognitionInstance = null;
    }
  },
};
