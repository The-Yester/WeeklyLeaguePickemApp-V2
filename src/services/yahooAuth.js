// src/services/yahooAuth.js
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import { getRedirectUri, YAHOO_CLIENT_ID, YAHOO_SCOPES } from '../config/yahoo';

const SS_KEYS = {
  state: 'yahoo_oauth_state',
  verifier: 'yahoo_pkce_verifier',
  redirectUri: 'yahoo_redirect_uri',
};

const discovery = {
  authorizationEndpoint: 'https://api.login.yahoo.com/oauth2/request_auth',
  tokenEndpoint: 'https://api.login.yahoo.com/oauth2/get_token',
};

// Start Yahoo OAuth with PKCE; returns the AuthSession result
export async function startYahooAuth({ useProxy = true } = {}) {
  // Compute the redirect URI once and persist the exact string
  const redirectUri = getRedirectUri(useProxy);
  await SecureStore.setItemAsync(SS_KEYS.redirectUri, redirectUri);

  // Create a PKCE request
  const req = new AuthSession.AuthRequest({
    clientId: YAHOO_CLIENT_ID,
    responseType: AuthSession.ResponseType.Code,
    scopes: YAHOO_SCOPES, // start minimal; add fantasy scopes as needed
    redirectUri,
    usePKCE: true,
  });

  // Load service configuration
  await req.makeAuthUrlAsync(discovery);

  // Save state and code_verifier for the callback to validate/exchange
  if (req.state) await SecureStore.setItemAsync(SS_KEYS.state, req.state);
  if (req.codeVerifier) await SecureStore.setItemAsync(SS_KEYS.verifier, req.codeVerifier);

  // Prompt the user
  const result = await req.promptAsync(discovery, { useProxy });

  return { result, redirectUri };
}