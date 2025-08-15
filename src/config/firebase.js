// src/config/firebase.js
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { Platform } from "react-native";
import { firebaseApp } from "./firebaseInit"; // however you init

export const functions = getFunctions(firebaseApp, "us-central1");

if (__DEV__) {
  const host = Platform.OS === "android" ? "10.0.2.2" : "127.0.0.1";
  connectFunctionsEmulator(functions, host, 5001);
}