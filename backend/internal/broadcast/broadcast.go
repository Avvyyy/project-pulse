package broadcast

import (
	"context"
	"sync"
)

// Event represents a real-time event broadcast to all connected clients.
type Event struct {
	Type      string // "event", "error_group"
	Service   string
	Level     string
	Message   string
	Timestamp string // ISO8601
	EventID   string
	GroupID   string
}

// Subscriber receives events through a channel.
type Subscriber struct {
	ID   string
	Ch   chan Event
	done chan struct{}
}

// Broadcaster manages pub/sub for real-time events.
type Broadcaster struct {
	mu          sync.RWMutex
	subscribers map[string]*Subscriber
	events      chan Event
	done        chan struct{}
}

// New creates a new broadcaster.
func New() *Broadcaster {
	b := &Broadcaster{
		subscribers: make(map[string]*Subscriber),
		events:      make(chan Event, 100),
		done:        make(chan struct{}),
	}
	go b.run()
	return b
}

// Subscribe adds a new subscriber.
func (b *Broadcaster) Subscribe(id string) *Subscriber {
	b.mu.Lock()
	defer b.mu.Unlock()

	sub := &Subscriber{
		ID:   id,
		Ch:   make(chan Event, 10),
		done: make(chan struct{}),
	}
	b.subscribers[id] = sub
	return sub
}

// Unsubscribe removes a subscriber.
func (b *Broadcaster) Unsubscribe(id string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if sub, ok := b.subscribers[id]; ok {
		close(sub.done)
		close(sub.Ch)
		delete(b.subscribers, id)
	}
}

// Publish broadcasts an event to all subscribers.
func (b *Broadcaster) Publish(ctx context.Context, e Event) {
	select {
	case b.events <- e:
	case <-ctx.Done():
	case <-b.done:
	}
}

// Shutdown stops the broadcaster.
func (b *Broadcaster) Shutdown() {
	close(b.done)
}

// run is the main loop that distributes events to subscribers.
func (b *Broadcaster) run() {
	for {
		select {
		case e := <-b.events:
			b.mu.RLock()
			for _, sub := range b.subscribers {
				select {
				case sub.Ch <- e:
				case <-sub.done:
				default: // Drop event if subscriber is slow
				}
			}
			b.mu.RUnlock()
		case <-b.done:
			return
		}
	}
}
