import { useEffect, useState, useRef, useMemo } from 'react';
import { useAuthRequest, makeRedirectUri } from 'expo-auth-session';
import { Alert, Platform } from 'react-native';
import { signInWithCustomToken } from 'firebase/auth';
import { auth, app } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

WebBrowser.maybeCompleteAuthSession();

const discovery = {
    authorizationEndpoint: 'https://api.login.yahoo.com/oauth2/request_auth',
    tokenEndpoint: 'https://api.login.yahoo.com/oauth2/get_token',
};

const SS_KEYS = {
    verifier: 'yahoo_pkce_verifier',
};

// Safe storage wrappers to handle Web (AsyncStorage) and Native (SecureStore)
const saveVerifier = async (verifier) => {
    try {
        if (Platform.OS === 'web') {
            await AsyncStorage.setItem(SS_KEYS.verifier, verifier);
        } else {
            await SecureStore.setItemAsync(SS_KEYS.verifier, verifier);
        }
    } catch (e) {
        console.error('Failed to save verifier:', e);
    }
};

const getVerifier = async () => {
    try {
        if (Platform.OS === 'web') {
            return await AsyncStorage.getItem(SS_KEYS.verifier);
        } else {
            return await SecureStore.getItemAsync(SS_KEYS.verifier);
        }
    } catch (e) {
        console.error('Failed to get verifier:', e);
        return null;
    }
};

const deleteVerifier = async () => {
    try {
        if (Platform.OS === 'web') {
            await AsyncStorage.removeItem(SS_KEYS.verifier);
        } else {
            await SecureStore.deleteItemAsync(SS_KEYS.verifier);
        }
    } catch (e) {
        console.error('Failed to delete verifier:', e);
    }
};

export function useYahooAuth() {
    // Determine redirect URI depending on running in Expo Go or custom built client.
    const redirectUri = useMemo(() => {
        const isExpoGo = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
        console.log('🔍 useYahooAuth: isExpoGo:', isExpoGo);

        if (isExpoGo) {
            // Expo Go requires Expo Auth Proxy. We use the base proxy URL registered with Yahoo:
            // https://auth.expo.io/@ryester/WeeklyLeaguePickemApp
            return makeRedirectUri({
                useProxy: true,
                scheme: 'weeklyleaguepickemapp',
            });
        }

        // Development Client / Production standalone uses the custom scheme directly:
        // weeklyleaguepickemapp://yahoo
        return makeRedirectUri({
            useProxy: false,
            scheme: 'weeklyleaguepickemapp',
            path: 'yahoo',
        });
    }, []);

    console.log('🔗 Yahoo Redirect URI:', redirectUri);

    const config = useMemo(() => ({
        clientId: 'dj0yJmk9dDhqVXlhU2hxbzRNJmQ9WVdrOU1qUXlORTgyYzJNbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PTIw',
        redirectUri,
        scopes: ['openid', 'profile', 'email', 'fspt-r'],
        responseType: 'code',
        usePKCE: true,
    }), [redirectUri]);

    const [request, response, promptAsyncOriginal] = useAuthRequest(config, discovery);

    const { signIn } = useAuth();
    const [isLoading, setIsLoading] = useState(false);

    // Wrapper to handle the async prompt cleanly
    const promptAsync = async () => {
        try {
            if (request?.codeVerifier) {
                await saveVerifier(request.codeVerifier);
                console.log('💾 Saved PKCE code verifier:', request.codeVerifier);
            }
            const isExpoGo = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
            return await promptAsyncOriginal({
                useProxy: isExpoGo,
            });
        } catch (e) {
            console.error("Yahoo Auth Prompt Error:", e);
            if (Platform.OS === 'web') {
                alert("Failed to start Yahoo Login: " + e.message);
            } else {
                Alert.alert("Error", "Failed to start Yahoo Login.");
            }
        }
    };

    const lastProcessedCode = useRef(null);

    useEffect(() => {
        if (response?.type === 'success') {
            const { code } = response.params;
            if (request?.codeVerifier && code !== lastProcessedCode.current) {
                lastProcessedCode.current = code;
                exchangeCode(code, request.codeVerifier);
            }
        } else if (response?.type === 'error') {
            if (Platform.OS === 'web') {
                alert('Yahoo Sign-In failed.');
            } else {
                Alert.alert('Yahoo Sign-In', 'Sign-in failed.');
            }
        } else if (response?.type === 'dismiss') {
            // User cancelled
            console.log('Yahoo Login dismissed');
        }
    }, [response]);

    const exchangeCode = async (code, codeVerifier) => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            console.log('🔄 Exchanging Yahoo code for tokens...');

            // Retrieve the stored verifier to handle component unmount/remount/regenerated requests
            let verifierToUse = codeVerifier;
            const storedVerifier = await getVerifier();
            if (storedVerifier) {
                console.log('💾 Retrieved original PKCE verifier:', storedVerifier);
                verifierToUse = storedVerifier;
            } else {
                console.warn('⚠️ No PKCE verifier found. Using active state verifier.');
            }

            const { getFunctions, httpsCallable } = require('firebase/functions');
            const functions = getFunctions(app);
            const yahooTokenExchange = httpsCallable(functions, 'yahooTokenExchange');

            const result = await yahooTokenExchange({
                code,
                code_verifier: verifierToUse,
                redirect_uri: redirectUri,
                currentUid: auth.currentUser?.uid || null,
                clientType: 'public'
            });

            const data = result.data;
            console.log('✅ Token Exchange Result:', data);

            if (data?.token) {
                await signInWithCustomToken(auth, data.token);
                console.log('🔥 Firebase Sign-In Successful');

                // Update context
                const currentUser = auth.currentUser;
                if (signIn) {
                    signIn(
                        {
                            uid: currentUser?.uid || data.yahoo_guid,
                            username: currentUser?.displayName || 'Yahoo User'
                        },
                        data.yahoo_access_token,
                        data.yahoo_refresh_token
                    );
                }

                // Cleanup stored verifier on success
                await deleteVerifier();
            } else {
                throw new Error('No custom token returned.');
            }

        } catch (error) {
            console.error('❌ Exchange failed:', error);
            if (Platform.OS === 'web') {
                alert('Login Error: ' + (error.message || 'Failed to exchange token.'));
            } else {
                Alert.alert('Login Error', error.message || 'Failed to exchange token.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return {
        isLoading,
        promptAsync,
        isReady: !!request,
        request,
    };
}
