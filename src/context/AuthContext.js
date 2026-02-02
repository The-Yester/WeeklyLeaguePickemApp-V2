import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useSegments, SplashScreen } from 'expo-router';
import { auth, db } from '../config/firebase';
import { onAuthStateChanged, signOut as firebaseSignOut, signInAnonymously } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import * as SecureStore from 'expo-secure-store';

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
    const [leagueKey, setLeagueKey] = useState(null); // [NEW] Store connected league key
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
                        setUser({ uid: firebaseUser.uid, ...userProfile });
                        await AsyncStorage.setItem('currentUser', JSON.stringify({ uid: firebaseUser.uid, ...userProfile }));

                        // [NEW] Load leagueKey if exists
                        if (userProfile.leagueKey) {
                            setLeagueKey(userProfile.leagueKey);
                            await AsyncStorage.setItem('leagueKey', userProfile.leagueKey);
                        } else {
                            // Check async storage backup?
                            const stored = await AsyncStorage.getItem('leagueKey');
                            if (stored) setLeagueKey(stored);
                        }

                        console.log('AuthProvider: User profile loaded.', userProfile.username);
                    } else {
                        console.warn('AuthProvider: Firebase user exists, but no profile found in Firestore.');
                        // If no profile, we treat as logged out or prompt creation?
                        // For now, let's just log out or set user undefined to force login
                        // actually, the user IS authenticated with Firebase, just missing profile.
                        // We should let them be "user" but perhaps redirect to setup?
                        // Let's set user to a minimal object
                        setUser({ uid: firebaseUser.uid, username: 'New User' });
                    }
                } catch (e) {
                    console.error('AuthProvider: Error fetching user profile:', e);
                    setUser(undefined);
                }
            } else {
                console.log('AuthProvider: No Firebase user found.');
                setUser(undefined);
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

        if (user && isInAuthGroup && user.username !== 'Anonymous') {
            // [NEW] Check if league is setup
            // logic moved to redirect effect below or handled by protected layout?
            // For now, prevent immediate redirect if league is missing? 
            // Actually, we'll let Home redirect to Setup, or handle it here.

            // Let's modify: If ready, go home.
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
                await SecureStore.setItemAsync('yahoo_access_token', yahooAccessToken);
                setAccessToken(yahooAccessToken);
            }
            if (yahooRefreshToken) {
                await SecureStore.setItemAsync('yahoo_refresh_token', yahooRefreshToken);
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
            await SecureStore.deleteItemAsync('yahoo_access_token');
            await SecureStore.deleteItemAsync('yahoo_refresh_token');
            setAccessToken(null);
            setRefreshToken(null);
        } catch (e) {
            console.error('AuthProvider: Sign out failed', e);
        }
    };

    useEffect(() => {
        const loadTokens = async () => {
            let storedAccessToken = await SecureStore.getItemAsync('yahoo_access_token');
            let storedRefreshToken = await SecureStore.getItemAsync('yahoo_refresh_token');

            // MIGRATION: Check AsyncStorage if not in SecureStore
            if (!storedAccessToken) {
                storedAccessToken = await AsyncStorage.getItem('yahoo_access_token');
                if (storedAccessToken) await SecureStore.setItemAsync('yahoo_access_token', storedAccessToken);
            }
            if (!storedRefreshToken) {
                storedRefreshToken = await AsyncStorage.getItem('yahoo_refresh_token');
                if (storedRefreshToken) await SecureStore.setItemAsync('yahoo_refresh_token', storedRefreshToken);
            }

            if (storedAccessToken) {
                setAccessToken(storedAccessToken);
            }
            if (storedRefreshToken) {
                setRefreshToken(storedRefreshToken);
            }
            const storedLeagueKey = await AsyncStorage.getItem('leagueKey');
            if (storedLeagueKey) setLeagueKey(storedLeagueKey);
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
                leagueKey, // [NEW]
                setLeagueKey // [NEW]
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
