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
import { auth, db } from '../../src/config/firebase'; // Ensure db is imported
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'; // Added imports

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
                .then(async (userCredential) => {
                    const { uid, email, displayName, photoURL } = userCredential.user;
                    console.log('✅ Google Sign-In success', uid);

                    // Create/Update Firestore User Profile
                    const userRef = doc(db, 'users', uid);
                    const userSnap = await getDoc(userRef);

                    let userData;

                    if (!userSnap.exists()) {
                        console.log('🆕 Creating new user profile in Firestore...');
                        userData = {
                            uid,
                            email,
                            username: displayName || email.split('@')[0],
                            photoURL,
                            createdAt: serverTimestamp(),
                            lastLogin: serverTimestamp(),
                            roles: ['user'], // Default role
                        };
                        await setDoc(userRef, userData);
                    } else {
                        console.log('👋 User profile exists, updating last login...');
                        // Merge update last login
                        await setDoc(userRef, { lastLogin: serverTimestamp() }, { merge: true });
                        userData = userSnap.data();
                    }

                    // Explicitly update AuthContext to avoid race condition/missing profile warning
                    // Pass null for Yahoo tokens as this is Google Auth (Yahoo linked later)
                    await signIn(userData, null, null);

                })
                .catch((error) => {
                    console.error('❌ Google Sign-In error', error);
                    Alert.alert("Google Login Error", error.message);
                });
        }
    }, [googleResponse]);



    const handleYahooLogin = async () => {
        // We rely on useYahooAuth to handle the request/crypto generation.
        // We do NOT need to manually set yahoo_redirect_uri here as useYahooAuth 
        // uses its own constant for the Proxy flow.

        const result = await promptAsync(); // Call without args to use hook defaults (Proxy)

        if (!result || result.type !== 'success') {
            // Did the user cancel?
            if (result?.type === 'dismiss') {
                // optional logging
            } else {
                Alert.alert("Yahoo Login Failed", "Could not launch Yahoo login. Please try again.");
            }
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
