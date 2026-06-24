import axios from 'axios';

const hausaDictionary: { [key: string]: string } = {
  'bonjour': 'sannu',
  'merci': 'na gode',
  'oui': 'eh',
  'non': "a'a",
  'comment': 'yaya',
  'pourquoi': 'don me',
  'quand': 'yaushe',
  'eau': 'ruwa',
  'nourriture': 'abinci',
  'maison': 'gida',
  'je': 'ni',
  'tu': 'kai',
  'il': 'shi',
  'elle': 'ita',
  'nous': 'mu',
  'vous': 'ku',
};

class TranslationService {
  private translateEnabled = false;
  isEnabled = false;

  toggleTranslation(): boolean {
    this.translateEnabled = !this.translateEnabled;
    this.isEnabled = this.translateEnabled;
    return this.translateEnabled;
  }

  isTranslationEnabled(): boolean {
    return this.translateEnabled;
  }

  // Traduire via Google Translate (API non officielle, gratuite)
  private async translateWithGoogle(text: string, from: string, to: string): Promise<string> {
    const resp = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`
    );
    const data = await resp.json();
    let result = '';
    if (Array.isArray(data[0])) {
      for (const part of data[0]) {
        if (part[0]) result += part[0];
      }
    }
    return result || text;
  }

  // Traduire via MyMemory (avec clé email optionnelle pour plus de quota)
  private async translateWithMyMemory(text: string, from: string, to: string): Promise<string> {
    const resp = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`
    );
    const data = await resp.json();
    const translated = data?.responseData?.translatedText;
    // MyMemory retourne parfois le texte original si pas de traduction
    if (!translated || translated === text || translated.includes('MYMEMORY WARNING')) {
      return '';
    }
    return translated;
  }

  async translateToFrench(text: string): Promise<string> {
    if (!text) return text;
    try {
      // Essayer Google d'abord (meilleure qualité)
      const google = await this.translateWithGoogle(text, 'ha', 'fr');
      if (google && google !== text) return google;
      // Fallback MyMemory
      const mm = await this.translateWithMyMemory(text, 'ha', 'fr');
      if (mm) return mm;
      return text;
    } catch {
      try {
        return await this.translateWithMyMemory(text, 'ha', 'fr') || text;
      } catch {
        return text;
      }
    }
  }

  async translateToHausa(text: string): Promise<string> {
    if (!text) return text;
    const shortText = text.slice(0, 500);
    try {
      // Essayer Google d'abord
      const google = await this.translateWithGoogle(shortText, 'fr', 'ha');
      if (google && google !== shortText) return google;
      // Fallback MyMemory
      const mm = await this.translateWithMyMemory(shortText, 'fr', 'ha');
      if (mm) return mm;
      return text;
    } catch {
      try {
        return await this.translateWithMyMemory(shortText, 'fr', 'ha') || text;
      } catch {
        return text;
      }
    }
  }

  translateToHausaSync(text: string): string {
    if (!this.translateEnabled || !text) return text;
    let result = text;
    const lowerText = text.toLowerCase();
    for (const [fr, ha] of Object.entries(hausaDictionary)) {
      if (lowerText.includes(fr)) {
        const regex = new RegExp(fr, 'gi');
        result = result.replace(regex, ha);
      }
    }
    return result;
  }
}

export const translationService = new TranslationService();
