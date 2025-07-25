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
  status: 'PENDING' | 'FILLED' | 'CANCELLED';
  timestamp: number;

  // yeni alanlar
  closeTimestamp?: number;
  exitPrice?: number;
  profit?: number;
  duration?: number;  // ⏱️ Süre (saniye cinsinden)
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
  fastLearningMode: boolean;
  adaptiveStrategyEnabled: boolean;
  maxRiskPerTrade: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  maxPositions: number;
  maxSymbolsToTrade: number; // eklenecek alan
  enableNewsTrading: boolean;
  enableTechnicalAnalysis: boolean;
  confidenceThreshold: number; // Unified confidence threshold for both AI and adaptive strategy
  apiKey?: string;
  apiSecret?: string;
  llama3Url?: string;
  llama3Model?: string;
  // Multi-Strategy Settings
  enableMultiStrategy: boolean;
  strategies: {
    rsiMacd: { enabled: boolean; weight: number };
    newsSentiment: { enabled: boolean; weight: number };
    volumeSpike: { enabled: boolean; weight: number };
  };
  // Auto-Rebalance Settings
  enableAutoRebalance: boolean;
  scaleInThreshold: number; // Decimal format: 0.03 = 3%
  scaleOutThreshold: number; // Decimal format: -0.01 = -1%
  enableTrailingStop: boolean;
  trailingStopPercent: number; // Decimal format: 0.01 = 1%
  // Simulation Replay Settings
  enableSimulationReplay: boolean;
  // Aggressive mode settings
  enableAggressiveMode: boolean;
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
  ema12: number;
  ema26: number;
  emaTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  volumeRatio: number;
  bollinger: {
    upper: number;
    middle: number;
    lower: number;
  };
}

export interface TradingSignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  sentimentScore: number;
  marketData: MarketData;
  newsContext: NewsItem[];
}

export interface StrategyResult {
  strategyName: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  weight: number;
}

export interface StrategyPerformance {
  name: string;
  totalTrades: number;
  winningTrades: number;
  totalPnL: number;
  winRate: number;
  avgTradeDuration: number;
  lastUsed: number;
}

export interface PositionScaling {
  positionId: string;
  originalSize: number;
  currentSize: number;
  scaleInCount: number;
  scaleOutCount: number;
  trailingStopPrice?: number;
  highWaterMark: number;
}

export interface SimulationReplay {
  date: string;
  marketData: MarketData[];
  newsData: NewsItem[];
  strategies: StrategyPerformance[];
  totalPnL: number;
  totalTrades: number;
}