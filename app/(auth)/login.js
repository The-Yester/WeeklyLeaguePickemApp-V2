// screens/Login.js
import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { useYahooAuth } from '../../hooks/useYahooAuth';

export default function Login() {
  const { isLoading, promptAsync, isReady } = useYahooAuth();

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/Pickem_Logo.png')} // optional branding
        style={styles.logo}
      />
      
      <Text style={styles.title}>Welcome to Weekly League Pick'em</Text>

      {isLoading ? (
        <ActivityIndicator size="large" color="#6001d2" />
      ) : (
        <TouchableOpacity
          onPress={() => promptAsync()}
          disabled={!isReady}
          style={styles.buttonWrapper}
        >
          <Image
            source={require('../../assets/images/Round_Primary_(dark).png')}
            style={[styles.buttonImage, !isReady && styles.disabled]}
            resizeMode="contain"
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
  },
  logo: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
    marginBottom: 30,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
  },
  buttonWrapper: {
    width: 240,
    height: 60,
  },
  buttonImage: {
    width: '100%',
    height: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
});

