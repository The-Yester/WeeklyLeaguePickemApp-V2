// app/authGroup/login.tsx
import React, { useEffect } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Image,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useYahooAuth } from '../../src/hooks/useYahooAuth';
import { exchangeYahooCodeForToken } from '@/services/yahooTokenExchange';
import { useLocalSearchParams, router } from 'expo-router';
import { nanoid } from 'nanoid/non-secure';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeRedirectUri } from 'expo-auth-session';

export default function Login() {
  const { isLoading, promptAsync, isReady, isExpoGo, request } = useYahooAuth();
  const { code } = useLocalSearchParams();
  const { user, signIn } = useAuth();

  useEffect(() => {
    const handleTokenExchange = async () => {
      if (!code) return;

      try {
        const code_verifier = await SecureStore.getItemAsync('yahoo_pkce_verifier');
        const redirect_uri = await SecureStore.getItemAsync('yahoo_redirect_uri');

        if (!code_verifier || !redirect_uri) {
          Alert.alert("Login Error", "Missing Yahoo login parameters. Please try again.");
          return;
        }

        const { access_token, user: profile } = await exchangeYahooCodeForToken({
          code: code as string,
          code_verifier,
          redirect_uri,
        });

        await SecureStore.setItemAsync('yahoo_access_token', access_token);
        console.log('🔑 Access Token:', access_token);
        console.log('👤 User Info:', profile);

        await signIn(profile, access_token);
        router.replace('/appGroup/home');
      } catch (error) {
        console.error('❌ Token exchange failed:', error);
        Alert.alert("Login Error", "Something went wrong during Yahoo login.");
      }
    };

    handleTokenExchange();
  }, [code]);

  const handleYahooLogin = async () => {
    if (!user?.uid) {
      Alert.alert("Login Error", "Missing Firebase UID. Please restart the app.");
      return;
    }

    console.log("🔐 Firebase UID before Yahoo login:", user.uid);
    await AsyncStorage.setItem('userId', user.uid);

    const state = nanoid();
    await SecureStore.setItemAsync('yahoo_oauth_state', state);

    const redirectUri = makeRedirectUri({
      scheme: 'weeklyleaguepickemapp',
      path: 'authGroup/callback',
      // @ts-ignore
      useProxy: false,
    });

    await SecureStore.setItemAsync('yahoo_redirect_uri', redirectUri);

    if (request?.codeVerifier) {
      await SecureStore.setItemAsync('yahoo_pkce_verifier', request.codeVerifier);
    }

    if (request?.url) {
      console.log('🔗 Launching Yahoo OAuth with URL:', request.url);
    }

    const result = await promptAsync({ useProxy: false, redirectUri } as any);
    if (!result || result.type !== 'success') {
      Alert.alert("Yahoo Login Failed", "Could not launch Yahoo login. Please try again.");
    }
  };

  return (
    <View style={styles.container}>
      <Image source={require('../../assets/Pickem_Logo.png')} style={styles.logo} />
      <Text style={styles.title}>Welcome to Weekly League Pick'em</Text>

      {isLoading ? (
        <ActivityIndicator size="large" color="#6001d2" />
      ) : (
        <TouchableOpacity
          onPress={handleYahooLogin}
          disabled={!isReady}
          style={styles.buttonWrapper}
        >
          <Image
            source={require('../../assets/images/Round_Primary_(dark).png')}
            style={[styles.buttonImage, !isReady && styles.disabled]}
            resizeMode="contain"
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#1f3668',
  },
  logo: {
    width: 320,
    height: 320,
    resizeMode: 'contain',
    marginBottom: 30,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
    color: '#FFFFFF',
  },
  buttonWrapper: {
    width: 240,
    height: 60,
  },
  buttonImage: {
    width: '100%',
    height: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
});