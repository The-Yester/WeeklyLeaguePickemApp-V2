// app/(app)/makepicks.js
import { Redirect } from 'expo-router';
import React from 'react';

// This file exists only to satisfy the tab route and redirect the user.
export default function MakePicksTabRedirect() {
  // Redirect to the actual MakePicks screen located within the 'home' stack.
  return <Redirect href="/(app)/home/makepicks" />;
}