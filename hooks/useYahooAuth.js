import { useMemo } from 'react';
import { useAuthRequest, makeRedirectUri } from 'expo-auth-session';
import { yahooCredentials } from '../config/yahooConfig';

const discovery = {
  authorizationEndpoint: 'https://api.login.yahoo.com/oauth2/request_auth',
  tokenEndpoint: 'https://api.login.yahoo.com/oauth2/get_token',
};

export const useYahooAuth = () => {
  const redirectUri = useMemo(
    () => makeRedirectUri({ scheme: 'weeklyleaguepickemapp' }),
    []
  );

  if (__DEV__) {
    console.log('Generated redirect URI:', redirectUri);
    console.log('Configured Yahoo redirect URI:', yahooCredentials.redirectUri);
  }

  return useAuthRequest(
    {
      clientId: yahooCredentials.clientId,
      scopes: ['fspt-r', 'profile'],
      redirectUri,
      responseType: 'code',
    },
    discovery
  );
};
