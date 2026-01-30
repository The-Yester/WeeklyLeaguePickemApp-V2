import { useEffect, useState } from 'react';
import { useAuthRequest, makeRedirectUri } from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import { getRedirectUri } from '../config/yahoo';
import { Alert } from 'react-native';
import { signInWithCustomToken } from 'firebase/auth';
import { auth, app } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import * as WebBrowser from 'expo-web-browser';

const discovery = {
    authorizationEndpoint: 'https://api.login.yahoo.com/oauth2/request_auth',
    tokenEndpoint: 'https://api.login.yahoo.com/oauth2/token',
};

export function useYahooAuth() {
    // Hardcode the Expo Auth Proxy URL because makeRedirectUri is returning exp:// in Expo Go
    // which fails Yahoo's HTTPS requirement.
    const redirectUri = 'https://auth.expo.io/@ryester/WeeklyLeaguePickemApp';

    // This is where the Proxy SHOULD redirect back to. 
    // With --tunnel, this should be an exp://....ngrok.io URL.
    const returnUrl = makeRedirectUri({ useProxy: false, scheme: 'weeklyleaguepickemapp' });

    console.log('🔗 Using Global Redirect URI (for Yahoo):', redirectUri);
    console.log('↩️ Expected Return URL (for App):', returnUrl);

    const [request, response, promptAsyncOriginal] = useAuthRequest(
        {
            clientId: 'dj0yJmk9YzB5OE1UcEwxMXBjJmQ9WVdrOU9YbExTRk5YZDFVbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PTky',
            redirectUri,
            scopes: ['openid', 'profile', 'email'],
            responseType: 'code',
            usePKCE: true,
        },
        discovery
    );

    useEffect(() => {
        if (request) {
            console.log('📝 Full Auth Request Object:', JSON.stringify(request));
        }
    }, [request]);

    const promptAsync = async (options = {}) => {
        // Force useProxy: true to ensure Expo Go handles the proxy return correctly
        const mergedOptions = { ...options, useProxy: true };
        return await promptAsyncOriginal(mergedOptions);
    };

    const { signIn } = useAuth();
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        WebBrowser.maybeCompleteAuthSession();
    }, []);

    useEffect(() => {
        console.log('👀 Auth Response Changed:', response); // Debugging line
        if (response?.type === 'success') {
            const { code } = response.params;
            if (request?.codeVerifier) {
                exchangeCode(code, request.codeVerifier);
            }
        } else if (response?.type === 'error') {
            Alert.alert('Yahoo Sign-In', 'Sign-in failed or was cancelled.');
        }
    }, [response]);

    const exchangeCode = async (code, codeVerifier) => {
        setIsLoading(true);
        try {
            console.log('🔄 Exchanging Yahoo code for tokens...');
            // Import the callable function wrapper or call directly
            // We will perform the httpsCallable here to avoid circular deps or complexity
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

                // Retrieve the updated user object or use a placeholder if state hasn't updated yet.
                // ideally signIn takes user object, but we might rely on the auth listener.
                // However, our signIn function in context also sets the tokens.
                // We should call signIn from context to set the tokens explicitly.
                // Note: user object might be null here if we just signed in with firebase, 
                // but the onAuthStateChanged in AuthContext will eventually fire and load the user.
                // We mainly want to Use signIn to set the tokens. 
                // We can pass the current user from auth.currentUser or handle it gracefully.

                // Ideally, AuthContext's onAuthStateChanged handles setUser. 
                // We just need to ensure tokens are saved.
                // Let's call a specific method or just manually save to AsyncStorage?
                // Using signIn from useAuth matches previous pattern but it expects userData.

                // Let's just manually save to AsyncStorage here to be safe, 
                // OR use the exposed setAccessToken from context if available.
                // Actually, looking at AuthContext.js, signIn is: (userData, accessToken, refreshToken) => ...

                // Better approach: Since AuthContext listens to firebase auth state changes,
                // we probably should just expose a way to set tokens, or save them directly here.
                // But let's try to use the context method if possible to keep state in sync.

                // WORKAROUND: We will directly save to AsyncStorage and let AuthContext pick it up 
                // or we can assume AuthContext's loadTokens effect might have run already.
                // Actually, since we are in a hook, we can just call signIn with what we have.
                // But we don't have the full user profile loaded from Firestore yet maybe.

                // Let's use the signIn function but be careful about the user object.
                // If we pass 'auth.currentUser', it might be minimal.

                // Actually, the previous implementation called `signIn` from useAuth.
                // Let's update that call.

                const currentUser = auth.currentUser;
                // We might not have the full profile data here, but we can pass basic info or rely on the listener.
                // Wait, the listener sets 'user'. 

                // Let's just save the tokens to AsyncStorage directly here as a fail-safe, 
                // AND call signIn if we can.

                // Actually, let's just trigger the token save.
                if (signIn) {
                    // We pass a dummy object or current state for user, but most importantly the tokens.
                    // If we pass auth.currentUser it might work.
                    signIn(
                        { uid: currentUser?.uid || data.yahoo_guid, username: currentUser?.displayName || 'Yahoo User' },
                        data.yahoo_access_token,
                        data.yahoo_refresh_token
                    );
                }

                // Also explicitly save to secure store or async storage just in case
                // await SecureStore.setItemAsync('yahoo_access_token', data.yahoo_access_token);

            } else {
                throw new Error('No custom token returned.');
            }

        } catch (error) {
            console.error('❌ Exchange failed (Detailed):', JSON.stringify(error, Object.getOwnPropertyNames(error)));
            if (error.code) console.error('Error Code:', error.code);
            if (error.details) console.error('Error Details:', error.details);
            Alert.alert('Login Error', error.message || 'Failed to exchange token.');
        } finally {
            setIsLoading(false);
        }
    };

    return {
        isLoading,
        promptAsync,
        isReady: !!request,
        isExpoGo: true,
        request,
    };
}
