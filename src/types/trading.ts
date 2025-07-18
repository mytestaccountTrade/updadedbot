export interface TradingPair {
  symbol: string;
  price: number;
  change24h: number;
  volume: number;
  high24h: number;
  low24h: number;
}

export interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  timestamp: number;
}

export interface Trade {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP_LOSS';
  quantity: number;
  price: number;
  status: 'FILLED' | 'PENDING' | 'CANCELLED';
  timestamp: number;
  profit?: number;
}

export interface Portfolio {
  totalValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  availableBalance: number;
  positions: Position[];
  trades: Trade[];
}

export interface NewsItem {
  id: string;
  title: string;
  content: string;
  source: string;
  timestamp: number;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  impact: number;
  coins: string[];
}

export interface Language {
  code: 'en' | 'tr';
  name: string;
}
export interface BotConfig {
  mode: 'SIMULATION' | 'REAL';
  simulationBalance: number;
  maxRiskPerTrade: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  maxPositions: number;
  enableNewsTrading: boolean;
  enableTechnicalAnalysis: boolean;
  apiKey?: string;
  apiSecret?: string;
  llama3Url?: string;
  llama3Model?: string;
}

export interface AppSettings {
  language: 'en' | 'tr';
}
export interface MarketData {
  symbol: string;
  price: number;
  timestamp: number;
  volume: number;
  rsi: number;
  macd: number;
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
  };
}