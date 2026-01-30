import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
  Platform,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import Ionicons from 'react-native-vector-icons/Ionicons'; // For back button icon

// Colors (ensure these are consistent or imported from a central theme)
const PRIMARY_COLOR = '#1f366a';
const TEXT_COLOR_LIGHT = '#FFFFFF';
const INPUT_BACKGROUND = '#FFFFFF';
const BORDER_COLOR = '#B0BEC5';
const TEXT_COLOR_DARK = '#333333';
const BUTTON_COLOR = '#4CAF50'; // Green for save/change

const ChangePasswordScreen = () => {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingUser, setIsFetchingUser] = useState(true);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      setIsFetchingUser(true);
      try {
        const userString = await AsyncStorage.getItem('currentUser');
        if (userString) {
          setCurrentUser(JSON.parse(userString));
        } else {
          Alert.alert("Error", "User session not found. Please log in again.");
          router.replace('/authGroup/login'); // Redirect if no user
        }
      } catch (e) {
        console.error("Failed to load current user:", e);
        Alert.alert("Error", "Could not load user data.");
        router.replace('/authGroup/login');
      } finally {
        setIsFetchingUser(false);
      }
    };
    fetchCurrentUser();
  }, [router]);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert('Error', 'New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
        Alert.alert('Error', 'New password must be at least 6 characters long.');
        return;
    }
    if (!currentUser) {
        Alert.alert('Error', 'User session not found. Please try again.');
        return;
    }

    setIsLoading(true);

    // SECURITY WARNING: Comparing plain text passwords. Highly insecure.
    if (currentUser.password !== currentPassword) {
      Alert.alert('Error', 'Incorrect current password.');
      setIsLoading(false);
      return;
    }

    try {
      // 1. Update password in the main 'users' list
      const usersString = await AsyncStorage.getItem('users');
      let users = usersString ? JSON.parse(usersString) : [];
      const userIndex = users.findIndex(u => u.email === currentUser.email);

      if (userIndex === -1) {
        Alert.alert('Error', 'Critical error: Could not find your user account in the list to update.');
        setIsLoading(false);
        return;
      }

      // Create a new user object with the updated password
      const updatedUserInList = { ...users[userIndex], password: newPassword };
      users[userIndex] = updatedUserInList; // Replace old user object with updated one
      await AsyncStorage.setItem('users', JSON.stringify(users));

      // 2. Update password in 'currentUser' session object
      const updatedCurrentUser = { ...currentUser, password: newPassword };
      await AsyncStorage.setItem('currentUser', JSON.stringify(updatedCurrentUser));
      setCurrentUser(updatedCurrentUser); // Update local state if needed elsewhere immediately

      Alert.alert('Success', 'Password changed successfully.', [
        { text: 'OK', onPress: () => router.back() } // Navigate back after success
      ]);

    } catch (error) {
      console.error('Change Password Error:', error);
      Alert.alert('Error', 'Failed to change password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isFetchingUser) {
      return (
          <View style={[styles.container, styles.centered]}>
              <ActivityIndicator size="large" color={PRIMARY_COLOR} />
          </View>
      );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={PRIMARY_COLOR} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back-outline" size={28} color={TEXT_COLOR_LIGHT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change Password</Text>
        <View style={{width: 28}} /> 
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.warningText}>
            SECURITY WARNING: This app currently stores and handles passwords in an insecure manner (plain text) for demonstration purposes only. Do not use real or important passwords.
        </Text>
        <TextInput
          style={styles.input}
          placeholder="Current Password"
          secureTextEntry
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholderTextColor="#888"
        />
        <TextInput
          style={styles.input}
          placeholder="New Password (min. 6 characters)"
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
          placeholderTextColor="#888"
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm New Password"
          secureTextEntry
          value={confirmNewPassword}
          onChangeText={setConfirmNewPassword}
          placeholderTextColor="#888"
          onSubmitEditing={handleChangePassword} // Optionally submit on done
        />
        <View style={styles.buttonContainer}>
            <Button
            title={isLoading ? "Changing..." : "Change Password"}
            onPress={handleChangePassword}
            disabled={isLoading}
            color={BUTTON_COLOR}
            />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5', // Lighter background
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 15,
    paddingVertical: 15,
    paddingTop: Platform.select({ android: StatusBar.currentHeight ? StatusBar.currentHeight + 10 : 20, ios: 40, default: 20 }),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center', // Center title if no back button shown from stack
  },
  backButton: { // Style for back button if you add one manually
  position: 'absolute',
  left: 15,
  top: Platform.select({ android: StatusBar.currentHeight ? StatusBar.currentHeight + 12 : 20, ios: 42, default: 20 }),
  zIndex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: TEXT_COLOR_LIGHT,
  },
  scrollContent: {
    padding: 20,
  },
  warningText: {
    backgroundColor: '#FFF3CD',
    color: '#856404',
    padding: 12,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#FFEEBA',
    textAlign: 'center',
    marginBottom: 20,
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: INPUT_BACKGROUND,
    borderColor: BORDER_COLOR,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    fontSize: 16,
    color: TEXT_COLOR_DARK,
  },
  buttonContainer: {
    marginTop: 10,
    borderRadius: 8,
    overflow: 'hidden', // For Button borderRadius on Android
  }
});

export default ChangePasswordScreen;