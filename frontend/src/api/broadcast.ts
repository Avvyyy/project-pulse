export interface BroadcastEvent {
  type: 'event' | 'error_group' | 'connected';
  id?: string; // For 'connected' type
  service?: string;
  level?: string;
  message?: string;
  timestamp?: string;
  eventId?: string;
  groupId?: string;
}

export class EventBroadcast {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners: ((event: BroadcastEvent) => void)[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(baseUrl: string = '') {
    // Convert http/https to ws/wss
    let wsUrl = baseUrl || window.location.origin;
    wsUrl = wsUrl.replace(/^http/, 'ws');
    this.url = `${wsUrl}/api/v1/ws`;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('✅ WebSocket connected');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as BroadcastEvent;
            this.listeners.forEach((listener) => listener(data));
          } catch (e) {
            console.error('Failed to parse WebSocket message:', e);
          }
        };

        this.ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('⚠️ WebSocket disconnected');
          this.attemptReconnect();
        };
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Subscribe to events
   */
  subscribe(listener: (event: BroadcastEvent) => void): () => void {
    this.listeners.push(listener);
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Attempt to reconnect after disconnection
   */
  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(`🔄 Attempting reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch((e) => {
        console.error('Reconnection failed:', e);
      });
    }, delay);
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.listeners = [];
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
let broadcaster: EventBroadcast | null = null;

export function getBroadcaster(baseUrl?: string): EventBroadcast {
  if (!broadcaster) {
    broadcaster = new EventBroadcast(baseUrl);
  }
  return broadcaster;
}

export function resetBroadcaster() {
  if (broadcaster) {
    broadcaster.disconnect();
    broadcaster = null;
  }
}
