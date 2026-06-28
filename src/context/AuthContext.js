import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useSegments, SplashScreen } from 'expo-router';
import { auth, db } from '../config/firebase';
import { onAuthStateChanged, signOut as firebaseSignOut, signInAnonymously } from 'firebase/auth';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

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
        let unsubscribeDoc = null;

        const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
            console.log('👀 onAuthStateChanged fired:', firebaseUser);

            if (unsubscribeDoc) {
                unsubscribeDoc();
                unsubscribeDoc = null;
            }

            if (firebaseUser) {
                const userDocRef = doc(db, 'users', firebaseUser.uid);
                
                // Set up real-time listener for the user profile document
                unsubscribeDoc = onSnapshot(userDocRef, async (docSnap) => {
                    if (docSnap.exists()) {
                        const userProfile = docSnap.data();
                        setUser(prev => (prev && prev.uid === firebaseUser.uid ? { ...prev, ...userProfile } : { uid: firebaseUser.uid, ...userProfile }));
                        await AsyncStorage.setItem('currentUser', JSON.stringify({ uid: firebaseUser.uid, ...userProfile }));

                        if (userProfile.leagueKey) {
                            setLeagueKey(userProfile.leagueKey);
                            await AsyncStorage.setItem('leagueKey', userProfile.leagueKey);
                        } else {
                            const stored = await AsyncStorage.getItem('leagueKey');
                            if (stored) setLeagueKey(stored);
                        }
                        console.log('AuthProvider: User profile loaded/updated.', userProfile.username || userProfile.teamName);
                    } else {
                        console.warn('AuthProvider: Firebase user exists, but no profile found in Firestore yet.');
                        setUser({ uid: firebaseUser.uid, username: 'New User' });
                    }
                    setIsLoading(false);
                }, (error) => {
                    console.error('AuthProvider: Error listening to user profile:', error);
                    setIsLoading(false);
                });
            } else {
                console.log('AuthProvider: No Firebase user found.');
                setUser(undefined);
                setLeagueKey(null);
                setIsLoading(false);
            }
        });

        return () => {
            unsubscribeAuth();
            if (unsubscribeDoc) unsubscribeDoc();
        };
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
            setUser(prev => (prev && prev.uid === userData.uid ? { ...prev, ...userData } : userData));
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
            setLeagueKey(null);
            await AsyncStorage.removeItem('currentUser');
            await AsyncStorage.removeItem('leagueKey');
            await AsyncStorage.removeItem('pickReminderEnabled');
            await AsyncStorage.removeItem('yahoo_access_token');
            await AsyncStorage.removeItem('yahoo_refresh_token');
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

    useEffect(() => {
        const registerForPushNotifications = async (uid) => {
            try {
                if (Platform.OS === 'web') return;

                const { status: existingStatus } = await Notifications.getPermissionsAsync();
                let finalStatus = existingStatus;
                if (existingStatus !== 'granted') {
                    const { status } = await Notifications.requestPermissionsAsync();
                    finalStatus = status;
                }
                if (finalStatus !== 'granted') {
                    console.log('Push notification permission not granted.');
                    return;
                }

                if (Platform.OS === 'android') {
                    await Notifications.setNotificationChannelAsync('default', {
                        name: 'default',
                        importance: Notifications.AndroidImportance.MAX,
                        vibrationPattern: [0, 250, 250, 250],
                        lightColor: '#FF231F7C',
                    });
                }

                const projectId = Constants.expoConfig?.extra?.eas?.projectId || "1a3ac46c-372c-43c5-88c3-86c01b32981d";
                const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
                const token = tokenData.data;
                console.log('🚀 Expo Push Token retrieved:', token);

                const userRef = doc(db, 'users', uid);
                await updateDoc(userRef, { expoPushToken: token });
                console.log('✅ Push token stored in Firestore for user:', uid);
            } catch (e) {
                console.warn('Failed to register for push notifications:', e);
            }
        };

        if (user && user.uid && user.username !== 'Anonymous') {
            registerForPushNotifications(user.uid);
        }
    }, [user]);

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
