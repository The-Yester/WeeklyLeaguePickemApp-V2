import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useSegments, SplashScreen } from 'expo-router';
import { auth, db } from '../config/firebase';
import { onAuthStateChanged, signOut as firebaseSignOut, signInAnonymously } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

const AuthContext = createContext(null);

export function useAuth() {
    const value = useContext(AuthContext);
    if (!value) {
        throw new Error('useAuth must be wrapped in a <AuthProvider />');
    }
    return value;
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(undefined);
    const [isLoading, setIsLoading] = useState(true);
    const [accessToken, setAccessToken] = useState(null);
    const [refreshToken, setRefreshToken] = useState(null);
    const [inAuthGroup, setInAuthGroup] = useState(false);
    const segments = useSegments();
    const router = useRouter();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            console.log('👀 onAuthStateChanged fired:', firebaseUser);

            if (firebaseUser) {
                try {
                    const userDocRef = doc(db, 'users', firebaseUser.uid);
                    const userDoc = await getDoc(userDocRef);

                    if (userDoc.exists()) {
                        const userProfile = userDoc.data();
                        setUser(userProfile);
                        await AsyncStorage.setItem('currentUser', JSON.stringify(userProfile));
                        console.log('AuthProvider: User profile loaded and set.', userProfile.username);
                    } else {
                        console.warn('AuthProvider: Firebase user exists, but no profile found in Firestore.');
                        setUser({ uid: firebaseUser.uid, username: 'Anonymous' });
                    }
                } catch (e) {
                    console.error('AuthProvider: Error fetching user profile:', e);
                    setUser({ uid: firebaseUser.uid, username: 'Anonymous' });
                }
            } else {
                console.log('AuthProvider: No Firebase user found. Signing in anonymously…');

                try {
                    const { user: anonUser } = await signInAnonymously(auth);
                    console.log('✅ Anonymous Firebase UID:', anonUser.uid);
                    console.log('⚠️ No Firestore profile found. Using anonymous fallback.');
                    setUser({ uid: anonUser.uid, username: 'Anonymous' });
                } catch (err) {
                    console.error('❌ Anonymous sign-in failed:', err);
                    setUser(undefined);
                }
            }

            setIsLoading(false);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (isLoading) {
            SplashScreen.preventAutoHideAsync();
            return;
        }

        const isInAuthGroup = segments[0] === '(auth)' || segments[0] === 'authGroup';
        setInAuthGroup(isInAuthGroup);
        console.log(`AuthProvider (redirect effect): User: ${user?.username ?? 'null'}, InAuthGroup: ${isInAuthGroup}`);

        if (user && isInAuthGroup) {
            router.replace('/appGroup/home');
        } else if (!user && !isInAuthGroup) {
            console.log('🔀 Redirecting to login screen...');
            router.replace('/authGroup/login');
        }

        SplashScreen.hideAsync().catch((e) => console.warn('SplashScreen.hideAsync error:', e));
    }, [user, segments, isLoading, router]);

    const signIn = async (userData, yahooAccessToken = null, yahooRefreshToken = null) => {
        try {
            await AsyncStorage.setItem('currentUser', JSON.stringify(userData));
            if (yahooAccessToken) {
                await AsyncStorage.setItem('yahoo_access_token', yahooAccessToken);
                setAccessToken(yahooAccessToken);
            }
            if (yahooRefreshToken) {
                await AsyncStorage.setItem('yahoo_refresh_token', yahooRefreshToken);
                setRefreshToken(yahooRefreshToken);
            }
            setUser(userData);
            console.log('🧠 AuthProvider received profile:', userData);
        } catch (e) {
            console.error('AuthProvider: Sign in failed', e);
        }
    };

    const signOut = async () => {
        try {
            await firebaseSignOut(auth);
            await AsyncStorage.removeItem('yahoo_access_token');
            await AsyncStorage.removeItem('yahoo_refresh_token');
            setAccessToken(null);
            setRefreshToken(null);
        } catch (e) {
            console.error('AuthProvider: Sign out failed', e);
        }
    };

    useEffect(() => {
        const loadTokens = async () => {
            const storedAccessToken = await AsyncStorage.getItem('yahoo_access_token');
            const storedRefreshToken = await AsyncStorage.getItem('yahoo_refresh_token');
            if (storedAccessToken) {
                setAccessToken(storedAccessToken);
            }
            if (storedRefreshToken) {
                setRefreshToken(storedRefreshToken);
            }
        };
        loadTokens();
    }, []);

    return (
        <AuthContext.Provider
            value={{
                user,
                accessToken,
                refreshToken,
                signIn,
                signOut,
                isLoadingAuth: isLoading,
                inAuthGroup,
                setAccessToken,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
