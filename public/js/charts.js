/**
 * StockPulse — Chart Engine
 * ===========================
 * Creates TradingView Lightweight Charts for VWMA analysis and RSI
 * mini-charts.  Everything lives on `window.Charts`.
 */

(function () {
  'use strict';

  // Reference to the TradingView library
  var LWC = window.LightweightCharts;

  // Shared chart theme matching the app's dark palette
  var CHART_THEME = {
    layout: {
      background: { type: 'solid', color: 'transparent' },
      textColor: '#8b8fad',
      fontSize: 11,
      fontFamily: "'Inter', sans-serif"
    },
    grid: {
      vertLines: { color: 'rgba(100, 120, 255, 0.04)' },
      horzLines: { color: 'rgba(100, 120, 255, 0.04)' }
    },
    crosshair: {
      mode: 0, // Normal
      vertLine: {
        color: 'rgba(0, 212, 255, 0.3)',
        width: 1,
        style: 2,
        labelBackgroundColor: '#0d1230'
      },
      horzLine: {
        color: 'rgba(0, 212, 255, 0.3)',
        width: 1,
        style: 2,
        labelBackgroundColor: '#0d1230'
      }
    },
    timeScale: {
      borderColor: 'rgba(100, 120, 255, 0.08)',
      timeVisible: false,
      fixLeftEdge: true,
      fixRightEdge: true
    },
    rightPriceScale: {
      borderColor: 'rgba(100, 120, 255, 0.08)',
      scaleMargins: { top: 0.1, bottom: 0.1 }
    }
  };

  // Store active chart instances for cleanup
  var _activeCharts = {};

  /* ------------------------------------------------------------------ */
  /*  VWMA Chart                                                        */
  /* ------------------------------------------------------------------ */

  /**
   * Create a VWMA analysis chart with candlestick data, VWMA line,
   * and crossover signal markers.
   *
   * @param {string}   containerId  DOM element ID for the chart
   * @param {object[]} dailyData    Daily OHLCV candles
   * @param {object[]} vwmaData     VWMA line data [{time, value}]
   * @param {object[]} signals      Crossover signals from Indicators
   * @returns {object} The chart instance
   */
  function createVWMAChart(containerId, dailyData, vwmaData, signals) {
    var container = document.getElementById(containerId);
    if (!container) return null;

    // Destroy previous chart if it exists
    destroyChart(containerId);

    // Clear container
    container.innerHTML = '';

    var chart = LWC.createChart(container, Object.assign({}, CHART_THEME, {
      width: container.clientWidth,
      height: 350,
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true }
    }));

    // --- Candlestick series ---
    var candleSeries = chart.addCandlestickSeries({
      upColor: '#00e676',
      downColor: '#ff1744',
      borderUpColor: '#00e676',
      borderDownColor: '#ff1744',
      wickUpColor: '#00e676',
      wickDownColor: '#ff1744'
    });

    // Prepare candlestick data (lightweight-charts wants {time, open, high, low, close})
    var candleFormatted = dailyData.map(function (d) {
      return { time: d.time, open: d.open, high: d.high, low: d.low, close: d.close };
    });
    candleSeries.setData(candleFormatted);

    // --- VWMA line overlay ---
    var vwmaLine = chart.addLineSeries({
      color: '#f7931a',
      lineWidth: 2,
      lineStyle: 0, // Solid
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      priceLineVisible: false,
      lastValueVisible: true
    });
    vwmaLine.setData(vwmaData);

    // --- Signal markers on the candlestick series ---
    if (signals && signals.length > 0) {
      var markers = signals.map(function (s) {
        return {
          time: s.time,
          position: s.type === 'BUY' ? 'belowBar' : 'aboveBar',
          color: s.type === 'BUY' ? '#00e676' : '#ff1744',
          shape: s.type === 'BUY' ? 'arrowUp' : 'arrowDown',
          text: s.type
        };
      });

      // Sort markers by time (required by lightweight-charts)
      markers.sort(function (a, b) {
        return a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
      });

      candleSeries.setMarkers(markers);
    }

    // --- Volume histogram ---
    var volumeSeries = chart.addHistogramSeries({
      color: 'rgba(0, 212, 255, 0.15)',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume'
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 }
    });

    var volData = dailyData.map(function (d) {
      return {
        time: d.time,
        value: d.volume,
        color: d.close >= d.open
          ? 'rgba(0, 230, 118, 0.2)'
          : 'rgba(255, 23, 68, 0.2)'
      };
    });
    volumeSeries.setData(volData);

    // Fit content
    chart.timeScale().fitContent();

    // Handle resize
    var resizeObserver = new ResizeObserver(function () {
      chart.applyOptions({ width: container.clientWidth });
    });
    resizeObserver.observe(container);

    // Store for cleanup
    _activeCharts[containerId] = { chart: chart, observer: resizeObserver };

    return chart;
  }

  /* ------------------------------------------------------------------ */
  /*  RSI Mini Chart                                                    */
  /* ------------------------------------------------------------------ */

  /**
   * Create a mini RSI chart for the divergence scanner.
   *
   * @param {string}   containerId  DOM element ID
   * @param {object[]} monthlyData  Monthly candles
   * @param {object[]} rsiData      RSI values [{time, value}]
   * @param {object}   divergence   Divergence result from Indicators
   * @returns {object} The chart instance
   */
  function createRSIMiniChart(containerId, monthlyData, rsiData, divergence) {
    var container = document.getElementById(containerId);
    if (!container) return null;

    // Destroy previous chart if it exists
    destroyChart(containerId);
    container.innerHTML = '';

    var chart = LWC.createChart(container, Object.assign({}, CHART_THEME, {
      width: container.clientWidth,
      height: 120,
      handleScroll: false,
      handleScale: false,
      rightPriceScale: {
        borderColor: 'rgba(100, 120, 255, 0.08)',
        scaleMargins: { top: 0.1, bottom: 0.1 }
      },
      timeScale: {
        borderColor: 'rgba(100, 120, 255, 0.08)',
        visible: false
      }
    }));

    // --- RSI Line ---
    var rsiLine = chart.addLineSeries({
      color: '#7b2ff2',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
    rsiLine.setData(rsiData);

    // --- Overbought/Oversold reference lines ---
    // RSI 70 line
    var line70 = chart.addLineSeries({
      color: 'rgba(255, 23, 68, 0.3)',
      lineWidth: 1,
      lineStyle: 2, // Dashed
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
    var data70 = rsiData.length >= 2
      ? [{ time: rsiData[0].time, value: 70 }, { time: rsiData[rsiData.length - 1].time, value: 70 }]
      : [];
    if (data70.length) line70.setData(data70);

    // RSI 30 line
    var line30 = chart.addLineSeries({
      color: 'rgba(0, 230, 118, 0.3)',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false
    });
    var data30 = rsiData.length >= 2
      ? [{ time: rsiData[0].time, value: 30 }, { time: rsiData[rsiData.length - 1].time, value: 30 }]
      : [];
    if (data30.length) line30.setData(data30);

    // --- Divergence markers ---
    if (divergence && divergence.type !== 'NONE' && divergence.rsiPoints.length === 2) {
      var markers = [];
      var markerColor = divergence.type === 'BULLISH' ? '#00e676' : '#ff1744';
      var markerShape = divergence.type === 'BULLISH' ? 'arrowUp' : 'arrowDown';
      var position = divergence.type === 'BULLISH' ? 'belowBar' : 'aboveBar';

      divergence.rsiPoints.forEach(function (pt) {
        markers.push({
          time: pt.time,
          position: position,
          color: markerColor,
          shape: markerShape,
          text: ''
        });
      });

      markers.sort(function (a, b) {
        return a.time < b.time ? -1 : a.time > b.time ? 1 : 0;
      });

      rsiLine.setMarkers(markers);
    }

    chart.timeScale().fitContent();

    // Resize handling
    var resizeObserver = new ResizeObserver(function () {
      chart.applyOptions({ width: container.clientWidth });
    });
    resizeObserver.observe(container);

    _activeCharts[containerId] = { chart: chart, observer: resizeObserver };
    return chart;
  }

  /* ------------------------------------------------------------------ */
  /*  Cleanup                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Destroy a chart and its resize observer.
   * @param {string} containerId
   */
  function destroyChart(containerId) {
    if (_activeCharts[containerId]) {
      try {
        _activeCharts[containerId].observer.disconnect();
        _activeCharts[containerId].chart.remove();
      } catch (_) { /* ignore */ }
      delete _activeCharts[containerId];
    }
  }

  /**
   * Destroy all active charts.
   */
  function destroyAllCharts() {
    for (var id in _activeCharts) {
      if (_activeCharts.hasOwnProperty(id)) {
        destroyChart(id);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                        */
  /* ------------------------------------------------------------------ */

  window.Charts = {
    createVWMAChart:     createVWMAChart,
    createRSIMiniChart:  createRSIMiniChart,
    destroyChart:        destroyChart,
    destroyAllCharts:    destroyAllCharts
  };

})();
