// app/authGroup/_layout.js
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
        </Stack>
    );
}
