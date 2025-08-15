// functions/src/auth/yahooTokenExchange.js
const functions = require('firebase-functions');
const fetch = require('node-fetch');

exports.exchangeYahooCodeForToken = functions.https.onCall(async (data, context) => {
  try {
    const { code, code_verifier, redirect_uri, includeUserInfo } = data || {};

    if (!code || !code_verifier || !redirect_uri) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Missing code, code_verifier, or redirect_uri.'
      );
    }

    const clientId = functions.config().yahoo.client_id;
    const clientSecret = functions.config().yahoo.client_secret;

    if (!clientId || !clientSecret) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Yahoo OAuth client credentials are not set in functions config.'
      );
    }

    // Exchange the authorization code for tokens
    const tokenRes = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri,
        code,
        code_verifier,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Yahoo token exchange failed:', errText);
      throw new functions.https.HttpsError(
        'unauthenticated',
        `Token endpoint error: ${tokenRes.status} ${errText}`
      );
    }

    const tokenData = await tokenRes.json();

    // Optionally fetch Yahoo user info or fantasy profile
    let userInfo = null;
    if (includeUserInfo && tokenData.access_token) {
      const userRes = await fetch('https://api.login.yahoo.com/openid/v1/userinfo', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });
      if (userRes.ok) {
        userInfo = await userRes.json();
      } else {
        console.warn('Failed to fetch Yahoo user info:', await userRes.text());
      }
    }

    return {
      ...tokenData,
      ...(userInfo ? { user: userInfo } : {}),
    };
  } catch (err) {
    console.error('exchangeYahooCodeForToken error:', err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError('internal', err.message);
  }
});