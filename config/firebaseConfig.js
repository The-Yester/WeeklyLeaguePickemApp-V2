// app/firebaseConfig.js
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';

// IMPORTANT: Your Firebase project configuration object
const firebaseConfig = {
  apiKey: "AIzaSyBsgpZtsLtPA7uSEmfPWq0b49qU7wHjZFo",
  authDomain: "weekly-pickem-8cea3.firebaseapp.com",
  databaseURL: "https://weekly-pickem-8cea3-default-rtdb.firebaseio.com",
  projectId: "weekly-pickem-8cea3",
  storageBucket: "weekly-pickem-8cea3.firebasestorage.app",
  messagingSenderId: "175850166680",
  appId: "1:175850166680:web:df6578c80042662599b3ed",
  measurementId: "G-QLN0DJTEL7"
};

// Initialize Firebase
let app;
let auth;

if (!getApps().length) {
  try {
    app = initializeApp(firebaseConfig);
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
    console.log("✅ Firebase initialized for the first time with auth persistence.");
  } catch (error) {
    console.error("🔥 Firebase initialization error:", error);
    app = initializeApp(firebaseConfig); // fallback init
    auth = getAuth(app);
  }
} else {
  app = getApp();
  auth = getAuth(app);
  console.log("🔁 Using existing Firebase app instance.");
}

const db = getFirestore(app);

export { app, auth, db };