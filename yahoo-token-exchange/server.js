const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

admin.initializeApp();
const db = admin.firestore();
const secretClient = new SecretManagerServiceClient();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get('/tokens/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log('🔍 Fetching token for user:', userId);

    const snapshot = await db.collection('yahooTokens')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    console.log('📦 Firestore snapshot size:', snapshot.size);

    if (snapshot.empty) {
      console.log('⚠️ No token found for user:', userId);
      return res.status(404).send({ error: 'No token found for user' });
    }

    const tokenDoc = snapshot.docs[0].data();
    console.log('✅ Token document:', tokenDoc);

    res.status(200).send(tokenDoc.token);
  } catch (err) {
    console.error('❌ Token fetch error:', err.message || err);
    res.status(500).send({ error: 'Internal Server Error' });
  }
});

async function getSecret(secretName) {
  const [version] = await secretClient.accessSecretVersion({
    name: `projects/weekly-pickem-8cea3/secrets/${secretName}/versions/latest`
  });
  return version.payload.data.toString();
}

app.post('/token', async (req, res) => {
  try {
    const code = req.body.code;
    const userId = req.body.userId;
    console.log('📥 Received code:', code);

    const codeVerifier = req.body.codeVerifier;

    const clientSecret = await getSecret('yahoo-client-secret');
    console.log('🔐 Retrieved client secret');

    const qs = require('querystring');
    const axios = require('axios');

    const tokenPayload = qs.stringify({
      client_id: 'dj0yJmk9dDhqVXlhU2hxbzRNJmQ9WVdrOU1qUXlORTgyYzJNbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PTIw',
      client_secret: clientSecret,
      redirect_uri: 'weeklyleaguepickemapp://auth',
      code: code,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    });

    console.log('📦 Token payload:', tokenPayload);

    const response = await axios.post('https://api.login.yahoo.com/oauth2/token', tokenPayload, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    console.log('✅ Yahoo response:', response.data);

    // 🔐 Store token in Firestore
    await db.collection('yahooTokens').add({
      userId: userId,
      code: code,
      token: response.data,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('📥 Firestore write confirmed for user:', userId);

    res.status(200).send(response.data);
  } catch (err) {
    console.error('❌ Token route error:', err.response?.data || err.message || err);
    res.status(500).send({ error: 'Internal Server Error' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});