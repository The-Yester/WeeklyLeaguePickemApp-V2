import React, { useEffect } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Image,
  TouchableOpacity,
} from 'react-native';
import { useYahooAuth } from '../../src/hooks/useYahooAuth';
import { exchangeYahooCodeForToken } from '@/services/yahooTokenExchange';
import { useLocalSearchParams, router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';

export default function Login() {
  const { isLoading, promptAsync, isReady, isExpoGo } = useYahooAuth();
  const { code } = useLocalSearchParams();

  useEffect(() => {
    const handleTokenExchange = async () => {
      if (!code) return;

      try {
        const code_verifier = await SecureStore.getItemAsync('yahoo_pkce_verifier');
        const redirect_uri = await SecureStore.getItemAsync('yahoo_redirect_uri');

        if (!code_verifier || !redirect_uri) {
          console.warn('Missing PKCE verifier or redirect URI');
          return;
        }

        const { access_token, user } = await exchangeYahooCodeForToken({
          code: code as string,
          code_verifier,
          redirect_uri,
        });

        await SecureStore.setItemAsync('yahoo_access_token', access_token);

        console.log('Access Token:', access_token);
        console.log('User Info:', user);

        // TODO: Store token, update context, navigate, etc.
        router.replace('/appGroup/home'); // or wherever your post-login route is
      } catch (error) {
        console.error('Token exchange failed:', error);
      }
    };

    handleTokenExchange();
  }, [code]);

  return (
    <View style={styles.container}>
      <Image source={require('../../assets/Pickem_Logo.png')} style={styles.logo} />
      <Text style={styles.title}>Welcome to Weekly League Pick'em</Text>

      {isLoading ? (
        <ActivityIndicator size="large" color="#6001d2" />
      ) : (
        <TouchableOpacity
          onPress={() => promptAsync()}
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
    backgroundColor: '#fff',
  },
  logo: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
    marginBottom: 30,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
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

