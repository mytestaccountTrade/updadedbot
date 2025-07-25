import { TradingPair, Trade, MarketData } from '../types/trading';
import CryptoJS from 'crypto-js';

interface KlineData {
  symbol: string;
  openTime: number;
  closeTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  trades: number;
}

interface SymbolInfo {
  symbol: string;
  minQty: number;
  stepSize: number;
  minNotional: number;
}

class BinanceService {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private testnetUrl: string;
  private isTestnet: boolean;
  private wsConnections: Map<string, WebSocket> = new Map();
  private marketDataCache: Map<string, MarketData> = new Map();
  private priceHistory: Map<string, number[]> = new Map();
  private volumeHistory: Map<string, number[]> = new Map();
  private validSymbols: Map<string, SymbolInfo> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  
  // Throttling and rate limiting
  private lastTradingPairsFetch: number = 0;
  private tradingPairsThrottle: number = 30000; // 30 seconds
  private lastMarketDataFetch: Map<string, number> = new Map();
  private marketDataThrottle: number = 5000; // 5 seconds per symbol
  private wsMessageThrottle: Map<string, number> = new Map();
  private wsThrottleDelay: number = 500; // 500ms per symbol
  private maxConcurrentRequests: number = 3;
  private activeRequests: number = 0;
  private requestQueue: Array<() => Promise<any>> = [];

  private cachedTradingPairs: TradingPair[] = [];

  constructor() {
    this.apiKey = '';
    this.apiSecret = '';
    this.baseUrl = '/binance-api';
    this.testnetUrl = '/binance-testnet';
    this.isTestnet = false;
    this.initializeSymbols();
  }

  setCredentials(apiKey: string, apiSecret: string, useTestnet: boolean = true) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.isTestnet = useTestnet;
  }

  private async initializeSymbols() {
    try {
      const exchangeInfo = await this.makeRequestWithRetry('/api/v3/exchangeInfo');
      
      exchangeInfo.symbols
        .filter((symbol: any) => symbol.status === 'TRADING' && symbol.symbol.endsWith('USDT'))
        .forEach((symbol: any) => {
          const lotSizeFilter = symbol.filters.find((f: any) => f.filterType === 'LOT_SIZE');
          const notionalFilter = symbol.filters.find((f: any) => f.filterType === 'NOTIONAL');
          
          this.validSymbols.set(symbol.symbol, {
            symbol: symbol.symbol,
            minQty: parseFloat(lotSizeFilter?.minQty || '0.001'),
            stepSize: parseFloat(lotSizeFilter?.stepSize || '0.001'),
            minNotional: parseFloat(notionalFilter?.minNotional || '10')
          });
        });
      
      console.log(`✅ Loaded ${this.validSymbols.size} valid trading symbols`);
    } catch (error) {
      console.warn('Failed to load symbol information from API, using default symbols:', error);
      
      // Fallback to default common trading symbols
      const defaultSymbols = [
        { symbol: 'BTCUSDT', minQty: 0.00001, stepSize: 0.00001, minNotional: 10 },
        { symbol: 'ETHUSDT', minQty: 0.0001, stepSize: 0.0001, minNotional: 10 },
        { symbol: 'BNBUSDT', minQty: 0.001, stepSize: 0.001, minNotional: 10 },
        { symbol: 'ADAUSDT', minQty: 0.1, stepSize: 0.1, minNotional: 10 },
        { symbol: 'SOLUSDT', minQty: 0.001, stepSize: 0.001, minNotional: 10 },
        { symbol: 'XRPUSDT', minQty: 0.1, stepSize: 0.1, minNotional: 10 },
        { symbol: 'DOGEUSDT', minQty: 1, stepSize: 1, minNotional: 10 },
        { symbol: 'DOTUSDT', minQty: 0.01, stepSize: 0.01, minNotional: 10 },
        { symbol: 'AVAXUSDT', minQty: 0.001, stepSize: 0.001, minNotional: 10 },
        { symbol: 'MATICUSDT', minQty: 0.1, stepSize: 0.1, minNotional: 10 }
      ];
      
      defaultSymbols.forEach(symbolInfo => {
        this.validSymbols.set(symbolInfo.symbol, symbolInfo);
      });
      
      console.log(`✅ Loaded ${this.validSymbols.size} default trading symbols`);
    }
  }

  isValidSymbol(symbol: string): boolean {
    return this.validSymbols.has(symbol);
  }

  getSymbolInfo(symbol: string): SymbolInfo | null {
    return this.validSymbols.get(symbol) || null;
  }

  validateOrderQuantity(symbol: string, quantity: number): { valid: boolean; adjustedQty?: number; error?: string } {
    const symbolInfo = this.getSymbolInfo(symbol);
    if (!symbolInfo) {
      return { valid: false, error: 'Invalid symbol' };
    }

    if (quantity < symbolInfo.minQty) {
      return { valid: false, error: `Quantity below minimum: ${symbolInfo.minQty}` };
    }

    // Adjust quantity to step size
    const adjustedQty = Math.floor(quantity / symbolInfo.stepSize) * symbolInfo.stepSize;
    
    // Check minimum notional value
    const currentPrice = this.marketDataCache.get(symbol)?.price || 0;
    if (adjustedQty * currentPrice < symbolInfo.minNotional) {
      return { valid: false, error: `Order value below minimum notional: ${symbolInfo.minNotional}` };
    }

    return { valid: true, adjustedQty };
  }

  // Add method to bypass minNotional for aggressive mode
  validateOrderQuantityAggressive(symbol: string, quantity: number): { valid: boolean; adjustedQty?: number; error?: string } {
    const symbolInfo = this.getSymbolInfo(symbol);
    if (!symbolInfo) {
      return { valid: false, error: 'Invalid symbol' };
    }

    if (quantity < symbolInfo.minQty) {
      return { valid: false, error: `Quantity below minimum: ${symbolInfo.minQty}` };
    }

    // Adjust quantity to step size
    const adjustedQty = Math.floor(quantity / symbolInfo.stepSize) * symbolInfo.stepSize;
    
    // Aggressive mode: Skip minNotional check or use lower threshold
    const minNotional = symbolInfo.minNotional * 0.5; // 50% of normal minNotional
    const currentPrice = this.marketDataCache.get(symbol)?.price || 0;
    if (adjustedQty * currentPrice < minNotional) {
      return { valid: false, error: `Order value below aggressive minimum: ${minNotional}` };
    }

    return { valid: true, adjustedQty };
  }

  private hasValidCredentials(): boolean {
    return this.apiKey.length > 0 && this.apiSecret.length > 0;
  }

  private getBaseUrl(): string {
    return this.isTestnet ? this.testnetUrl : this.baseUrl;
  }

  private async makeRequest(endpoint: string, params: any = {}, method: string = 'GET'): Promise<any> {
    const requiresAuth = endpoint.includes('/api/v3/order') || endpoint.includes('/api/v3/account') || endpoint.includes('/api/v3/openOrders');
    
    if (requiresAuth && !this.hasValidCredentials()) {
      throw new Error('API credentials not configured. Please set your Binance API key and secret in the settings.');
    }

    if (requiresAuth) {
      params.timestamp = Date.now();
      params.recvWindow = 5000;
    }
    
    const url = `${this.getBaseUrl()}${endpoint}`;
    const queryString = new URLSearchParams(params).toString();
    
    let finalQueryString = queryString;
    if (requiresAuth) {
      const signature = CryptoJS.HmacSHA256(queryString, this.apiSecret).toString();
      finalQueryString = `${queryString}&signature=${signature}`;
    }
    
    try {
      const response = await fetch(`${url}?${finalQueryString}`, {
        method,
        headers: {
          ...(requiresAuth && { 'X-MBX-APIKEY': this.apiKey }),
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Binance API error: ${response.statusText} - ${errorText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Binance API request failed:', error);
      throw error;
    }
  }

  async getTradingPairs(limit: number = 100): Promise<TradingPair[]> {
  const now = Date.now();
  if (now - this.lastTradingPairsFetch < this.tradingPairsThrottle) {
    console.log('🕒 Trading pairs fetch throttled, using cached data');
    return this.getCachedTradingPairs(limit);
  }

  try {
    this.lastTradingPairsFetch = now;
    const data = await this.makeRequest('/api/v3/ticker/24hr');

    const excluded = ['USDC', 'BUSD', 'TUSD', 'FDUSD', 'DAI', 'USDP'];

    const pairs = data
      .filter((ticker: any) =>
        ticker.symbol.endsWith('USDT') &&
        this.isValidSymbol(ticker.symbol) &&
        !excluded.some(stable => ticker.symbol.startsWith(stable))
      )
      .sort((a: any, b: any) => parseFloat(b.volume) - parseFloat(a.volume)) // en yüksek hacimli coinleri öne al
      .slice(0, limit)
      .map((ticker: any) => ({
        symbol: ticker.symbol,
        price: parseFloat(ticker.lastPrice),
        change24h: parseFloat(ticker.priceChangePercent),
        volume: parseFloat(ticker.volume),
        high24h: parseFloat(ticker.highPrice),
        low24h: parseFloat(ticker.lowPrice),
      }));

    this.cachedTradingPairs = pairs;
    return pairs;
  } catch (error) {
    console.error('Failed to fetch trading pairs:', error);
    return [];
  }
}

  subscribeToMarketData(symbol: string, onUpdate?: (data: MarketData) => void): void {
    if (this.wsConnections.has(symbol)) {
      console.log(`Already subscribed to ${symbol}`);
      return;
    }

    const wsUrl = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_1m`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log(`📡 WebSocket connected for ${symbol}`);
      this.reconnectAttempts.set(symbol, 0);
    };

    ws.onmessage = (event) => {
      // Throttle WebSocket message processing to prevent resource overload
      const now = Date.now();
      const lastProcessed = this.wsMessageThrottle.get(symbol) || 0;
      
      if (now - lastProcessed < this.wsThrottleDelay) {
        return; // Skip this message to prevent overload
      }
      
      this.wsMessageThrottle.set(symbol, now);
      
      try {
        const data = JSON.parse(event.data);
        const kline = data.k;
        
        if (!kline) return;

        const klineData: KlineData = {
          symbol: kline.s,
          openTime: kline.t,
          closeTime: kline.T,
          open: kline.o,
          high: kline.h,
          low: kline.l,
          close: kline.c,
          volume: kline.v,
          trades: kline.n
        };

        this.updateMarketData(klineData);
        
        const marketData = this.marketDataCache.get(symbol);
        if (marketData && onUpdate) {
          onUpdate(marketData);
        }
      } catch (error) {
        console.error(`Error processing WebSocket data for ${symbol}:`, error);
      }
    };

    ws.onclose = () => {
      console.log(`📡 WebSocket disconnected for ${symbol}`);
      this.wsConnections.delete(symbol);
      this.scheduleReconnect(symbol, onUpdate);
    };

    ws.onerror = (error) => {
      console.error(`WebSocket error for ${symbol}:`, error);
       ws.close();
    };

    this.wsConnections.set(symbol, ws);
  }

  private scheduleReconnect(symbol: string, onUpdate?: (data: MarketData) => void): void {
    const attempts = this.reconnectAttempts.get(symbol) || 0;
    
    if (attempts >= this.maxReconnectAttempts) {
      console.error(`Max reconnection attempts reached for ${symbol}`);
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, attempts);
    console.log(`Reconnecting to ${symbol} in ${delay}ms (attempt ${attempts + 1})`);
    
    setTimeout(() => {
      this.reconnectAttempts.set(symbol, attempts + 1);
      this.subscribeToMarketData(symbol, onUpdate);
    }, delay);
  }

  private updateMarketData(klineData: KlineData): void {
    const symbol = klineData.symbol;
    const price = parseFloat(klineData.close);
    const volume = parseFloat(klineData.volume);

    // Update price history
    let prices = this.priceHistory.get(symbol) || [];
    prices.push(price);
    if (prices.length > 100) prices = prices.slice(-100);
    this.priceHistory.set(symbol, prices);

    // Update volume history
    let volumes = this.volumeHistory.get(symbol) || [];
    volumes.push(volume);
    if (volumes.length > 100) volumes = volumes.slice(-100);
    this.volumeHistory.set(symbol, volumes);

    // Calculate indicators
    const rsi = this.calculateRSI(prices);
    const macd = this.calculateMACD(prices);
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const emaTrend = this.calculateEMATrend(ema12, ema26);
    const volumeRatio = this.calculateVolumeRatio(volumes);
    const bollinger = this.calculateBollingerBands(prices);

    const marketData: MarketData = {
      symbol,
      price,
      timestamp: Date.now(),
      volume,
      rsi,
      macd,
      ema12,
      ema26,
      emaTrend,
      volumeRatio,
      bollinger,
    };

    this.marketDataCache.set(symbol, marketData);
  }

  async getMarketData(symbol: string): Promise<MarketData | null> {
    // Throttle market data requests per symbol
    const now = Date.now();
    const lastFetch = this.lastMarketDataFetch.get(symbol) || 0;
    
    if (now - lastFetch < this.marketDataThrottle) {
      const cached = this.marketDataCache.get(symbol);
      if (cached) {
        return cached;
      }
    }

    // Return cached data if available
    const cached = this.marketDataCache.get(symbol);
    if (cached) {
      return cached;
    }

    // Queue request if too many concurrent requests
    if (this.activeRequests >= this.maxConcurrentRequests) {
      return new Promise((resolve) => {
        this.requestQueue.push(async () => {
          const result = await this.fetchMarketDataInternal(symbol);
          resolve(result);
          return result;
        });
      });
    }

    return this.fetchMarketDataInternal(symbol);
  }

  private async fetchMarketDataInternal(symbol: string): Promise<MarketData | null> {
    this.activeRequests++;
    this.lastMarketDataFetch.set(symbol, Date.now());

    // Fallback to REST API if WebSocket data not available
    try {
      // Batch requests with retry mechanism
      const [ticker, klines] = await Promise.all([
        this.makeRequestWithRetry('/api/v3/ticker/24hr', { symbol }),
        this.makeRequestWithRetry('/api/v3/klines', {
          symbol,
          interval: '1m',
          limit: 50
        })
      ]);

      const prices = klines.map((k: any) => parseFloat(k[4]));
      const volumes = klines.map((k: any) => parseFloat(k[5]));
      
      this.priceHistory.set(symbol, prices);
      this.volumeHistory.set(symbol, volumes);

      const rsi = this.calculateRSI(prices);
      const macd = this.calculateMACD(prices);
      const ema12 = this.calculateEMA(prices, 12);
      const ema26 = this.calculateEMA(prices, 26);
      const emaTrend = this.calculateEMATrend(ema12, ema26);
      const volumeRatio = this.calculateVolumeRatio(volumes);
      const bollinger = this.calculateBollingerBands(prices);

      const marketData: MarketData = {
        symbol,
        price: parseFloat(ticker.lastPrice),
        timestamp: Date.now(),
        volume: parseFloat(ticker.volume),
        rsi,
        macd,
        ema12,
        ema26,
        emaTrend,
        volumeRatio,
        bollinger,
      };

      this.marketDataCache.set(symbol, marketData);
      return marketData;
    } catch (error) {
      console.error('Failed to fetch market data:', error);
      return null;
    } finally {
      this.activeRequests--;
      this.processRequestQueue();
    }
  }

  private async processRequestQueue(): Promise<void> {
    if (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrentRequests) {
      const nextRequest = this.requestQueue.shift();
      if (nextRequest) {
        try {
          await nextRequest();
        } catch (error) {
          console.error('Queued request failed:', error);
        }
      }
    }
  }

  private async makeRequestWithRetry(endpoint: string, params: any = {}, maxRetries: number = 3): Promise<any> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Add exponential backoff delay for retries
        if (attempt > 1) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 2), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
          console.log(`🔄 Retry attempt ${attempt} for ${endpoint} after ${delay}ms delay`);
        }
        
        return await this.makeRequest(endpoint, params);
      } catch (error) {
        lastError = error as Error;
        console.warn(`Request failed (attempt ${attempt}/${maxRetries}):`, error);
        
        // Don't retry on certain errors
        if (error instanceof Error && error.message.includes('Forbidden')) {
          throw error;
        }
      }
    }
    
    throw lastError!;
  }
  async getOpenPositions(): Promise<any[]> {
    if (!this.hasValidCredentials()) {
      return [];
    }

    try {
      const openOrders = await this.makeRequest('/api/v3/openOrders');
      return openOrders || [];
    } catch (error) {
      console.error('Failed to fetch open positions:', error);
      return [];
    }
  }

  async placeTrade(symbol: string, side: 'BUY' | 'SELL', quantity: number, price?: number): Promise<Trade | null> {
    try {
      // Validate symbol and quantity
      const validation = this.validateOrderQuantity(symbol, quantity);
      if (!validation.valid) {
        console.error(`Order validation failed: ${validation.error}`);
        return null;
      }

      const params: any = {
        symbol,
        side,
        type: price ? 'LIMIT' : 'MARKET',
        quantity: validation.adjustedQty!.toString(),
      };

      if (price) {
        params.price = price.toString();
        params.timeInForce = 'GTC';
      }

      const result = await this.makeRequest('/api/v3/order', params, 'POST');
      
      return {
        id: result.orderId.toString(),
        symbol,
        side,
        type: params.type,
        quantity: validation.adjustedQty!,
        price: price || parseFloat(result.fills?.[0]?.price || '0'),
        status: result.status === 'FILLED' ? 'FILLED' : 'PENDING',
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Failed to place trade:', error);
      return null;
    }
  }

  async getAccountInfo(): Promise<{ totalWalletBalance: number } | null> {
    try {
      if (!this.hasValidCredentials()) {
        throw new Error('API credentials not configured');
      }

      const data = await this.makeRequest('/api/v3/account');
      
      let totalBalance = 0;
      if (data.balances) {
        for (const balance of data.balances) {
          if (parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0) {
            const total = parseFloat(balance.free) + parseFloat(balance.locked);
            
            if (balance.asset === 'USDT') {
              totalBalance += total;
            } else if (balance.asset === 'BTC') {
              const btcPrice = await this.getCurrentPrice('BTCUSDT');
              totalBalance += total * btcPrice;
            } else if (balance.asset === 'ETH') {
              const ethPrice = await this.getCurrentPrice('ETHUSDT');
              totalBalance += total * ethPrice;
            }
          }
        }
      }
      
      return { totalWalletBalance: totalBalance };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('API credentials not configured')) {
        console.warn('API credentials not configured - using simulation mode');
      } else {
        console.error('Failed to get account info:', error);
      }
      return null;
    }
  }

  private async getCurrentPrice(symbol: string): Promise<number> {
    try {
      const cached = this.marketDataCache.get(symbol);
      if (cached) return cached.price;
      
      const ticker = await this.makeRequest('/api/v3/ticker/price', { symbol });
      return parseFloat(ticker.price);
    } catch (error) {
      console.error(`Failed to get price for ${symbol}:`, error);
      return 0;
    }
  }

  unsubscribeFromMarketData(symbol: string): void {
    const ws = this.wsConnections.get(symbol);
    if (ws) {
      ws.close();
      this.wsConnections.delete(symbol);
      console.log(`📡 Unsubscribed from ${symbol}`);
    }
  }

  disconnectAll(): void {
    this.wsConnections.forEach((ws, symbol) => {
      ws.close();
      console.log(`📡 Disconnected from ${symbol}`);
    });
    this.wsConnections.clear();
  }

  private getCachedTradingPairs(): TradingPair[] {
    if (this.cachedTradingPairs.length > 0) {
      return this.cachedTradingPairs;
    }
    return this.getMockTradingPairs();
  }

  private getMockTradingPairs(): TradingPair[] {
    return [
      { symbol: 'BTCUSDT', price: 43000, change24h: 2.5, volume: 1000000, high24h: 44000, low24h: 42000 },
      { symbol: 'ETHUSDT', price: 2600, change24h: 1.8, volume: 800000, high24h: 2650, low24h: 2550 },
      { symbol: 'BNBUSDT', price: 320, change24h: -0.5, volume: 500000, high24h: 325, low24h: 315 },
      { symbol: 'ADAUSDT', price: 0.45, change24h: 3.2, volume: 300000, high24h: 0.47, low24h: 0.43 },
      { symbol: 'SOLUSDT', price: 95, change24h: 4.1, volume: 400000, high24h: 98, low24h: 92 }
    ];
  }

  private calculateRSI(prices: number[]): number {
    if (prices.length < 14) return 50;
    
    const gains = [];
    const losses = [];
    
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }
    
    const avgGain = gains.slice(-14).reduce((a, b) => a + b, 0) / 14;
    const avgLoss = losses.slice(-14).reduce((a, b) => a + b, 0) / 14;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateMACD(prices: number[]): number {
    if (prices.length < 26) return 0;
    
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    
    return ema12 - ema26;
  }

  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1];
    
    const multiplier = 2 / (period + 1);
    let ema = prices[0];
    
    for (let i = 1; i < prices.length; i++) {
      ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
    }
    
    return ema;
  }

  private calculateEMATrend(ema12: number, ema26: number): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    const diff = ema12 - ema26;
    const threshold = ema26 * 0.001;
    
    if (diff > threshold) return 'BULLISH';
    if (diff < -threshold) return 'BEARISH';
    return 'NEUTRAL';
  }

  private calculateVolumeRatio(volumes: number[]): number {
    if (volumes.length < 20) return 1;
    
    const recentVolume = volumes[volumes.length - 1];
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    
    return avgVolume > 0 ? recentVolume / avgVolume : 1;
  }

  private calculateBollingerBands(prices: number[]): { upper: number; middle: number; lower: number } {
    if (prices.length < 20) {
      const lastPrice = prices[prices.length - 1];
      return { upper: lastPrice, middle: lastPrice, lower: lastPrice };
    }
    
    const recentPrices = prices.slice(-20);
    const sma = recentPrices.reduce((a, b) => a + b, 0) / 20;
    const variance = recentPrices.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / 20;
    const stdDev = Math.sqrt(variance);
    
    return {
      upper: sma + (stdDev * 2),
      middle: sma,
      lower: sma - (stdDev * 2),
    };
  }
}

export const binanceService = new BinanceService();