// Service de gestion audio avec support streaming et traitement temps réel
import {makeAutoObservable, runInAction} from 'mobx';
import {connectionStore} from '../connection/connectionStore';

export interface AudioConfig {
  sampleRate: number; // Hz
  channels: number;
  bitDepth: 16 | 24 | 32; // bits
  codec: 'pcm' | 'opus' | 'aac';
  bitrate?: number; // kbps pour opus/aac
}

export interface AudioFrame {
  id: string;
  timestamp: number;
  data: Uint8Array;
  sampleCount: number;
  duration: number; // ms
}

export interface AudioStreamSession {
  id: string;
  config: AudioConfig;
  startedAt: number;
  stoppedAt?: number;
  totalFrames: number;
  totalBytes: number;
  duration: number; // ms
  isRecording: boolean;
  isPlaying: boolean;
}

class AudioStreamingService {
  private sessions = new Map<string, AudioStreamSession>();
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private audioProcessor: ScriptProcessorNode | null = null;
  
  private onFrameCallbacks: ((frame: AudioFrame) => void)[] = [];
  private onStatusChangeCallbacks: ((sessionId: string, status: 'recording' | 'stopped') => void)[] = [];

  // Configuration par défaut
  private readonly DEFAULT_CONFIG: AudioConfig = {
    sampleRate: 16000,
    channels: 1,
    bitDepth: 16,
    codec: 'opus',
    bitrate: 32,
  };

  constructor() {
    makeAutoObservable(this);
  }

  /**
   * Démarrer l'enregistrement audio
   */
  async startRecording(
    config: Partial<AudioConfig> = {}
  ): Promise<string> {
    const sessionId = this.generateUUID();
    const fullConfig: AudioConfig = {...this.DEFAULT_CONFIG, ...config};

    try {
      // Obtenir l'accès au microphone
      if (!this.mediaStream) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: fullConfig.sampleRate,
          },
        });
      }

      // Initialiser le contexte audio
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      // Créer le processeur audio
      const bufferSize = 4096;
      this.audioProcessor = this.audioContext.createScriptProcessor(
        bufferSize,
        fullConfig.channels,
        fullConfig.channels
      );

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.audioProcessor);
      this.audioProcessor.connect(this.audioContext.destination);

      // Créer la session
      const session: AudioStreamSession = {
        id: sessionId,
        config: fullConfig,
        startedAt: Date.now(),
        totalFrames: 0,
        totalBytes: 0,
        duration: 0,
        isRecording: true,
        isPlaying: false,
      };

      runInAction(() => {
        this.sessions.set(sessionId, session);
      });

      // Traiter les données audio
      this.audioProcessor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        const audioData = new Uint8Array(inputData.length * 2);

        // Convertir float32 en PCM16
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          audioData[i * 2] = (s < 0 ? s * 0x8000 : s * 0x7fff) & 0xff;
          audioData[i * 2 + 1] = ((s < 0 ? s * 0x8000 : s * 0x7fff) >> 8) & 0xff;
        }

        // Créer un frame
        const frame: AudioFrame = {
          id: this.generateUUID(),
          timestamp: Date.now(),
          data: audioData,
          sampleCount: inputData.length,
          duration: (inputData.length / fullConfig.sampleRate) * 1000,
        };

        // Mettre à jour la session
        runInAction(() => {
          session.totalFrames++;
          session.totalBytes += audioData.length;
          session.duration = Date.now() - session.startedAt;
        });

        // Notifier les listeners
        this.onFrameCallbacks.forEach(cb => cb(frame));

        // Envoyer à l'appareil connecté
        if (connectionStore.status === 'connected') {
          connectionStore.sendAudioStream(audioData, fullConfig.codec, fullConfig.bitrate);
        }
      };

      this.onStatusChangeCallbacks.forEach(cb => cb(sessionId, 'recording'));
      return sessionId;
    } catch (error) {
      console.error('[AudioStreaming] Recording start failed:', error);
      throw error;
    }
  }

  /**
   * Arrêter l'enregistrement audio
   */
  stopRecording(sessionId: string): AudioStreamSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isRecording) return;

    // Arrêter le traitement audio
    if (this.audioProcessor) {
      this.audioProcessor.disconnect();
      this.audioProcessor = null;
    }

    // Arrêter le stream média
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // Fermer le contexte audio
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // Mettre à jour la session
    runInAction(() => {
      session.isRecording = false;
      session.stoppedAt = Date.now();
    });

    this.onStatusChangeCallbacks.forEach(cb => cb(sessionId, 'stopped'));
    return session;
  }

  /**
   * Lire un buffer audio
   */
  async playAudio(
    audioBuffer: Uint8Array,
    config: AudioConfig = this.DEFAULT_CONFIG
  ): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    // Décoder le buffer audio
    const decodedBuffer = await this.audioContext.decodeAudioData(
      audioBuffer.buffer.slice(0)
    );

    // Créer une source et la jouer
    const source = this.audioContext.createBufferSource();
    source.buffer = decodedBuffer;
    source.connect(this.audioContext.destination);
    source.start(0);

    // Attendre la fin
    return new Promise(resolve => {
      source.onended = () => resolve();
    });
  }

  /**
   * Obtenir la session
   */
  getSession(sessionId: string): AudioStreamSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Listeners
   */
  onFrame(callback: (frame: AudioFrame) => void): () => void {
    this.onFrameCallbacks.push(callback);
    return () => {
      this.onFrameCallbacks = this.onFrameCallbacks.filter(c => c !== callback);
    };
  }

  onStatusChange(callback: (sessionId: string, status: 'recording' | 'stopped') => void): () => void {
    this.onStatusChangeCallbacks.push(callback);
    return () => {
      this.onStatusChangeCallbacks = this.onStatusChangeCallbacks.filter(c => c !== callback);
    };
  }

  /**
   * Utilitaires
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

export const audioStreamingService = new AudioStreamingService();
