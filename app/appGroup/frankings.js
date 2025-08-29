// app/(app)/frankings.js
import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';

// This file exists to satisfy Expo Router's file-based routing for the 'frankings' tab.
// The actual navigation to the external website is handled by a listener in the
// tab layout file (app/(app)/_layout.js), so this component will not normally be seen.
export default function FrankingsScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      <Text style={styles.text}>Redirecting to Frankings...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f0f4f7',
    },
    text: {
        marginTop: 10,
        fontSize: 16,
        color: '#333'
    }
});