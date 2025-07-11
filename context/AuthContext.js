// context/AuthContext.js
import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useSegments, SplashScreen } from 'expo-router';

const AuthContext = createContext(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (process.env.NODE_ENV !== 'production') {
    if (!value) {
      throw new Error('useAuth must be wrapped in a <AuthProvider />');
    }
  }
  return value;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // Stores the user object or null
  const [isLoading, setIsLoading] = useState(true); // Initial loading for auth check
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    SplashScreen.preventAutoHideAsync(); // Keep splash screen visible
    const loadUser = async () => {
      console.log("AuthProvider: Checking AsyncStorage for currentUser...");
      try {
        const userString = await AsyncStorage.getItem('currentUser');
        if (userString) {
          const loadedUser = JSON.parse(userString);
          setUser(loadedUser);
          console.log("AuthProvider: User found in AsyncStorage.", loadedUser.username || loadedUser.name);
        } else {
          console.log("AuthProvider: No user found in AsyncStorage.");
          setUser(null);
        }
      } catch (e) {
        console.error("AuthProvider: Failed to load user from storage", e);
        setUser(null);
      } finally {
        setIsLoading(false);
        console.log("AuthProvider: Initial auth check complete. isLoading set to false.");
      }
    };
    loadUser();
  }, []);

  useEffect(() => {
    if (isLoading) {
      console.log("AuthProvider (redirect effect): Still loading initial auth state. No redirect action yet.");
      return; // Don't run redirect logic until initial auth check is done
    }

    const inAuthGroup = segments[0] === '(auth)';
    const inAppGroup = segments[0] === '(app)';
    const isSpecialRoute = segments[0] === '_sitemap' || segments[0] === '+not-found';

    console.log(`AuthProvider (redirect effect): User: ${user ? user.username : 'null'}, InAuthGroup: ${inAuthGroup}, InAppGroup: ${inAppGroup}, Segments: ${JSON.stringify(segments)}`);

    if (user) { // User IS logged in
      if (inAuthGroup) {
        // Logged in, but on an auth screen (e.g., /login). Redirect to app.
        console.log("AuthProvider: User logged in AND in auth group. Replacing route to '/(app)/home'.");
        router.replace('/(app)/home');
      } else if (!inAppGroup && !isSpecialRoute) {
        // Logged in, but NOT in an app screen and NOT a special route
        // (e.g., at root '/', or some other unexpected route). Redirect to app.
        console.log("AuthProvider: User logged in AND NOT in app group (and not special route). Replacing route to '/(app)/home'.");
        router.replace('/(app)/home');
      } else {
        // User is logged in and already in an app screen, or on a special route. Correct flow.
        console.log("AuthProvider: User logged in. Correct flow or on special route. No redirect action.");
      }
    } else { // User is NOT logged in
      if (!inAuthGroup && !isSpecialRoute) {
        // Not logged in, and NOT in an auth screen and NOT a special route.
        // (e.g. at root '/', or tried to access an app screen directly). Redirect to login.
        console.log("AuthProvider: User NOT logged in AND NOT in auth group (and not special route). Replacing route to '/(auth)/login'.");
        router.replace('/(auth)/login');
      } else {
        // User is not logged in, but IS in an auth screen (e.g., /login) or on a special route. Correct flow.
        console.log("AuthProvider: User NOT logged in. Correct flow or on special route. No redirect action.");
      }
    }

    // Hide splash screen once logic has run and a navigation decision is made
    SplashScreen.hideAsync().catch(e => console.warn("SplashScreen.hideAsync error:", e));

  }, [user, segments, router, isLoading]); // Key dependencies

  const signIn = async (userData) => {
    try {
      console.log("AuthProvider: signIn called with user:", userData.username);
      await AsyncStorage.setItem('currentUser', JSON.stringify(userData));
      setUser(userData);
    } catch (e) {
      console.error("AuthProvider: Sign in failed to save to AsyncStorage", e);
      throw e;
    }
  };

  const signOut = async () => {
    try {
      console.log("AuthProvider: signOut called.");
      await AsyncStorage.removeItem('currentUser');
      setUser(null);
    } catch (e) {
      console.error("AuthProvider: Sign out failed", e);
      throw e;
    }
  };

  return (
    <AuthContext.Provider value={{ user, signIn, signOut, isLoadingAuth: isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}