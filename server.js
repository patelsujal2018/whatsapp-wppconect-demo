const express = require('express');
const wppconnect = require('@wppconnect-team/wppconnect');
const fs = require('fs');
const path = require('path');
var bodyParser = require("body-parser");

const app = express();
const port = 3000;
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Store user sessions
const sessions = {};

// Ensure sessions directory exists
if (!fs.existsSync('./sessions')) {
    fs.mkdirSync('./sessions');
}

// Middleware to parse JSON bodies
app.use(express.json());

// Route to create a new WhatsApp session
app.post('/login', (req, res) => {
    const userId = req.body.userId;

    if (!userId) {
        return res.status(400).send({ error: 'User ID is required' });
    }

    // Create a new WhatsApp session
    wppconnect.create({
        session: userId,
        catchQR: (qrCode, asciiQR) => {
            console.log('QR Code received', qrCode); // You can log or send this QR code to the user for scanning
            res.send({ qrCode });
        },
        statusFind: (status) => {
            console.log('Session status:', status);
        },
        onLoadingScreen: (percent, message) => {
            console.log('Loading screen:', percent, message);
        },
        logQR: true,
        autoClose: 60000, // 60 seconds timeout
    }).then(client => {
        // Save the session to the sessions object
        sessions[userId] = client;

        // Save session credentials to disk
        client.onStateChange(state => {
            console.log('State changed:', state);
            if (state === 'CONNECTED') {
                client.getSessionTokenBrowser().then(session => {
                    fs.writeFileSync(`./sessions/${userId}.json`, JSON.stringify(session));
                });
            }
        });
    }).catch(error => {
        console.error('Error creating session:', error);
        res.status(500).send({ error: 'Error creating session' });
    });
});

// Route to send a message using a saved session
app.post('/send-message', async (req, res) => {
    const { userId, to, message } = req.body;

    if (!userId || !to || !message) {
        return res.status(400).send({ error: 'User ID, recipient, and message are required' });
    }

    const client = sessions[userId];

    if (!client) {
        return res.status(404).send({ error: 'Session not found' });
    }

    try {
        const result = await client.sendText(to, message);
        res.send({ result });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).send({ error: 'Error sending message' });
    }
});

// Load existing sessions on startup
fs.readdir('./sessions', (err, files) => {
    if (err) {
        console.error('Error reading sessions directory', err);
        return;
    }

    files.forEach(async (file) => {
        const userId = path.basename(file, '.json');
        const sessionData = fs.readFileSync(`./sessions/${file}`, 'utf8');

        try {
            const client = await wppconnect.create({
                session: userId,
                sessionData: JSON.parse(sessionData),
                catchQR: (qrCode, asciiQR) => {
                    console.log('QR Code received for', userId);
                },
                statusFind: (status) => {
                    console.log('Session status:', status);
                },
                onLoadingScreen: (percent, message) => {
                    console.log('Loading screen:', percent, message);
                },
                logQR: true,
                autoClose: 60000, // 60 seconds timeout
            });

            sessions[userId] = client;

        } catch (error) {
            console.error('Error loading session for', userId, error);
        }
    });
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
