// app/(app)/home/_layout.js
import { Stack } from 'expo-router';
import React from 'react';

export default function HomeStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
    </Stack>
  );
}