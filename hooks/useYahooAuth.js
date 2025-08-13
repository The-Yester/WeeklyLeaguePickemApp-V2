// hooks/useYahooAuth.js
import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { useAuthRequest, makeRedirectUri } from 'expo-auth-session';
import { onAuthStateChanged, getAuth, signInWithCustomToken } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

import { useAuth } from '../context/AuthContext';
import { app } from '../config/firebaseConfig';
import { yahooCredentials } from '../config/yahooConfig';

WebBrowser.maybeCompleteAuthSession();

const discovery = {
  authorizationEndpoint: 'https://api.login.yahoo.com/oauth2/request_auth',
  tokenEndpoint: 'https://api.login.yahoo.com/oauth2/get_token',
};

export function useYahooAuth() {
  const { signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const isUsingProxy = Constants.appOwnership === 'expo'; // true in Expo Go

  const redirectUri = makeRedirectUri({
    useProxy: isUsingProxy,
    native: 'weeklyleaguepickemapp://',
  });

  console.log(makeRedirectUri({ useProxy: true }));

  const [request, response, promptAsync] = useAuthRequest(
    {
        clientId: 'dj0yJmk9QlNGVXFQNmljM1U4JmQ9WVdrOVRrcFdSbkIzUlRZbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PThl',
        scopes: ['fspt-r', 'openid', 'profile', 'email'],
        redirectUri,
        responseType: 'code',
    },
    discovery
  );

  console.log("🔁 Using redirectUri:", redirectUri);

  const handleYahooResponse = useCallback(async (authCode) => {
    setIsLoading(true);
    try {
      const functions = getFunctions(app);
      const exchangeYahooCode = httpsCallable(functions, 'exchangeYahooCodeForToken');

      const result = await exchangeYahooCode({ code: authCode, redirectUri });
      const { token, profile, accessToken, refreshToken } = result.data;

      await AsyncStorage.setItem('yahooAccessToken', accessToken);
      await AsyncStorage.setItem('yahooRefreshToken', refreshToken);

      const auth = getAuth(app);
      const credential = await signInWithCustomToken(auth, token);
      const firebaseUser = credential.user;

      const db = getFirestore(app);
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const userProfile = userDoc.data();
        await signIn(userProfile); // <<--- important
      } else {
        console.warn("User doc not found after Yahoo login.");
      }

    } catch (error) {
      console.error("❌ Error during token exchange or sign-in:", error);
      Alert.alert("Login Failed", "There was an error connecting your account. Please try again.");
    }
    setIsLoading(false);
  }, [redirectUri, signIn]);

  // Automatically trigger handleYahooResponse when response is received
  useEffect(() => {
    if (response?.type === 'success') {
      const { code } = response.params;
      console.log('✅ Yahoo login successful, received auth code:', code);
      handleYahooResponse(code);
    } else if (response?.type === 'error') {
      console.error("❌ Yahoo login error:", response);
      Alert.alert("Yahoo Login Failed", "Could not connect to your Yahoo account.");
    } else if (response?.type === 'dismiss') {
      console.log("User dismissed Yahoo login.");
    }
  }, [response, handleYahooResponse]);

  return {
    isLoading,
    promptAsync,
    isReady: !!request,
    handleYahooResponse, // Optionally expose this to manually trigger it with a code
  };
}
