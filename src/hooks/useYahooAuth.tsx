import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { useAuthRequest, makeRedirectUri } from 'expo-auth-session';
import { signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useAuth } from '@context/AuthContext';
import { app, auth } from '../config/firebase';
import * as SecureStore from 'expo-secure-store';


type UserProfile = {
  uid: string;
  displayName: string;
  email?: string;
  username: string;
  created_at: number;
};

function isUserProfile(data: any): data is UserProfile {
  return (
    data &&
    typeof data.displayName === 'string' &&
    typeof data.username === 'string' &&
    typeof data.created_at === 'number'
  );
}

const discovery = {
  authorizationEndpoint: 'https://api.login.yahoo.com/oauth2/request_auth',
  tokenEndpoint: 'https://api.login.yahoo.com/oauth2/token',
};

export function useYahooAuth() {
  const { signIn, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const appOwnership = String(Constants?.appOwnership ?? 'unknown');
  const isExpoGo = appOwnership === 'expo';
  const isDevClient = appOwnership === 'expo-dev-client';
  const useProxy = !isDevClient;

  console.log('🧭 App Ownership:', appOwnership);
  console.log('🔧 useProxy:', useProxy);

  
  const redirectUri = makeRedirectUri({
    scheme: 'weeklyleaguepickemapp',
    path: 'authGroup/callback',
    // @ts-ignore
    useProxy: false,
  });

  useEffect(() => {
    SecureStore.setItemAsync('yahoo_redirect_uri', redirectUri);
  }, [redirectUri]);

  const [oauthState] = useState(() => Math.random().toString(36).substring(2));
  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: 'dj0yJmk9YzB5OE1UcEwxMXBjJmQ9WVdrOU9YbExTRk5YZDFVbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PTky',
      redirectUri,
      scopes: ['openid', 'profile', 'email'],
      responseType: 'code',
      usePKCE: true,
      state: oauthState,
    },
    discovery
  );

  useEffect(() => {
    SecureStore.setItemAsync('yahoo_oauth_state', oauthState);
  }, [oauthState]);

  useEffect(() => {
    if (request?.url) {
      console.log('🔗 Yahoo OAuth request URL:', request.url);
      console.log('🔐 PKCE codeVerifier:', request.codeVerifier)
    }
  }, [request]);

  const handleYahooResponse = useCallback(async (authCode: string, codeVerifier: string) => {
    setIsLoading(true);
    console.log('🚀 handleYahooResponse started with code:', authCode);

    const fallbackUserId = await AsyncStorage.getItem('userId');
    const finalUserId = user?.uid || fallbackUserId;

    if (!finalUserId) {
      console.error('❌ No userId available — cannot proceed with token exchange.');
      return;
    }

    try {
      const response = await fetch(
        'https://yahoo-token-exchange-175850166680.us-central1.run.app/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: authCode, codeVerifier, userId: finalUserId }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Token exchange failed:', errorText);
        return;
      }

      const result = await response.json();
      const { token, profile, access_token: accessToken, refresh_token: refreshToken } = result;
      console.log('🔁 Yahoo OAuth response:', response);

      if (!token) {
        console.error('❌ Missing Firebase token from backend:', result);
        return;
      }

      const credential = await signInWithCustomToken(auth, token);
      const uid = credential.user.uid;

      await AsyncStorage.setItem('userId', uid);
      await AsyncStorage.setItem('yahooAccessToken', accessToken);
      await AsyncStorage.setItem('yahooRefreshToken', refreshToken);

      await new Promise(res => setTimeout(res, 1000));
      console.log('🧪 auth.currentUser after 1s delay:', auth.currentUser);

      const db = getFirestore(app);
      const userDocRef = doc(db, 'users', uid);
      const snap = await getDoc(userDocRef);

        const userProfile: UserProfile = {
          uid,
          displayName: profile?.nickname || profile?.name || 'Yahoo User',
          email: profile?.email,
          username: profile?.nickname || profile?.email?.split('@')[0] || 'user',
          created_at: Date.now(),
        };

        let finalProfile: UserProfile;

        if (snap.exists()) {
          const data = snap.data() as Record<string, any>;

          finalProfile = {
            uid,
            displayName: typeof data.displayName === 'string' ? data.displayName : userProfile.displayName,
            email: typeof data.email === 'string' ? data.email : userProfile.email,
            username: typeof data.username === 'string' ? data.username : userProfile.username,
            created_at: typeof data.created_at === 'number' ? data.created_at : userProfile.created_at,
          };
        } else {
          finalProfile = userProfile;
        }

        await signIn(finalProfile, null);

      if (!snap.exists()) {
        await setDoc(userDocRef, userProfile, { merge: true });
        console.log('✅ Firestore profile written:', userProfile);
      }

      await setDoc(doc(db, 'users', uid, 'oauth', 'yahoo'), {
        access_token: accessToken,
        refresh_token: refreshToken,
        profile,
        updated_at: Date.now(),
      });

      console.log('🔥 Firebase sign-in complete:', credential.user);
    } catch (err) {
      console.error('❌ Yahoo login flow failed:', err);
      Alert.alert('Yahoo Login Failed', 'Something went wrong during login. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [redirectUri, signIn, user]);

  useEffect(() => {
    if (response?.type === 'success') {
      const { code } = response.params;
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
    console.log('✅ Yahoo OAuth response received:', response);
  }, [response, handleYahooResponse, request]);

  return {
    isLoading,
    promptAsync,
    isReady: !!request,
    isExpoGo,
    request, // ✅ Add this line
  };
}

