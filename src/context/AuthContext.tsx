import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useSegments, SplashScreen } from 'expo-router';
import { auth, db } from '../config/firebase';
import { onAuthStateChanged, signOut as firebaseSignOut, signInAnonymously } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

type AuthProviderProps = {
  children: React.ReactNode;
};

type UserProfile = {
  uid: string;
  username?: string;
  email?: string;
};

type AuthContextType = {
  user: UserProfile | undefined;
  accessToken: string | null;
  signIn: (userData: UserProfile, token?: string | null) => Promise<void>;
  signOut: () => Promise<void>;
  isLoadingAuth: boolean;
  setAccessToken: React.Dispatch<React.SetStateAction<string | null>>;
  inAuthGroup: boolean;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be wrapped in a <AuthProvider />');
  }
  return value;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<UserProfile | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [inAuthGroup, setInAuthGroup] = useState<boolean>(false);
  const segments = useSegments() as string[];
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('👀 onAuthStateChanged fired:', firebaseUser);

      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);

          if (userDoc.exists()) {
            const userProfile = userDoc.data() as UserProfile;
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

    const isInAuthGroup = segments[0] === '(auth)';
    setInAuthGroup(isInAuthGroup);
    console.log(`AuthProvider (redirect effect): User: ${user?.username ?? 'null'}, InAuthGroup: ${inAuthGroup}`);

    if (user && inAuthGroup) {
      router.replace('/appGroup/home');
    } else if (!user && !inAuthGroup) {
      console.log('🔀 Redirecting to login screen...');
      router.replace('/authGroup/login');
    }

    SplashScreen.hideAsync().catch((e) => console.warn('SplashScreen.hideAsync error:', e));
  }, [user, segments, isLoading, router]);

  const signIn = async (userData: UserProfile, token = null) => {
    try {
      await AsyncStorage.setItem('currentUser', JSON.stringify(userData));
      if (token) {
        await AsyncStorage.setItem('yahoo_access_token', token);
        setAccessToken(token);
      }
      setUser(userData);
      console.log('🧠 AuthProvider received profile:', userData); // ← moved here
    } catch (e) {
      console.error('AuthProvider: Sign in failed', e);
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      await AsyncStorage.removeItem('yahoo_access_token');
      setAccessToken(null);
    } catch (e) {
      console.error('AuthProvider: Sign out failed', e);
    }
  };

  useEffect(() => {
    const loadYahooToken = async () => {
      const token = await AsyncStorage.getItem('yahoo_access_token');
      if (token) {
        setAccessToken(token);
      }
    };
    loadYahooToken();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        signIn,
        signOut,
        isLoadingAuth: isLoading,
        inAuthGroup, // ✅ make sure this is exposed
        setAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
