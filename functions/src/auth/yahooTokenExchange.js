const express = require('express');
const cors = require('cors');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

admin.initializeApp();
const secretClient = new SecretManagerServiceClient();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

async function getSecret(secretName) {
  const [version] = await secretClient.accessSecretVersion({
    name: `projects/${process.env.GCP_PROJECT}/secrets/${secretName}/versions/latest`,
  });
  return version.payload.data.toString();
}

app.post('/token', async (req, res) => {
  try {
    const clientId = await getSecret('YAHOO_CLIENT_ID');
    const clientSecret = await getSecret('YAHOO_CLIENT_SECRET');
    console.log('✅ Yahoo config loaded:', { clientId, clientSecret: !!clientSecret });

    const { code, code_verifier, redirect_uri, state } = req.body || {};
    console.log('📦 Incoming payload:', { code, code_verifier, redirect_uri });
    console.log('🔁 OAuth callback params:', { code, state });

    const payload = {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier,
      redirect_uri,
      grant_type: 'authorization_code',
    };

    console.log('📤 Yahoo token request payload:', payload);

    const tokenResponse = await fetch('https://api.login.yahoo.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(payload),
    });

    const rawText = await tokenResponse.text();
    console.log('📡 Yahoo token response:', rawText);

    if (!tokenResponse.ok) {
      throw new Error(`Yahoo token exchange failed with status ${tokenResponse.status}`);
    }

    const tokenData = JSON.parse(rawText);
    if (!tokenData.id_token) throw new Error('Missing id_token in Yahoo response');

    const base64Url = tokenData.id_token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const decodedPayload = JSON.parse(Buffer.from(base64, 'base64').toString());
    const yahooUserId = decodedPayload.sub;

    const customToken = await admin.auth().createCustomToken(yahooUserId);
    console.log('✅ Firebase custom token created');

    res.status(200).json({ token: customToken });
  } catch (error) {
    console.error('❌ Token exchange failed:', error);
    res.status(500).json({ error: error.message });
  }
});

exports.yahooTokenExchange = functions.https.onRequest(app);