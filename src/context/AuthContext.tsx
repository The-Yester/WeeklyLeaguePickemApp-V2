// context/AuthContext.tsx
import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useSegments, SplashScreen } from 'expo-router';
import { auth, db } from '../config/firebase'; 
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

type AuthProviderProps = {
  children: React.ReactNode;
};

type AuthContextType = {
  user: any; // You can replace `any` with a proper User type later
  accessToken: string | null;
  signIn: (userData: any, token?: string | null) => Promise<void>;
  signOut: () => Promise<void>;
  isLoadingAuth: boolean;
  setAccessToken: React.Dispatch<React.SetStateAction<string | null>>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const value = useContext(AuthContext);
  if (process.env.NODE_ENV !== 'production') {
    if (!value) {
      throw new Error('useAuth must be wrapped in a <AuthProvider />');
    }
  }
  return value;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState(undefined); // Use undefined for initial loading state
  const [isLoading, setIsLoading] = useState(true);
  const segments = useSegments() as string[];
  const router = useRouter();
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // This is the primary effect for handling authentication state.
  useEffect(() => {
    // onAuthStateChanged returns an unsubscribe function
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in with Firebase.
        console.log("AuthProvider: Firebase user found (UID:", firebaseUser.uid, "), fetching profile from Firestore...");
        
        // Now, fetch the user's profile document from Firestore to get their name, username, etc.
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userProfile = userDoc.data();
          // Set the user state with the full profile from Firestore
          setUser(userProfile);
          // Also save to AsyncStorage for faster loads next time (optional but good practice)
          await AsyncStorage.setItem('currentUser', JSON.stringify(userProfile));
          console.log("AuthProvider: User profile loaded and set.", userProfile.username);
        } else {
          // This case is unlikely but good to handle. It means a user exists in Auth but not Firestore.
          console.warn("AuthProvider: User exists in Firebase Auth, but no profile found in Firestore.");
          setUser(null); // Treat as logged out
        }
      } else {
        // User is signed out.
        console.log("AuthProvider: No Firebase user found.");
        setUser(null);
        await AsyncStorage.removeItem('currentUser');
      }
      setIsLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  // This effect handles redirecting the user based on their auth state
  useEffect(() => {
    if (isLoading) {
      SplashScreen.preventAutoHideAsync(); // Keep splash screen visible while loading
      return;
    }

    const inAuthGroup = segments[0] === '(auth)';
    
    console.log(`AuthProvider (redirect effect): User: ${user ? user.username : 'null'}, InAuthGroup: ${inAuthGroup}`);

    if (user && inAuthGroup) {
      // User is logged in but on an auth screen (e.g., /login). Redirect to app.
      router.replace('/appGroup/home');
    } else if (!user && !inAuthGroup) {
      // User is not logged in and not in the auth section. Redirect to login.
      router.replace('/authGroup/login');
    }

    // Hide splash screen once logic has run
    SplashScreen.hideAsync().catch(e => console.warn("SplashScreen.hideAsync error:", e));

  }, [user, segments, isLoading, router]);


  const signIn = async (userData, token = null) => {
    try {
      await AsyncStorage.setItem('currentUser', JSON.stringify(userData));
      if (token) {
        await AsyncStorage.setItem('yahoo_access_token', token);
        setAccessToken(token);
      }
      setUser(userData);
    } catch (e) {
      console.error("AuthProvider: Sign in failed", e);
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      await AsyncStorage.removeItem('yahoo_access_token');
      setAccessToken(null);
    } catch (e) {
      console.error("AuthProvider: Sign out failed", e);
    }
  };

  const loadYahooToken = async () => {
    const token = await AsyncStorage.getItem('yahoo_access_token');
    if (token) {
      setAccessToken(token);
    }
  };
  useEffect(() => {
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
        setAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
