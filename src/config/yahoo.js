import { makeRedirectUri } from 'expo-auth-session';

export const getRedirectUri = (useProxy = true) =>
  makeRedirectUri({
    useProxy,
    scheme: 'weeklyleaguepickemapp',
    path: 'authGroup/callback',
  });