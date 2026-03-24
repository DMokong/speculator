// Test fixture: Clean code that should NOT trigger the secrets scan.
// These patterns look similar but are legitimate — no false positives expected.

// Environment variable references (correct pattern)
const apiKey = process.env.API_KEY;
const dbPassword = process.env.DATABASE_PASSWORD;
const secret = process.env.SECRET_KEY;

// Secret manager references (correct pattern)
const token = await secretManager.get('auth-token');
const credential = config.getSecret('client-credential');

// Placeholder values in documentation/examples
const exampleKey = "your-api-key-here";
const exampleToken = "<INSERT_TOKEN>";
const placeholder = "REPLACE_WITH_YOUR_KEY";

// Variable declarations without assignments to literals
let password;
let auth_token = getTokenFromVault();
const client_secret = await fetchSecret('client');

// Short strings that happen to match variable names
const api_key_name = "X-API-Key";  // header name, not a secret
const password_field = "password";  // field name, not a secret

// Config reading from external sources
const config = JSON.parse(fs.readFileSync('.env.local'));
const apiKey2 = config.apiKey; // reading from config object, not hardcoded

module.exports = { /* clean code fixture */ };
