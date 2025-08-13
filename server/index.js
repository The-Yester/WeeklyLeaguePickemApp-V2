const express = require("express");
const axios = require("axios");
const admin = require("firebase-admin");
const bodyParser = require("body-parser");
const cors = require("cors");
const serviceAccount = require("./serviceAccountKey.json"); // Your Firebase service account

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
app.use(cors());
app.use(bodyParser.json());

const YAHOO_CLIENT_ID = "dj0yJmk9QlNGVXFQNmljM1U4JmQ9WVdrOVRrcFdSbkIzUlRZbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PThl";
const YAHOO_CLIENT_SECRET = "55fa9e1120d158e79bfa2c29983bc1d3c7aaaf05";
const REDIRECT_URI = "weeklyleaguepickemapp://redirect"; // Match what you used in the app

app.post("/auth/yahoo", async (req, res) => {
  const { code } = req.body;

  try {
    // Exchange code for Yahoo tokens
    const tokenResponse = await axios.post(
      "https://api.login.yahoo.com/oauth2/get_token",
      new URLSearchParams({
        client_id: YAHOO_CLIENT_ID,
        client_secret: YAHOO_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code,
        grant_type: "authorization_code",
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token } = tokenResponse.data;

    // Use token to get Yahoo user info
    const userResponse = await axios.get("https://api.login.yahoo.com/openid/v1/userinfo", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    const yahooUser = userResponse.data;

    const uid = `yahoo:${yahooUser.sub}`;

    // Create custom Firebase token
    const firebaseToken = await admin.auth().createCustomToken(uid);

    return res.send({ token: firebaseToken });
  } catch (err) {
    console.error("Error exchanging Yahoo code:", err.response?.data || err.message);
    return res.status(500).send({ error: "Token exchange failed" });
  }
});

const PORT = 3001;
app.listen(3001, '0.0.0.0', () => {
  console.log('✅ Server running on port 3001');
});
