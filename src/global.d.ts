declare module 'react-native/Libraries/Blob/Blob' {
  class Blob {
    constructor(parts: Array<Blob | string>);

    get size(): number;
  }

  export default Blob;
}

declare module '*.png' {
  const value: any;
  export default value;
}

declare module '*.svg' {
  import React from 'react';
  import {SvgProps} from 'react-native-svg';
  const content: React.FC<SvgProps>;
  export default content;
}

// Déclaration de type pour react-native-voice
declare module 'react-native-voice' {
  export interface SpeechResultsEvent {
    value?: string[];
  }
  export interface SpeechErrorEvent {
    error?: {message?: string; code?: string};
  }
  const Voice: {
    start: (locale: string) => Promise<void>;
    stop: () => Promise<void>;
    destroy: () => Promise<void>;
    removeAllListeners: () => void;
    onSpeechStart: ((e: any) => void) | null;
    onSpeechEnd: ((e: any) => void) | null;
    onSpeechResults: ((e: SpeechResultsEvent) => void) | null;
    onSpeechError: ((e: SpeechErrorEvent) => void) | null;
  };
  export default Voice;
}
