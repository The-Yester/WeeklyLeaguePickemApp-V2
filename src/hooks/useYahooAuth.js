import { useEffect, useState, useRef } from 'react';
import { useAuthRequest, makeRedirectUri } from 'expo-auth-session';
import { Alert } from 'react-native';
import { signInWithCustomToken } from 'firebase/auth';
import { auth, app } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const discovery = {
    authorizationEndpoint: 'https://api.login.yahoo.com/oauth2/request_auth',
    tokenEndpoint: 'https://api.login.yahoo.com/oauth2/token',
};

export function useYahooAuth() {
    // Clean Redirect URI generation matching app.config.js
    // Scheme: weeklyleaguepickemapp
    // Path: yahoo (matches intent filter host)
    const redirectUri = makeRedirectUri({
        scheme: 'weeklyleaguepickemapp',
        path: 'yahoo'
    });

    console.log('🔗 Yahoo Redirect URI:', redirectUri);

    const [request, response, promptAsyncOriginal] = useAuthRequest(
        {
            clientId: 'dj0yJmk9ZUJDMkJNYXJrOUt3JmQ9WVdrOU0yWmlOMGR3ZGtjbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PWI5',
            redirectUri,
            scopes: ['openid', 'profile', 'email', 'fspt-r'],
            responseType: 'code',
            usePKCE: true,
        },
        discovery
    );

    const { signIn } = useAuth();
    const [isLoading, setIsLoading] = useState(false);

    // Wrapper to handle the async prompt cleanly
    const promptAsync = async () => {
        try {
            return await promptAsyncOriginal();
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
            const { getFunctions, httpsCallable } = require('firebase/functions');
            const functions = getFunctions(app);
            const yahooTokenExchange = httpsCallable(functions, 'yahooTokenExchange');

            const result = await yahooTokenExchange({
                code,
                code_verifier: codeVerifier,
                redirect_uri: redirectUri
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
