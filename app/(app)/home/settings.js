// app/(app)/home/settings.js
import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  Platform,
  StatusBar,
  Alert,
  Linking,
  Switch,
  Image
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useRouter, Link } from 'expo-router';
import { useAuth } from '../../../context/AuthContext'; // Adjust path if your context file is elsewhere
import * as Notifications from 'expo-notifications'; // Import expo-notifications
import { getAuth, deleteUser } from "firebase/auth";
import { doc, deleteDoc, collection, getDocs } from "firebase/firestore";
import { db } from '../../../firebaseConfig'; // Adjust path if needed

// Colors
const PRIMARY_COLOR = '#1f366a';
const TEXT_COLOR_LIGHT = '#FFFFFF';
const TEXT_COLOR_DARK = '#333333';
const CARD_BACKGROUND = '#FFFFFF';
const BORDER_COLOR = '#E0E0E0';
const LIST_ITEM_TEXT_COLOR = '#212121';
const LIST_ITEM_ICON_COLOR = '#757575';
const DANGER_COLOR = '#D32F2F';
const SWITCH_THUMB_COLOR_IOS = '#FFFFFF';
const SWITCH_TRACK_COLOR_FALSE = '#767577';
const SWITCH_TRACK_COLOR_TRUE = PRIMARY_COLOR;

// --- Weekly Picks Lock Schedule ---
// Notification will be 1 hour before this lockTime.
// Using YYYY-MM-DD and 24-hour time for robust parsing.
const PICKS_LOCK_SCHEDULE = [
  { week: 1, date: '2025-09-04', lockTime: '19:15' },
  { week: 2, date: '2025-09-11', lockTime: '19:15' },
  { week: 3, date: '2025-09-18', lockTime: '19:15' },
  { week: 4, date: '2025-09-25', lockTime: '19:15' },
  { week: 5, date: '2025-10-02', lockTime: '19:15' },
  { week: 6, date: '2025-10-09', lockTime: '19:15' },
  { week: 7, date: '2025-10-16', lockTime: '19:15' },
  { week: 8, date: '2025-10-23', lockTime: '19:15' },
  { week: 9, date: '2025-10-30', lockTime: '19:15' },
  { week: 10, date: '2025-11-06', lockTime: '19:15' },
  { week: 11, date: '2025-11-13', lockTime: '19:15' },
  { week: 12, date: '2025-11-20', lockTime: '19:15' },
  { week: 13, date: '2025-11-27', lockTime: '19:15' },
  { week: 14, date: '2025-12-04', lockTime: '19:15' },
  { week: 15, date: '2025-12-11', lockTime: '19:15' },
  { week: 16, date: '2025-12-18', lockTime: '19:15' },
  { week: 17, date: '2025-12-25', lockTime: '12:00' },
  { week: 18, date: '2026-01-01', lockTime: '12:00' },
];

const PICK_REMINDER_NOTIFICATION_ID_PREFIX = 'weeklyPickReminder_week_';

// Configure how notifications are handled when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const SettingsScreen = () => {
  const router = useRouter();
  const { user, signOut } = useAuth(); // Get user and signOut function from context

  const [arePickRemindersEnabled, setArePickRemindersEnabled] = useState(false);
  const [profileImageUri, setProfileImageUri] = useState(null);

  const registerForPushNotificationsAsync = async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      Alert.alert('Permission Required', 'Failed to get permission for notifications! Please enable them in your device settings.');
      return false;
    }
    return true;
  };

  // This effect fetches user-specific preferences when the component loads or the user changes
  useEffect(() => {
    const fetchUserPreferences = async () => {
      // Fetch notification preference
      try {
        const reminderPref = await AsyncStorage.getItem('pickReminderEnabled');
        setArePickRemindersEnabled(reminderPref === 'true');
      } catch (e) { console.error("Failed to load notification preference:", e); }

      // Fetch profile image URI if user exists
      if (user && user.username) {
        try {
          const savedImageUri = await AsyncStorage.getItem(`profile_${user.username}_imageUri`);
          if (savedImageUri) {
            setProfileImageUri(savedImageUri);
          } else {
            setProfileImageUri(null);
          }
        } catch (e) {
            console.error("Failed to load profile image:", e);
            setProfileImageUri(null);
        }
      }
    };

    fetchUserPreferences();
  }, [user]); // Rerun this effect if the user object changes

  const scheduleWeeklyPickReminders = async () => {
    const now = new Date();
    let scheduledCount = 0;

    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log("Cancelled all previously scheduled notifications.");

    for (const weekSchedule of PICKS_LOCK_SCHEDULE) {
      const lockDateTime = new Date(`${weekSchedule.date}T${weekSchedule.lockTime}:00`);
      const reminderDateTime = new Date(lockDateTime.getTime() - (60 * 60 * 1000)); // 1 hour before

      if (reminderDateTime > now) {
        const notificationId = `${PICK_REMINDER_NOTIFICATION_ID_PREFIX}${weekSchedule.week}`;
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: `🏈 Week ${weekSchedule.week} Pick'em Reminder!`,
              body: `Don't forget! Picks lock in about 1 hour.`,
              data: { screen: 'makepicks', week: weekSchedule.week }, 
            },
            trigger: reminderDateTime,
            identifier: notificationId,
          });
          console.log(`Notification scheduled for Week ${weekSchedule.week} at: ${reminderDateTime.toLocaleString()}`);
          scheduledCount++;
        } catch (e) {
          console.error(`Failed to schedule notification for Week ${weekSchedule.week}:`, e);
        }
      }
    }
    Alert.alert("Reminders Enabled", `${scheduledCount} weekly pick reminders have been scheduled.`);
  };

  const cancelAllWeeklyPickReminders = async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log(`Cancelled all weekly pick reminders.`);
    Alert.alert("Reminders Disabled", "All weekly pick reminders have been turned off.");
  };

  const handleReminderToggle = async (value) => {
    setArePickRemindersEnabled(value);
    try {
        await AsyncStorage.setItem('pickReminderEnabled', value.toString());
        if (value) {
            Alert.alert("Reminder Preference Saved", "Pick deadline reminder preference is ON.");
        } else {
            Alert.alert("Reminder Preference Saved", "Pick deadline reminder preference is OFF.");
        }
    } catch (e) {
        console.error("Failed to save reminder preference:", e);
        Alert.alert("Error", "Could not save reminder preference.");
    }
  };

  const handleLogoutPress = () => {
    Alert.alert( "Logout", "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout", style: "destructive",
          onPress: async () => {
            try {
              await signOut(); // Call signOut from AuthContext
              // The AuthContext's useEffect will now handle redirecting to the login screen.
            } catch (e) {
              console.error("Logout failed on settings screen:", e);
              Alert.alert("Error", "Logout failed. Please try again.");
            }
          }
        }
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "Are you absolutely sure you want to delete your account? This action is permanent and cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete My Account",
          style: "destructive",
          onPress: async () => {
            console.log("Starting account deletion process...");
            const auth = getAuth();
            const firebaseUser = auth.currentUser;

            if (!firebaseUser) {
              Alert.alert("Error", "Could not verify user. Please log out and log back in to delete your account.");
              return;
            }

            try {
              // Step 1: Delete all subcollections (picks, comments) from Firestore.
              // This is important as Firestore doesn't automatically delete subcollections.
              const picksCollectionRef = collection(db, "users", firebaseUser.uid, "picks");
              const commentsCollectionRef = collection(db, "users", firebaseUser.uid, "comments");
              
              const picksSnapshot = await getDocs(picksCollectionRef);
              for (const doc of picksSnapshot.docs) {
                await deleteDoc(doc.ref);
              }
              console.log("Deleted user's picks subcollection.");

              const commentsSnapshot = await getDocs(commentsCollectionRef);
              for (const doc of commentsSnapshot.docs) {
                await deleteDoc(doc.ref);
              }
              console.log("Deleted user's comments subcollection.");

              // Step 2: Delete the main user document from Firestore.
              await deleteDoc(doc(db, "users", firebaseUser.uid));
              console.log("Deleted main user document from Firestore.");

              // Step 3: Delete the user from Firebase Authentication.
              // This is the final, irreversible step.
              await deleteUser(firebaseUser);
              console.log("Successfully deleted user from Firebase Auth.");

              Alert.alert("Account Deleted", "Your account and all associated data have been permanently deleted.");
              // The signOut function will clear local data and trigger navigation to the login screen.
              await signOut();

            } catch (error) {
              console.error("Account deletion failed:", error);
              let errorMessage = "An error occurred while deleting your account. Please try again.";
              if (error.code === 'auth/requires-recent-login') {
                errorMessage = "This is a sensitive operation. Please log out and log back in before deleting your account.";
              }
              Alert.alert("Deletion Failed", errorMessage);
            }
          },
        },
      ]
    );
  };

  const SettingItem = ({ iconName, title, onPress, href, isDestructive = false, hasSwitch = false, switchValue, onSwitchValueChange }) => {
    const content = (
        <>
            <Ionicons name={iconName} size={24} color={isDestructive ? DANGER_COLOR : LIST_ITEM_ICON_COLOR} style={styles.settingIcon} />
            <Text style={[styles.settingText, isDestructive && styles.destructiveText]}>{title}</Text>
            {hasSwitch ? (
            <Switch
                trackColor={{ false: SWITCH_TRACK_COLOR_FALSE, true: SWITCH_TRACK_COLOR_TRUE }}
                thumbColor={Platform.OS === 'ios' ? SWITCH_THUMB_COLOR_IOS : (switchValue ? PRIMARY_COLOR : '#f4f3f4')}
                ios_backgroundColor={SWITCH_TRACK_COLOR_FALSE}
                onValueChange={onSwitchValueChange}
                value={switchValue}
            />
            ) : ( !isDestructive && <Ionicons name="chevron-forward-outline" size={22} color="#C7C7CC" /> )}
        </>
    );

    if (href) {
        return (
            <Link href={href} asChild>
                <TouchableOpacity style={styles.settingItem} activeOpacity={0.7}>
                    {content}
                </TouchableOpacity>
            </Link>
        );
    }

    return (
        <TouchableOpacity style={styles.settingItem} onPress={onPress} activeOpacity={hasSwitch ? 1 : 0.2}>
            {content}
        </TouchableOpacity>
    );
};


  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={PRIMARY_COLOR} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back-outline" size={28} color={TEXT_COLOR_LIGHT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView style={styles.scrollView}>
        {user && (
          <View style={styles.profileHeader}>
            <View style={styles.avatarPlaceholder}>
              {profileImageUri ? (
                <Image source={{ uri: profileImageUri }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person-circle-outline" size={60} color={PRIMARY_COLOR} />
              )}
            </View>
            <Text style={styles.profileName}>{user.name || user.username || 'User'}</Text>
            <Text style={styles.profileEmail}>{user.email}</Text>
          </View>
        )}

        <Text style={styles.sectionHeader}>Account</Text>
        <View style={styles.section}>
          <SettingItem 
            iconName="person-outline" 
            title="Edit Profile" 
            href="./profile"
          />
          <SettingItem 
            iconName="lock-closed-outline" 
            title="Change Password" 
            href="./changePassword"
          />
        </View>

        <Text style={styles.sectionHeader}>Notifications</Text>
        <View style={styles.section}>
          <SettingItem
            iconName="alarm-outline"
            title="Pick Deadline Reminders"
            hasSwitch
            switchValue={arePickRemindersEnabled}
            onSwitchValueChange={handleReminderToggle}
          />
        </View>

        <Text style={styles.sectionHeader}>About</Text>
        <View style={styles.section}>
          <SettingItem iconName="information-circle-outline" title="App Version" onPress={() => Alert.alert("App Version", "1.0.0")} />
          <SettingItem iconName="document-text-outline" title="Terms of Service" onPress={() => Linking.openURL('https://yourwebsite.com/terms').catch(err => console.error("Couldn't load page", err))} />
          <SettingItem iconName="shield-checkmark-outline" title="Privacy Policy" onPress={() => Linking.openURL('https://yourwebsite.com/privacy').catch(err => console.error("Couldn't load page", err))} />
        </View>

        <View style={[styles.section, {marginTop: 20}]}>
          <SettingItem iconName="log-out-outline" title="Logout" onPress={handleLogoutPress} isDestructive />
        </View>

        <Text style={styles.sectionHeader}>Danger Zone</Text>
        <View style={[styles.section, { borderColor: DANGER_COLOR }]}>
          <SettingItem iconName="trash-outline" title="Delete Account" onPress={handleDeleteAccount} isDestructive />
        </View>
        <Text style={styles.dangerZoneText}>
            Account deletion is permanent and cannot be undone.
        </Text>

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', },
  header: { 
    backgroundColor: PRIMARY_COLOR, 
    paddingHorizontal: 15, 
    paddingVertical: 15, 
    paddingTop: Platform.select({ android: StatusBar.currentHeight ? StatusBar.currentHeight + 10 : 20, ios: 40, default: 20 }), 
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between', 
  },
  backButton: {
    padding: 5,
  },
  headerTitle: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    color: TEXT_COLOR_LIGHT, 
  },
  headerSpacer: {
    width: 28 + 10,
  },
  scrollView: { flex: 1, },
  profileHeader: { alignItems: 'center', paddingVertical: 20, backgroundColor: CARD_BACKGROUND, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: BORDER_COLOR, },
  avatarPlaceholder: { 
    width: 80, 
    height: 80, 
    borderRadius: 40, 
    backgroundColor: '#e0e0e0', 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: 10,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  profileName: { fontSize: 20, fontWeight: 'bold', color: TEXT_COLOR_DARK, },
  profileEmail: { fontSize: 14, color: '#757575', },
  sectionHeader: { fontSize: 14, fontWeight: '600', color: '#666', paddingHorizontal: 15, paddingTop: 20, paddingBottom: 8, textTransform: 'uppercase', },
  section: { backgroundColor: CARD_BACKGROUND, borderTopWidth: 1, borderBottomWidth: 1, borderColor: BORDER_COLOR, },
  settingItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 15, backgroundColor: CARD_BACKGROUND, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER_COLOR, },
  settingIcon: { marginRight: 15, },
  settingText: { flex: 1, fontSize: 16, color: LIST_ITEM_TEXT_COLOR, },
  destructiveText: { color: DANGER_COLOR, },
  dangerZoneText: {
    marginHorizontal: 15,
    marginTop: 8,
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  }
});

export default SettingsScreen;