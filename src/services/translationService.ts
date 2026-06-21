import axios from 'axios';

// Dictionnaire de traduction Hausa <-> Français (hors ligne)
// Utile pour les mots courants en attendant l'API
const hausaDictionary: { [key: string]: string } = {
  // Mots courants
  'san ka': 'bonjour',
  'sannu': 'bonjour',
  'yaya': 'comment',
  'kai': 'tu',
  'ni': 'je',
  'mu': 'nous',
  'su': 'ils',
  'ku': 'vous',
  'shi': 'il',
  'ita': 'elle',
  'muna': 'nous sommes',
  'kana': 'tu es',
  'ina': 'je suis',
  'suna': 'ils sont',
  
  // Phrases courantes
  'yaya kake': 'comment vas-tu',
  'ina jin': 'je pense',
  'ina so': 'je veux',
  'muna so': 'nous voulons',
  'ya fi': 'c\'est mieux',
  'mai kyau': 'bon',
  'mugun': 'mauvais',
  'gida': 'maison',
  'ruwa': 'eau',
  'abinci': 'nourriture',
  
  // Questions
  'me': 'quoi',
  'waye': 'qui',
  'ina': 'où',
  'yaushe': 'quand',
  'don me': 'pourquoi',
};

class TranslationService {
  private translateEnabled = false;
  private sourceLang = 'ha'; // Hausa
  private targetLang = 'fr'; // Français par défaut

  // Basculer le mode traduction
  toggleTranslation(): boolean {
    this.translateEnabled = !this.translateEnabled;
    console.log('Traduction:', this.translateEnabled ? 'ACTIVÉE' : 'DÉSACTIVÉE');
    return this.translateEnabled;
  }

  get isEnabled(): boolean {
    return this.translateEnabled;
  }

  // Traduire du Hausa vers le Français/Anglais
  async translateToFrench(text: string): Promise<string> {
    if (!this.translateEnabled || !text) return text;
    
    try {
      // Essayer d'abord le dictionnaire local
      const translated = this.translateWithDictionary(text);
      if (translated !== text) {
        return translated;
      }
      
      // Sinon, utiliser l'API Google Translate (gratuit)
      return await this.translateWithGoogle(text, 'ha', 'fr');
    } catch (error) {
      console.error('Erreur traduction:', error);
      return text;
    }
  }

  // Traduire du Français/Anglais vers le Hausa
  async translateToHausa(text: string): Promise<string> {
    if (!this.translateEnabled || !text) return text;
    
    try {
      return await this.translateWithGoogle(text, 'fr', 'ha');
    } catch (error) {
      console.error('Erreur traduction:', error);
      return text;
    }
  }

  // Traduction avec dictionnaire local
  private translateWithDictionary(text: string): string {
    let result = text;
    const lowerText = text.toLowerCase();
    
    // Vérifier les mots/phrases du dictionnaire
    for (const [ha, fr] of Object.entries(hausaDictionary)) {
      if (lowerText.includes(ha)) {
        result = result.replace(new RegExp(ha, 'gi'), fr);
      }
    }
    
    return result;
  }

  // Traduction avec Google Translate API (gratuit)
  private async translateWithGoogle(
    text: string,
    from: string,
    to: string
  ): Promise<string> {
    try {
      // Utiliser l'API Google Translate gratuite (limité)
      const response = await axios.get(
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`
      );
      
      if (response.data && response.data[0]) {
        let translated = '';
        for (const part of response.data[0]) {
          translated += part[0];
        }
        return translated || text;
      }
      return text;
    } catch (error) {
      console.error('Erreur API Google:', error);
      return text;
    }
  }

  // Traduire un message complet (détection automatique)
  async translateMessage(text: string, toLang: 'fr' | 'ha'): Promise<string> {
    if (!this.translateEnabled) return text;
    
    if (toLang === 'fr') {
      return this.translateToFrench(text);
    } else {
      return this.translateToHausa(text);
    }
  }
}

export const translationService = new TranslationService();
