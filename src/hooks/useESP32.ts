import { useState } from 'react';
import { ESP32Service } from '../services/esp32Service';

export const useESP32 = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const testConnection = async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const connected = await ESP32Service.testConnection();
      setIsConnected(connected);
      return connected;
    } catch (error) {
      setIsConnected(false);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (text: string): Promise<boolean> => {
    try {
      await ESP32Service.sendMessage(text);
      return true;
    } catch (error) {
      return false;
    }
  };

  const sendResponse = async (text: string): Promise<void> => {
    try {
      await ESP32Service.sendResponse(text);
    } catch (error) {
      console.error('Failed to send response:', error);
    }
  };

  const controlLED = async (led: string, action: string): Promise<boolean> => {
    try {
      await ESP32Service.controlLED(led, action);
      return true;
    } catch (error) {
      return false;
    }
  };

  return {
    isConnected,
    isLoading,
    testConnection,
    sendMessage,
    sendResponse,
    controlLED,
  };
};
