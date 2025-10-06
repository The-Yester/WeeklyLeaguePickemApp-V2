// app/authGroup/callback.js
import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as AuthSession from 'expo-auth-session';
import { httpsCallable } from 'firebase/functions';

import { functions } from '../../src/config/firebase';
import { getRedirectUri } from '../../src/config/yahoo';

const EXCHANGE_FN_NAME = 'exchangeYahooCodeForToken'; // Cloud Function callable
const SS_KEYS = {
  state: 'yahoo_oauth_state',
  verifier: 'yahoo_pkce_verifier',
  redirectUri: 'yahoo_redirect_uri',
  session: 'yahoo_session', // where we’ll store the resulting tokens/session
};

export default function YahooCallback() {
  const router = useRouter();
  const params = useLocalSearchParams(); // expects code, state, error, error_description
  const [message, setMessage] = useState('Finishing sign-in…');
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;
    finishAuth().catch((err) => {
      console.error('Yahoo callback error:', err);
      setMessage('Authentication failed. Please try again.');
      // Give the user a moment to read, then return to login
      setTimeout(() => router.replace('/authGroup/login'), 1200);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishAuth = async () => {
    // 1) Handle provider-side error fast
    if (params.error) {
      const desc = Array.isArray(params.error_description)
        ? params.error_description[0]
        : params.error_description;
      throw new Error(`Yahoo error: ${params.error} - ${desc || 'No description'}`);
    }

    // 2) Parse params safely
    const authCode = Array.isArray(params.code) ? params.code[0] : params.code;
    const returnedState = Array.isArray(params.state) ? params.state[0] : params.state;
    if (!authCode || !returnedState) {
      throw new Error('Missing code or state in callback URL.');
    }

    // 3) CSRF/state check
    const storedState = await SecureStore.getItemAsync(SS_KEYS.state);
    if (!storedState || storedState !== returnedState) {
      throw new Error('State mismatch. Please restart sign-in.');
    }

    // 4) Load PKCE verifier + redirect URI used during the request
    const codeVerifier = await SecureStore.getItemAsync(SS_KEYS.verifier);
    if (!codeVerifier) {
      throw new Error('Missing PKCE verifier. Please restart sign-in.');
    }

    // Prefer the exact redirect used at login (stored), else recompute
    const storedRedirect = await SecureStore.getItemAsync(SS_KEYS.redirectUri);
    const redirectUri =
      storedRedirect ||
      getRedirectUri(true) || // default to proxy during development
      AuthSession.makeRedirectUri({ useProxy: true, scheme: 'weeklyleaguepickemapp' });

    setMessage('Exchanging code…');

    // 5) Call your Cloud Function to perform the secure token exchange
    //    The function should use server-side client_secret and validate everything.
    const CodeForToken = httpsCallable(functions, EXCHANGE_FN_NAME);
    const { data } = await CodeForToken({
      code: authCode,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code', // ✅ include this
      includeUserInfo: true,
    });

    // Expected shape (example):
    // {
    //   access_token, refresh_token, expires_in, token_type,
    //   xoauth_yahoo_guid, id_token, user (optional)
    // }

    if (!data || !data.access_token) {
      throw new Error('Token exchange failed. Missing access token.');
    }

    // 6) Persist session for your app (adjust to your AuthContext if needed)
    await SecureStore.setItemAsync(SS_KEYS.session, JSON.stringify(data));

    // 7) Cleanup ephemeral values
    await Promise.all([
      SecureStore.deleteItemAsync(SS_KEYS.state),
      SecureStore.deleteItemAsync(SS_KEYS.verifier),
      // keep redirectUri if you want to re-use it, or clear it:
      // SecureStore.deleteItemAsync(SS_KEYS.redirectUri),
    ]);

    setMessage('Signed in. Redirecting…');
    router.replace('/appGroup/home');
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <ActivityIndicator size="large" />
      <Text style={{ marginTop: 16, textAlign: 'center' }}>{message}</Text>
    </View>
  );
}