// app/(app)/_layout.js
import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Alert } from 'react-native';
import * as Linking from 'expo-linking';
// Correct the import path if your context folder is at the project root

const COLORS = {
  primaryBlue: '#1A237E',
  activeTab: '#1A237E',
  inactiveTab: '#757575',
};

// This helper function creates the logic for each tab press.
const createTabPressListener = (hasUnsavedChanges, setHasUnsavedChanges, router, path, isExternal = false) => ({
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

        if (hasUnsavedChanges) {
            Alert.alert(
                'Unsaved Picks',
                'You are leaving this page without saving your picks. Click OK to continue or Cancel to stay on this page.',
                [
                  { text: "Cancel", style: 'cancel', onPress: () => {} },
                  { 
                    text: 'OK', 
                    style: 'destructive', 
                    onPress: () => {
                      // Reset the flag and then perform the navigation
                      setHasUnsavedChanges(false);
                      performAction();
                  }},
                ]
            );
        } else {
            // If no unsaved changes, just perform the action.
            performAction();
        }
    }
});

// This is the actual Tabs layout component. It must be inside the provider.
function AppTabsLayout() {
  const router = useRouter();
  // Get the shared state and setter from the context
  const { hasUnsavedChanges, setHasUnsavedChanges } = useUnsavedChanges();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
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
        options={{ title: 'Home' }}
        listeners={createTabPressListener(hasUnsavedChanges, setHasUnsavedChanges, router, '/(app)/home')}
      />
      <Tabs.Screen
        name="makepicks"
        options={{ title: 'Make Picks' }}
        // CORRECTED PATH: Points to the redirect file, which then goes to the actual screen
        listeners={createTabPressListener(hasUnsavedChanges, setHasUnsavedChanges, router, '/(app)/makepicks')}
      />
      <Tabs.Screen
        name="myPicks"
        options={{ title: 'My Picks' }}
        listeners={createTabPressListener(hasUnsavedChanges, setHasUnsavedChanges, router, '/(app)/myPicks')}
      />
      <Tabs.Screen
        name="stats"
        options={{ title: 'Stats' }}
        listeners={createTabPressListener(hasUnsavedChanges, setHasUnsavedChanges, router, '/(app)/stats')}
      />
      <Tabs.Screen
        name="frankings"
        options={{ title: 'Frankings' }}
        listeners={createTabPressListener(hasUnsavedChanges, setHasUnsavedChanges, router, 'https://frankings.blogspot.com/?view=sidebar', true)}
      />
    </Tabs>
  );
}

// The component that is exported wraps the layout with the provider
export default function AppLayoutWithProvider() {
  return (
    {children}
  );
}