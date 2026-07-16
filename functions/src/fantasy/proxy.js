// functions/src/fantasy/proxy.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

if (!admin.apps.length) admin.initializeApp();

const YAHOO_TOKEN_ENDPOINT = 'https://api.login.yahoo.com/oauth2/get_token';
const YAHOO_FANTASY_BASE = 'https://fantasysports.yahooapis.com/fantasy/v2';

const tokenDocRef = (uid) =>
  admin.firestore().collection('users').doc(uid).collection('oauth').doc('yahoo');

const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const secretClient = new SecretManagerServiceClient();

async function getSecret(secretName) {
  const projectId = 'weekly-pickem-8cea3';
  const [version] = await secretClient.accessSecretVersion({
    name: `projects/${projectId}/secrets/${secretName}/versions/latest`,
  });
  return version.payload.data.toString();
}

async function getYahooCreds() {
  try {
    const clientId = await getSecret('YAHOO_CLIENT_ID');
    let clientSecret;
    try {
      clientSecret = await getSecret('YAHOO_CLIENT_SECRET');
    } catch (e) {
      clientSecret = await getSecret('yahoo-client-secret');
    }
    return { clientId, clientSecret };
  } catch (err) {
    console.warn('Secret manager lookup failed, falling back to config:', err.message);
    const cfg = functions.config().yahoo || {};
    if (!cfg.client_id || !cfg.client_secret) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Yahoo client credentials missing.'
      );
    }
    return { clientId: cfg.client_id, clientSecret: cfg.client_secret };
  }
}

async function ensureAccessToken(uid) {
  const ref = tokenDocRef(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Tokens not found.');

  const tokens = snap.data();
  const skew = 60_000;
  const now = Date.now();
  const fresh = tokens.expires_at && tokens.expires_at - skew > now;

  if (fresh && tokens.access_token) return tokens.access_token;
  if (!tokens.refresh_token) {
    throw new functions.https.HttpsError('unauthenticated', 'No refresh token available.');
  }

  const { clientId, clientSecret } = await getYahooCreds();

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: tokens.refresh_token,
  });

  const firstBody = new URLSearchParams(body);
  const isConfidential = clientSecret && clientSecret !== 'your-client-secret-here';
  if (isConfidential) {
    firstBody.append('client_secret', clientSecret);
  }

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  console.log(`🔄 Refreshing Yahoo token via proxy (${isConfidential ? 'Confidential' : 'Public'} client)...`);
  const res = await fetch(YAHOO_TOKEN_ENDPOINT, {
    method: 'POST',
    headers,
    body: firstBody,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`❌ Yahoo token refresh failed: ${res.status}`, text);

    // If Yahoo complains that a client secret is not required (e.g. for "Installed Application" client type),
    // retry the request without the client secret.
    if (isConfidential && text.includes('client secret not required')) {
      console.log('🔄 Retrying Yahoo token refresh without client secret (as requested by Yahoo)...');
      const retryHeaders = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };
      const retryRes = await fetch(YAHOO_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: retryHeaders,
        body,
      });

      if (retryRes.ok) {
        const json = await retryRes.json();
        const { access_token, token_type, expires_in, refresh_token: newRefresh } = json;
        const updated = {
          access_token,
          token_type: token_type || 'Bearer',
          expires_at: Date.now() + Math.max(0, (expires_in ?? 3600) - 60) * 1000,
        };
        if (newRefresh) updated.refresh_token = newRefresh;
        await ref.set(updated, { merge: true });
        console.log('✅ Yahoo token refreshed and stored successfully (on retry).');
        return access_token;
      } else {
        const retryText = await retryRes.text();
        console.error(`❌ Yahoo token refresh retry failed: ${retryRes.status}`, retryText);
        throw new functions.https.HttpsError('unauthenticated', `Refresh failed: ${retryRes.status} ${retryText}`);
      }
    }

    throw new functions.https.HttpsError('unauthenticated', `Refresh failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  const { access_token, token_type, expires_in, refresh_token: newRefresh } = json;
  const updated = {
    access_token,
    token_type: token_type || 'Bearer',
    expires_at: Date.now() + Math.max(0, (expires_in ?? 3600) - 60) * 1000,
  };
  if (newRefresh) updated.refresh_token = newRefresh;
  await ref.set(updated, { merge: true });
  console.log('✅ Yahoo token refreshed and stored successfully.');
  return access_token;
}
  exports.yahooFantasyProxy = async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');

    const data = request.data || {};
    const path = String(data.path || '');
    if (!path.startsWith('/')) {
      throw new functions.https.HttpsError('invalid-argument', 'Path must start with "/"');
    }

    const method = (data.method || 'GET').toUpperCase();
    const allowed = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
    if (!allowed.has(method)) {
      throw new functions.https.HttpsError('invalid-argument', `Unsupported method: ${method}`);
    }

    const format = (data.format || 'json').toLowerCase();
    const extraHeaders = data.headers && typeof data.headers === 'object' ? data.headers : undefined;
    const body = data.body;

    const accessToken = await ensureAccessToken(uid);
    const url = `${YAHOO_FANTASY_BASE}${path}${path.includes('?') ? '&' : '?'}format=${format}`;

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: format === 'json' ? 'application/json' : 'application/xml',
        ...(extraHeaders || {}),
      },
      body: ['GET', 'HEAD'].includes(method) ? undefined : body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new functions.https.HttpsError('unknown', `Yahoo API error ${res.status}: ${text}`);
    }

    return format === 'json' && text ? JSON.parse(text) : text;
  };