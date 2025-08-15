// functions/index.js

// Import and export your callable(s)
const { exchangeYahooCodeForToken } = require('./src/auth/yahooTokenExchange');

exports.exchangeYahooCodeForToken = exchangeYahooCodeForToken;