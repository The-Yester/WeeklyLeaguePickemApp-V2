// app/(app)/_layout.js
import React, { useState } from 'react';
import { Tabs, useRouter } from 'expo-router';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Alert, View, TouchableOpacity, StyleSheet } from 'react-native';
import * as Linking from 'expo-linking';

// Define explicit colors to ensure they exist
const COLORS = {
  primaryBlue: '#1f366a', // Updated to match other screens
  activeTab: '#1f366a',
  inactiveTab: '#757575',
  headerIcon: '#FFFFFF',
};

// Header Right Component
const HeaderRightButtons = () => {
  const router = useRouter();

  return (
    <View style={{ flexDirection: 'row', marginRight: 15 }}>
      <TouchableOpacity
        onPress={() => router.push('/appGroup/settings')}
        style={{ marginRight: 15 }}
      >
        <Ionicons name="settings-outline" size={24} color={COLORS.headerIcon} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => router.push('/appGroup/profile')}
      >
        <Ionicons name="person-circle-outline" size={28} color={COLORS.headerIcon} />
      </TouchableOpacity>
    </View>
  );
};

// Simplified tab press listener without the missing "UnsavedChanges" context
const createTabPressListener = (router, path, isExternal = false) => ({
  tabPress: (e) => {
    // Prevent default navigation for all tabs we are handling manually.
    e.preventDefault();

    // The action to perform (navigate or open link)
    const performAction = () => {
      if (isExternal) {
        Linking.openURL(path).catch(err => {
          console.error("Failed to open URL:", err);
          Alert.alert("Could not open page.");
        });
      } else {
        router.navigate(path);
      }
    };

    performAction();
  }
});

export default function AppTabsLayout() {
  const router = useRouter();

  // NOTE: "useUnsavedChanges" was missing, so we are disabling that feature for now 
  // to prevent the white-screen crash.

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: true, // Enable Header
        headerStyle: {
          backgroundColor: COLORS.primaryBlue,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        headerRight: () => <HeaderRightButtons />,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'home') { iconName = focused ? 'home' : 'home-outline'; }
          else if (route.name === 'makepicks') { iconName = focused ? 'shield-checkmark' : 'shield-checkmark-outline'; }
          else if (route.name === 'myPicks') { iconName = focused ? 'checkmark-done-circle' : 'checkmark-done-circle-outline'; }
          else if (route.name === 'stats') { iconName = focused ? 'stats-chart' : 'stats-chart-outline'; }
          else if (route.name === 'frankings') { iconName = focused ? 'american-football' : 'american-football-outline'; }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: COLORS.activeTab,
        tabBarInactiveTintColor: COLORS.inactiveTab,
      })}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'The League' }}
        listeners={createTabPressListener(router, '/appGroup/home')}
      />
      <Tabs.Screen
        name="makepicks"
        options={{ title: 'Make Picks' }}
        listeners={createTabPressListener(router, '/appGroup/makepicks')}
      />
      <Tabs.Screen
        name="myPicks"
        options={{ title: 'My Picks' }}
        listeners={createTabPressListener(router, '/appGroup/myPicks')}
      />
      <Tabs.Screen
        name="stats"
        options={{ title: 'Stats' }}
        listeners={createTabPressListener(router, '/appGroup/stats')}
      />
      <Tabs.Screen
        name="frankings"
        options={{ title: 'Frankings' }}
        listeners={createTabPressListener(router, '/appGroup/frankings')}
      />
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
          title: 'Profile'
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
          title: 'Settings',
          headerShown: false
        }}
      />
      <Tabs.Screen
        name="changePassword"
        options={{
          href: null,
          title: 'Change Password'
        }}
      />
      <Tabs.Screen
        name="leagueSetup"
        options={{
          href: null,
          title: 'Setup League',
          tabBarStyle: { display: 'none' }
        }}
      />
    </Tabs>
  );
}
