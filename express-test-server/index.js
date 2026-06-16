require("dotenv").config();
const express = require("express");
const app = express();
const PORT = 4000;

const api = require('./routes');
const errorLog = require('./middleware');
const pulseLog = require('./pulseLog');


app.use("/api", api);
app.use(errorLog);


// ── Route 1: Plain text greeting ────────────────────────────────────────────
app.get("/", (req, res) => {
  pulseLog('info', 'server started', []);
  res.send("Hello! Welcome to the Express test server.");
});




app.listen(PORT, () => {
  console.log(`\n✅  Express test server running at http://localhost:${PORT}`);
  console.log("    Routes available:");
  console.log("      GET /          → plain text greeting");
  console.log("      GET /api/user      → JSON user object");
  console.log("      GET /api/products  → JSON product list");
  console.log("      GET /api/status    → plain text status");
  console.log("      GET /api/events    → JSON event summary\n");
});
