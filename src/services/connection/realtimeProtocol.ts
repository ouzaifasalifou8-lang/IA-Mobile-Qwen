// Service de protocole temps réel optimisé pour communication bidirectionnelle
// Support : texte, audio (opus codec), vidéo (h264), fichiers en chunks
import {makeAutoObservable, runInAction} from 'mobx';

export type MessageType = 'text' | 'audio' | 'video' | 'file' | 'command' | 'ai_response' | 'heartbeat' | 'ack' | 'stream_start' | 'stream_chunk' | 'stream_end';

export interface Frame {
  id: string; // UUID du message
  type: MessageType;
  sequence: number; // Pour le réassemblage
  totalChunks: number;
  chunkIndex: number;
  timestamp: number;
  sender: 'app' | 'device';
  payload: Uint8Array; // Binary data
  metadata?: {
    codec?: string; // opus, h264, etc
    mimeType?: string; // audio/opus, video/h264, etc
    filename?: string;
    filesize?: number;
    duration?: number; // ms pour audio/video
    bitrate?: number; // kbps
    priority?: 'low' | 'normal' | 'high';
    compression?: 'none' | 'gzip' | 'brotli';
  };
  checksum?: string; // SHA256 du payload pour vérification intégrité
}

export interface StreamBuffer {
  id: string;
  type: MessageType;
  chunks: Map<number, Uint8Array>;
  totalChunks: number;
  receivedChunks: number;
  createdAt: number;
  lastUpdated: number;
  metadata?: Record<string, any>;
}

interface QueuedMessage {
  frame: Frame;
  retries: number;
  maxRetries: number;
  lastSent: number;
}

class RealtimeProtocolService {
  private chunks = new Map<string, Uint8Array[]>();
  private streamBuffers = new Map<string, StreamBuffer>();
  private outgoingQueue: QueuedMessage[] = [];
  private pendingAcks = new Map<string, {resolve: () => void; timeout: NodeJS.Timeout}>();
  
  // Configuration
  private readonly CHUNK_SIZE = 16384; // 16KB chunks
  private readonly HEARTBEAT_INTERVAL = 30000; // 30s
  private readonly ACK_TIMEOUT = 5000; // 5s
  private readonly MAX_RETRIES = 3;
  private readonly COMPRESSION_THRESHOLD = 4096; // Compresser si > 4KB
  
  private heartbeatTimer: NodeJS.Timer | null = null;
  private onFrameCallbacks: ((frame: Frame) => void)[] = [];
  private onStreamStartCallbacks: ((type: MessageType, id: string) => void)[] = [];
  private onStreamProgressCallbacks: ((progress: number, id: string) => void)[] = [];
  
  constructor() {
    makeAutoObservable(this);
  }

  /**
   * Préparer un frame pour transmission
   */
  private async prepareFrame(
    type: MessageType,
    payload: Uint8Array,
    metadata?: Record<string, any>
  ): Promise<Frame[]> {
    const id = this.generateUUID();
    const frames: Frame[] = [];
    
    // Déterminer la compression
    let processedPayload = payload;
    let compression: 'none' | 'gzip' | 'brotli' = 'none';
    
    if (payload.length > this.COMPRESSION_THRESHOLD) {
      // Pour la démo, marquer comme compressible (en production, utiliser pako/brotli)
      compression = 'gzip';
      // Dans la vraie implémentation, compresser ici
    }

    // Fragmenter si nécessaire
    const totalChunks = Math.ceil(processedPayload.length / this.CHUNK_SIZE);
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.CHUNK_SIZE;
      const end = Math.min(start + this.CHUNK_SIZE, processedPayload.length);
      const chunk = processedPayload.slice(start, end);
      
      // Calculer le checksum
      const checksum = this.sha256(chunk);
      
      const frame: Frame = {
        id: totalChunks > 1 ? id : this.generateUUID(),
        type,
        sequence: totalChunks > 1 ? i : 0,
        totalChunks,
        chunkIndex: i,
        timestamp: Date.now(),
        sender: 'app',
        payload: chunk,
        metadata: {
          ...metadata,
          compression,
        },
        checksum,
      };
      
      frames.push(frame);
    }
    
    return frames;
  }

  /**
   * Envoyer du texte
   */
  async sendText(text: string, priority: 'low' | 'normal' | 'high' = 'normal'): Promise<string> {
    const payload = this.textToUint8Array(text);
    const frames = await this.prepareFrame('text', payload, {priority});
    
    for (const frame of frames) {
      this.queueForSend(frame);
    }
    
    return frames[0]?.id || '';
  }

  /**
   * Envoyer une réponse IA en streaming
   */
  async sendAiResponseStream(
    text: string,
    onProgress?: (sent: number, total: number) => void
  ): Promise<void> {
    const payload = this.textToUint8Array(text);
    const frames = await this.prepareFrame('ai_response', payload, {priority: 'high'});
    
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      this.queueForSend(frame);
      
      // Callback de progression
      const sentBytes = Math.min((i + 1) * this.CHUNK_SIZE, payload.length);
      onProgress?.(sentBytes, payload.length);
      
      // Délai pour éviter congestion
      if (i < frames.length - 1) {
        await this.delay(10);
      }
    }
  }

  /**
   * Envoyer de l'audio en chunks
   */
  async sendAudioStream(
    audioBuffer: Uint8Array,
    codec: 'opus' | 'aac' = 'opus',
    bitrate: number = 32, // kbps
    onProgress?: (sent: number, total: number) => void
  ): Promise<string> {
    const frames = await this.prepareFrame('audio', audioBuffer, {
      codec,
      mimeType: `audio/${codec}`,
      bitrate,
      priority: 'high',
    });
    
    const id = frames[0]?.id || '';
    
    // Annoncer le début du stream
    this.onStreamStartCallbacks.forEach(cb => cb('audio', id));
    
    for (let i = 0; i < frames.length; i++) {
      this.queueForSend(frames[i]);
      
      const progress = ((i + 1) / frames.length) * 100;
      onProgress?.(i + 1, frames.length);
      this.onStreamProgressCallbacks.forEach(cb => cb(progress, id));
      
      await this.delay(5);
    }
    
    return id;
  }

  /**
   * Envoyer de la vidéo en chunks
   */
  async sendVideoStream(
    videoBuffer: Uint8Array,
    codec: 'h264' | 'h265' = 'h264',
    bitrate: number = 1000, // kbps
    fps: number = 30,
    onProgress?: (sent: number, total: number) => void
  ): Promise<string> {
    const frames = await this.prepareFrame('video', videoBuffer, {
      codec,
      mimeType: `video/${codec}`,
      bitrate,
      duration: Math.round((videoBuffer.length / bitrate) * 1000),
      priority: 'high',
    });
    
    const id = frames[0]?.id || '';
    
    this.onStreamStartCallbacks.forEach(cb => cb('video', id));
    
    // Calculer délai entre chunks basé sur FPS
    const delayBetweenChunks = Math.max(1, 1000 / fps / 10);
    
    for (let i = 0; i < frames.length; i++) {
      this.queueForSend(frames[i]);
      
      const progress = ((i + 1) / frames.length) * 100;
      onProgress?.(i + 1, frames.length);
      this.onStreamProgressCallbacks.forEach(cb => cb(progress, id));
      
      await this.delay(delayBetweenChunks);
    }
    
    return id;
  }

  /**
   * Envoyer un fichier en chunks
   */
  async sendFile(
    filename: string,
    fileBuffer: Uint8Array,
    mimeType: string = 'application/octet-stream',
    onProgress?: (sent: number, total: number) => void
  ): Promise<string> {
    const frames = await this.prepareFrame('file', fileBuffer, {
      filename,
      mimeType,
      filesize: fileBuffer.length,
      priority: 'normal',
    });
    
    const id = frames[0]?.id || '';
    
    this.onStreamStartCallbacks.forEach(cb => cb('file', id));
    
    for (let i = 0; i < frames.length; i++) {
      this.queueForSend(frames[i]);
      
      const progress = ((i + 1) / frames.length) * 100;
      onProgress?.(i + 1, frames.length);
      this.onStreamProgressCallbacks.forEach(cb => cb(progress, id));
      
      await this.delay(2);
    }
    
    return id;
  }

  /**
   * Traiter un frame reçu
   */
  processReceivedFrame(data: Uint8Array): void {
    try {
      const frame = this.deserializeFrame(data);
      
      if (frame.totalChunks > 1) {
        // Réassemblage multi-chunk
        const bufferId = frame.id;
        
        if (!this.streamBuffers.has(bufferId)) {
          this.streamBuffers.set(bufferId, {
            id: bufferId,
            type: frame.type,
            chunks: new Map(),
            totalChunks: frame.totalChunks,
            receivedChunks: 0,
            createdAt: Date.now(),
            lastUpdated: Date.now(),
            metadata: frame.metadata,
          });
          
          this.onStreamStartCallbacks.forEach(cb => cb(frame.type, bufferId));
        }
        
        const buffer = this.streamBuffers.get(bufferId)!;
        buffer.chunks.set(frame.chunkIndex, frame.payload);
        buffer.receivedChunks = buffer.chunks.size;
        buffer.lastUpdated = Date.now();
        
        // Progression
        const progress = (buffer.receivedChunks / buffer.totalChunks) * 100;
        this.onStreamProgressCallbacks.forEach(cb => cb(progress, bufferId));
        
        // Envoyer ACK
        this.sendAck(frame.id, frame.chunkIndex);
        
        // Complet ?
        if (buffer.receivedChunks === buffer.totalChunks) {
          const completePayload = this.reassembleChunks(buffer.chunks, buffer.totalChunks);
          const completeFrame: Frame = {
            ...frame,
            payload: completePayload,
          };
          this.onFrameCallbacks.forEach(cb => cb(completeFrame));
          this.streamBuffers.delete(bufferId);
        }
      } else {
        // Single-chunk, traiter directement
        this.sendAck(frame.id, 0);
        this.onFrameCallbacks.forEach(cb => cb(frame));
      }
    } catch (e) {
      console.error('[RealtimeProtocol] Erreur traitement frame:', e);
    }
  }

  /**
   * Mettre en queue un message à envoyer
   */
  private queueForSend(frame: Frame): void {
    this.outgoingQueue.push({
      frame,
      retries: 0,
      maxRetries: this.MAX_RETRIES,
      lastSent: 0,
    });
  }

  /**
   * Obtenir les messages à envoyer (stratégie de priorité)
   */
  getNextFrames(count: number = 5): Frame[] {
    const frames: Frame[] = [];
    
    // Trier par priorité et ordre
    this.outgoingQueue.sort((a, b) => {
      const priorityOrder = {high: 0, normal: 1, low: 2};
      const aPriority = priorityOrder[a.frame.metadata?.priority as keyof typeof priorityOrder] ?? 1;
      const bPriority = priorityOrder[b.frame.metadata?.priority as keyof typeof priorityOrder] ?? 1;
      return aPriority - bPriority;
    });
    
    while (frames.length < count && this.outgoingQueue.length > 0) {
      const msg = this.outgoingQueue.shift()!;
      frames.push(msg.frame);
    }
    
    return frames;
  }

  /**
   * Retry un message échoué
   */
  retryFrame(frame: Frame): void {
    const queuedMsg = this.outgoingQueue.find(m => m.frame.id === frame.id);
    if (queuedMsg) {
      queuedMsg.retries++;
      if (queuedMsg.retries < queuedMsg.maxRetries) {
        queuedMsg.lastSent = Date.now();
      } else {
        // Trop de retries, abandonner
        this.outgoingQueue = this.outgoingQueue.filter(m => m.frame.id !== frame.id);
      }
    }
  }

  /**
   * Envoyer un ACK
   */
  private sendAck(messageId: string, chunkIndex: number): void {
    const ackPayload = JSON.stringify({messageId, chunkIndex});
    const frame: Frame = {
      id: this.generateUUID(),
      type: 'ack',
      sequence: 0,
      totalChunks: 1,
      chunkIndex: 0,
      timestamp: Date.now(),
      sender: 'app',
      payload: this.textToUint8Array(ackPayload),
    };
    this.queueForSend(frame);
  }

  /**
   * Heartbeat
   */
  startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    
    this.heartbeatTimer = setInterval(() => {
      const frame: Frame = {
        id: this.generateUUID(),
        type: 'heartbeat',
        sequence: 0,
        totalChunks: 1,
        chunkIndex: 0,
        timestamp: Date.now(),
        sender: 'app',
        payload: new Uint8Array([0]),
      };
      this.queueForSend(frame);
    }, this.HEARTBEAT_INTERVAL);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Listeners
   */
  onFrame(callback: (frame: Frame) => void): () => void {
    this.onFrameCallbacks.push(callback);
    return () => {
      this.onFrameCallbacks = this.onFrameCallbacks.filter(c => c !== callback);
    };
  }

  onStreamStart(callback: (type: MessageType, id: string) => void): () => void {
    this.onStreamStartCallbacks.push(callback);
    return () => {
      this.onStreamStartCallbacks = this.onStreamStartCallbacks.filter(c => c !== callback);
    };
  }

  onStreamProgress(callback: (progress: number, id: string) => void): () => void {
    this.onStreamProgressCallbacks.push(callback);
    return () => {
      this.onStreamProgressCallbacks = this.onStreamProgressCallbacks.filter(c => c !== callback);
    };
  }

  /**
   * Utilitaires
   */
  private textToUint8Array(text: string): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(text);
  }

  private uint8ArrayToText(buffer: Uint8Array): string {
    const decoder = new TextDecoder();
    return decoder.decode(buffer);
  }

  private reassembleChunks(chunks: Map<number, Uint8Array>, total: number): Uint8Array {
    let totalLength = 0;
    for (let i = 0; i < total; i++) {
      totalLength += chunks.get(i)?.length ?? 0;
    }
    
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (let i = 0; i < total; i++) {
      const chunk = chunks.get(i);
      if (chunk) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
    }
    return result;
  }

  private serializeFrame(frame: Frame): Uint8Array {
    // Format simple: header + payload
    const header = JSON.stringify({
      id: frame.id,
      type: frame.type,
      sequence: frame.sequence,
      totalChunks: frame.totalChunks,
      chunkIndex: frame.chunkIndex,
      timestamp: frame.timestamp,
      sender: frame.sender,
      metadata: frame.metadata,
      checksum: frame.checksum,
    });
    
    const headerBytes = this.textToUint8Array(header);
    const headerLen = new Uint32Array([headerBytes.length]);
    
    const result = new Uint8Array(4 + headerBytes.length + frame.payload.length);
    result.set(new Uint8Array(headerLen.buffer), 0);
    result.set(headerBytes, 4);
    result.set(frame.payload, 4 + headerBytes.length);
    
    return result;
  }

  private deserializeFrame(data: Uint8Array): Frame {
    const headerLen = new Uint32Array(data.slice(0, 4).buffer)[0];
    const headerBytes = data.slice(4, 4 + headerLen);
    const payload = data.slice(4 + headerLen);
    
    const header = JSON.parse(this.uint8ArrayToText(headerBytes));
    
    return {
      ...header,
      payload,
    };
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private sha256(data: Uint8Array): string {
    // Stub - en production, utiliser TweetNaCl ou libsodium
    return 'sha256_' + Math.random().toString(36);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Stats
  getQueueSize(): number {
    return this.outgoingQueue.length;
  }

  getStreamBufferCount(): number {
    return this.streamBuffers.size;
  }

  clearOldBuffers(maxAge: number = 60000): void {
    const now = Date.now();
    for (const [id, buffer] of this.streamBuffers.entries()) {
      if (now - buffer.lastUpdated > maxAge) {
        this.streamBuffers.delete(id);
      }
    }
  }
}

export const realtimeProtocol = new RealtimeProtocolService();
