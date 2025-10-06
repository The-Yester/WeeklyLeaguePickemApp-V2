import { initializeApp, FirebaseApp, getApps, getApp } from 'firebase/app';
import { initializeAuth } from 'firebase/auth';
import { getReactNativePersistence } from 'firebase/auth/react-native';
import { getFirestore, Firestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyBsgpZtsLtPA7uSEmfPWq0b49qU7wHjZFo',
  authDomain: 'weekly-pickem-8cea3.firebaseapp.com',
  databaseURL: 'https://weekly-pickem-8cea3-default-rtdb.firebaseio.com',
  projectId: 'weekly-pickem-8cea3',
  storageBucket: 'weekly-pickem-8cea3.firebasestorage.app',
  messagingSenderId: '175850166680',
  appId: '1:175850166680:web:df6578c80042662599b3ed',
  measurementId: 'G-QLN0DJTEL7',
};

const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

const db: Firestore = getFirestore(app);

import { getFunctions } from 'firebase/functions';
const functions = getFunctions(app);

export { app, auth, db, functions };
