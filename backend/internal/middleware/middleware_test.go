package middleware

import "testing"

func TestHashKey(t *testing.T) {
    raw := "pk_e39a9c1c49569c879aac4f5dd5b11ecb59360fe1ddef92c5be530834b7481a15"
    expected := "68ba73a5361ebc4c9df40a42eac892017f0dc88d0431919a6ff2cbfe8e660fbf"

    got := hashKey(raw)
    if got != expected {
        t.Fatalf("expected %s, got %s", expected, got)
    }
}
