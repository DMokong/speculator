// Test fixture: Fake hardcoded secrets for validating the mandatory secrets scan.
// Every value here is FAKE — generated for testing purposes only.
// The code-reviewer's grep patterns MUST catch each of these.

// --- Category 1: High-entropy secret assignments ---
const api_key = "fake-test-api-key-12345678";
const apikey = "another-fake-key-abcdef";
const api_secret = "supersecret-fake-value-999";
const secret_key = "sk_test_fakefakefake";
const access_key = "AKIAFAKEACCESSKEY1234";
const private_key = "fake-private-key-do-not-use";
const auth_token = "fake-auth-token-xyz789";
const password = "P@ssw0rd_FAKE_testing";
const credential = "fake-credential-value";
const client_secret = "cs_fake_1234567890abcdef";
const app_secret = "as_fake_abcdef1234567890";

// --- Category 2: Known API key formats ---
const awsKey = "AKIAZ7FAKE12345ABCDE";                    // AWS access key
const githubPat = "ghp_FakeToken1234567890abcdefghijklmnopq"; // GitHub PAT
const githubOauth = "gho_FakeOAuth1234567890abcdefghijklmnopq"; // GitHub OAuth
const slackBot = "xoxb-fake-1234567890-abcdefghijkl";     // Slack bot token
const slackUser = "xoxp-fake-9876543210-zyxwvutsrqpo";    // Slack user token
const openaiKey = "sk-FakeOpenAIKey1234567890abcdef";      // OpenAI key
const anthropicKey = "sk-ant-fake-test-key-1234567890abcdef"; // Anthropic key
const googleKey = "AIzaFakeGoogleAPIKey1234567890123456789";  // Google API key
const privateKeyPem = `-----BEGIN RSA PRIVATE KEY-----
MIIFAKEFAKEFAKEnotarealkeyjustfortesting
-----END RSA PRIVATE KEY-----`;
const ecKey = `-----BEGIN EC PRIVATE KEY-----
FAKEECKEYnotarealkeyjustfortesting1234
-----END EC PRIVATE KEY-----`;

// --- Category 3: Connection strings with embedded credentials ---
const dbUrl = "postgres://admin:hunter2fake@db.example.com:5432/myapp";
const mongoUrl = "mongodb://root:fakepass123@mongo.example.com:27017/prod";
const redisUrl = "redis://default:fakeredispass@cache.example.com:6379";
const mysqlUrl = "mysql://dbuser:fakedbpass@mysql.example.com:3306/app";
const amqpUrl = "amqp://rabbit:fakerabbitpass@mq.example.com:5672/vhost";

// --- Category 4: Inline bearer tokens and authorization headers ---
const headers = {
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fakepayload.fakesignature",
};
const authHeader = { Authorization: "Basic dXNlcjpmYWtlcGFzc3dvcmQ=" };

// --- Category 5: Base64-encoded secrets in assignments ---
const secret = "dGhpcyBpcyBhIGZha2Ugc2VjcmV0IHZhbHVlIGZvciB0ZXN0aW5nIHB1cnBvc2VzIG9ubHk=";
const token = "YW5vdGhlcmZha2V0b2tlbnZhbHVlZm9ydGVzdGluZ3RoZXNlY3JldHNzY2Fu";

module.exports = { /* test fixture — not real code */ };
