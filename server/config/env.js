// Load server/.env before anything reads process.env. Every entry point
// (server.js and the CLI scripts) reaches config/db.js, which requires this
// first, so a DATABASE_URL in .env is honoured. dotenv never overwrites a
// variable that is already set in the real environment.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
