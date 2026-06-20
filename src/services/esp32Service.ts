const ESP32_IP = '192.168.1.100';
const BASE_URL = `http://${ESP32_IP}`;

export class ESP32Service {
  static async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return response.status === 200;
    } catch (error) {
      console.error('ESP32 connection error:', error);
      return false;
    }
  }

  static async sendMessage(text: string): Promise<void> {
    try {
      await fetch(`${BASE_URL}/msg`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'text',
          payload: text,
        }),
      });
    } catch (error) {
      console.error('Error sending message to ESP32:', error);
    }
  }

  static async sendResponse(responseText: string): Promise<void> {
    try {
      await fetch(`${BASE_URL}/msg`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'response',
          payload: responseText,
        }),
      });
    } catch (error) {
      console.error('Error sending response to ESP32:', error);
    }
  }

  static async controlLED(led: string, action: string): Promise<void> {
    try {
      await fetch(`${BASE_URL}/led?l=${led}&a=${action}`, {
        method: 'GET',
      });
    } catch (error) {
      console.error('Error controlling LED:', error);
    }
  }
}
