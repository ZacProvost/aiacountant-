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

export const speechService = {
  isSupported: (): boolean => {
    return (
      typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition) !== undefined
    );
  },

  // Normalize Canadian French transcript for better accuracy
  normalizeTranscript: (transcript: string): string => {
    let normalized = transcript.trim();
    
    // Fix common recognition errors for Canadian French numbers
    // Sometimes hyphens are missing or spaces are inserted
    normalized = normalized.replace(/\bsoixante\s+dix\b/gi, 'soixante-dix');
    normalized = normalized.replace(/\bquatre\s+vingt\s+dix\b/gi, 'quatre-vingt-dix');
    normalized = normalized.replace(/\bquatre\s+vingt\b/gi, 'quatre-vingt');
    
    // Fix spacing issues in numbers (e.g., "1 000" should be "1000" or "1,000")
    normalized = normalized.replace(/\b(\d{1,3})\s+(\d{3})\b/g, '$1$2');
    
    // Canadian French currency terms - normalize variations to standard terms
    // Keep "piasses" as is since AI understands it, but fix common misrecognitions
    normalized = normalized.replace(/\bpiasse\b/gi, 'piasses');
    normalized = normalized.replace(/\bdollard\b/gi, 'dollars');
    normalized = normalized.replace(/\bdollars?\s+canadien(ne)?s?\b/gi, 'dollars');
    
    // Normalize currency symbols and amounts
    // Keep "dix dollars" as is (AI can understand it), but fix spacing
    normalized = normalized.replace(/\b(\d+)\s+dollars?\b/gi, '$1 dollars');
    normalized = normalized.replace(/\b(\d+)\s+piasses?\b/gi, '$1 piasses');
    
    // Fix common misrecognitions in numbers
    // "un" sometimes misrecognized as "1" or vice versa in context
    normalized = normalized.replace(/\bun\s+(\d{2,})\b/gi, '$1'); // "un 1000" -> "1000"
    
    // Fix spacing around punctuation (French style)
    normalized = normalized.replace(/\s+([.,!?;:])/g, '$1');
    normalized = normalized.replace(/([.,!?;:])\s*/g, '$1 ');
    
    // Normalize common Canadian French phrases that might be misrecognized
    normalized = normalized.replace(/\bça\s+va\b/gi, 'ça va');
    normalized = normalized.replace(/\bcomment\s+ça\s+va\b/gi, 'comment ça va');
    normalized = normalized.replace(/\bc\s+est\s+correct\b/gi, "c'est correct");
    
    // Fix common word splitting issues
    normalized = normalized.replace(/\bqu\s+est\s+ce\s+que\b/gi, "qu'est-ce que");
    normalized = normalized.replace(/\bqu\s+est\b/gi, "qu'est");
    normalized = normalized.replace(/\bc\s+est\b/gi, "c'est");
    
    // Fix capitalization issues - capitalize first letter
    if (normalized.length > 0) {
      normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }
    
    return normalized.trim();
  },

  startListening: (
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

      // Optimize for Canadian French
      recognition.continuous = true;
      recognition.interimResults = true;
      // Use Canadian French locale - try multiple variants for better support
      recognition.lang = 'fr-CA';
      // Increase maxAlternatives for better accuracy with Canadian French
      recognition.maxAlternatives = 3;

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        // With continuous mode, accumulate all results
        let fullTranscript = '';
        
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          
          // Use the first (most confident) alternative
          // The result is indexed: result[0] is the first alternative, result[1] is second, etc.
          const primaryTranscript = result[0]?.transcript || '';
          
          // For Canadian French, we could check alternatives if the first doesn't seem right
          // But for now, we'll use the primary and normalize it
          fullTranscript += primaryTranscript;
          
          if (i < event.results.length - 1) {
            fullTranscript += ' ';
          }
        }
        
        const lastResult = event.results[event.results.length - 1];
        const isFinal = lastResult.isFinal;
        
        // Normalize the transcript for Canadian French
        const normalizedTranscript = speechService.normalizeTranscript(fullTranscript);
        
        onResult(normalizedTranscript, isFinal);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        let errorMessage = 'Erreur de reconnaissance vocale';
        switch (event.error) {
          case 'no-speech':
            errorMessage = 'Aucune parole détectée';
            break;
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
          default:
            errorMessage = `Erreur: ${event.error}`;
        }
        onError(errorMessage);
      };

      // Add handlers for better Canadian French recognition
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
        // When no match is found, try to continue listening
        // This is common with Canadian French accents
        console.warn('No speech match found - continuing to listen');
      };

      recognition.onend = () => {
        // With continuous mode, if recognition ends naturally (e.g., timeout),
        // we may want to restart it to keep listening
        // But for now, just reset instance - user will need to click again if it stops
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
