// app/_layout.js
import React, { useEffect } from 'react'; // useEffect might be needed in AppStack
import { Stack, SplashScreen } from 'expo-router';
import { AuthProvider, useAuth } from '../../../src/context/AuthContext';
import { ActivityIndicator, View, StatusBar, StyleSheet, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const PRIMARY_COLOR = '#1A237E'; 

// This internal component renders the actual navigation stack once auth state is determined
// It uses the useAuth hook to access the loading state and user.
function AppStackLayout() {
  const { isLoadingAuth } = useAuth(); // Get auth loading state from context

  useEffect(() => {
    // Hide splash screen once the AuthProvider has finished its initial loading
    // and this component is ready to render something (or nothing if still loading).
    if (!isLoadingAuth) {
      SplashScreen.hideAsync().catch(e => console.warn("AppStackLayout SplashScreen.hideAsync error:", e));
    }
  }, [isLoadingAuth]);

  if (isLoadingAuth) {
    // AuthProvider is still determining the initial user state.
    // SplashScreen.preventAutoHideAsync() should have been called in AuthProvider.
    // This view might be shown very briefly or covered by the native splash.
    console.log("AppStackLayout: Auth is loading, showing loading indicator.");
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text style={styles.loadingText}>Initializing App...</Text>
      </View>
    );
  }

  console.log("AppStackLayout: Auth loading complete. Rendering Expo Router Stack.");
  // Auth state is resolved. AuthProvider's useEffect will handle redirection.
  // This Stack just defines the available top-level route groups.
  // Expo Router will automatically look for _layout.js files in app/(auth)/ and app/(app)/
  // to define the screens and layout for these groups.
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ gestureEnabled: false }} />
      <Stack.Screen name="(app)" options={{ gestureEnabled: false }} />
      <Stack.Screen name="+not-found" />
      <Stack.Screen name="index" />
    </Stack>
  );
}

export default function RootLayout() {
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
  }
});