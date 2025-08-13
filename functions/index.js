// functions/index.js
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const fetch = require("cross-fetch");
const { yahooCredentials } = require("./config/yahooConfig");

admin.initializeApp();

exports.exchangeYahooCodeForToken = onCall(async (request) => {
  const code = request.data.code;
  // Get the redirectUri sent from the app
  const redirectUri = request.data.redirectUri; 

  if (!code || !redirectUri) {
    throw new HttpsError(
      "invalid-argument",
      "The function must be called with 'code' and 'redirectUri' arguments."
    );
  }

  console.log("Received authorization code:", code);
  console.log("Using redirect URI for token exchange:", redirectUri);

  const tokenUrl = "https://api.login.yahoo.com/oauth2/get_token";
  const credentials = Buffer.from(
    `${yahooCredentials.clientId}:${yahooCredentials.clientSecret}`
  ).toString("base64");

  const body = new URLSearchParams();
  body.append("code", code);
  body.append("redirect_uri", redirectUri); // Use the URI from the app
  body.append("grant_type", "authorization_code");

  try {
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: body.toString(),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      console.error("Yahoo token exchange failed:", tokenData);
      throw new Error(tokenData.error_description || "Failed to get token from Yahoo.");
    }

    const { access_token, refresh_token, xoauth_yahoo_guid } = tokenData;
    console.log("Successfully exchanged code for access token.");

    const profileUrl = `https://social.yahooapis.com/v1/user/${xoauth_yahoo_guid}/profile?format=json`;
    const profileResponse = await fetch(profileUrl, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const profileData = await profileResponse.json();
    if (!profileResponse.ok) {
      console.error("Failed to fetch Yahoo profile:", profileData);
      throw new Error("Could not fetch user profile from Yahoo.");
    }
    
    const userProfile = profileData.profile;
    const firebaseToken = await admin.auth().createCustomToken(xoauth_yahoo_guid);

    const userDocRef = admin.firestore().collection("users").doc(xoauth_yahoo_guid);
    await userDocRef.set({
        uid: xoauth_yahoo_guid,
        name: userProfile.nickname,
        username: userProfile.nickname,
        email: userProfile.emails?.find(e => e.primary)?.handle || '',
        avatarUri: userProfile.image?.imageUrl || '',
    }, { merge: true });

    return { 
        token: firebaseToken,
        profile: {
            uid: xoauth_yahoo_guid,
            name: userProfile.nickname,
            username: userProfile.nickname,
            email: userProfile.emails.find(e => e.primary)?.handle,
            avatarUri: userProfile.image.imageUrl,
        },
        accessToken: access_token,
        refreshToken: refresh_token,
    };

  } catch (error) {
    console.error("Error in cloud function:", error);
    throw new HttpsError("internal", error.message);
  }
});
