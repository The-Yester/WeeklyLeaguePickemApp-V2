// app/authGroup/login.js
import React, { useEffect, useState } from 'react';
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
import { useAuth } from '../../src/context/AuthContext';
import * as Google from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, signInWithCredential, OAuthProvider, signInAnonymously } from 'firebase/auth';
import { GOOGLE_ANDROID_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from '../../src/config/google';
import { auth, db } from '../../src/config/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { BlurView } from 'expo-blur';
import { FontAwesome } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';

export default function Login() {
    const { isLoading, promptAsync, isReady } = useYahooAuth();
    const { code } = useLocalSearchParams();
    const { signIn } = useAuth();
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [isAppleAvailable, setIsAppleAvailable] = useState(false);
    const [logoTapCount, setLogoTapCount] = useState(0);

    const handleLogoPress = () => {
        setLogoTapCount((prev) => {
            const nextCount = prev + 1;
            if (nextCount === 5) {
                Alert.alert("Demo Mode Unlocked", "The 'Sign in with Demo Account' option is now visible.");
            }
            return nextCount;
        });
    };

    useEffect(() => {
        AppleAuthentication.isAvailableAsync().then((available) => {
            setIsAppleAvailable(available);
        });
    }, []);

    const [googleRequest, googleResponse, googlePromptAsync] = Google.useAuthRequest({
        iosClientId: GOOGLE_IOS_CLIENT_ID,
        androidClientId: GOOGLE_ANDROID_CLIENT_ID,
        webClientId: GOOGLE_WEB_CLIENT_ID,
    });

    useEffect(() => {
        if (googleResponse?.type === 'success') {
            setIsAuthenticating(true);
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
                    await signIn(userData, null, null);
                })
                .catch((error) => {
                    console.error('❌ Google Sign-In error', error);
                    Alert.alert("Google Login Error", error.message);
                })
                .finally(() => {
                    setIsAuthenticating(false);
                });
        }
    }, [googleResponse]);

    const handleYahooLogin = async () => {
        const result = await promptAsync();

        if (!result || result.type !== 'success') {
            if (result?.type === 'dismiss') {
                // User cancelled
            } else {
                Alert.alert("Yahoo Login Failed", "Could not launch Yahoo login. Please try again.");
            }
        }
    };

    const handleAppleLogin = async () => {
        try {
            setIsAuthenticating(true);
            const credential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                    AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
            });

            const { identityToken } = credential;
            if (!identityToken) {
                throw new Error("No identity token returned from Apple");
            }

            const provider = new OAuthProvider('apple.com');
            const firebaseCredential = provider.credential({
                idToken: identityToken,
            });

            const userCredential = await signInWithCredential(auth, firebaseCredential);
            const { uid, email, displayName } = userCredential.user;

            let name = displayName;
            if (credential.fullName) {
                const { givenName, familyName } = credential.fullName;
                if (givenName) {
                    name = familyName ? `${givenName} ${familyName}` : givenName;
                }
            }

            const userRef = doc(db, 'users', uid);
            const userSnap = await getDoc(userRef);

            let userData;
            if (!userSnap.exists()) {
                userData = {
                    uid,
                    email: email || credential.email || '',
                    username: name || email?.split('@')[0] || `AppleUser_${uid.substring(0, 6)}`,
                    createdAt: serverTimestamp(),
                    lastLogin: serverTimestamp(),
                    roles: ['user'],
                };
                await setDoc(userRef, userData);
            } else {
                await setDoc(userRef, { lastLogin: serverTimestamp() }, { merge: true });
                userData = userSnap.data();
            }

            await signIn(userData, null, null);
        } catch (error) {
            if (error.code === 'ERR_CANCELED') {
                return; // User cancelled
            }
            console.error("Apple Sign-In Error:", error);
            Alert.alert("Apple Sign-In Error", error.message);
        } finally {
            setIsAuthenticating(false);
        }
    };

    const handleDemoLogin = async () => {
        try {
            setIsAuthenticating(true);
            console.log("🔑 Logging in as Demo/Guest account...");
            const userCredential = await signInAnonymously(auth);
            const { uid } = userCredential.user;
            
            const userRef = doc(db, 'users', uid);
            const userSnap = await getDoc(userRef);

            let userData;
            if (!userSnap.exists()) {
                userData = {
                    uid,
                    email: 'demo@example.com',
                    username: 'Demo User',
                    displayName: 'Demo User',
                    createdAt: serverTimestamp(),
                    lastLogin: serverTimestamp(),
                    roles: ['user', 'demo'],
                    isDemo: true,
                    leagueKey: 'demo-league',
                    leagueName: 'Demo Fantasy League',
                    teamKey: 'demo_team_1',
                    teamName: 'Gridiron Gladiators',
                    teamLogo: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100'
                };
                await setDoc(userRef, userData);
            } else {
                await setDoc(userRef, { 
                    lastLogin: serverTimestamp(),
                    leagueKey: 'demo-league',
                    isDemo: true
                }, { merge: true });
                userData = userSnap.data();
            }

            console.log("✅ Demo account loaded:", userData.username);
            await signIn(userData, null, null);
        } catch (error) {
            console.error("Demo login error:", error);
            Alert.alert("Demo Login Error", error.message || "Failed to log in to demo mode.");
        } finally {
            setIsAuthenticating(false);
        }
    };

    return (
        <View style={styles.container}>
            {/* Futuristic Glowing Background Accents */}
            <View style={styles.glowCircle1} />
            <View style={styles.glowCircle2} />
            <View style={styles.glowCircle3} />

            {/* Glassmorphic Card Wrapper */}
            <View style={styles.glassCard}>
                <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />

                <TouchableOpacity
                    activeOpacity={0.95}
                    onPress={handleLogoPress}
                    style={styles.logoContainer}
                >
                    <Image source={require('../../assets/Pickem_Logo.png')} style={styles.logo} />
                </TouchableOpacity>

                <Text style={styles.title}>{"Weekly League Pick'em"}</Text>
                <Text style={styles.subtitle}>Predict. Compete. Win.</Text>

                {(isLoading || isAuthenticating) ? (
                    <View style={styles.loaderContainer}>
                        <ActivityIndicator size="large" color="#FFFFFF" />
                        <Text style={styles.loaderText}>Authenticating...</Text>
                    </View>
                ) : (
                    <View style={styles.buttonContainer}>
                        {/* Yahoo Sign-In Button */}
                        <TouchableOpacity
                            onPress={handleYahooLogin}
                            disabled={!isReady}
                            style={[styles.loginButton, styles.yahooButton, !isReady && styles.disabledButton]}
                        >
                            <FontAwesome name="yahoo" size={20} color="#FFFFFF" style={styles.buttonIcon} />
                            <Text style={styles.yahooButtonText}>Sign in with Yahoo</Text>
                        </TouchableOpacity>

                        {/* Google Sign-In Button */}
                        <TouchableOpacity
                            onPress={() => googlePromptAsync()}
                            style={[styles.loginButton, styles.googleButton]}
                        >
                            <FontAwesome name="google" size={18} color="#EA4335" style={styles.buttonIcon} />
                            <Text style={styles.googleButtonText}>Sign in with Google</Text>
                        </TouchableOpacity>

                        {/* Apple Sign-In Button (iOS only/Apple auth available) */}
                        {isAppleAvailable && (
                            <AppleAuthentication.AppleAuthenticationButton
                                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                                cornerRadius={18}
                                style={styles.appleButton}
                                onPress={handleAppleLogin}
                            />
                        )}

                        {/* Guest / Demo Mode Button (Secret tap gesture to reveal) */}
                        {logoTapCount >= 5 && (
                            <TouchableOpacity
                                onPress={handleDemoLogin}
                                style={[styles.loginButton, styles.demoButton]}
                            >
                                <FontAwesome name="eye" size={18} color="#10b981" style={styles.buttonIcon} />
                                <Text style={styles.demoButtonText}>Sign in with Demo Account</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0f172a', // Deep slate background
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    glowCircle1: {
        position: 'absolute',
        top: '15%',
        right: '-15%',
        width: 280,
        height: 280,
        borderRadius: 140,
        backgroundColor: '#10b981', // Emerald Green matching brand
        opacity: 0.15,
    },
    glowCircle2: {
        position: 'absolute',
        bottom: '15%',
        left: '-15%',
        width: 320,
        height: 320,
        borderRadius: 160,
        backgroundColor: '#1e3a8a', // Deep navy/blue
        opacity: 0.22,
    },
    glowCircle3: {
        position: 'absolute',
        top: '40%',
        left: '10%',
        width: 160,
        height: 160,
        borderRadius: 80,
        backgroundColor: '#7c3aed', // Purple accent for Yahoo
        opacity: 0.12,
    },
    glassCard: {
        width: '95%',
        maxWidth: 380,
        borderRadius: 32,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.14)',
        backgroundColor: 'rgba(15, 23, 42, 0.45)', // Sleek semi-transparent dark container
        paddingVertical: 45,
        paddingHorizontal: 28,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.4,
        shadowRadius: 24,
        elevation: 10,
        overflow: 'hidden', // Keep blur within rounded borders
    },
    logoContainer: {
        width: 180,
        height: 180,
        borderRadius: 90,
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.18)',
        backgroundColor: '#1f3668', // Matches the logo background color perfectly to blend corners
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 28,
        overflow: 'hidden', // Clips the square image into a circle
        shadowColor: '#10b981', // Emerald green brand glow
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 6,
    },
    logo: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    title: {
        fontSize: 24,
        fontWeight: '900',
        color: '#FFFFFF',
        textAlign: 'center',
        marginBottom: 6,
        letterSpacing: 0.5,
    },
    subtitle: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.5)',
        textAlign: 'center',
        marginBottom: 36,
        fontWeight: '600',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    buttonContainer: {
        width: '100%',
    },
    loginButton: {
        width: '100%',
        height: 56,
        borderRadius: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 3,
    },
    yahooButton: {
        backgroundColor: '#6001d2', // Yahoo Purple
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.15)',
    },
    googleButton: {
        backgroundColor: '#FFFFFF', // Clean Google White
        marginTop: 16,
    },
    appleButton: {
        width: '100%',
        height: 56,
        marginTop: 16,
    },
    demoButton: {
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderColor: '#10b981', // Emerald green brand color
        marginTop: 16,
    },
    demoButtonText: {
        color: '#10b981',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    buttonIcon: {
        marginRight: 14,
    },
    yahooButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    googleButtonText: {
        color: '#1f2937', // Slate dark text
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    disabledButton: {
        opacity: 0.4,
    },
    loaderContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
    },
    loaderText: {
        marginTop: 12,
        color: 'rgba(255, 255, 255, 0.7)',
        fontSize: 15,
        fontWeight: '600',
    },
});
