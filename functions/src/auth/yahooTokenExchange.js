const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const { HttpsError } = require('firebase-functions/v2/https');

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const secretClient = new SecretManagerServiceClient();

async function getSecret(secretName) {
  // Hardcoded Project ID to prevent 'projects/undefined' error
  const projectId = 'weekly-pickem-8cea3';
  const [version] = await secretClient.accessSecretVersion({
    name: `projects/${projectId}/secrets/${secretName}/versions/latest`,
  });
  return version.payload.data.toString();
}

/**
 * Exchange Yahoo Auth Code for Tokens + Create Firebase Custom Token
 * Expects data: { code, code_verifier, redirect_uri }
 */
exports.exchangeYahooCodeForToken = async (request) => {
  // Callable functions wrap data in `request.data`
  const { code, code_verifier, redirect_uri } = request.data || {};

  console.log('📦 exchangeYahooCodeForToken called with:', { code, hasVerifier: !!code_verifier, redirect_uri });

  if (!code || !code_verifier || !redirect_uri) {
    throw new HttpsError('invalid-argument', 'Missing code, code_verifier, or redirect_uri');
  }

  try {
    const clientId = await getSecret('YAHOO_CLIENT_ID');
    // Public Client Flow (No Secret)
    // We only use the Client ID validation + PKCE

    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('code', code);
    params.append('code_verifier', code_verifier);
    params.append('redirect_uri', redirect_uri);
    params.append('grant_type', 'authorization_code');

    console.log('📤 Sending token request to Yahoo (Public Client)...');
    console.log('🔍 DEBUG PARAMS:', {
      client_id_prefix: clientId ? clientId.substring(0, 5) + '...' : 'undefined',
      redirect_uri: redirect_uri,
      has_verifier: !!code_verifier,
      code_length: code ? code.length : 0,
      mode: 'public_pkce'
    });

    // No Basic Auth for Public Clients
    // Update: Using /get_token endpoint as /token returns 404 for this client type
    const tokenResponse = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params,
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Yahoo token response error:', tokenResponse.status, errorText);
      throw new HttpsError('internal', `Yahoo API Error: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('✅ Yahoo tokens received');

    if (!tokenData.id_token) {
      // Technically Yahoo should always return id_token with 'openid' scope. 
      // If not, we can't identify the user easily without another call to userinfo.
      throw new HttpsError('internal', 'No id_token returned from Yahoo. Ensure scopes include "openid".');
    }

    // Decode id_token to get Yahoo subject ID (GUID)
    // id_token is JWT: header.payload.signature
    const base64Url = tokenData.id_token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString();
    const payload = JSON.parse(jsonPayload);

    const yahooUserId = payload.sub;
    console.log('👤 Yahoo User ID (sub):', yahooUserId);

    // Create Firebase Custom Token
    const firebaseCustomToken = await admin.auth().createCustomToken(yahooUserId, {
      yahooAccessToken: tokenData.access_token, // Optional: embed in token if needed on client
    });

    console.log('✅ Firebase Custom Token created');

    // Return everything client might need
    return {
      token: firebaseCustomToken, // Client uses signInWithCustomToken(token)
      yahoo_access_token: tokenData.access_token,
      yahoo_refresh_token: tokenData.refresh_token,
      yahoo_id_token: tokenData.id_token,
      expires_in: tokenData.expires_in
    };

  } catch (err) {
    console.error('❌ exchangeYahooCodeForToken Exception:', err);
    // Re-throw HttpsError as is, or wrap others
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', err.message);
  }
};