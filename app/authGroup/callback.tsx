// app/authGroup/callback.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, Text, Linking } from 'react-native';
import { useSearchParams, useRouter, usePathname } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as AuthSession from 'expo-auth-session';
import { httpsCallable } from 'firebase/functions';
import { OAuthProvider, signInWithCredential } from 'firebase/auth';

import { auth, functions } from '../../src/config/firebase';
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
  const params = useSearchParams(); // expects code, state, error, error_description
  const [message, setMessage] = useState('Finishing sign-in…');
  const didRun = useRef(false);
  const pathname = usePathname();

  console.log('🔁 YahooCallback: Received search params:', params);
  console.log('📍 Current route pathname:', pathname);
  // @ts-ignore
  console.log('🌐 Full redirect URI:', AuthSession.makeRedirectUri({ useProxy: true, scheme: 'weeklyleaguepickemapp' }));

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;
    finishAuth().catch((err) => {
      console.error('Yahoo callback error:', err);
      setMessage('Authentication failed. Please try again.');
      console.log('❌ Yahoo sign-in failed. Redirecting to login.');
      setTimeout(() => router.replace('/authGroup/login'), 1200);
      // Give the user a moment to read, then return to login
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      console.log("🔗 Deep link received:", url);
      const parsed = new URL(url ?? "");
      const code = parsed.searchParams.get("code");
      const state = parsed.searchParams.get("state");
      console.log("✅ Parsed code:", code);
      console.log("✅ Parsed state:", state);
    });
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
    console.log('🔑 Parsed code and state:', { authCode, returnedState });
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
      // @ts-ignore
      AuthSession.makeRedirectUri({ useProxy: false, scheme: 'weeklyleaguepickemapp' });

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

    console.log('🔑 Token exchange response:', data);

    // Expected shape (example):
    // {
    //   access_token, refresh_token, expires_in, token_type,
    //   xoauth_yahoo_guid, id_token, user (optional)
    // }

    const tokenData = data as {
      access_token: string;
      id_token: string;
      [key: string]: any;
    };

    const yahooProvider = new OAuthProvider('yahoo.com');
    const credential = yahooProvider.credential({
      idToken: tokenData?.id_token,
      accessToken: tokenData?.access_token,
    });


    await signInWithCredential(auth, credential);

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
    console.log('✅ Yahoo sign-in complete. Redirecting to home.');
    router.replace('/appGroup/home');
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <ActivityIndicator size="large" />
      <Text style={{ marginTop: 16, textAlign: 'center' }}>{message}</Text>
    </View>
  );
}