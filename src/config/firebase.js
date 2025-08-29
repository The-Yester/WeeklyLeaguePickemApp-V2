// src/config/firebase.js
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { Platform } from 'react-native';
import { firebaseApp } from './firebaseInit';

export const auth = initializeAuth(firebaseApp, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const functions = getFunctions(firebaseApp, 'us-central1');

if (__DEV__) {
  const host = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
  connectFunctionsEmulator(functions, host, 5001);
}
