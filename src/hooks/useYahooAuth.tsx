// hooks/useYahooAuth.tsx
import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { useAuthRequest, makeRedirectUri } from 'expo-auth-session';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '@context/AuthContext';
import { app } from '../config/firebase';
import { getRedirectUri } from '../config/yahoo';

WebBrowser.maybeCompleteAuthSession();

const discovery = {
  authorizationEndpoint: 'https://api.login.yahoo.com/oauth2/request_auth',
  tokenEndpoint: 'https://api.login.yahoo.com/oauth2/token',
};

export function useYahooAuth() {
  const { signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const isExpoGo = !Constants.appOwnership || Constants.appOwnership === 'expo';

  const redirectUri = getRedirectUri(isExpoGo);

  console.log('Generated redirect URI:', redirectUri);

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: 'dj0yJmk9QlNGVXFQNmljM1U4JmQ9WVdrOVRrcFdSbkIzUlRZbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PThl',
      redirectUri,
      scopes: ['openid', 'profile', 'email'], // add fspt-r later, after basic login works
      responseType: 'code',
      usePKCE: true,
      state: Math.random().toString(36).substring(2),
    },
    discovery
  );

  useEffect(() => {
    if (request?.url) {
      console.log('🔗 Yahoo OAuth request URL:', request.url);
    }
  }, [request]);

  const handleYahooResponse = useCallback(async (authCode, codeVerifier) => {
    setIsLoading(true);
    try {
      const functions = getFunctions(app);
      const exchangeYahooCode = httpsCallable(functions, 'exchangeYahooCodeForToken');

      const result = await exchangeYahooCode({ code: authCode, redirectUri, codeVerifier });
      type YahooTokenResponse = {
        token: string;
        profile: any;
        accessToken: string;
        refreshToken: string;
      };

      const { token, profile, accessToken, refreshToken } = result.data as YahooTokenResponse;

      await AsyncStorage.setItem('yahooAccessToken', accessToken);
      await AsyncStorage.setItem('yahooRefreshToken', refreshToken);

      const auth = getAuth(app);
      const credential = await signInWithCustomToken(auth, token);
      const firebaseUser = credential.user;

      const db = getFirestore(app);
      const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (snap.exists()) {
        await signIn(snap.data());
      } else {
        console.warn('User doc not found after Yahoo login.');
      }
    } catch (error) {
      console.error('❌ Error during token exchange or sign-in:', error);
      if (error.response?.data) {
        console.error('Yahoo token exchange error:', error.response.data);
      }

      Alert.alert('Login Failed', 'There was an error connecting your account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [redirectUri, signIn]);

  useEffect(() => {
    if (response?.type === 'success') {
      const { code } = response.params;
      console.log('✅ Yahoo login successful, received auth code:', code);

      
    if (!request?.codeVerifier) {
      console.error('Missing codeVerifier — cannot complete token exchange.');
      return;
    }
    handleYahooResponse(code, request.codeVerifier);
    } else if (response?.type === 'error') {
      console.error('❌ Yahoo login error:', response);
      Alert.alert('Yahoo Login Failed', 'Could not connect to your Yahoo account.');
    } else if (response?.type === 'dismiss') {
      console.log('User dismissed Yahoo login.');
    }
  }, [response, handleYahooResponse, request]);

  return {
    isLoading,
    promptAsync,
    isReady: !!request,
    isExpoGo,
  };
}

