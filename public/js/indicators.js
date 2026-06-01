/**
 * StockPulse — Technical Indicators Engine
 * ==========================================
 * Provides VWMA, RSI, swing-point detection, RSI divergence analysis,
 * and formatting helpers.  Everything lives on `window.Indicators`.
 */

(function () {
  'use strict';

  /* ================================================================== */
  /*  FORMATTING HELPERS                                                */
  /* ================================================================== */

  /**
   * Format a number to a fixed number of decimal places.
   * @param {number} num
   * @param {number} [decimals=2]
   * @returns {string}
   */
  function formatNumber(num, decimals) {
    if (typeof num !== 'number' || isNaN(num)) return '—';
    decimals = typeof decimals === 'number' ? decimals : 2;
    return num.toFixed(decimals);
  }

  /**
   * Format a number as currency with the appropriate symbol.
   * @param {number} num
   * @param {string} [currency='INR']  'INR' → ₹ , 'USD' → $
   * @returns {string}
   */
  function formatCurrency(num, currency) {
    if (typeof num !== 'number' || isNaN(num)) return '—';
    currency = (currency || 'INR').toUpperCase();
    var sym = currency === 'USD' ? '$' : '₹';
    var abs = Math.abs(num);
    var formatted = abs.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return (num < 0 ? '-' : '') + sym + formatted;
  }

  /**
   * Format a decimal ratio as a signed percentage string.
   * e.g. 0.0604 → "+6.04%", -0.0251 → "-2.51%"
   * @param {number} num  Decimal ratio (not already multiplied by 100)
   * @returns {string}
   */
  function formatPercent(num) {
    if (typeof num !== 'number' || isNaN(num)) return '—';
    var pct = (num * 100).toFixed(2);
    return (num > 0 ? '+' : '') + pct + '%';
  }

  /* ================================================================== */
  /*  VWMA  (Volume Weighted Moving Average)                            */
  /* ================================================================== */

  /**
   * Calculate the Volume Weighted Moving Average.
   *
   * VWMA[i] = Σ(Close[j] × Volume[j], j=i-period+1..i)
   *         / Σ(Volume[j],             j=i-period+1..i)
   *
   * @param {{ time:string, close:number, volume:number }[]} data
   *   Array of OHLCV candles (daily or monthly).
   * @param {number} [period=50]
   * @returns {{ time:string, value:number }[]}
   *   One entry per candle starting from index (period − 1).
   */
  function calculateVWMA(data, period) {
    period = period || 50;
    if (!data || data.length < period) return [];

    var result = [];

    // Running sums for efficiency
    var sumCV = 0; // Σ close*volume
    var sumV  = 0; // Σ volume

    for (var i = 0; i < data.length; i++) {
      var c = data[i].close;
      var v = data[i].volume || 0;

      sumCV += c * v;
      sumV  += v;

      if (i >= period) {
        // Remove the element that just fell out of the window
        var old = data[i - period];
        sumCV -= old.close * (old.volume || 0);
        sumV  -= (old.volume || 0);
      }

      if (i >= period - 1) {
        var vwma = sumV !== 0 ? sumCV / sumV : c;
        result.push({
          time:  data[i].time,
          value: Math.round(vwma * 100) / 100
        });
      }
    }

    return result;
  }

  /**
   * Detect crossover events between the closing price and the VWMA.
   *
   * BUY  signal: previous close ≤ previous VWMA  AND  current close > current VWMA
   * SELL signal: previous close ≥ previous VWMA  AND  current close < current VWMA
   *
   * @param {{ time:string, close:number }[]} data
   *   The OHLCV data from which the VWMA was computed.  Must be the
   *   SAME array (or at least same length / alignment) so that
   *   data[offset + j].time === vwma[j].time.
   * @param {{ time:string, value:number }[]} vwma
   *   Output of calculateVWMA().
   * @returns {{ time:string, type:'BUY'|'SELL', price:number,
   *             vwmaValue:number, description:string }[]}
   */
  function detectVWMASignals(data, vwma) {
    if (!data || !vwma || vwma.length < 2) return [];

    // Build a time→close lookup for the original data
    var closeMap = {};
    for (var i = 0; i < data.length; i++) {
      closeMap[data[i].time] = data[i].close;
    }

    var signals = [];

    for (var j = 1; j < vwma.length; j++) {
      var prevTime  = vwma[j - 1].time;
      var currTime  = vwma[j].time;
      var prevClose = closeMap[prevTime];
      var currClose = closeMap[currTime];
      var prevVWMA  = vwma[j - 1].value;
      var currVWMA  = vwma[j].value;

      if (typeof prevClose !== 'number' || typeof currClose !== 'number') continue;

      if (prevClose <= prevVWMA && currClose > currVWMA) {
        signals.push({
          time:        currTime,
          type:        'BUY',
          price:       currClose,
          vwmaValue:   currVWMA,
          description: 'Price crossed above VWMA (' + formatNumber(currVWMA) +
                       ') — bullish crossover on ' + currTime
        });
      } else if (prevClose >= prevVWMA && currClose < currVWMA) {
        signals.push({
          time:        currTime,
          type:        'SELL',
          price:       currClose,
          vwmaValue:   currVWMA,
          description: 'Price crossed below VWMA (' + formatNumber(currVWMA) +
                       ') — bearish crossover on ' + currTime
        });
      }
    }

    return signals;
  }

  /**
   * Return the current VWMA status for a stock.
   *
   * @param {{ time:string, close:number }[]} data  Original OHLCV
   * @param {{ time:string, value:number }[]} vwma  VWMA series
   * @returns {{ signal:'BUY'|'SELL'|'NEUTRAL', price:number,
   *             vwmaValue:number, distance:number,
   *             lastCrossover:object|null }}
   */
  function getCurrentVWMASignal(data, vwma) {
    if (!data || !vwma || vwma.length === 0) {
      return { signal: 'NEUTRAL', price: 0, vwmaValue: 0, distance: 0, lastCrossover: null };
    }

    var lastVWMA  = vwma[vwma.length - 1];
    // Find matching close price
    var price = null;
    for (var i = data.length - 1; i >= 0; i--) {
      if (data[i].time === lastVWMA.time) { price = data[i].close; break; }
    }
    if (price === null) price = data[data.length - 1].close;

    var vwmaVal  = lastVWMA.value;
    var distance = vwmaVal !== 0 ? ((price - vwmaVal) / vwmaVal) : 0;
    var signal   = price > vwmaVal ? 'BUY' : price < vwmaVal ? 'SELL' : 'NEUTRAL';

    // Find last crossover
    var crossovers     = detectVWMASignals(data, vwma);
    var lastCrossover  = crossovers.length > 0 ? crossovers[crossovers.length - 1] : null;

    return {
      signal:        signal,
      price:         price,
      vwmaValue:     vwmaVal,
      distance:      Math.round(distance * 10000) / 10000, // decimal ratio
      lastCrossover: lastCrossover
    };
  }

  /* ================================================================== */
  /*  RSI  (Relative Strength Index — Wilder's Smoothing)               */
  /* ================================================================== */

  /**
   * Calculate RSI using Wilder's smoothing method.
   *
   * @param {{ time:string, close:number }[]} data
   *   Array of candles (typically monthly).
   * @param {number} [period=14]
   * @returns {{ time:string, value:number }[]}
   */
  function calculateRSI(data, period) {
    period = period || 14;
    if (!data || data.length < period + 1) return [];

    // --- Compute period-by-period gains and losses --------------------
    var gains  = [];
    var losses = [];
    for (var i = 1; i < data.length; i++) {
      var diff = data[i].close - data[i - 1].close;
      gains.push(diff > 0 ? diff : 0);
      losses.push(diff < 0 ? -diff : 0);
    }
    // gains[0] corresponds to the change from data[0] → data[1]

    // --- First average (simple mean over the initial `period` changes)
    var sumGain = 0;
    var sumLoss = 0;
    for (var j = 0; j < period; j++) {
      sumGain += gains[j];
      sumLoss += losses[j];
    }
    var avgGain = sumGain / period;
    var avgLoss = sumLoss / period;

    var result = [];

    // First RSI value corresponds to data[period] (index period in data)
    var rs  = avgLoss === 0 ? 100 : avgGain / avgLoss;
    var rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);
    result.push({ time: data[period].time, value: Math.round(rsi * 100) / 100 });

    // --- Wilder's smoothing for the rest ------------------------------
    for (var k = period; k < gains.length; k++) {
      avgGain = (avgGain * (period - 1) + gains[k]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[k]) / period;

      rs  = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + rs);

      // k in gains[] maps to data[k+1]
      result.push({ time: data[k + 1].time, value: Math.round(rsi * 100) / 100 });
    }

    return result;
  }

  /* ================================================================== */
  /*  SWING POINT DETECTION                                             */
  /* ================================================================== */

  /**
   * Find local swing highs and swing lows in a data series.
   *
   * A swing high at index i means data[i][field] is strictly higher
   * than all points within `lookback` on both sides.
   *
   * @param {object[]} data
   * @param {string}   field     Property name to analyse ('close', 'value', …)
   * @param {number}   [lookback=2]  How many bars to look each side
   * @returns {{ highs: {index:number, time:string, value:number}[],
   *             lows:  {index:number, time:string, value:number}[] }}
   */
  function findSwingPoints(data, field, lookback) {
    lookback = lookback || 2;
    if (!data || data.length < 2 * lookback + 1) return { highs: [], lows: [] };

    var highs = [];
    var lows  = [];

    for (var i = lookback; i < data.length - lookback; i++) {
      var val       = data[i][field];
      var isHigh    = true;
      var isLow     = true;

      for (var j = 1; j <= lookback; j++) {
        var left  = data[i - j][field];
        var right = data[i + j][field];

        if (val <= left || val <= right) isHigh = false;
        if (val >= left || val >= right) isLow  = false;
      }

      if (isHigh) {
        highs.push({ index: i, time: data[i].time, value: val });
      }
      if (isLow) {
        lows.push({ index: i, time: data[i].time, value: val });
      }
    }

    return { highs: highs, lows: lows };
  }

  /* ================================================================== */
  /*  RSI DIVERGENCE                                                    */
  /* ================================================================== */

  /**
   * Detect bullish or bearish RSI divergence.
   *
   * • Bullish: price makes a lower low while RSI makes a higher low.
   * • Bearish: price makes a higher high while RSI makes a lower high.
   *
   * The function compares the *last two* swing points in both series.
   *
   * @param {{ time:string, close:number }[]} priceData  Monthly candles
   * @param {{ time:string, value:number }[]} rsiData    RSI output
   * @returns {{ type:'BULLISH'|'BEARISH'|'NONE', description:string,
   *             pricePoints:{time:string,value:number}[],
   *             rsiPoints:{time:string,value:number}[],
   *             currentRSI:number, signal:string }}
   */
  function detectRSIDivergence(priceData, rsiData) {
    var noResult = {
      type:        'NONE',
      description: 'No divergence detected',
      pricePoints: [],
      rsiPoints:   [],
      currentRSI:  rsiData && rsiData.length ? rsiData[rsiData.length - 1].value : 0,
      signal:      'No actionable RSI divergence at this time'
    };

    if (!priceData || !rsiData || rsiData.length < 5) return noResult;

    // ----- Align price data to the RSI window ------------------------
    // RSI starts after the warmup period. Build a time → index map so we
    // can create an aligned price array of the same length as rsiData.
    var rsiStartTime = rsiData[0].time;
    var priceStart   = -1;
    for (var p = 0; p < priceData.length; p++) {
      if (priceData[p].time === rsiStartTime) { priceStart = p; break; }
    }
    if (priceStart === -1) {
      // Fallback: take the tail of priceData with the same length
      priceStart = priceData.length - rsiData.length;
      if (priceStart < 0) priceStart = 0;
    }

    var alignedPrice = priceData.slice(priceStart, priceStart + rsiData.length);
    if (alignedPrice.length < 5) return noResult;

    // ----- Find swing points -----------------------------------------
    var priceSP = findSwingPoints(alignedPrice, 'close', 2);
    var rsiSP   = findSwingPoints(rsiData,      'value', 2);

    var currentRSI = rsiData[rsiData.length - 1].value;

    // ----- Check BULLISH divergence (compare last two lows) ----------
    if (priceSP.lows.length >= 2 && rsiSP.lows.length >= 2) {
      var pLow1 = priceSP.lows[priceSP.lows.length - 2];
      var pLow2 = priceSP.lows[priceSP.lows.length - 1];

      // Find the RSI swing low closest in time to each price swing low
      var rLow1 = _closestSwingPoint(rsiSP.lows, pLow1.time);
      var rLow2 = _closestSwingPoint(rsiSP.lows, pLow2.time);

      // Ensure we actually found two distinct RSI lows
      if (rLow1 && rLow2 && rLow1.index !== rLow2.index) {
        if (pLow2.value < pLow1.value && rLow2.value > rLow1.value) {
          return {
            type:        'BULLISH',
            description: 'Price made a lower low (' + formatNumber(pLow2.value) +
                         ' vs ' + formatNumber(pLow1.value) +
                         ') while RSI made a higher low (' + formatNumber(rLow2.value) +
                         ' vs ' + formatNumber(rLow1.value) + ')',
            pricePoints: [
              { time: pLow1.time, value: pLow1.value },
              { time: pLow2.time, value: pLow2.value }
            ],
            rsiPoints: [
              { time: rLow1.time, value: rLow1.value },
              { time: rLow2.time, value: rLow2.value }
            ],
            currentRSI: currentRSI,
            signal:     'Bullish RSI divergence detected — potential reversal to the upside. ' +
                        'Current RSI: ' + formatNumber(currentRSI)
          };
        }
      }
    }

    // ----- Check BEARISH divergence (compare last two highs) ---------
    if (priceSP.highs.length >= 2 && rsiSP.highs.length >= 2) {
      var pHi1 = priceSP.highs[priceSP.highs.length - 2];
      var pHi2 = priceSP.highs[priceSP.highs.length - 1];

      var rHi1 = _closestSwingPoint(rsiSP.highs, pHi1.time);
      var rHi2 = _closestSwingPoint(rsiSP.highs, pHi2.time);

      if (rHi1 && rHi2 && rHi1.index !== rHi2.index) {
        if (pHi2.value > pHi1.value && rHi2.value < rHi1.value) {
          return {
            type:        'BEARISH',
            description: 'Price made a higher high (' + formatNumber(pHi2.value) +
                         ' vs ' + formatNumber(pHi1.value) +
                         ') while RSI made a lower high (' + formatNumber(rHi2.value) +
                         ' vs ' + formatNumber(rHi1.value) + ')',
            pricePoints: [
              { time: pHi1.time, value: pHi1.value },
              { time: pHi2.time, value: pHi2.value }
            ],
            rsiPoints: [
              { time: rHi1.time, value: rHi1.value },
              { time: rHi2.time, value: rHi2.value }
            ],
            currentRSI: currentRSI,
            signal:     'Bearish RSI divergence detected — potential reversal to the downside. ' +
                        'Current RSI: ' + formatNumber(currentRSI)
          };
        }
      }
    }

    return noResult;
  }

  /**
   * Find the swing point whose time is closest to `targetTime`.
   * @param {{index:number, time:string, value:number}[]} swings
   * @param {string} targetTime  'YYYY-MM-DD'
   * @returns {{index:number, time:string, value:number}|null}
   * @private
   */
  function _closestSwingPoint(swings, targetTime) {
    if (!swings || swings.length === 0) return null;

    var targetMs = new Date(targetTime).getTime();
    var best     = null;
    var bestDist = Infinity;

    for (var i = 0; i < swings.length; i++) {
      var dist = Math.abs(new Date(swings[i].time).getTime() - targetMs);
      if (dist < bestDist) {
        bestDist = dist;
        best     = swings[i];
      }
    }
    return best;
  }

  /* ================================================================== */
  /*  PORTFOLIO-WIDE RSI DIVERGENCE SCAN                                */
  /* ================================================================== */

  /**
   * Scan all stocks for RSI divergences.
   *
   * @param {object[]}  stocks   Array of stock objects (need .symbol)
   * @param {function}  getData  Function(symbol) → { daily, monthly }
   *                             (e.g. StockData.getStockData)
   * @returns {{ symbol:string, name:string, divergence:object }[]}
   *   Sorted by significance: BULLISH/BEARISH first, then by
   *   distance of RSI from neutral (50).
   */
  function scanAllRSIDivergences(stocks, getData) {
    if (!stocks || !getData) return [];

    var results = [];

    for (var i = 0; i < stocks.length; i++) {
      var s    = stocks[i];
      var data = getData(s.symbol);
      if (!data || !data.monthly || data.monthly.length === 0) continue;

      var rsi  = calculateRSI(data.monthly, 14);
      var div  = detectRSIDivergence(data.monthly, rsi);

      results.push({
        symbol:     s.symbol,
        name:       s.name,
        divergence: div
      });
    }

    // Sort: actionable divergences first, then by RSI distance from 50
    results.sort(function (a, b) {
      var aScore = a.divergence.type !== 'NONE' ? 1 : 0;
      var bScore = b.divergence.type !== 'NONE' ? 1 : 0;
      if (aScore !== bScore) return bScore - aScore; // divergences first

      // Secondary sort: extremity of RSI (further from 50 = more significant)
      var aDist = Math.abs(a.divergence.currentRSI - 50);
      var bDist = Math.abs(b.divergence.currentRSI - 50);
      return bDist - aDist;
    });

    return results;
  }

  /* ================================================================== */
  /*  PUBLIC API                                                        */
  /* ================================================================== */

  window.Indicators = {
    // VWMA
    calculateVWMA:        calculateVWMA,
    detectVWMASignals:    detectVWMASignals,
    getCurrentVWMASignal: getCurrentVWMASignal,

    // RSI
    calculateRSI:         calculateRSI,

    // Swing Points
    findSwingPoints:      findSwingPoints,

    // RSI Divergence
    detectRSIDivergence:      detectRSIDivergence,
    scanAllRSIDivergences:    scanAllRSIDivergences,

    // Formatting
    formatNumber:    formatNumber,
    formatCurrency:  formatCurrency,
    formatPercent:   formatPercent
  };
})();
