package queue

import (
	"context"
	"sync"
)

// Job is a unit of work for the ingestion pipeline.
type Job struct {
	Payload []byte
	// Populated by the handler before enqueuing
	Service     string
	Environment string
	Level       string
	Message     string
	ErrorType   string
	Tags        []string
	Timestamp   int64 // unix nano, 0 = use now
	Extra       []byte
}

// Handler processes a single job.
type Handler func(ctx context.Context, job Job)

// Queue is a buffered, concurrent worker pool.
type Queue struct {
	jobs    chan Job
	handler Handler
	wg      sync.WaitGroup
}

func New(concurrency, bufSize int, handler Handler) *Queue {
	q := &Queue{
		jobs:    make(chan Job, bufSize),
		handler: handler,
	}
	q.wg.Add(concurrency)
	for i := 0; i < concurrency; i++ {
		go q.worker()
	}
	return q
}

// Enqueue adds a job to the queue. Drops the job if the buffer is full (non-blocking).
func (q *Queue) Enqueue(job Job) bool {
	select {
	case q.jobs <- job:
		return true
	default:
		return false
	}
}

// Shutdown drains and stops the queue.
func (q *Queue) Shutdown() {
	close(q.jobs)
	q.wg.Wait()
}

func (q *Queue) worker() {
	defer q.wg.Done()
	ctx := context.Background()
	for job := range q.jobs {
		q.handler(ctx, job)
	}
}
