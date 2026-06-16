const Router = require("express").Router;
const pulseLog = require('./pulseLog');


const api = new Router();
// ── Route 2: JSON – single user object ──────────────────────────────────────
api.get("/users", (req, res) => {
  pulseLog('info', 'Get User', []);
  res.json({
    id: 1,
    name: "Ada Lovelace",
    email: "ada@example.com",
    role: "admin",
  });
});

// ── Route 3: JSON – list of products ────────────────────────────────────────
api.get("/products", (req, res) => {
  pulseLog('info', 'Get Products', []);
  res.json([
    { id: 101, name: "Widget A", price: 9.99, inStock: true },
    { id: 102, name: "Gadget B", price: 24.99, inStock: false },
    { id: 103, name: "Doohickey C", price: 4.49, inStock: true },
  ]);
});

// ── Route 4: Plain text – server status ─────────────────────────────────────
api.get("/status", (req, res) => {
  pulseLog('info', 'Get Status', []);
  res.send("Server is running. All systems nominal.");
});

// ── Route 5: JSON – analytics / event summary ────────────────────────────────
api.get("/events", (req, res) => {
  pulseLog('info', 'Get Events', []);
  res.json({
    totalEvents: 42,
    lastRecorded: "2026-06-15T13:00:00Z",
    breakdown: {
      clicks: 18,
      pageViews: 15,
      formSubmits: 7,
      errors: 2,
    },
  });
});

module.exports = api;
