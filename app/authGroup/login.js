// app/authGroup/login.js
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
import { useLocalSearchParams, router } from 'expo-router';
import { nanoid } from 'nanoid/non-secure';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../../src/context/AuthContext'; // Fixed path alias
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeRedirectUri } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { GOOGLE_ANDROID_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from '../../src/config/google';
import { auth } from '../../src/config/firebase';

export default function Login() {
    const { isLoading, promptAsync, isReady, isExpoGo, request } = useYahooAuth();
    const { code } = useLocalSearchParams();
    const { user, signIn } = useAuth();

    const [googleRequest, googleResponse, googlePromptAsync] = Google.useAuthRequest({
        iosClientId: GOOGLE_IOS_CLIENT_ID,
        androidClientId: GOOGLE_ANDROID_CLIENT_ID,
        webClientId: GOOGLE_WEB_CLIENT_ID,
    });

    useEffect(() => {
        if (googleResponse?.type === 'success') {
            const { id_token } = googleResponse.params;
            const credential = GoogleAuthProvider.credential(id_token);
            signInWithCredential(auth, credential)
                .then((userCredential) => {
                    // Link or sign in logic handled by AuthContext listener usually, 
                    // but we might need to manually trigger our app's signIn context if it relies on firestore profile
                    console.log('✅ Google Sign-In success', userCredential.user.uid);
                    // router.replace('/appGroup/home'); // AuthContext listener should handle this
                })
                .catch((error) => {
                    console.error('❌ Google Sign-In error', error);
                    Alert.alert("Google Login Error", error.message);
                });
        }
    }, [googleResponse]);



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
            useProxy: false,
        });

        await SecureStore.setItemAsync('yahoo_redirect_uri', redirectUri);

        if (request?.codeVerifier) {
            await SecureStore.setItemAsync('yahoo_pkce_verifier', request.codeVerifier);
        }

        if (request?.url) {
            console.log('🔗 Launching Yahoo OAuth with URL:', request.url);
        }

        const result = await promptAsync({ useProxy: false, redirectUri });
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

            {/* Google Sign-In Button */}
            <TouchableOpacity
                onPress={() => googlePromptAsync()}
                style={[styles.buttonWrapper, { marginTop: 20 }]}
            >
                <Image
                    // Using a placeholder or reusing style for now, ideally we'd have a Google button asset or style
                    source={{ uri: 'https://developers.google.com/identity/images/btn_google_signin_dark_normal_web.png' }}
                    style={{ width: '100%', height: '100%', resizeMode: 'contain' }}
                />
                {/* Fallback Text if image fails or just for clarity during dev */}
                <View style={StyleSheet.absoluteFill}>
                    <Text style={{ color: 'transparent' }}>Sign in with Google</Text>
                </View>
            </TouchableOpacity>

            {/* DEVELOPER BYPASS BUTTON */}
            <TouchableOpacity
                onPress={() => {
                    console.log("⚡ Skipping Auth (Developer Mode)");
                    router.replace('/appGroup/home');
                }}
                style={{ marginTop: 30, padding: 10, backgroundColor: '#333', borderRadius: 5 }}
            >
                <Text style={{ color: '#00FF00', fontWeight: 'bold' }}>[DEV] Skip to App</Text>
            </TouchableOpacity>

            <View style={{ height: 20 }} />

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
