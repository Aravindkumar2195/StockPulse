/**
 * StockPulse — Data Engine (Real API Version)
 * ============================================
 * Fetches data from the local Node.js backend.
 * Everything lives on `window.StockData`.
 */

(function () {
  'use strict';

  var API_BASE = 'http://10.0.2.2:3001/api';

  var defaultStocks = [
    { symbol: 'GOOG', name: 'Alphabet Inc Class C', exchange: 'NASDAQ', shares: 5, avgPrice: 150.00 },
    { symbol: 'RELIANCE.NS', name: 'Reliance Industries', exchange: 'NSE', shares: 10, avgPrice: 2800.00 },
    { symbol: 'TCS.NS', name: 'Tata Consultancy Services', exchange: 'NSE', shares: 0, avgPrice: 0 }
  ];

  function getPortfolio() {
    try {
      var saved = localStorage.getItem('stockpulse_portfolio');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return JSON.parse(JSON.stringify(defaultStocks));
  }

  function savePortfolio(portfolio) {
    localStorage.setItem('stockpulse_portfolio', JSON.stringify(portfolio));
  }

  function addStock(stock) {
    var p = getPortfolio();
    for (var i = 0; i < p.length; i++) {
      if (p[i].symbol === stock.symbol) return; // already exists
    }
    p.push(stock);
    savePortfolio(p);
  }

  function removeStock(symbol) {
    var p = getPortfolio();
    var p2 = [];
    for (var i = 0; i < p.length; i++) {
      if (p[i].symbol !== symbol) p2.push(p[i]);
    }
    savePortfolio(p2);
  }

  function updateShares(symbol, shares, avgPrice) {
    var p = getPortfolio();
    for (var i = 0; i < p.length; i++) {
      if (p[i].symbol === symbol) {
        p[i].shares = shares;
        p[i].avgPrice = avgPrice;
        break;
      }
    }
    savePortfolio(p);
  }

  // --- API Calls ---

  async function fetchQuotes(symbols) {
    if (!symbols || symbols.length === 0) return [];
    var symString = symbols.join(',');
    try {
      var res = await fetch(API_BASE + '/quote?symbols=' + symString);
      if (!res.ok) throw new Error('Network error');
      return await res.json();
    } catch (e) {
      console.error('Failed to fetch quotes:', e);
      return [];
    }
  }

  async function fetchHistoricalData(symbol, days) {
    try {
      var res = await fetch(API_BASE + '/historical?symbol=' + symbol + '&days=' + (days || 1000));
      if (!res.ok) throw new Error('Network error');
      return await res.json(); // Array of daily OHLCV
    } catch (e) {
      console.error('Failed to fetch historical data for ' + symbol, e);
      return [];
    }
  }

  async function fetchIndexSymbols(indexName) {
    try {
      var res = await fetch(API_BASE + '/index?name=' + indexName);
      if (!res.ok) throw new Error('Network error');
      var data = await res.json();
      return data.symbols || [];
    } catch (e) {
      console.error('Failed to fetch index', e);
      return [];
    }
  }

  // --- Aggregation ---

  function aggregateToWeekly(dailyData) {
    if (!dailyData || dailyData.length === 0) return [];
    var weeks = [];
    var currentWeek = null;

    for (var i = 0; i < dailyData.length; i++) {
      var d = dailyData[i];
      var dateObj = new Date(d.time);
      
      // Calculate the start of the week (Monday)
      var day = dateObj.getDay();
      var diff = dateObj.getDate() - day + (day === 0 ? -6 : 1);
      var monday = new Date(dateObj.setDate(diff));
      var weekKey = monday.toISOString().split('T')[0];

      if (!currentWeek || currentWeek.time !== weekKey) {
        if (currentWeek) weeks.push(currentWeek);
        currentWeek = {
          time: weekKey,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volume
        };
      } else {
        currentWeek.high = Math.max(currentWeek.high, d.high);
        currentWeek.low = Math.min(currentWeek.low, d.low);
        currentWeek.close = d.close;
        currentWeek.volume += d.volume;
      }
    }
    if (currentWeek) weeks.push(currentWeek);
    return weeks;
  }

  function aggregateToMonthly(dailyData) {
    if (!dailyData || dailyData.length === 0) return [];
    var buckets = {};
    var order = [];

    for (var i = 0; i < dailyData.length; i++) {
      var d = dailyData[i];
      var key = d.time.substring(0, 7); // YYYY-MM
      if (!buckets[key]) {
        buckets[key] = [];
        order.push(key);
      }
      buckets[key].push(d);
    }

    var monthly = [];
    for (var j = 0; j < order.length; j++) {
      var group = buckets[order[j]];
      var mOpen = group[0].open;
      var mClose = group[group.length - 1].close;
      var mHigh = -Infinity;
      var mLow = Infinity;
      var mVol = 0;
      for (var k = 0; k < group.length; k++) {
        if (group[k].high > mHigh) mHigh = group[k].high;
        if (group[k].low < mLow) mLow = group[k].low;
        mVol += group[k].volume;
      }
      monthly.push({
        time: order[j] + '-01',
        open: mOpen, high: mHigh, low: mLow, close: mClose, volume: mVol
      });
    }
    return monthly;
  }

  // Basic cache so we don't spam the API unnecessarily
  var _cache = {};

  async function getStockData(symbol) {
    if (_cache[symbol]) return _cache[symbol];
    
    var daily = await fetchHistoricalData(symbol, 1000);
    if (!daily || daily.length === 0) return null;

    var weekly = aggregateToWeekly(daily);
    var monthly = aggregateToMonthly(daily);

    var data = { daily: daily, weekly: weekly, monthly: monthly };
    _cache[symbol] = data;
    return data;
  }

  window.StockData = {
    getPortfolio:      getPortfolio,
    savePortfolio:     savePortfolio,
    addStock:          addStock,
    removeStock:       removeStock,
    updateShares:      updateShares,
    fetchQuotes:       fetchQuotes,
    fetchIndexSymbols: fetchIndexSymbols,
    getStockData:      getStockData
  };

})();
