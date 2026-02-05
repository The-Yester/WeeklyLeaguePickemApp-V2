// app/(app)/frankings.js
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  Image,
  Dimensions,
  Linking
} from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from 'react-native-vector-icons/Ionicons';

// --- THEME COLORS ---
const PRIMARY_COLOR = '#0D1B2A';
const SECONDARY_COLOR = '#00E5FF';
const CARD_BACKGROUND = '#1B263B';
const TEXT_COLOR_MAIN = '#FFFFFF';
const TEXT_COLOR_SUB = '#B0BEC5';
const ACCENT_COLOR = '#00E676';
const ERROR_COLOR = '#FF5252';

const { width } = Dimensions.get('window');

export default function FrankingsScreen() {
  const router = useRouter();

  // Security State
  // isUnlocked = false: Show Modal
  // isUnlocked = true: Show Content
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [password, setPassword] = useState('');

  // Password Validation
  const handleUnlock = () => {
    if (password === 'FranktheTank') {
      setIsUnlocked(true);
      // Auto-open link on first unlock
      Linking.openURL('https://frankings.blogspot.com/?view=sidebar').catch(err => {
        console.error("Link Error", err);
      });
    } else {
      Alert.alert("Access Denied", "Incorrect Password.");
    }
  };

  const handleAIOverview = () => {
    // DO NOT unlock. Just navigate.
    // When user returns, isUnlocked is still false, so Modal appears.
    router.push('/appGroup/stats');
  };

  return (
    <View style={styles.container}>
      {/* 
        Modal is visible ONLY if NOT Unlocked. 
        onRequestClose handles hardware back button on Android.
      */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={!isUnlocked}
        onRequestClose={() => {
          router.back();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="lock-closed" size={48} color={SECONDARY_COLOR} style={{ marginBottom: 20 }} />

            <Text style={styles.modalTitle}>COMMISSIONER ACCESS</Text>
            <Text style={styles.modalText}>
              This section belongs to the specific league known as <Text style={{ fontWeight: 'bold', color: SECONDARY_COLOR }}>"THE LEAGUE"</Text>.
            </Text>

            <Text style={styles.modalText}>
              Please enter the password to continue.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Enter Password"
              placeholderTextColor="#777"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
            />

            <TouchableOpacity style={styles.unlockButton} onPress={handleUnlock}>
              <Text style={styles.unlockButtonText}>UNLOCK VAULT</Text>
            </TouchableOpacity>

            <View style={styles.separator} />

            <Text style={styles.secondaryText}>
              Not part of THE LEAGUE?
            </Text>

            <TouchableOpacity style={styles.aiButton} onPress={handleAIOverview}>
              <Ionicons name="analytics" size={20} color={PRIMARY_COLOR} style={{ marginRight: 8 }} />
              <Text style={styles.aiButtonText}>VIEW STATS OVERVIEW</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

      {/* Content View: Only rendered/visible if unlocked */}
      {isUnlocked && (
        <View style={styles.contentContainer}>
          <Ionicons name="open-outline" size={64} color={SECONDARY_COLOR} />
          <Text style={styles.successText}>Redirecting to Frankings...</Text>

          <TouchableOpacity
            style={styles.reopenButton}
            onPress={() => Linking.openURL('https://frankings.blogspot.com/?view=sidebar')}
          >
            <Text style={styles.reopenButtonText}>OPEN LINK AGAIN</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{ marginTop: 30 }}
            onPress={() => setIsUnlocked(false)} // Relock option
          >
            <Text style={{ color: TEXT_COLOR_SUB, textDecorationLine: 'underline' }}>Relock Vault</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PRIMARY_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.95)', // Darker overlay to hide background fully
  },
  modalContent: {
    width: width * 0.85,
    backgroundColor: CARD_BACKGROUND,
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SECONDARY_COLOR,
    shadowColor: SECONDARY_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    color: TEXT_COLOR_MAIN,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 15,
    letterSpacing: 1,
  },
  modalText: {
    color: TEXT_COLOR_SUB,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 20,
  },
  input: {
    width: '100%',
    backgroundColor: '#0D1B2A',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    padding: 15,
    color: TEXT_COLOR_MAIN,
    marginBottom: 20,
    marginTop: 10,
    textAlign: 'center',
  },
  unlockButton: {
    backgroundColor: SECONDARY_COLOR,
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
    width: '100%',
    alignItems: 'center',
    marginBottom: 15,
  },
  unlockButtonText: {
    color: PRIMARY_COLOR,
    fontWeight: 'bold',
    fontSize: 16,
  },
  separator: {
    height: 1,
    width: '100%',
    backgroundColor: '#333',
    marginVertical: 15,
  },
  secondaryText: {
    color: TEXT_COLOR_SUB,
    fontSize: 12,
    marginBottom: 10,
  },
  aiButton: {
    flexDirection: 'row',
    backgroundColor: ACCENT_COLOR,
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiButtonText: {
    color: PRIMARY_COLOR,
    fontWeight: 'bold',
    fontSize: 14,
  },

  // Success/Background state
  contentContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successText: {
    color: TEXT_COLOR_MAIN,
    fontSize: 18,
    marginTop: 20,
    marginBottom: 20,
  },
  reopenButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SECONDARY_COLOR,
  },
  reopenButtonText: {
    color: SECONDARY_COLOR,
    fontWeight: 'bold',
  }
});