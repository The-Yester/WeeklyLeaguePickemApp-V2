import * as AuthSession from 'expo-auth-session';

export const getRedirectUri = (useProxy = true) =>
  AuthSession.makeRedirectUri({ 
    useProxy, 
    scheme: 'weeklyleaguepickemapp' 
  });