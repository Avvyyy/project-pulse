const axios = require('axios');

async function pulseLog(level, message, context = []) {
  try {
    await axios.post('http://localhost:8080/api/v1/ingest', {
      environment: process.env.NODE_ENV || 'development',
      level: level,
      message: message,
      tags: context
    }, {
      headers: {
        'X-Api-Key': process.env.API_KEY
      }
    });
  } catch (err) {
    if (err.response) {
      console.error("Failed to send event to Pulse:", err.response.status, err.response.data);
    } else {
      console.error("Failed to send event to Pulse:", err.message);
    }
  }
}

module.exports = pulseLog;
