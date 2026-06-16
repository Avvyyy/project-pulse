import { useEffect, useState, useCallback } from 'react';
import { getBroadcaster, type BroadcastEvent } from '../api/broadcast';

/**
 * Hook to connect to the event broadcaster and listen for real-time events
 */
export function useEventBroadcast() {
  const [isConnected, setIsConnected] = useState(false);
  const [events, setEvents] = useState<BroadcastEvent[]>([]);

  useEffect(() => {
    const broadcaster = getBroadcaster();

    // Connect if not already connected
    if (!broadcaster.isConnected()) {
      broadcaster.connect().catch((e) => {
        console.error('Failed to connect to broadcaster:', e);
      });
    }

    // Subscribe to all events
    const unsubscribe = broadcaster.subscribe((event) => {
      setEvents((prev) => [event, ...prev].slice(0, 100)); // Keep last 100 events
      setIsConnected(broadcaster.isConnected());
    });

    // Set initial connection state
    setIsConnected(broadcaster.isConnected());

    // Cleanup
    return () => {
      unsubscribe();
    };
  }, []);

  return { isConnected, events };
}

/**
 * Hook to listen for events and trigger a callback
 */
export function useEventListener(callback: (event: BroadcastEvent) => void) {
  useEffect(() => {
    const broadcaster = getBroadcaster();

    if (!broadcaster.isConnected()) {
      broadcaster.connect().catch((e) => {
        console.error('Failed to connect to broadcaster:', e);
      });
    }

    const unsubscribe = broadcaster.subscribe(callback);

    return () => {
      unsubscribe();
    };
  }, [callback]);
}
