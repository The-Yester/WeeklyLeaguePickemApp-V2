import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { useYahooAuth } from '../../src/hooks/useYahooAuth'; // Added import
import { validateAndLinkLeague } from '../../src/services/yahooFantasy';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../src/config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';

const PRIMARY_COLOR = '#1f366a';
const SECONDARY_COLOR = 'green';
const BACKGROUND_COLOR = '#F4F6F8';

export default function LeagueSetupScreen() {
    const router = useRouter();
    const { user, setLeagueKey, accessToken, setAccessToken, signOut } = useAuth(); // accessToken from context
    const [leagueIdInput, setLeagueIdInput] = useState('');
    const [loading, setLoading] = useState(false);

    // Yahoo Auth logic
    const { promptAsync, request, isReady } = useYahooAuth();

    const handleYahooLogin = async () => {
        // We rely on useYahooAuth internal logic using the Proxy URI
        const result = await promptAsync();
        if (result?.type !== 'success') {
            // alert or log?
        }
    };

    const handleConnect = async () => {
        if (!leagueIdInput.trim()) {
            Alert.alert('Missing ID', 'Please enter your Yahoo League ID (Group ID).');
            return;
        }

        setLoading(true);
        try {
            // 1. Validate against Yahoo API
            const leagueData = await validateAndLinkLeague(leagueIdInput.trim());
            console.log('League Verified:', leagueData);

            // 2. Save to Firestore (Persistent)
            if (user?.uid) {
                const userRef = doc(db, 'users', user.uid);
                // Use setDoc with merge: true so it creates the document if it doesn't exist
                await setDoc(userRef, {
                    leagueKey: leagueData.league_key, // e.g., 449.l.66645
                    leagueName: leagueData.name,
                    leagueId: leagueData.league_id,   // e.g., 66645

                    // [NEW] Save User's Yahoo Team Info
                    teamKey: leagueData.team_key || null,
                    teamName: leagueData.team_name || null,
                    teamLogo: leagueData.team_logo || null,

                    lastUpdated: new Date()
                }, { merge: true });
            }

            // 3. Save to Local Storage & Context (Immediate use)
            await AsyncStorage.setItem('leagueKey', leagueData.league_key);
            setLeagueKey(leagueData.league_key);

            Alert.alert('Success', `Connected to "${leagueData.name}"!`, [
                { text: "Let's Play", onPress: () => router.replace('/appGroup/home') }
            ]);

        } catch (error) {
            console.error(error);
            const errString = error.message || '';
            if (errString.includes('token_expired') || errString.includes('401')) {
                Alert.alert('Session Expired', 'Your Yahoo session has expired. Please log in again.', [
                    { text: 'OK', onPress: () => signOut() }
                ]);
            } else {
                Alert.alert('Connection Failed', error.message || 'Could not verify league. Please check the ID and try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    if (!accessToken) {
        return (
            <View style={styles.container}>
                <View style={styles.content}>
                    <Ionicons name="warning" size={60} color={PRIMARY_COLOR} style={{ marginBottom: 20 }} />
                    <Text style={styles.title}>Yahoo Connection Required</Text>
                    <Text style={styles.subtitle}>
                        Using Google login? You still need to link your Yahoo Fantasy account.
                        If you are logged out, please go back to the main login.
                    </Text>
                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleYahooLogin}
                        disabled={!isReady}
                    >
                        <Text style={styles.buttonText}>Connect Yahoo Account</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { signOut(); router.replace('/authGroup/login'); }} style={{ marginTop: 20 }}>
                        <Text style={styles.linkText}>Log in with Google / Email</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <Ionicons name="american-football" size={60} color={PRIMARY_COLOR} style={{ marginBottom: 20 }} />
                <Text style={styles.title}>Connect Your League</Text>
                <Text style={styles.subtitle}>
                    Enter the Yahoo League ID (Group ID) for the current season. You can find this in your league URL or renewal email.
                </Text>

                <View style={styles.inputContainer}>
                    <Text style={styles.label}>League ID (e.g. 66645)</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Enter League ID"
                        placeholderTextColor="#999"
                        keyboardType="numeric"
                        value={leagueIdInput}
                        onChangeText={setLeagueIdInput}
                        maxLength={10}
                    />
                </View>

                <TouchableOpacity
                    style={[styles.button, loading && styles.buttonDisabled]}
                    onPress={handleConnect}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <Text style={styles.buttonText}>Connect League</Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => Linking.openURL('https://football.fantasysports.yahoo.com/')} style={{ marginTop: 20 }}>
                    <Text style={styles.linkText}>Go to Yahoo Fantasy Website</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={signOut} style={{ marginTop: 20 }}>
                    <Text style={[styles.linkText, { color: 'red' }]}>Sign Out / Reset</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: BACKGROUND_COLOR,
        justifyContent: 'center',
        padding: 20,
    },
    content: {
        backgroundColor: '#FFF',
        borderRadius: 20,
        padding: 30,
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 5,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: PRIMARY_COLOR,
        marginBottom: 10,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        marginBottom: 30,
        lineHeight: 20,
    },
    inputContainer: {
        width: '100%',
        marginBottom: 20,
    },
    label: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 5,
        marginLeft: 4,
    },
    input: {
        backgroundColor: '#F9F9F9',
        borderWidth: 1,
        borderColor: '#DDD',
        borderRadius: 10,
        padding: 15,
        fontSize: 16,
        color: '#333',
    },
    button: {
        backgroundColor: SECONDARY_COLOR,
        width: '100%',
        padding: 15,
        borderRadius: 10,
        alignItems: 'center',
    },
    buttonDisabled: {
        backgroundColor: '#A5D6A7',
    },
    buttonText: {
        color: '#FFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    linkText: {
        color: PRIMARY_COLOR,
        textDecorationLine: 'underline',
        fontSize: 14,
    }
});
