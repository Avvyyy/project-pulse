package search

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/elastic/go-elasticsearch/v8"
)

type Client struct {
	es          *elasticsearch.Client
	indexEvents string
	indexGroups string
}

func New(url, indexEvents string) (*Client, error) {
	cfg := elasticsearch.Config{Addresses: []string{url}}
	es, err := elasticsearch.NewClient(cfg)
	if err != nil {
		return nil, fmt.Errorf("create es client: %w", err)
	}
	return &Client{
		es:          es,
		indexEvents: indexEvents,
		indexGroups: indexEvents + "_groups",
	}, nil
}

func (c *Client) EnsureIndices(ctx context.Context) error {
	for _, idx := range []string{c.indexEvents, c.indexGroups} {
		res, err := c.es.Indices.Exists([]string{idx})
		if err != nil {
			return err
		}
		res.Body.Close()
		if res.StatusCode == 404 {
			body := `{"mappings":{"properties":{"timestamp":{"type":"date"},"received_at":{"type":"date"}}}}`
			r, err := c.es.Indices.Create(idx, c.es.Indices.Create.WithBody(strings.NewReader(body)))
			if err != nil {
				return err
			}
			r.Body.Close()
		}
	}
	return nil
}

func (c *Client) IndexEvent(ctx context.Context, id string, doc map[string]any) error {
	b, _ := json.Marshal(doc)
	res, err := c.es.Index(c.indexEvents,
		bytes.NewReader(b),
		c.es.Index.WithDocumentID(id),
		c.es.Index.WithContext(ctx),
	)
	if err != nil {
		return err
	}
	res.Body.Close()
	return nil
}

func (c *Client) IndexGroup(ctx context.Context, id string, doc map[string]any) error {
	b, _ := json.Marshal(doc)
	res, err := c.es.Index(c.indexGroups,
		bytes.NewReader(b),
		c.es.Index.WithDocumentID(id),
		c.es.Index.WithContext(ctx),
	)
	if err != nil {
		return err
	}
	res.Body.Close()
	return nil
}

type SearchResult struct {
	Total   int64            `json:"total"`
	Results []map[string]any `json:"results"`
}

func (c *Client) SearchEvents(ctx context.Context, q, service, level string, page, limit int) (*SearchResult, error) {
	return c.search(ctx, c.indexEvents, q, map[string]string{"service": service, "level": level}, page, limit)
}

func (c *Client) SearchGroups(ctx context.Context, q, service, status string, page, limit int) (*SearchResult, error) {
	return c.search(ctx, c.indexGroups, q, map[string]string{"service": service, "status": status}, page, limit)
}

func (c *Client) search(ctx context.Context, index, q string, filters map[string]string, page, limit int) (*SearchResult, error) {
	must := []map[string]any{}
	if q != "" {
		must = append(must, map[string]any{"multi_match": map[string]any{
			"query":  q,
			"fields": []string{"message", "title", "service", "error_type"},
		}})
	}

	filter := []map[string]any{}
	for field, val := range filters {
		if val != "" {
			filter = append(filter, map[string]any{"term": map[string]any{field + ".keyword": val}})
		}
	}

	query := map[string]any{
		"query": map[string]any{
			"bool": map[string]any{
				"must":   must,
				"filter": filter,
			},
		},
		"from": (page - 1) * limit,
		"size": limit,
		"sort": []map[string]any{{"_score": "desc"}},
	}

	b, _ := json.Marshal(query)
	res, err := c.es.Search(
		c.es.Search.WithIndex(index),
		c.es.Search.WithBody(bytes.NewReader(b)),
		c.es.Search.WithContext(ctx),
	)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	var raw struct {
		Hits struct {
			Total struct{ Value int64 } `json:"total"`
			Hits  []struct {
				Source map[string]any `json:"_source"`
			} `json:"hits"`
		} `json:"hits"`
	}
	if err := json.NewDecoder(res.Body).Decode(&raw); err != nil {
		return nil, err
	}

	results := make([]map[string]any, 0, len(raw.Hits.Hits))
	for _, h := range raw.Hits.Hits {
		results = append(results, h.Source)
	}
	return &SearchResult{Total: raw.Hits.Total.Value, Results: results}, nil
}

func (c *Client) Ping(ctx context.Context) error {
	res, err := c.es.Ping(c.es.Ping.WithContext(ctx))
	if err != nil {
		return err
	}
	res.Body.Close()
	if res.IsError() {
		return fmt.Errorf("es ping status %d", res.StatusCode)
	}
	return nil
}
