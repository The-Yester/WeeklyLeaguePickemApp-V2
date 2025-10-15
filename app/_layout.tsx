// app/_layout.tsx
import React, { useEffect } from 'react';
import { Stack, SplashScreen } from 'expo-router';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { ActivityIndicator, View, StatusBar, StyleSheet, Text, Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';

WebBrowser.maybeCompleteAuthSession();

const PRIMARY_COLOR = '#1A237E';

function AppStackLayout() {
  const { isLoadingAuth, user, inAuthGroup } = useAuth();

  useEffect(() => {
    if (!isLoadingAuth) {
      SplashScreen.hideAsync().catch(e =>
        console.warn("AppStackLayout SplashScreen.hideAsync error:", e)
      );

      if (user?.username === 'Anonymous' && !inAuthGroup) {
        console.log('🔀 Redirecting anonymous user to /authGroup/login');
        router.replace('/authGroup/login');
      }
    }
  }, [isLoadingAuth, user, inAuthGroup]);

  if (isLoadingAuth) {
    console.log("AppStackLayout: Auth is loading, showing loading indicator.");
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.loadingText}>Initializing App...</Text>
      </View>
    );
  }

  console.log("AppStackLayout: Auth loading complete. Rendering Expo Router Stack.");
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="authGroup" options={{ gestureEnabled: false }} />
      <Stack.Screen name="appGroup" options={{ gestureEnabled: false }} />
      <Stack.Screen name="+not-found" />
      <Stack.Screen name="index" />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      console.log('🌍 RootLayout received initial URL:', url);
    });
  }, []);

  console.log("RootLayout: Rendering with AuthProvider and AppStackLayout.");
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor={PRIMARY_COLOR} />
      <AuthProvider>
        <AppStackLayout />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: PRIMARY_COLOR,
  },
  loadingText: {
    marginTop: 10,
    color: '#FFFFFF',
    fontSize: 16,
  },
});