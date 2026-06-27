// Service de reconnaissance vocale
// Utilise l'API native Android via NativeModules si disponible
// Sinon fallback vers une alerte

import {Alert, NativeModules, Platform} from 'react-native';

class VoiceRecognitionService {
  private isListening = false;
  private onResultCallback: ((text: string) => void) | null = null;

  getIsListening(): boolean {
    return this.isListening;
  }

  async startListening(
    lang: string = 'ha-NE',
    onResult: (text: string) => void,
    onError?: (error: string) => void,
    onStart?: () => void,
    onEnd?: () => void,
  ): Promise<void> {
    this.onResultCallback = onResult;
    this.isListening = true;
    onStart?.();

    // Sur Android, utiliser l'intent de reconnaissance vocale système
    // Pour l'instant on simule avec une alerte demandant le texte
    // TODO: implémenter avec react-native-voice quand disponible
    Alert.prompt
      ? Alert.prompt(
          'Parler à l\'IA',
          'Tapez votre message en Haoussa (reconnaissance vocale bientôt disponible)',
          [
            {text: 'Annuler', onPress: () => { this.isListening = false; onEnd?.(); }},
            {text: 'OK', onPress: (text) => {
              if (text) onResult(text);
              this.isListening = false;
              onEnd?.();
            }},
          ],
          'plain-text'
        )
      : Alert.alert(
          'Reconnaissance vocale',
          'Fonctionnalité bientôt disponible. Utilisez le clavier pour taper en Haoussa.',
          [{text: 'OK', onPress: () => { this.isListening = false; onEnd?.(); }}]
        );
  }

  async stopListening(): Promise<void> {
    this.isListening = false;
  }

  async destroy(): Promise<void> {
    this.isListening = false;
  }
}

export const voiceService = new VoiceRecognitionService();
