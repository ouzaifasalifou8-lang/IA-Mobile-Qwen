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

  async translateToFrench(text: string): Promise<string> {
    if (!text) return text;
    try {
      const resp = await fetch(
        'https://api.mymemory.translated.net/get?q=' +
          encodeURIComponent(text) + '&langpair=ha|fr',
      );
      const data = await resp.json();
      return data?.responseData?.translatedText || text;
    } catch {
      return text;
    }
  }

  async translateToHausa(text: string): Promise<string> {
    if (!text) return text;
    try {
      const resp = await fetch(
        'https://api.mymemory.translated.net/get?q=' +
          encodeURIComponent(text.slice(0, 500)) + '&langpair=fr|ha',
      );
      const data = await resp.json();
      return data?.responseData?.translatedText || text;
    } catch {
      return text;
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
