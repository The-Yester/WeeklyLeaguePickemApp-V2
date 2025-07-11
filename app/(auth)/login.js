// app/(auth)/login.js
import { makeRedirectUri, useAuthRequest } from 'expo-auth-session';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import { useAuth } from '../../context/AuthContext';
import { yahooCredentials } from '../../yahooConfig';
import { app } from '../firebaseConfig'; // Import the initialized app

WebBrowser.maybeCompleteAuthSession();

// Yahoo OAuth 2.0 Endpoints
const discovery = {
  authorizationEndpoint: 'https://api.login.yahoo.com/oauth2/request_auth',
  tokenEndpoint: 'https://api.login.yahoo.com/oauth2/get_token',
};

const COLORS = {
  primaryBlue: '#1A237E',
  lighterBlue: '#1f366a',
  textWhite: '#FFFFFF',
  fieldGreen: 'green',
  accentYellow: '#FFEB3B',
  inputBackground: '#E8EAF6',
  placeholderText: '#757575',
  errorRed: '#D32F2F',
  buttonText: '#FFFFFF',
  disabledButton: '#9E9E9E'
};

const LoginScreen = () => {
  const { signIn } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const redirectUri = makeRedirectUri({
    scheme: 'weeklyleaguepickemapp',
    path: 'login'
  });

  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: yahooCredentials.clientId,
      scopes: ['fspt-r', 'profile'],
      clientSecret: yahooCredentials.clientSecret,
      redirectUri,
      responseType: 'code',
    },
    discovery
  );

  // This useEffect handles the response after the user attempts to log in with Yahoo
  useEffect(() => {
    const handleYahooResponse = async () => {
      if (response) {
        setIsLoading(true);
        if (response.type === 'success') {
          const { code } = response.params;
          console.log('Yahoo login successful, received auth code:', code);
          
          try {
            // --- Call the Firebase Cloud Function ---
            const functions = getFunctions(app);
            const exchangeYahooCode = httpsCallable(functions, 'exchangeYahooCodeForToken');
            const result = await exchangeYahooCode({ code });

            const { token, profile } = result.data;

            // Use the custom token to sign into Firebase Auth
            const auth = getAuth(app);
            await signInWithCustomToken(auth, token);
            console.log("Successfully signed into Firebase with custom token.");

            // Use the profile data to update the AuthContext and navigate
            await signIn(profile);
            
          } catch (error) {
            console.error("Error calling cloud function or signing in:", error);
            Alert.alert("Login Failed", "There was an error connecting your account. Please try again.");
          }

        } else if (response.type === 'error') {
          console.error("Yahoo login error:", response.error);
          Alert.alert("Yahoo Login Failed", "Could not connect to your Yahoo account. Please try again.");
        }
        setIsLoading(false);
      }
    };

    handleYahooResponse();
  }, [response, signIn]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryBlue} />
      <View style={styles.content}>
        <Image
          source={require('../../assets/Pickem_Logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>The League: Weekly Pick'em</Text>
        <Text style={styles.subtitle}>Log in with your Yahoo Fantasy account to get started.</Text>

        <View style={styles.buttonContainer}>
            {isLoading ? (
                <ActivityIndicator size="large" color={COLORS.yahooPurple} />
            ) : (
                <TouchableOpacity
                    style={styles.button}
                    onPress={() => promptAsync()}
                    disabled={!request}
                >
                    <Ionicons name="logo-yahoo" size={24} color={COLORS.buttonText} style={{marginRight: 10}}/>
                    <Text style={styles.buttonText}>Login with Yahoo Fantasy</Text>
                </TouchableOpacity>
            )}
        </View>
        <Text style={styles.disclaimer}>
            This app is not affiliated with or endorsed by Yahoo.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PRIMARY_COLOR,
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  logo: {
    width: 200,
    height: 200,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.textWhite,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#E0E0E0',
    textAlign: 'center',
    marginBottom: 40,
  },
  buttonContainer: {
    width: '100%',
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    flexDirection: 'row',
    width: '100%',
    height: 50,
    backgroundColor: COLORS.yahooPurple,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  buttonText: {
    color: COLORS.buttonText,
    fontSize: 18,
    fontWeight: 'bold',
  },
  disclaimer: {
    fontSize: 12,
    color: '#B0BEC5',
    textAlign: 'center',
    marginTop: 30,
  }
});

export default LoginScreen;