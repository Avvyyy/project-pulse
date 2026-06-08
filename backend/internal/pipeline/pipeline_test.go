package pipeline

import (
	"testing"
)

func TestFingerprint(t *testing.T) {
	// Same service+level+message → same fingerprint
	fp1 := fingerprint("api", "error", "user 123 not found")
	fp2 := fingerprint("api", "error", "user 456 not found")
	if fp1 != fp2 {
		t.Errorf("expected same fingerprint for similar messages, got %s vs %s", fp1, fp2)
	}

	// Different level → different fingerprint
	fp3 := fingerprint("api", "warn", "user 123 not found")
	if fp1 == fp3 {
		t.Errorf("expected different fingerprint for different level")
	}

	// Deterministic
	if fingerprint("svc", "error", "msg") != fingerprint("svc", "error", "msg") {
		t.Error("fingerprint not deterministic")
	}
}

func TestNormaliseMessage(t *testing.T) {
	cases := []struct{ in, out string }{
		{"user 123 not found", "user <N> not found"},
		{"id=456", "id=<N>"},
		{"no numbers here", "no numbers here"},
		{"1 and 2 and 3", "<N> and <N> and <N>"},
	}
	for _, tc := range cases {
		got := normaliseMessage(tc.in)
		if got != tc.out {
			t.Errorf("normaliseMessage(%q) = %q, want %q", tc.in, got, tc.out)
		}
	}
}

func TestSeverityOf(t *testing.T) {
	cases := map[string]int{"error": 3, "warn": 2, "info": 1, "debug": 0, "trace": 0}
	for level, want := range cases {
		if got := severityOf(level); got != want {
			t.Errorf("severityOf(%q) = %d, want %d", level, got, want)
		}
	}
}

func TestTruncate(t *testing.T) {
	if truncate("hello", 3) != "hel" {
		t.Error("truncate to 3 failed")
	}
	if truncate("hi", 10) != "hi" {
		t.Error("truncate shorter than max should return unchanged")
	}
	// Unicode safety
	s := truncate("日本語テスト", 3)
	if s != "日本語" {
		t.Errorf("unicode truncate got %q", s)
	}
}
