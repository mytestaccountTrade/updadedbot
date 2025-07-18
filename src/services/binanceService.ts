import { TradingPair, Trade, MarketData } from '../types/trading';
import CryptoJS from 'crypto-js';

class BinanceService {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private testnetUrl: string;
  private isTestnet: boolean;

  constructor() {
    this.apiKey = '';
    this.apiSecret = '';
    this.baseUrl = '/binance-api';
    this.testnetUrl = '/binance-testnet';
    this.isTestnet = true; // Default to testnet for safety
  }

  setCredentials(apiKey: string, apiSecret: string, useTestnet: boolean = true) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.isTestnet = useTestnet;
  }

  private hasValidCredentials(): boolean {
    return this.apiKey.length > 0 && this.apiSecret.length > 0;
  }

  private getBaseUrl(): string {
    return this.isTestnet ? this.testnetUrl : this.baseUrl;
  }

  private async makeRequest(endpoint: string, params: any = {}, method: string = 'GET'): Promise<any> {
    // Check if we need authentication for this endpoint
    const requiresAuth = endpoint.includes('/api/v3/order') || endpoint.includes('/api/v3/account');
    
    if (requiresAuth && !this.hasValidCredentials()) {
      throw new Error('API credentials not configured. Please set your Binance API key and secret in the settings.');
    }

    // Add timestamp for authenticated requests
    if (requiresAuth) {
      params.timestamp = Date.now();
      params.recvWindow = 5000;
    }
    
    const url = `${this.getBaseUrl()}${endpoint}`;
    const queryString = new URLSearchParams(params).toString();
    
    // Generate signature for authenticated requests
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

  async getTradingPairs(): Promise<TradingPair[]> {
    try {
      const data = await this.makeRequest('/api/v3/ticker/24hr');
      return data
        .filter((ticker: any) => ticker.symbol.endsWith('USDT'))
        .slice(0, 20)
        .map((ticker: any) => ({
          symbol: ticker.symbol,
          price: parseFloat(ticker.lastPrice),
          change24h: parseFloat(ticker.priceChangePercent),
          volume: parseFloat(ticker.volume),
          high24h: parseFloat(ticker.highPrice),
          low24h: parseFloat(ticker.lowPrice),
        }));
    } catch (error) {
      console.error('Failed to fetch trading pairs:', error);
      return [];
    }
  }

  async getMarketData(symbol: string): Promise<MarketData | null> {
    try {
      const ticker = await this.makeRequest('/api/v3/ticker/24hr', { symbol });
      const klines = await this.makeRequest('/api/v3/klines', {
        symbol,
        interval: '1h',
        limit: 50
      });

      // Calculate technical indicators (simplified)
      const prices = klines.map((k: any) => parseFloat(k[4]));
      const rsi = this.calculateRSI(prices);
      const macd = this.calculateMACD(prices);
      const bollinger = this.calculateBollingerBands(prices);

      return {
        symbol,
        price: parseFloat(ticker.lastPrice),
        timestamp: Date.now(),
        volume: parseFloat(ticker.volume),
        rsi,
        macd,
        bollinger,
      };
    } catch (error) {
      console.error('Failed to fetch market data:', error);
      return null;
    }
  }

  async placeTrade(symbol: string, side: 'BUY' | 'SELL', quantity: number, price?: number): Promise<Trade | null> {
    try {
      const params: any = {
        symbol,
        side,
        type: price ? 'LIMIT' : 'MARKET',
        quantity: quantity.toString(),
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
        quantity,
        price: price || parseFloat(result.fills?.[0]?.price || '0'),
        status: result.status === 'FILLED' ? 'FILLED' : 'PENDING',
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Failed to place trade:', error);
      return null;
    }
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