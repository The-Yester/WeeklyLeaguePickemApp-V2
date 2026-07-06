import { useEffect, useState, useRef, useMemo } from 'react';
import { useAuthRequest, makeRedirectUri } from 'expo-auth-session';
import { Alert } from 'react-native';
import { signInWithCustomToken } from 'firebase/auth';
import { auth, app } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

WebBrowser.maybeCompleteAuthSession();

const discovery = {
    authorizationEndpoint: 'https://api.login.yahoo.com/oauth2/request_auth',
    tokenEndpoint: 'https://api.login.yahoo.com/oauth2/get_token',
};

const SS_KEYS = {
    verifier: 'yahoo_pkce_verifier',
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
                await SecureStore.setItemAsync(SS_KEYS.verifier, request.codeVerifier);
                console.log('💾 Saved PKCE code verifier to SecureStore:', request.codeVerifier);
            }
            const isExpoGo = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
            return await promptAsyncOriginal({
                useProxy: isExpoGo,
            });
        } catch (e) {
            console.error("Yahoo Auth Prompt Error:", e);
            Alert.alert("Error", "Failed to start Yahoo Login.");
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
            Alert.alert('Yahoo Sign-In', 'Sign-in failed.');
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
            const storedVerifier = await SecureStore.getItemAsync(SS_KEYS.verifier);
            if (storedVerifier) {
                console.log('💾 Retrieved original PKCE verifier from SecureStore:', storedVerifier);
                verifierToUse = storedVerifier;
            } else {
                console.warn('⚠️ No PKCE verifier found in SecureStore. Using active state verifier.');
            }

            const { getFunctions, httpsCallable } = require('firebase/functions');
            const functions = getFunctions(app);
            const yahooTokenExchange = httpsCallable(functions, 'yahooTokenExchange');

            const result = await yahooTokenExchange({
                code,
                code_verifier: verifierToUse,
                redirect_uri: redirectUri,
                currentUid: auth.currentUser?.uid || null
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
                await SecureStore.deleteItemAsync(SS_KEYS.verifier);
            } else {
                throw new Error('No custom token returned.');
            }

        } catch (error) {
            console.error('❌ Exchange failed:', error);
            Alert.alert('Login Error', error.message || 'Failed to exchange token.');
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
