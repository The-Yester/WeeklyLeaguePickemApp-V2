// functions/src/fantasy/proxy.js
const { onCall } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');

setGlobalOptions({ region: 'us-central1' });
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();

const YAHOO_TOKEN_ENDPOINT = 'https://api.login.yahoo.com/oauth2/token';
const YAHOO_FANTASY_BASE = 'https://fantasysports.yahooapis.com/fantasy/v2';

const tokenDocRef = (uid) =>
  admin.firestore().collection('users').doc(uid).collection('oauth').doc('yahoo');

function getYahooCreds() {
  const cfg = functions.config().yahoo || {};
  if (!cfg.client_id || !cfg.client_secret) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Yahoo client credentials missing. Set with: firebase functions:config:set yahoo.client_id="..." yahoo.client_secret="..."'
    );
  }
  return { clientId: cfg.client_id, clientSecret: cfg.client_secret };
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

  const { clientId, clientSecret } = getYahooCreds();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  });

  const res = await fetch(YAHOO_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
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
  return access_token;
}
  exports.yahooFantasyProxy = onCall(async (data, context) => {
    const uid = context.auth?.uid;
    if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Sign in required.');

    const path = String(data?.path || '');
    if (!path.startsWith('/')) {
      throw new functions.https.HttpsError('invalid-argument', 'Path must start with "/"');
    }

    const method = (data?.method || 'GET').toUpperCase();
    const allowed = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
    if (!allowed.has(method)) {
      throw new functions.https.HttpsError('invalid-argument', `Unsupported method: ${method}`);
    }

    const format = (data?.format || 'json').toLowerCase();
    const extraHeaders = data?.headers && typeof data.headers === 'object' ? data.headers : undefined;
    const body = data?.body;

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
  });