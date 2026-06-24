import Voice, {
  SpeechResultsEvent,
  SpeechErrorEvent,
} from 'react-native-voice';

class VoiceRecognitionService {
  private isListening = false;
  private onResultCallback: ((text: string) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private onStartCallback: (() => void) | null = null;
  private onEndCallback: (() => void) | null = null;

  constructor() {
    Voice.onSpeechStart = this.handleStart.bind(this);
    Voice.onSpeechEnd = this.handleEnd.bind(this);
    Voice.onSpeechResults = this.handleResults.bind(this);
    Voice.onSpeechError = this.handleError.bind(this);
  }

  private handleStart() {
    this.isListening = true;
    this.onStartCallback?.();
  }

  private handleEnd() {
    this.isListening = false;
    this.onEndCallback?.();
  }

  private handleResults(event: SpeechResultsEvent) {
    const text = event.value?.[0] || '';
    if (text) {
      this.onResultCallback?.(text);
    }
  }

  private handleError(event: SpeechErrorEvent) {
    this.isListening = false;
    this.onErrorCallback?.(event.error?.message || 'Erreur reconnaissance vocale');
  }

  async startListening(
    lang: string = 'ha-NE', // Haoussa Niger
    onResult: (text: string) => void,
    onError?: (error: string) => void,
    onStart?: () => void,
    onEnd?: () => void,
  ) {
    if (this.isListening) {
      await this.stopListening();
    }

    this.onResultCallback = onResult;
    this.onErrorCallback = onError || null;
    this.onStartCallback = onStart || null;
    this.onEndCallback = onEnd || null;

    try {
      await Voice.start(lang);
    } catch (e: any) {
      // Fallback vers français si Haoussa non supporté
      try {
        await Voice.start('fr-FR');
      } catch (e2: any) {
        onError?.(e2?.message || 'Microphone non disponible');
      }
    }
  }

  async stopListening() {
    try {
      await Voice.stop();
      this.isListening = false;
    } catch {}
  }

  async destroy() {
    try {
      await Voice.destroy();
      Voice.removeAllListeners();
    } catch {}
  }

  getIsListening() {
    return this.isListening;
  }
}

export const voiceService = new VoiceRecognitionService();
