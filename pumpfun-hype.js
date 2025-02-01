const WebSocket = require('ws');
const fs = require('fs');

const AUTH_HEADER = 'bloxroutes auth';
const BIRDEYE_API_KEY = 'bird api key';
const PRICE_THRESHOLD = 0.00008;
const PRICE_CHECK_DELAY = 60000;

// Create a log file with timestamp
const logFileName = `price_checks_${new Date().toISOString().split('T')[0]}.json`;

function logPriceCheck(checkData) {
    const logEntry = {
        ...checkData,
        checkTime: new Date().toISOString()
    };

    // Append to log file
    fs.appendFile(logFileName, JSON.stringify(logEntry) + '\n', (err) => {
        if (err) console.error('Error writing to log file:', err);
    });
}

async function checkTokenPrice(mint) {
    const options = {
        method: 'GET',
        headers: {
            accept: 'application/json',
            'x-chain': 'solana',
            'X-API-KEY': BIRDEYE_API_KEY
        }
    };

    try {
        const response = await fetch(`https://public-api.birdeye.so/defi/price?address=${mint}`, options);
        const data = await response.json();
        return data.data?.value || 0;
    } catch (error) {
        console.error('Error checking price:', error);
        return 0;
    }
}

function formatTimeDelta(ms) {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
}

function connectToTokenStream() {
    const ws = new WebSocket('wss://pump-ny.solana.dex.blxrbdn.com/ws', {
        headers: {
            'Authorization': AUTH_HEADER
        }
    });

    ws.on('open', () => {
        console.log('Connected to token stream');
        const subscribeMessage = {
            jsonrpc: "2.0",
            id: 1,
            method: "subscribe",
            params: ["GetPumpFunNewTokensStream", {}]
        };
        ws.send(JSON.stringify(subscribeMessage));
        console.log('Subscribed to token stream. Monitoring for tokens...');
        console.log(`Logging all price checks to: ${logFileName}\n`);
    });

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);
            if (message.params?.result) {
                const token = message.params.result;
                const mintTime = new Date(token.timestamp);

                // Schedule price check after delay
                setTimeout(async () => {
                    const price = await checkTokenPrice(token.mint);
                    
                    // Log every price check
                    logPriceCheck({
                        name: token.name,
                        symbol: token.symbol,
                        mint: token.mint,
                        price: price,
                        launchTime: mintTime.toISOString(),
                        meetsThreshold: price > PRICE_THRESHOLD
                    });

                    if (price > PRICE_THRESHOLD) {
                        console.log('\n!!! High Value Token Found !!!');
                        console.log(`Token: ${token.name} (${token.symbol})`);
                        console.log(`Mint: ${token.mint}`);
                        console.log(`Price: ${price}`);
                        console.log(`Time since launch: ${formatTimeDelta(Date.now() - mintTime)}`);
                        console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!\n');
                    }
                }, PRICE_CHECK_DELAY);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    ws.on('close', () => {
        console.log('Disconnected from token stream. Reconnecting in 5 seconds...');
        setTimeout(connectToTokenStream, 5000);
    });
}

// Start the connection
console.log('Starting token monitor...');
connectToTokenStream();