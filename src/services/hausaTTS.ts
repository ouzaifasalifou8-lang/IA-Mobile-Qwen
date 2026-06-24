// Service TTS simple pour Haoussa
// Utilise l'API Google Text-to-Speech (non officielle) ou le TTS système

import {NativeModules, Platform} from 'react-native';

class HausaTTSService {
  private enabled = false;
  private speaking = false;
  private audioQueue: string[] = [];

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stop();
    }
    return this.enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  // Traduire et lire en Haoussa via Google TTS
  async speak(text: string, lang: string = 'ha'): Promise<void> {
    if (!this.enabled || !text) return;

    try {
      this.speaking = true;

      // Découper le texte en chunks de 200 caractères max
      const chunks = this.chunkText(text, 200);

      for (const chunk of chunks) {
        if (!this.enabled) break;
        await this.speakChunk(chunk, lang);
      }
    } catch (e) {
      console.warn('[HausaTTS] Erreur:', e);
    } finally {
      this.speaking = false;
    }
  }

  private chunkText(text: string, maxLen: number): string[] {
    const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      if ((current + sentence).length > maxLen) {
        if (current) chunks.push(current.trim());
        current = sentence;
      } else {
        current += sentence;
      }
    }
    if (current) chunks.push(current.trim());
    return chunks.filter(c => c.length > 0);
  }

  private async speakChunk(text: string, lang: string): Promise<void> {
    return new Promise((resolve) => {
      // Utiliser l'API Google TTS non officielle
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;

      // Sur Android, on peut utiliser le module Sound natif
      // Pour l'instant, on log pour debug
      console.log('[HausaTTS] Speaking:', text.slice(0, 50));

      // Simuler la durée de parole (200ms par mot approximativement)
      const words = text.split(' ').length;
      setTimeout(resolve, words * 300);
    });
  }

  stop(): void {
    this.enabled = false;
    this.speaking = false;
    this.audioQueue = [];
  }
}

export const hausaTTS = new HausaTTSService();
