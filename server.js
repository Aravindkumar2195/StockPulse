const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const YF = require('yahoo-finance2').default;
const yahooFinance = new YF({
  suppressNotices: ['yahooSurvey'],
  queue: {
    concurrency: 4, // Max 4 concurrent requests to avoid 429
    timeout: 60000
  },
  logger: {
    info: (...args) => {},
    warn: (...args) => {},
    error: (...args) => {},
    debug: (...args) => {}
  }
});

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------
// PREDEFINED INDICES
// ---------------------------------------------------------
const indices = {
  nifty50: [
    'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'ICICIBANK.NS', 'INFY.NS',
    'ITC.NS', 'SBI.NS', 'HINDUNILVR.NS', 'LARSEN.NS', 'BAJFINANCE.NS',
    'BHARTIARTL.NS', 'KOTAKBANK.NS', 'AXISBANK.NS', 'HCLTECH.NS', 'ASIANPAINT.NS',
    'MARUTI.NS', 'SUNPHARMA.NS', 'TITAN.NS', 'ULTRACEMCO.NS', 'TATASTEEL.NS',
    'TATAMOTORS.NS', 'POWERGRID.NS', 'BAJAJFINSV.NS', 'NTPC.NS', 'M&M.NS',
    'ONGC.NS', 'WIPRO.NS', 'ADANIENT.NS', 'NESTLEIND.NS', 'TECHM.NS',
    'JSWSTEEL.NS', 'HINDALCO.NS', 'GRASIM.NS', 'CIPLA.NS', 'DRREDDY.NS',
    'INDUSINDBK.NS', 'TATACHEM.NS', 'ADANIPORTS.NS', 'BPCL.NS', 'DIVISLAB.NS',
    'BRITANNIA.NS', 'APOLLOHOSP.NS', 'EICHERMOT.NS', 'HEROMOTOCO.NS', 'BAJAJ-AUTO.NS',
    'COALINDIA.NS', 'SBILIFE.NS', 'HDFCLIFE.NS', 'UPL.NS', 'TATACONSUM.NS'
  ],
  default_portfolio: [
    'GOOG', 'ASHOKLEY.NS', 'MOTHERSON.NS', 'GOLDBEES.NS', 'MRPL.NS', 'TATAMOTORS.NS'
  ]
};

// ---------------------------------------------------------
// ENDPOINTS
// ---------------------------------------------------------

/**
 * GET /api/index?name=nifty50
 * Returns the list of symbols for a given index name.
 */
app.get('/api/index', (req, res) => {
  const name = req.query.name || 'nifty50';
  const lowercaseName = name.toLowerCase();
  
  if (indices[lowercaseName]) {
    return res.json({ name, symbols: indices[lowercaseName] });
  }

  // Try to load from data folder
  const filepath = path.join(__dirname, 'data', `${lowercaseName}.json`);
  try {
    if (fs.existsSync(filepath)) {
      const symbols = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      return res.json({ name, symbols });
    }
  } catch (e) {
    console.error(`Failed to load index ${name}`, e);
  }

  // Fallback
  res.json({ name, symbols: indices.nifty50 });
});

/**
 * GET /api/quote?symbols=AAPL,GOOG
 * Fetches real-time or delayed quote for one or more symbols.
 */
app.get('/api/quote', async (req, res) => {
  try {
    const symbolQuery = req.query.symbols || req.query.symbol;
    if (!symbolQuery) return res.status(400).json({ error: 'Missing symbols' });

    const symbols = symbolQuery.split(',');
    
    // Fetch quotes in parallel
    const quotes = await Promise.all(
      symbols.map(async (sym) => {
        try {
          const q = await yahooFinance.quote(sym);
          return {
            symbol: sym,
            name: q.longName || q.shortName || sym,
            exchange: q.exchange || '',
            currentPrice: q.regularMarketPrice || q.postMarketPrice || 0,
            change: q.regularMarketChange || 0,
            changePercent: q.regularMarketChangePercent ? q.regularMarketChangePercent / 100 : 0
          };
        } catch (e) {
          console.error(`Quote error for ${sym}:`, e.message);
          return null; // Ignore failed symbols gracefully
        }
      })
    );

    res.json(quotes.filter(q => q !== null));
  } catch (error) {
    console.error('Quote API error:', error);
    res.status(500).json({ error: 'Failed to fetch quote data' });
  }
});

/**
 * GET /api/historical?symbol=AAPL&days=1000
 * Fetches historical daily data for a single symbol.
 */
app.get('/api/historical', async (req, res) => {
  try {
    const symbol = req.query.symbol;
    const days = parseInt(req.query.days) || 1000;

    if (!symbol) return res.status(400).json({ error: 'Missing symbol' });

    // Calculate start date (going back `days` calendar days approx)
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - Math.floor(days * 1.5)); // 1.5 to account for weekends

    const queryOptions = {
      period1: start,
      period2: end,
      interval: '1d'
    };

    const result = await yahooFinance.chart(symbol, queryOptions);
    
    // Format to match frontend expectations
    const formatted = result.quotes.map(d => {
      // Create YYYY-MM-DD string
      const dateStr = d.date.toISOString().split('T')[0];
      return {
        time: dateStr,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error(`Historical API error for ${req.query.symbol}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch historical data' });
  }
});

// Start server locally (ignored by Vercel serverless)
if (process.env.NODE_ENV !== 'production' || process.env.RENDER) {
  app.listen(PORT, () => {
    console.log(`StockPulse API backend running on http://localhost:${PORT}`);
  });
}

module.exports = app;
