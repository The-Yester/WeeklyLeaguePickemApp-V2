// app/(auth)/signup.js
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Button,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig'; // Adjust path if needed

// Colors
const PRIMARY_COLOR = '#1f366a';
const TEXT_COLOR_LIGHT = '#FFFFFF';
const INPUT_BACKGROUND = '#000000';
const BORDER_COLOR = '#B0BEC5';
const TEXT_COLOR_DARK = '#FFFFFF';
const BUTTON_COLOR = 'green';
const PLACEHOLDER_TEXT_COLOR = '#757575';

const SignUpScreen = () => {
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSignUp = async () => {
        if (!email || !password || !name || !username) {
            Alert.alert('Error', 'Please fill in all fields');
            return;
        }

        if (password.length < 6) {
            Alert.alert('Weak Password', 'Password must be at least 6 characters long.');
            return;
        }

        setIsLoading(true);

        try {
            // Step 1: Create the user in Firebase Authentication
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            console.log('Firebase Auth user created with UID:', user.uid);

            // Step 2: Create a document for the user in the 'users' collection in Firestore
            const userDocRef = doc(db, "users", user.uid);
            await setDoc(userDocRef, {
                uid: user.uid,
                name: name,
                username: username,
                email: email.toLowerCase(),
            });
            console.log('User document created in Firestore.');

            // --- Step 3: Send the Firebase verification email ---
            await sendEmailVerification(user);
            console.log('Verification email sent.');
            
            // --- End of email sending logic ---

            Alert.alert(
                'Success!',
                'Your account has been created. Please check your email to verify your account, then log in.',
                [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
            );

        } catch (error) {
            console.error('Sign up error:', error);
            // Provide more specific feedback to the user
            let friendlyMessage = 'An unexpected error occurred. Please try again.';
            if (error.code) {
                switch (error.code) {
                    case 'auth/email-already-in-use':
                        friendlyMessage = 'This email address is already registered. Please log in or use a different email.';
                        break;
                    case 'auth/invalid-email':
                        friendlyMessage = 'Please enter a valid email address.';
                        break;
                    case 'auth/weak-password':
                        friendlyMessage = 'The password must be at least 6 characters long.';
                        break;
                    case 'auth/network-request-failed':
                        friendlyMessage = 'A network error occurred. Please check your internet connection and try again.';
                        break;
                    default:
                        friendlyMessage = `An error occurred: ${error.message}`;
                }
            }
            Alert.alert('Sign Up Failed', friendlyMessage);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={PRIMARY_COLOR} />
            <Text style={styles.title}>Create an Account</Text>
            <TextInput
                style={styles.input}
                placeholder="Name (First & Last)"
                placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
                onChangeText={setName}
                value={name}
                autoCapitalize="words"
            />
            <TextInput
                style={styles.input}
                placeholder="Team Name (Username)"
                placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
                onChangeText={setUsername}
                value={username}
                autoCapitalize="none"
            />
            <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
                onChangeText={setEmail}
                value={email}
                keyboardType="email-address"
                autoCapitalize="none"
            />
            <TextInput
                style={styles.input}
                placeholder="Password (min. 6 characters)"
                placeholderTextColor={PLACEHOLDER_TEXT_COLOR}
                secureTextEntry
                onChangeText={setPassword}
                value={password}
            />

            <View style={styles.buttonContainer}>
                {isLoading ? (
                    <ActivityIndicator size="large" color={BUTTON_COLOR} />
                ) : (
                    <Button title="Sign Up" onPress={handleSignUp} color={BUTTON_COLOR} />
                )}
            </View>

            <Link href="/(auth)/login" asChild>
                <TouchableOpacity style={styles.loginLink} disabled={isLoading}>
                    <Text style={styles.loginLinkText}>Already have an account? Login</Text>
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
        marginBottom: 30,
        textAlign: 'center',
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

export default SignUpScreen;