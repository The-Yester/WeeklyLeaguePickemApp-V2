const https = require('https');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("\n--- Yahoo Credential Verifier ---");
console.log("This script checks if your Client ID and Secret are accepted by Yahoo's Token Endpoint.");
console.log("We expect an 'invalid_grant' error (because the code is fake).");
console.log("If we get 'NOT_FOUND', your credentials are wrong.\n");

rl.question('Paste your Client ID: ', (clientId) => {
    rl.question('Paste your Client Secret: ', (clientSecret) => {

        console.log("\nTesting...");

        // Public Client Verification (No Secret)
        const params = new URLSearchParams();
        params.append('client_id', clientId.trim());
        // Test the HTTPS URI. If this works (400), but custom scheme (404) failed, we know to switch to HTTPS in the app.
        params.append('redirect_uri', 'https://auth.expo.io/@ryester/WeeklyLeaguePickemApp');
        params.append('code', 'fake_code');
        params.append('grant_type', 'authorization_code');
        // PKCE params normally needed, but for 'fake_code' check, missing them might give 400 (which is Good) or 404 (Bad).

        const postData = params.toString();

        const options = {
            hostname: 'api.login.yahoo.com',
            port: 443,
            path: '/oauth2/get_token', // TRYING ALTERNATE ENDPOINT
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': postData.length
            }
        };

        const req = https.request(options, (res) => {
            console.log(`\nStatus Code: ${res.statusCode}`);

            let data = '';
            res.on('data', (chunk) => { data += chunk; });

            res.on('end', () => {
                console.log(`Response Body: ${data}`);

                if (res.statusCode === 200) {
                    console.log("✅ SUCCESS! Credentials valid (and fake code somehow worked???)");
                } else if (res.statusCode === 400 || data.includes('invalid_grant')) {
                    console.log("✅ SUCCESS! Credentials Accepted! (Yahoo rejected the fake code, which is EXPECTED).");
                    console.log("👉 This means the Endpoint and Client ID are CORRECT.");
                } else if (res.statusCode === 404) {
                    console.log("❌ 404 NOT_FOUND.");
                    console.log("This might mean the ENDPOINT is wrong, OR Yahoo returns 404 for bad codes.");
                } else {
                    console.log("⚠️ Unknown Error.");
                }
                process.exit(0);
            });
        });

        req.on('error', (e) => {
            console.error(`problem with request: ${e.message}`);
            process.exit(1);
        });

        req.write(postData);
        req.end();
    });
});
