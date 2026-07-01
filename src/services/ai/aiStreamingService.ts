// Service de streaming IA - Envoie les réponses LLM en temps réel à l'appareil connecté
import {makeAutoObservable, runInAction} from 'mobx';
import {connectionStore} from './connectionStore';

export interface AIStreamOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  sendToDevice?: boolean; // Envoyer la réponse à l'appareil connecté
  onChunk?: (chunk: string) => void;
  onProgress?: (tokens: number, totalTokens: number) => void;
  onComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
}

export interface StreamingSession {
  id: string;
  prompt: string;
  model: string;
  startedAt: number;
  completedAt?: number;
  fullResponse: string;
  tokenCount: number;
  status: 'pending' | 'streaming' | 'completed' | 'error';
  error?: Error;
}

interface ActiveStream {
  sessionId: string;
  controller: AbortController;
  onChunk: (chunk: string) => void;
  onProgress: (tokens: number) => void;
  onComplete: (text: string) => void;
  onError: (error: Error) => void;
}

class AIStreamingService {
  private sessions = new Map<string, StreamingSession>();
  private activeStreams = new Map<string, ActiveStream>();
  
  private onSessionCallbacks: ((session: StreamingSession) => void)[] = [];
  private onChunkCallbacks: ((sessionId: string, chunk: string) => void)[] = [];
  
  // Configuration
  private readonly DEFAULT_MODEL = 'qwen-7b';
  private readonly DEFAULT_TEMPERATURE = 0.7;
  private readonly DEFAULT_MAX_TOKENS = 2048;
  private readonly CHUNK_BUFFER_SIZE = 50; // ms
  
  // API endpoints
  private readonly LOCAL_API_ENDPOINT = 'http://localhost:5000/v1/chat/completions';
  private readonly DEVICE_API_ENDPOINT = () => {
    if (connectionStore.connectedDevice?.type === 'wifi') {
      return `http://${connectionStore.connectedDevice.address}/ai/chat`;
    }
    return null;
  };

  constructor() {
    makeAutoObservable(this);
  }

  /**
   * Démarrer un stream de chat IA
   */
  async streamChat(
    prompt: string,
    options: AIStreamOptions = {}
  ): Promise<string> {
    const sessionId = this.generateUUID();
    const model = options.model || this.DEFAULT_MODEL;
    
    const session: StreamingSession = {
      id: sessionId,
      prompt,
      model,
      startedAt: Date.now(),
      fullResponse: '',
      tokenCount: 0,
      status: 'pending',
    };

    runInAction(() => {
      this.sessions.set(sessionId, session);
    });

    // Notifier les listeners
    this.onSessionCallbacks.forEach(cb => cb(session));

    try {
      const fullText = await this.performStream(
        sessionId,
        prompt,
        model,
        options
      );

      runInAction(() => {
        session.fullResponse = fullText;
        session.status = 'completed';
        session.completedAt = Date.now();
      });

      options.onComplete?.(fullText);
      this.onSessionCallbacks.forEach(cb => cb(session));

      // Envoyer à l'appareil si connecté
      if (options.sendToDevice && connectionStore.status === 'connected') {
        await connectionStore.sendAiResponseStream(fullText);
      }

      return fullText;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      
      runInAction(() => {
        session.error = err;
        session.status = 'error';
        session.completedAt = Date.now();
      });

      options.onError?.(err);
      this.onSessionCallbacks.forEach(cb => cb(session));
      throw err;
    }
  }

  /**
   * Effectuer le streaming depuis l'API
   */
  private async performStream(
    sessionId: string,
    prompt: string,
    model: string,
    options: AIStreamOptions
  ): Promise<string> {
    const controller = new AbortController();
    let fullText = '';
    let tokenCount = 0;

    const session = this.sessions.get(sessionId)!;
    
    // Wrapper callbacks
    const onChunk = (chunk: string) => {
      fullText += chunk;
      tokenCount++;
      
      runInAction(() => {
        session.fullResponse = fullText;
        session.tokenCount = tokenCount;
      });

      options.onChunk?.(chunk);
      options.onProgress?.(tokenCount, options.maxTokens || this.DEFAULT_MAX_TOKENS);
      this.onChunkCallbacks.forEach(cb => cb(sessionId, chunk));
    };

    const onProgress = (tokens: number) => {
      runInAction(() => {
        session.tokenCount = tokens;
      });
      options.onProgress?.(tokens, options.maxTokens || this.DEFAULT_MAX_TOKENS);
    };

    const activeStream: ActiveStream = {
      sessionId,
      controller,
      onChunk,
      onProgress,
      onComplete: options.onComplete || (() => {}),
      onError: options.onError || (() => {}),
    };

    this.activeStreams.set(sessionId, activeStream);

    try {
      runInAction(() => {
        session.status = 'streaming';
      });

      // Essayer d'abord l'API locale (Ollama, LM Studio, etc)
      try {
        return await this.streamFromLocalAPI(sessionId, prompt, model, options, controller);
      } catch (localError) {
        console.warn('[AIStreaming] Local API failed, trying device:', localError);
        
        // Fallback à l'API de l'appareil connecté
        if (connectionStore.status === 'connected') {
          return await this.streamFromDeviceAPI(sessionId, prompt, model, options, controller);
        }
        throw localError;
      }
    } finally {
      this.activeStreams.delete(sessionId);
    }
  }

  /**
   * Stream depuis l'API locale (OpenAI compatible)
   */
  private async streamFromLocalAPI(
    sessionId: string,
    prompt: string,
    model: string,
    options: AIStreamOptions,
    controller: AbortController
  ): Promise<string> {
    const payload = {
      model,
      messages: [
        {
          role: 'system',
          content: options.systemPrompt || 'You are a helpful AI assistant.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: options.temperature ?? this.DEFAULT_TEMPERATURE,
      max_tokens: options.maxTokens ?? this.DEFAULT_MAX_TOKENS,
      stream: true,
    };

    const response = await fetch(this.LOCAL_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return this.processSSEStream(sessionId, response, options);
  }

  /**
   * Stream depuis l'API de l'appareil
   */
  private async streamFromDeviceAPI(
    sessionId: string,
    prompt: string,
    model: string,
    options: AIStreamOptions,
    controller: AbortController
  ): Promise<string> {
    const endpoint = this.DEVICE_API_ENDPOINT();
    if (!endpoint) {
      throw new Error('No device connected');
    }

    const payload = {
      prompt,
      model,
      temperature: options.temperature ?? this.DEFAULT_TEMPERATURE,
      max_tokens: options.maxTokens ?? this.DEFAULT_MAX_TOKENS,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Device API error: ${response.statusText}`);
    }

    // L'appareil peut répondre en JSON simple ou en SSE
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('event-stream')) {
      return this.processSSEStream(sessionId, response, options);
    } else {
      return this.processJSONResponse(sessionId, response, options);
    }
  }

  /**
   * Traiter un stream SSE (Server-Sent Events)
   */
  private async processSSEStream(
    sessionId: string,
    response: Response,
    options: AIStreamOptions
  ): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    const stream = this.activeStreams.get(sessionId);
    if (!stream) throw new Error('Stream not found');

    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, {stream: true});
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.slice(6);
              if (jsonStr === '[DONE]') continue;

              const data = JSON.parse(jsonStr);
              const chunk = data.choices?.[0]?.delta?.content || '';

              if (chunk) {
                fullText += chunk;
                stream.onChunk(chunk);
                
                // Envoyer progressivement à l'appareil si connecté
                if (options.sendToDevice && connectionStore.status === 'connected') {
                  // Buffer et envoyer par chunks
                  if (fullText.length % 100 === 0) {
                    // À ajuster selon la latence réseau
                  }
                }
              }
            } catch (e) {
              console.error('[AIStreaming] JSON parse error:', e);
            }
          }
        }
      }

      // Traiter le dernier buffer
      if (buffer.startsWith('data: ')) {
        try {
          const jsonStr = buffer.slice(6);
          if (jsonStr !== '[DONE]') {
            const data = JSON.parse(jsonStr);
            const chunk = data.choices?.[0]?.delta?.content || '';
            if (chunk) {
              fullText += chunk;
              stream.onChunk(chunk);
            }
          }
        } catch (e) {
          console.error('[AIStreaming] Final JSON parse error:', e);
        }
      }

      return fullText;
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Traiter une réponse JSON simple
   */
  private async processJSONResponse(
    sessionId: string,
    response: Response,
    options: AIStreamOptions
  ): Promise<string> {
    const data = await response.json();
    const text = data.response || data.text || data.content || '';

    const stream = this.activeStreams.get(sessionId);
    if (stream) {
      // Envoyer par chunks
      const chunkSize = 50;
      for (let i = 0; i < text.length; i += chunkSize) {
        const chunk = text.slice(i, i + chunkSize);
        stream.onChunk(chunk);
        await this.delay(10);
      }
    }

    return text;
  }

  /**
   * Annuler un stream en cours
   */
  cancelStream(sessionId: string): void {
    const stream = this.activeStreams.get(sessionId);
    if (stream) {
      stream.controller.abort();
      this.activeStreams.delete(sessionId);

      const session = this.sessions.get(sessionId);
      if (session) {
        runInAction(() => {
          session.status = 'error';
          session.completedAt = Date.now();
          session.error = new Error('Stream cancelled by user');
        });
      }
    }
  }

  /**
   * Obtenir une session
   */
  getSession(sessionId: string): StreamingSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Obtenir toutes les sessions
   */
  getAllSessions(): StreamingSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Effacer l'historique des sessions
   */
  clearHistory(): void {
    runInAction(() => {
      this.sessions.clear();
    });
  }

  /**
   * Listeners
   */
  onSession(callback: (session: StreamingSession) => void): () => void {
    this.onSessionCallbacks.push(callback);
    return () => {
      this.onSessionCallbacks = this.onSessionCallbacks.filter(c => c !== callback);
    };
  }

  onChunk(callback: (sessionId: string, chunk: string) => void): () => void {
    this.onChunkCallbacks.push(callback);
    return () => {
      this.onChunkCallbacks = this.onChunkCallbacks.filter(c => c !== callback);
    };
  }

  /**
   * Statistiques
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    completedSessions: number;
    failedSessions: number;
    averageTokens: number;
  } {
    const sessions = Array.from(this.sessions.values());
    const completed = sessions.filter(s => s.status === 'completed');
    const failed = sessions.filter(s => s.status === 'error');
    const active = this.activeStreams.size;

    const avgTokens = completed.length > 0
      ? Math.round(completed.reduce((sum, s) => sum + s.tokenCount, 0) / completed.length)
      : 0;

    return {
      totalSessions: sessions.length,
      activeSessions: active,
      completedSessions: completed.length,
      failedSessions: failed.length,
      averageTokens: avgTokens,
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

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const aiStreamingService = new AIStreamingService();
