// app/(auth)/_layout.js
import React from 'react';
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // No header for the auth stack itself
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="forgotPassword" />
      {/* The actual screen components will be in login.js, signup.js, etc. */}
    </Stack>
  );
}