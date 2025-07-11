// app/(auth)/forgotPassword.js
import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    Button,
    Alert,
    StyleSheet,
    TouchableOpacity,
    Platform,
    StatusBar,
    ActivityIndicator
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebaseConfig'; // Adjust path if firebaseConfig is elsewhere

// Colors
const PRIMARY_COLOR = '#1f366a';
const TEXT_COLOR_LIGHT = '#FFFFFF';
const INPUT_BACKGROUND = '#FFFFFF';
const BORDER_COLOR = '#B0BEC5';
const TEXT_COLOR_DARK = '#333333';
const BUTTON_COLOR = '#0288D1'; // A different color for this action
const PLACEHOLDER_TEXT_COLOR = '#757575';

const ForgotPasswordScreen = () => {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handlePasswordReset = async () => {
        if (!email) {
            Alert.alert('Error', 'Please enter your email address.');
            return;
        }

        setIsLoading(true);

        try {
            await sendPasswordResetEmail(auth, email);
            Alert.alert(
                'Check Your Email',
                `A password reset link has been sent to ${email}. Please follow the instructions in the email to reset your password.`,
                [
                    {
                        text: 'OK',
                        onPress: () => router.back(), // Go back to the previous screen (login)
                    }
                ]
            );
        } catch (error) {
            console.error('Password reset error:', error);
            if (error.code === 'auth/user-not-found') {
                Alert.alert('Error', 'No user found with this email address.');
            } else if (error.code === 'auth/invalid-email') {
                Alert.alert('Error', 'Please enter a valid email address.');
            }
            else {
                Alert.alert('Error', 'An error occurred. Please try again.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={PRIMARY_COLOR} />
            <Text style={styles.title}>Forgot Password?</Text>
            <Text style={styles.subtitle}>Enter your email address below and we'll send you a link to reset your password.</Text>
            <TextInput
                style={styles.input}
                placeholder="Enter your email address"
                placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
                onChangeText={setEmail}
                value={email}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                onSubmitEditing={handlePasswordReset}
            />

            <View style={styles.buttonContainer}>
                {isLoading ? (
                    <ActivityIndicator size="large" color={BUTTON_COLOR} />
                ) : (
                    <Button title="Send Reset Link" onPress={handlePasswordReset} color={BUTTON_COLOR} />
                )}
            </View>

            <Link href="/(auth)/login" asChild>
                <TouchableOpacity style={styles.loginLink} disabled={isLoading}>
                    <Text style={styles.loginLinkText}>Back to Login</Text>
                </TouchableOpacity>
            </Link>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#1f366a',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: TEXT_COLOR_LIGHT,
        marginBottom: 15,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        color: '#E0E0E0',
        textAlign: 'center',
        marginBottom: 30,
        paddingHorizontal: 10,
    },
    input: {
        width: '100%',
        height: 50,
        backgroundColor: INPUT_BACKGROUND,
        borderColor: BORDER_COLOR,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 15,
        marginBottom: 20,
        fontSize: 16,
        color: TEXT_COLOR_DARK,
    },
    buttonContainer: {
        width: '100%',
        marginTop: 10,
        borderRadius: 8,
        overflow: 'hidden',
        height: 40, 
        justifyContent: 'center'
    },
    loginLink: {
        marginTop: 25,
    },
    loginLinkText: {
        color: TEXT_COLOR_LIGHT,
        fontSize: 16,
        textDecorationLine: 'underline',
    }
});

export default ForgotPasswordScreen;