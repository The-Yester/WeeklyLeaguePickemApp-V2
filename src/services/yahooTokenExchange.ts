import { getFunctions, httpsCallable } from 'firebase/functions';

export async function exchangeYahooCodeForToken({
  code,
  code_verifier,
  redirect_uri,
  includeUserInfo = true,
}: {
  code: string;
  code_verifier: string;
  redirect_uri: string;
  includeUserInfo?: boolean;
}) {
  const exchangeYahooCode = httpsCallable(
    getFunctions(),
    'exchangeYahooCodeForToken'
  );

  const result = await exchangeYahooCode({
    code,
    code_verifier,
    redirect_uri,
    includeUserInfo,
  });

  const { access_token, user } = result.data as {
    access_token: string;
    user?: any;
  };

  return { access_token, user };
}