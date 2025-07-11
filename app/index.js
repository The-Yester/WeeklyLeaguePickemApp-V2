// app/index.js
import React from 'react';
import { View, ActivityIndicator } from 'react-native';
export default function InitialRootPage() { 
  // This page should be redirected from almost immediately by AuthContext logic
  return <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><ActivityIndicator/></View>; 
}