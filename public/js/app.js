/**
 * StockPulse — Main Application Controller
 * ===========================================
 * Orchestrates navigation, rendering, event handling, and ties together
 * StockData, Indicators, and Charts modules.
 * Everything lives on `window.App`.
 */

(function () {
  'use strict';

  /* ================================================================== */
  /*  STATE                                                             */
  /* ================================================================== */

  var state = {
    currentScreen:  'dashboardScreen',
    vwmaPeriod:     50,
    rsiPeriod:      14,
    currency:       'INR',
    selectedVWMAStock: null,
    
    // Scan settings
    rsiScanUniverse: 'portfolio',
    rsiTimeframe: 'monthly'
  };

  /* ================================================================== */
  /*  INITIALIZATION                                                    */
  /* ================================================================== */

  async function init() {
    loadSettings();
    setupNavigation();
    setupModal();
    setupManageModal();
    setupSettings();
    setupRefresh();
    setupRSIControls();
    
    // Initial render
    await renderDashboard();
  }

  /* ================================================================== */
  /*  SETTINGS PERSISTENCE                                              */
  /* ================================================================== */

  function loadSettings() {
    try {
      var saved = localStorage.getItem('stockpulse_settings');
      if (saved) {
        var s = JSON.parse(saved);
        state.vwmaPeriod = s.vwmaPeriod || 50;
        state.rsiPeriod  = s.rsiPeriod  || 14;
        state.currency   = s.currency   || 'INR';
      }
    } catch (_) {}
  }

  function saveSettings() {
    localStorage.setItem('stockpulse_settings', JSON.stringify({
      vwmaPeriod: state.vwmaPeriod,
      rsiPeriod:  state.rsiPeriod,
      currency:   state.currency
    }));
  }

  /* ================================================================== */
  /*  NAVIGATION                                                        */
  /* ================================================================== */

  function setupNavigation() {
    var navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var screenId = btn.getAttribute('data-screen');
        await navigateTo(screenId);

        // Update active nav item
        navItems.forEach(function (n) { n.classList.remove('active'); });
        btn.classList.add('active');
      });
    });
  }

  async function navigateTo(screenId) {
    // Hide all screens
    var screens = document.querySelectorAll('.screen');
    screens.forEach(function (s) { s.classList.remove('active'); });

    // Show target
    var target = document.getElementById(screenId);
    if (target) target.classList.add('active');

    state.currentScreen = screenId;

    // Render screen content on navigation
    switch (screenId) {
      case 'dashboardScreen': await renderDashboard(); break;
      case 'vwmaScreen':      await renderVWMAScreen(); break;
      case 'rsiScreen':       await renderRSIScreen(); break;
      case 'settingsScreen':  break; // Static content
    }
  }

  /* ================================================================== */
  /*  MODAL (Add Stock)                                                 */
  /* ================================================================== */

  function setupModal() {
    var modal   = document.getElementById('addStockModal');
    var openBtn = document.getElementById('addStockBtn');
    var closeBtn = document.getElementById('closeModal');
    var form    = document.getElementById('addStockForm');

    openBtn.addEventListener('click', function () {
      modal.classList.add('active');
    });

    closeBtn.addEventListener('click', function () {
      modal.classList.remove('active');
    });

    // Close on backdrop click
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.classList.remove('active');
    });

    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      var symbol   = document.getElementById('stockSymbolInput').value.trim().toUpperCase();
      var name     = document.getElementById('stockNameInput').value.trim() || symbol;
      var shares   = parseInt(document.getElementById('stockSharesInput').value) || 0;
      var avgPrice = parseFloat(document.getElementById('stockAvgPriceInput').value) || 0;

      if (!symbol) return;

      StockData.addStock({
        symbol:        symbol,
        name:          name,
        exchange:      'NSE',
        shares:        shares,
        avgPrice:      avgPrice
      });

      // Reset form and close modal
      form.reset();
      modal.classList.remove('active');

      // Refresh current screen
      if (state.currentScreen === 'dashboardScreen') await renderDashboard();
      if (state.currentScreen === 'vwmaScreen') await renderVWMAScreen(); 
    });
  }

  /* ================================================================== */
  /*  MODAL (Manage Portfolio)                                          */
  /* ================================================================== */

  function setupManageModal() {
    var manageBtn = document.getElementById('managePortfolioBtn');
    var modal = document.getElementById('managePortfolioModal');
    var closeBtn = document.getElementById('closeManageModal');
    var listContainer = document.getElementById('managePortfolioList');

    if (!manageBtn || !modal) return;

    manageBtn.addEventListener('click', function() {
      renderManageList();
      modal.classList.add('active');
    });

    closeBtn.addEventListener('click', function() {
      modal.classList.remove('active');
    });

    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.classList.remove('active');
    });

    function renderManageList() {
      var portfolio = StockData.getPortfolio();
      if (portfolio.length === 0) {
        listContainer.innerHTML = '<div style="padding:20px;text-align:center;">No stocks in portfolio.</div>';
        return;
      }
      var html = '<ul style="list-style:none; padding:0; margin:0;">';
      portfolio.forEach(function(stock) {
        html += '<li style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid var(--border-color);">' +
                '<span><strong>' + stock.symbol + '</strong> - ' + stock.shares + ' shares</span>' +
                '<button class="danger-btn remove-stock-btn" data-symbol="' + stock.symbol + '" style="padding:5px 10px; font-size:0.8rem;">Remove</button>' +
                '</li>';
      });
      html += '</ul>';
      listContainer.innerHTML = html;

      listContainer.querySelectorAll('.remove-stock-btn').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          var sym = this.getAttribute('data-symbol');
          if (confirm('Remove ' + sym + ' from portfolio?')) {
            StockData.removeStock(sym);
            renderManageList(); // re-render list
            if (state.currentScreen === 'dashboardScreen') await renderDashboard();
            if (state.currentScreen === 'vwmaScreen') await renderVWMAScreen(); 
          }
        });
      });
    }
  }

  /* ================================================================== */
  /*  SETTINGS                                                          */
  /* ================================================================== */

  function setupSettings() {
    var vwmaPeriodEl = document.getElementById('vwmaPeriodSetting');
    var rsiPeriodEl  = document.getElementById('rsiPeriodSetting');
    var currencyEl   = document.getElementById('currencySetting');
    var clearBtn     = document.getElementById('clearDataBtn');

    // Apply saved settings to UI
    vwmaPeriodEl.value = state.vwmaPeriod;
    rsiPeriodEl.value  = state.rsiPeriod;
    currencyEl.value   = state.currency;

    vwmaPeriodEl.addEventListener('change', function () {
      state.vwmaPeriod = parseInt(this.value);
      saveSettings();
    });

    rsiPeriodEl.addEventListener('change', function () {
      state.rsiPeriod = parseInt(this.value);
      saveSettings();
    });

    currencyEl.addEventListener('change', async function () {
      state.currency = this.value;
      saveSettings();
      await renderDashboard();
    });

    clearBtn.addEventListener('click', async function () {
      if (confirm('Clear all portfolio data? This cannot be undone.')) {
        localStorage.removeItem('stockpulse_portfolio');
        localStorage.removeItem('stockpulse_settings');
        state.vwmaPeriod = 50;
        state.rsiPeriod  = 14;
        state.currency   = 'INR';
        vwmaPeriodEl.value = '50';
        rsiPeriodEl.value  = '14';
        currencyEl.value   = 'INR';
        Charts.destroyAllCharts();
        await renderDashboard();
      }
    });
  }

  /* ================================================================== */
  /*  REFRESH                                                           */
  /* ================================================================== */

  function setupRefresh() {
    var btn = document.getElementById('refreshBtn');
    btn.addEventListener('click', async function () {
      // Spin animation
      var icon = btn.querySelector('.material-symbols-rounded');
      icon.style.transition = 'transform 0.6s ease';
      icon.style.transform = 'rotate(360deg)';
      setTimeout(function () {
        icon.style.transition = 'none';
        icon.style.transform = 'rotate(0)';
      }, 600);

      // Re-render current screen
      switch (state.currentScreen) {
        case 'dashboardScreen': await renderDashboard(); break;
        case 'vwmaScreen':      await renderVWMAScreen(); break;
        case 'rsiScreen':       await renderRSIScreen(); break;
      }
    });
  }
  
  function setupRSIControls() {
    var scanBtn = document.getElementById('runRsiScanBtn');
    var uniSelect = document.getElementById('rsiScanUniverse');
    var tfSelect = document.getElementById('rsiTimeframe');
    
    scanBtn.addEventListener('click', async function() {
      state.rsiScanUniverse = uniSelect.value;
      state.rsiTimeframe = tfSelect.value;
      await renderRSIScreen();
    });
  }

  /* ================================================================== */
  /*  DASHBOARD RENDERING                                               */
  /* ================================================================== */

  async function renderDashboard() {
    var portfolio = StockData.getPortfolio();
    var symbols = portfolio.map(function(s) { return s.symbol; });
    
    // Fetch live quotes
    var quotes = await StockData.fetchQuotes(symbols);
    
    // Merge quotes into portfolio
    portfolio.forEach(function(stock) {
      var q = quotes.find(function(qq) { return qq.symbol === stock.symbol; });
      if (q) {
        stock.currentPrice = q.currentPrice;
        stock.change = q.change;
        stock.changePercent = q.changePercent;
      } else {
        stock.currentPrice = stock.currentPrice || 0;
        stock.change = stock.change || 0;
        stock.changePercent = stock.changePercent || 0;
      }
    });

    renderPortfolioSummary(portfolio);
    renderWatchlist(portfolio);
    await renderRecentAlerts(portfolio);
  }

  function renderPortfolioSummary(portfolio) {
    var totalValue = 0;
    var todayPL = 0;
    var totalInvested = 0;
    
    portfolio.forEach(function (s) {
      if (s.shares > 0) {
        totalValue += s.shares * s.currentPrice;
        todayPL += s.shares * s.change;
        if (s.avgPrice > 0) {
          totalInvested += s.shares * s.avgPrice;
        }
      }
    });

    var totalGain = totalValue - totalInvested;
    var totalGainPct = totalInvested > 0 ? totalGain / totalInvested : 0;

    document.getElementById('totalValue').textContent =
      Indicators.formatCurrency(totalValue, state.currency);

    var changeEl = document.getElementById('totalChange');
    changeEl.textContent =
      (totalGain >= 0 ? '+' : '') + Indicators.formatCurrency(totalGain, state.currency) +
      ' (' + Indicators.formatPercent(totalGainPct) + ')';
    changeEl.className = 'card-change ' + (totalGain >= 0 ? 'positive' : 'negative');

    var plEl = document.getElementById('todayPL');
    plEl.textContent = (todayPL >= 0 ? '+' : '') + Indicators.formatCurrency(todayPL, state.currency);
    plEl.className = 'card-value ' + (todayPL >= 0 ? 'positive' : 'negative');
  }

  function renderWatchlist(portfolio) {
    var container = document.getElementById('watchlistContainer');

    if (!portfolio || portfolio.length === 0) {
      container.innerHTML = '<div class="empty-state">' +
        '<span class="material-symbols-rounded">playlist_add</span>' +
        '<p>No stocks in your watchlist.<br>Tap + to add stocks.</p></div>';
      return;
    }

    var html = '';
    portfolio.forEach(function (stock) {
      var changeClass = stock.change >= 0 ? 'positive' : 'negative';
      var changeSign  = stock.change >= 0 ? '+' : '';
      var holdingsText = stock.shares > 0
        ? stock.shares + ' shares · ' + Indicators.formatCurrency(stock.shares * stock.currentPrice, state.currency)
        : '';

      html += '<div class="watchlist-item" data-symbol="' + stock.symbol + '">' +
        '<div class="stock-info">' +
          '<span class="stock-symbol">' + stock.symbol + '</span>' +
          '<span class="stock-name">' + stock.name + '</span>' +
          (holdingsText ? '<span class="stock-shares">' + holdingsText + '</span>' : '') +
        '</div>' +
        '<div class="stock-price-info">' +
          '<span class="stock-price">' + Indicators.formatCurrency(stock.currentPrice, state.currency) + '</span>' +
          '<span class="stock-change ' + changeClass + '">' +
            changeSign + Indicators.formatNumber(stock.change) + ' (' + Indicators.formatPercent(stock.changePercent) + ')' +
          '</span>' +
        '</div>' +
      '</div>';
    });

    container.innerHTML = html;

    // Add click handlers to navigate to VWMA with the stock selected
    container.querySelectorAll('.watchlist-item').forEach(function (item) {
      item.addEventListener('click', async function () {
        var symbol = item.getAttribute('data-symbol');
        state.selectedVWMAStock = symbol;

        // Navigate to VWMA screen
        document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
        document.querySelector('[data-screen="vwmaScreen"]').classList.add('active');
        await navigateTo('vwmaScreen');
      });
    });
  }

  async function renderRecentAlerts(portfolio) {
    var container = document.getElementById('alertsPreview');
    var alerts = [];

    // Fetch data for alerts (only top 3 for speed)
    for (var i = 0; i < portfolio.length; i++) {
      var stock = portfolio[i];
      var data = await StockData.getStockData(stock.symbol);
      if (!data || !data.daily || data.daily.length === 0) continue;

      // VWMA
      var vwma = Indicators.calculateVWMA(data.daily, state.vwmaPeriod);
      var signals = Indicators.detectVWMASignals(data.daily, vwma);
      var recentSignals = signals.slice(-2);
      recentSignals.forEach(function (s) {
        alerts.push({
          symbol: stock.symbol, type: s.type, description: s.description,
          time: s.time, source: 'VWMA', sortTime: new Date(s.time).getTime()
        });
      });

      // RSI (Monthly)
      if (data.monthly && data.monthly.length > 0) {
        var rsi = Indicators.calculateRSI(data.monthly, state.rsiPeriod);
        var div = Indicators.detectRSIDivergence(data.monthly, rsi);
        if (div.type !== 'NONE') {
          alerts.push({
            symbol: stock.symbol, type: div.type, description: div.description,
            time: data.monthly[data.monthly.length - 1].time, source: 'RSI',
            sortTime: new Date(data.monthly[data.monthly.length - 1].time).getTime()
          });
        }
      }
    }

    // Sort by time descending (most recent first)
    alerts.sort(function (a, b) { return b.sortTime - a.sortTime; });
    document.getElementById('activeAlerts').textContent = alerts.length;

    if (alerts.length === 0) {
      container.innerHTML = '<div class="empty-state">' +
        '<span class="material-symbols-rounded">notifications_none</span>' +
        '<p>No recent alerts.<br>Alerts will appear when signals are triggered.</p></div>';
      return;
    }

    var recent = alerts.slice(0, 3);
    var html = '';
    recent.forEach(function (alert) {
      var typeClass = alert.type.toLowerCase();
      html += '<div class="alert-item ' + typeClass + '">' +
        '<div class="alert-header">' +
          '<span class="alert-stock">' + alert.symbol + '</span>' +
          '<span class="alert-type ' + typeClass + '">' + alert.type + '</span>' +
        '</div>' +
        '<div class="alert-desc">' + alert.description + '</div>' +
        '<div class="alert-time">' + alert.time + '</div>' +
      '</div>';
    });

    container.innerHTML = html;
  }

  /* ================================================================== */
  /*  VWMA SCREEN                                                       */
  /* ================================================================== */

  async function renderVWMAScreen() {
    populateStockSelector();

    if (state.selectedVWMAStock) {
      var select = document.getElementById('vwmaStockSelect');
      select.value = state.selectedVWMAStock;
      await loadVWMAAnalysis(state.selectedVWMAStock);
      state.selectedVWMAStock = null; // Clear after use
    }
  }

  function populateStockSelector() {
    var select    = document.getElementById('vwmaStockSelect');
    var portfolio = StockData.getPortfolio();

    var currentVal = select.value;
    select.innerHTML = '<option value="" disabled selected>Select a stock...</option>';

    portfolio.forEach(function (stock) {
      var opt = document.createElement('option');
      opt.value = stock.symbol;
      opt.textContent = stock.symbol + ' — ' + stock.name;
      select.appendChild(opt);
    });

    if (currentVal) {
      select.value = currentVal;
    }

    select.onchange = async function () {
      if (select.value) {
        await loadVWMAAnalysis(select.value);
      }
    };
  }

  async function loadVWMAAnalysis(symbol) {
    var section = document.getElementById('vwmaChartSection');
    section.style.display = 'block';

    var portfolio = StockData.getPortfolio();
    var stock = portfolio.find(function(s) { return s.symbol === symbol; });
    if (!stock) return;

    // Show loading text
    document.getElementById('vwmaSymbol').textContent = 'Loading...';
    
    // Fetch quotes and data
    var [quotes, data] = await Promise.all([
      StockData.fetchQuotes([symbol]),
      StockData.getStockData(symbol)
    ]);
    
    if (quotes && quotes.length > 0) {
      stock.currentPrice = quotes[0].currentPrice;
      stock.change = quotes[0].change;
      stock.changePercent = quotes[0].changePercent;
    }

    if (!data || !data.daily) return;

    // Calculate VWMA
    var vwma    = Indicators.calculateVWMA(data.daily, state.vwmaPeriod);
    var signals = Indicators.detectVWMASignals(data.daily, vwma);
    var current = Indicators.getCurrentVWMASignal(data.daily, vwma);

    // Update header info
    document.getElementById('vwmaSymbol').textContent = stock.symbol;
    document.getElementById('vwmaPrice').textContent =
      Indicators.formatCurrency(stock.currentPrice, state.currency);

    var changeEl = document.getElementById('vwmaChange');
    var changeClass = stock.change >= 0 ? 'positive' : 'negative';
    changeEl.textContent = (stock.change >= 0 ? '+' : '') +
      Indicators.formatNumber(stock.change) + ' (' + Indicators.formatPercent(stock.changePercent) + ')';
    changeEl.className = 'chart-change ' + changeClass;

    // Update signal badge
    var badge = document.getElementById('vwmaSignalBadge');
    badge.textContent = current.signal;
    badge.className = 'signal-badge ' + current.signal.toLowerCase();

    // Create chart
    Charts.createVWMAChart('vwmaChart', data.daily, vwma, signals);
    renderVWMASignalDetails(current, stock);
    renderVWMASignalHistory(signals);
  }

  function renderVWMASignalDetails(current, stock) {
    var grid = document.getElementById('vwmaSignalGrid');
    var distanceClass = current.distance >= 0 ? 'positive' : 'negative';
    var lastCrossText = current.lastCrossover
      ? current.lastCrossover.type + ' on ' + current.lastCrossover.time
      : 'None detected';
    var lastCrossClass = current.lastCrossover
      ? (current.lastCrossover.type === 'BUY' ? 'positive' : 'negative')
      : '';

    grid.innerHTML =
      '<div class="signal-info-item"><span class="label">Current Price</span><span class="value">' + Indicators.formatCurrency(current.price, state.currency) + '</span></div>' +
      '<div class="signal-info-item"><span class="label">VWMA (' + state.vwmaPeriod + ')</span><span class="value">' + Indicators.formatCurrency(current.vwmaValue, state.currency) + '</span></div>' +
      '<div class="signal-info-item"><span class="label">Distance</span><span class="value ' + distanceClass + '">' + Indicators.formatPercent(current.distance) + '</span></div>' +
      '<div class="signal-info-item"><span class="label">Last Crossover</span><span class="value ' + lastCrossClass + '">' + lastCrossText + '</span></div>' +
      '<div class="signal-info-item"><span class="label">Position</span><span class="value">' + (current.signal === 'BUY' ? 'Above VWMA' : current.signal === 'SELL' ? 'Below VWMA' : 'At VWMA') + '</span></div>' +
      '<div class="signal-info-item"><span class="label">Recommendation</span><span class="value ' + (current.signal === 'BUY' ? 'positive' : current.signal === 'SELL' ? 'negative' : '') + '">' + getRecommendation(current) + '</span></div>';
  }

  function getRecommendation(current) {
    var dist = Math.abs(current.distance);
    if (current.signal === 'BUY') {
      if (dist > 0.05) return 'Strong Buy';
      if (dist > 0.02) return 'Buy';
      return 'Weak Buy';
    } else if (current.signal === 'SELL') {
      if (dist > 0.05) return 'Strong Sell';
      if (dist > 0.02) return 'Sell';
      return 'Weak Sell';
    }
    return 'Hold';
  }

  function renderVWMASignalHistory(signals) {
    var container = document.getElementById('vwmaSignalHistory');
    if (!signals || signals.length === 0) {
      container.innerHTML = '<div class="empty-state"><p class="muted">No crossover signals detected in this period.</p></div>';
      return;
    }

    var recent = signals.slice(-10).reverse();
    var html = '';
    recent.forEach(function (s) {
      var typeClass = s.type.toLowerCase();
      html += '<div class="signal-history-item"><div class="history-left"><span class="history-type ' + typeClass + '">' + s.type + '</span><span class="history-date">' + formatDateStr(s.time) + '</span></div><span class="history-price">' + Indicators.formatCurrency(s.price, state.currency) + '</span></div>';
    });
    container.innerHTML = html;
  }

  /* ================================================================== */
  /*  RSI DIVERGENCE SCREEN                                             */
  /* ================================================================== */

  async function renderRSIScreen() {
    var container = document.getElementById('rsiAlertsList');
    var loading = document.getElementById('rsiLoadingIndicator');
    var summaryCards = document.querySelector('.rsi-summary-cards');
    
    // Reset UI
    container.innerHTML = '';
    summaryCards.style.opacity = '0.5';
    loading.style.display = 'block';

    var symbolsToScan = [];
    if (state.rsiScanUniverse === 'portfolio') {
      var portfolio = StockData.getPortfolio();
      symbolsToScan = portfolio.map(function(s) { return s.symbol; });
    } else {
      symbolsToScan = await StockData.fetchIndexSymbols(state.rsiScanUniverse);
    }

    var results = [];
    var loadingText = document.querySelector('#rsiLoadingIndicator p');
    if (loadingText) loadingText.textContent = 'Scanning Market Data...';
    
    // Batch fetching to avoid rate-limits and UI freezing
    var BATCH_SIZE = 15;
    for (var i = 0; i < symbolsToScan.length; i += BATCH_SIZE) {
      var chunk = symbolsToScan.slice(i, i + BATCH_SIZE);
      
      if (loadingText) {
        loadingText.textContent = 'Scanning ' + Math.min(i + BATCH_SIZE, symbolsToScan.length) + ' of ' + symbolsToScan.length + ' stocks...';
      }

      var promises = chunk.map(function(sym) {
        return StockData.getStockData(sym).then(function(data) {
          if (!data) return null;
          
          var seriesData = data.monthly;
          if (state.rsiTimeframe === 'daily') seriesData = data.daily;
          if (state.rsiTimeframe === 'weekly') seriesData = data.weekly;
          
          if (!seriesData || seriesData.length === 0) return null;
          
          var rsi = Indicators.calculateRSI(seriesData, state.rsiPeriod);
          var div = Indicators.detectRSIDivergence(seriesData, rsi);
          
          return {
            symbol: sym,
            name: sym, // Generic name placeholder
            seriesData: seriesData,
            rsi: rsi,
            divergence: div
          };
        }).catch(function(err) {
          console.error("Error processing " + sym, err);
          return null;
        });
      });

      var chunkResults = await Promise.all(promises);
      for (var k = 0; k < chunkResults.length; k++) {
        if (chunkResults[k]) results.push(chunkResults[k]);
      }

      // Small delay to let browser breathe
      await new Promise(function(resolve) { setTimeout(resolve, 50); });
    }

    // Count by type
    var bullishCount = 0;
    var bearishCount = 0;
    var noneCount    = 0;

    results.forEach(function (r) {
      switch (r.divergence.type) {
        case 'BULLISH': bullishCount++; break;
        case 'BEARISH': bearishCount++; break;
        default:        noneCount++;    break;
      }
    });

    document.getElementById('bullishCount').textContent = bullishCount;
    document.getElementById('bearishCount').textContent = bearishCount;
    document.getElementById('neutralCount').textContent = noneCount;
    
    // Hide loading
    loading.style.display = 'none';
    summaryCards.style.opacity = '1';

    // Render alert cards
    await renderRSIAlertCards(results);
  }

  async function renderRSIAlertCards(results) {
    var container = document.getElementById('rsiAlertsList');

    if (!results || results.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="material-symbols-rounded">query_stats</span><p>No stocks to analyze.</p></div>';
      return;
    }

    // Sort: Bullish first, Bearish second, None last
    results.sort(function(a, b) {
      var wA = a.divergence.type === 'BULLISH' ? 2 : (a.divergence.type === 'BEARISH' ? 1 : 0);
      var wB = b.divergence.type === 'BULLISH' ? 2 : (b.divergence.type === 'BEARISH' ? 1 : 0);
      return wB - wA;
    });

    // We only render those that have signals to avoid cluttering if scanning whole index,
    // UNLESS it's portfolio in which case we show all.
    var displayResults = results;
    if (state.rsiScanUniverse !== 'portfolio') {
      displayResults = results.filter(function(r) { return r.divergence.type !== 'NONE'; });
      if (displayResults.length === 0) {
        container.innerHTML = '<div class="empty-state"><span class="material-symbols-rounded">check_circle</span><p>No divergence signals found in the index.</p></div>';
        return;
      }
    }

    var html = '';
    var portfolio = StockData.getPortfolio();

    displayResults.forEach(function (result, index) {
      var div       = result.divergence;
      var typeClass = div.type.toLowerCase();
      var inPortfolio = portfolio.find(function(p) { return p.symbol === result.symbol; });

      var signalBadgeClass = div.type === 'BULLISH' ? 'buy' : div.type === 'BEARISH' ? 'sell' : 'hold';
      var signalText = div.type === 'NONE' ? 'NO SIGNAL' : div.type;
      var miniChartId = 'rsiMiniChart_' + index;
      
      var addBtnHtml = '';
      if (!inPortfolio) {
        addBtnHtml = '<button class="primary-btn add-to-portfolio-btn" data-symbol="' + result.symbol + '" style="margin-top:10px; padding: 8px 16px; font-size:0.8rem;">+ Add to Portfolio</button>';
      }

      html += '<div class="rsi-alert-card ' + typeClass + '">' +
        '<div class="rsi-alert-header">' +
          '<div>' +
            '<span class="rsi-alert-symbol">' + result.symbol + '</span>' +
          '</div>' +
          '<span class="signal-badge ' + signalBadgeClass + '">' + signalText + '</span>' +
        '</div>' +
        '<div class="rsi-alert-info">' +
          '<div><div class="rsi-label">Current RSI</div><div class="rsi-value ' + getRSIColorClass(div.currentRSI) + '">' + Indicators.formatNumber(div.currentRSI) + '</div></div>' +
          '<div><div class="rsi-label">RSI Zone</div><div class="rsi-value">' + getRSIZone(div.currentRSI) + '</div></div>' +
          (div.type !== 'NONE' ? '<div><div class="rsi-label">Signal</div><div class="rsi-value ' + (div.type === 'BULLISH' ? 'positive' : 'negative') + '">' + (div.type === 'BULLISH' ? '↑ Reversal Up' : '↓ Reversal Down') + '</div></div>' : '') +
        '</div>' +
        (div.type !== 'NONE' ? '<div class="alert-desc" style="margin-top:10px;">' + div.description + '</div>' : '') +
        addBtnHtml + 
        '<div class="rsi-chart-mini" id="' + miniChartId + '"></div>' +
      '</div>';
    });

    container.innerHTML = html;

    // Attach add to portfolio handlers
    container.querySelectorAll('.add-to-portfolio-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var sym = this.getAttribute('data-symbol');
        StockData.addStock({
          symbol: sym,
          name: sym,
          exchange: 'NSE',
          shares: 0,
          avgPrice: 0
        });
        this.textContent = '✓ Added';
        this.disabled = true;
        this.style.background = 'var(--green)';
      });
    });

    // Create mini RSI charts after DOM is ready
    setTimeout(function () {
      displayResults.forEach(function (result, index) {
        var miniChartId = 'rsiMiniChart_' + index;
        Charts.createRSIMiniChart(miniChartId, result.seriesData, result.rsi, result.divergence);
      });
    }, 100);
  }

  function getRSIColorClass(rsi) {
    if (rsi >= 70) return 'negative';
    if (rsi <= 30) return 'positive';
    return '';
  }

  function getRSIZone(rsi) {
    if (rsi >= 80) return 'Extreme Overbought';
    if (rsi >= 70) return 'Overbought';
    if (rsi >= 60) return 'Bullish';
    if (rsi >= 40) return 'Neutral';
    if (rsi >= 30) return 'Bearish';
    if (rsi >= 20) return 'Oversold';
    return 'Extreme Oversold';
  }

  /* ================================================================== */
  /*  HELPERS                                                           */
  /* ================================================================== */

  function formatDateStr(dateStr) {
    try {
      var parts = dateStr.split('-');
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return months[parseInt(parts[1]) - 1] + ' ' + parseInt(parts[2]) + ', ' + parts[0];
    } catch (_) {
      return dateStr;
    }
  }

  /* ================================================================== */
  /*  BOOT                                                              */
  /* ================================================================== */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.App = {
    navigateTo:    navigateTo,
    renderDashboard: renderDashboard,
    state:         state
  };

})();
