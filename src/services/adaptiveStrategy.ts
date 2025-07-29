import { MarketData, Position, Trade } from '../types/trading';

export interface MarketCondition {
  type: 'TRENDING_UP' | 'TRENDING_DOWN' | 'SIDEWAYS' | 'UNCERTAIN' | 'HIGH_VOLATILITY';
  marketTrend: 'UP' | 'DOWN' | 'SIDEWAYS' | 'UNKNOWN';
  confidence: number;
  volatility: number;
  volume: number;
  timeOfDay: 'ASIAN' | 'EUROPEAN' | 'AMERICAN' | 'OVERNIGHT';
}

export interface TradingStrategy {
  name: string;
  description: string;
  entryThreshold: number;
  exitThreshold: number;
  riskMultiplier: number;
  maxPositions: number;
  preferredTimeframes: string[];
}

export interface TradePattern {
  id: string;
  conditions: {
    rsi: { min: number; max: number };
    macd: { min: number; max: number };
    volumeRatio: { min: number; max: number };
    emaTrend: string;
    bollingerPosition: string;
    timeOfDay: string;
    // NEW
    marketTrend?: 'UP' | 'DOWN' | 'SIDEWAYS';
  };
  outcome: {
    winRate: number;
    avgProfit: number;
    avgDuration: number;
    tradeCount: number;
  };
  lastUsed: number;
  profitability: number;
}

export interface RiskMetrics {
  recentWinRate: number;
  consecutiveLosses: number;
  currentRiskLevel: number;
  lastCooldownEnd: number;
  totalTrades: number;
  profitableTrades: number;
}

class AdaptiveStrategyService {
  private strategies: Map<string, TradingStrategy> = new Map();
  private learnedPatterns: TradePattern[] = [];
  private useMongoDB: boolean = true;
  private riskMetrics: RiskMetrics = {
    recentWinRate: 0.5,
    consecutiveLosses: 0,
    currentRiskLevel: 1.0,
    lastCooldownEnd: 0,
    totalTrades: 0,
    profitableTrades: 0
  };
  private recentTrades: Array<{ outcome: 'WIN' | 'LOSS'; timestamp: number; profit: number }> = [];
  private tradeReflections: Array<{ timestamp: number; reflection: string; trade: any }> = [];

  constructor() {
    this.initializeStrategies();
    this.loadStoredData();
  }

  private initializeStrategies() {
    this.strategies.set('TREND_FOLLOWING', {
      name: 'Trend Following',
      description: 'Follow strong trends with momentum',
      entryThreshold: 0.7,
      exitThreshold: 0.3,
      riskMultiplier: 1.2,
      maxPositions: 3,
      preferredTimeframes: ['1h', '4h']
    });

    this.strategies.set('MEAN_REVERSION', {
      name: 'Mean Reversion',
      description: 'Trade oversold/overbought conditions',
      entryThreshold: 0.6,
      exitThreshold: 0.4,
      riskMultiplier: 0.8,
      maxPositions: 5,
      preferredTimeframes: ['15m', '1h']
    });

    this.strategies.set('SCALPING', {
      name: 'Scalping',
      description: 'Quick small profits in sideways markets',
      entryThreshold: 0.5,
      exitThreshold: 0.3,
      riskMultiplier: 0.6,
      maxPositions: 8,
      preferredTimeframes: ['1m', '5m']
    });

    this.strategies.set('CONSERVATIVE', {
      name: 'Conservative',
      description: 'Low risk during uncertain conditions',
      entryThreshold: 0.8,
      exitThreshold: 0.2,
      riskMultiplier: 0.4,
      maxPositions: 2,
      preferredTimeframes: ['4h', '1d']
    });
  }

  analyzeMarketCondition(marketData: MarketData): MarketCondition {
  const { rsi, macd, volumeRatio, emaTrend, bollinger } = marketData;

  // Volatilite hesapla
  const volatility = bollinger
    ? (bollinger.upper - bollinger.lower) / bollinger.middle
    : 0.02;

  // Zaman dilimi belirle
  const hour = new Date().getUTCHours();
  const timeOfDay =
    hour < 6 ? 'ASIAN'
    : hour < 14 ? 'EUROPEAN'
    : hour < 22 ? 'AMERICAN'
    : 'OVERNIGHT';

  // Puan bazlı analiz
  let scoreTrendingUp = 0;
  let scoreTrendingDown = 0;
  let scoreSideways = 0;
  let confidence = 0.5;

  if (emaTrend === 'BULLISH') scoreTrendingUp += 1;
  if (emaTrend === 'BEARISH') scoreTrendingDown += 1;

  if (rsi > 60) scoreTrendingUp += 1;
  else if (rsi < 40) scoreTrendingDown += 1;
  else scoreSideways += 1;

  if (macd > 0.001) scoreTrendingUp += 1;
  else if (macd < -0.001) scoreTrendingDown += 1;
  else scoreSideways += 1;

  // Volume yorumlama
  if (volumeRatio > 1.5) {
    scoreTrendingUp += 1;
  } else if (volumeRatio < 0.8) {
    scoreTrendingDown += 1;
  } else {
    scoreSideways += 0.5;
  }

  if (volatility < 0.02) scoreSideways += 1;
  else if (volatility > 0.05) confidence += 0.2;

  // En yüksek skora göre trend belirleme
  let type: MarketCondition['type'] = 'UNCERTAIN';
  const maxScore = Math.max(scoreTrendingUp, scoreTrendingDown, scoreSideways);

  if (maxScore >= 2.5) {
    if (scoreTrendingUp === maxScore) type = 'TRENDING_UP';
    else if (scoreTrendingDown === maxScore) type = 'TRENDING_DOWN';
    else if (scoreSideways === maxScore) type = 'SIDEWAYS';

    confidence = 0.7 + (maxScore / 5) * 0.2;
  } else if (volatility > 0.05) {
    type = 'HIGH_VOLATILITY';
    confidence = 0.8;
  } else {
    type = 'UNCERTAIN';
    confidence = 0.3;
  }

  const marketTrend: MarketCondition['marketTrend'] =
    type === 'TRENDING_UP' ? 'UP' :
    type === 'TRENDING_DOWN' ? 'DOWN' :
    type === 'SIDEWAYS' ? 'SIDEWAYS' :
    'UNKNOWN';

  return {
    type,
    marketTrend,
    confidence: Math.min(confidence, 0.95),
    volatility,
    volume: volumeRatio,
    timeOfDay
  };
}


  selectOptimalStrategy(
  marketCondition: MarketCondition,
  leverage: number = 1
): TradingStrategy {
    const { type, timeOfDay } = marketCondition;
    
    // Time-based risk adjustment
    const isHighVolatilityTime = timeOfDay === 'AMERICAN' || timeOfDay === 'EUROPEAN';
    const isLowLiquidityTime = timeOfDay === 'OVERNIGHT';

    let strategyKey: string;

    switch (type) {
      case 'TRENDING_UP':
      case 'TRENDING_DOWN':
        strategyKey = 'TREND_FOLLOWING';
        break;
      case 'SIDEWAYS':
        strategyKey = isHighVolatilityTime ? 'SCALPING' : 'MEAN_REVERSION';
        break;
      case 'HIGH_VOLATILITY':
        strategyKey = 'CONSERVATIVE';
        break;
      case 'UNCERTAIN':
      default:
        strategyKey = isLowLiquidityTime ? 'CONSERVATIVE' : 'MEAN_REVERSION';
        break;
    }

    const strategy = this.strategies.get(strategyKey)!;
    
    // Apply risk adjustments
    const adjustedStrategy = { ...strategy };
    
    if (isHighVolatilityTime) {
      adjustedStrategy.riskMultiplier *= 0.8;
      adjustedStrategy.entryThreshold += 0.1;
    }
    
    if (isLowLiquidityTime) {
      adjustedStrategy.riskMultiplier *= 0.6;
      adjustedStrategy.entryThreshold += 0.2;
    }

    // Apply learned risk adjustments
    adjustedStrategy.riskMultiplier *= this.riskMetrics.currentRiskLevel;
     // Kaldıraç arttıkça risk çarpanını azalt
  if (leverage > 1) {
    const leverageReduction = leverage > 1
  ? Math.max(0.5, 1 / Math.log2(leverage + 1))
  : 1.0;

adjustedStrategy.riskMultiplier *= leverageReduction;
  }
    return adjustedStrategy;
  }

  calculateSignalConfidence(
  marketData: MarketData,
  marketCondition: MarketCondition,
  confidenceThreshold: number = 0.8
): number {
  let score = 0;
  let weight = 0;

  // RSI Normalize: ideal aralık 60–70
  if (marketData.rsi !== undefined) {
    const rsiScore = Math.max(0, Math.min((marketData.rsi - 50) / 20, 1)); // 50–70 → 0–1
    score += rsiScore * 1.2;
    weight += 1.2;
  }

  // MACD Normalize: tanh ile aşırı değerleri bastır
  if (marketData.macd !== undefined) {
    const macdScore = Math.tanh(marketData.macd * 10); // genelde 0.005–0.02 civarında
    score += macdScore * 1.5;
    weight += 1.5;
  }

  // EMA Trend
  if (marketData.emaTrend === 'BULLISH') {
    score += 1.0;
    weight += 1.0;
  } else if (marketData.emaTrend === 'BEARISH') {
    score -= 1.0;
    weight += 1.0;
  }

  // VolumeRatio normalize
  if (marketData.volumeRatio !== undefined) {
    const volScore = Math.min(marketData.volumeRatio / 2, 1); // 0–2 → 0–1
    score += volScore * 0.8;
    weight += 0.8;
  }

  // Bollinger pozisyon
  const bollPos = this.getBollingerPosition(marketData);
  if (bollPos === 'UPPER') {
    score -= 0.5;
    weight += 0.5;
  } else if (bollPos === 'LOWER') {
    score += 0.5;
    weight += 0.5;
  }

  // Pattern bonus
  const patternBonus = this.getPatternMatchBonus(marketData);
  score += patternBonus;
  weight += patternBonus > 0 ? 0.6 : 0;

  // Normalize confidence
  let confidence = weight > 0 ? Math.max(0, Math.min(score / weight, 1)) : 0.5;

  // Market condition etkisi
  confidence *= marketCondition.confidence;

  return Number(confidence.toFixed(3));
}

  private getPatternMatchBonus(marketData: MarketData): number {
    const hour = new Date().getUTCHours();
    let timeOfDay: string;
    if (hour >= 0 && hour < 6) timeOfDay = 'ASIAN';
    else if (hour >= 6 && hour < 14) timeOfDay = 'EUROPEAN';
    else if (hour >= 14 && hour < 22) timeOfDay = 'AMERICAN';
    else timeOfDay = 'OVERNIGHT';

    const bollingerPosition = this.getBollingerPosition(marketData);

    for (const pattern of this.learnedPatterns) {
      if (this.matchesPattern(marketData, pattern, timeOfDay, bollingerPosition)) {
        // Higher bonus for more profitable and recent patterns
        const recencyFactor = Math.max(0.1, 1 - (Date.now() - pattern.lastUsed) / (7 * 24 * 60 * 60 * 1000));
        return pattern.profitability * 0.2 * recencyFactor;
      }
    }

    return 0;
  }

  private getBollingerPosition(marketData: MarketData): string {
    if (!marketData.bollinger) return 'MIDDLE';
    
    const { price, bollinger } = marketData;
    if (price > bollinger.upper * 0.99) return 'UPPER';
    if (price < bollinger.lower * 1.01) return 'LOWER';
    return 'MIDDLE';
  }

  private matchesPattern(marketData: MarketData, pattern: TradePattern, timeOfDay: string, bollingerPosition: string): boolean {
    const { conditions } = pattern;
    
    return (
      marketData.rsi >= conditions.rsi.min && marketData.rsi <= conditions.rsi.max &&
      marketData.macd >= conditions.macd.min && marketData.macd <= conditions.macd.max &&
      marketData.volumeRatio >= conditions.volumeRatio.min && marketData.volumeRatio <= conditions.volumeRatio.max &&
      marketData.emaTrend === conditions.emaTrend &&
      bollingerPosition === conditions.bollingerPosition &&
      timeOfDay === conditions.timeOfDay
    );
  }

  shouldTrade(
  marketData: MarketData,
  confidenceThreshold: number = 0.8,
  positionType: 'SPOT' | 'LONG' | 'SHORT' = 'SPOT',
  leverage: number = 1
): { shouldTrade: boolean; reason: string; confidence: number; strategy: TradingStrategy } {
    // Check cooldown
    if (Date.now() < this.riskMetrics.lastCooldownEnd) {
      return {
        shouldTrade: false,
        reason: 'In cooldown period after consecutive losses',
        confidence: 0,
        strategy: this.strategies.get('CONSERVATIVE')!
      };
    }

    const marketCondition = this.analyzeMarketCondition(marketData);
    const strategy = this.selectOptimalStrategy(marketCondition);
    const confidence = this.calculateSignalConfidence(marketData, marketCondition, confidenceThreshold);
     // Kaldıraçlı (futures) işlemlerde minimum güven eşiğini yükselt
  if (positionType !== 'SPOT' && confidence < 0.6) {
    return {
      shouldTrade: false,
      reason: 'Too risky with leverage',
      confidence,
      strategy
    };
  }
    // Time-based restrictions
    if (marketCondition.timeOfDay === 'OVERNIGHT' && marketCondition.type === 'UNCERTAIN') {
      return {
        shouldTrade: false,
        reason: 'Low liquidity overnight period with uncertain conditions',
        confidence,
        strategy
      };
    }

    // Confidence threshold check
    if (confidence < confidenceThreshold) {
      return {
        shouldTrade: false,
        reason: `Confidence ${confidence.toFixed(2)} below adaptive threshold ${confidenceThreshold.toFixed(2)}`,
        confidence,
        strategy
      };
    }

    return {
      shouldTrade: true,
      reason: `${strategy.name} strategy selected for ${marketCondition.type} market`,
      confidence,
      strategy
    };
  }

  recordTradeOutcome(trade: Trade, position: Position, marketData: MarketData) {
  const isWin = position.pnl > 0;
  const outcome = isWin ? 'WIN' : 'LOSS';
  
  // Update recent trades
  this.recentTrades.push({
    outcome,
    timestamp: Date.now(),
    profit: position.pnl
  });

  // Keep only last 20 trades
  if (this.recentTrades.length > 20) {
    this.recentTrades = this.recentTrades.slice(-20);
  }

  // Update risk metrics
  this.riskMetrics.totalTrades++;
  if (isWin) {
    this.riskMetrics.profitableTrades++;
    this.riskMetrics.consecutiveLosses = 0;
  } else {
    this.riskMetrics.consecutiveLosses++;
  }

  // Calculate recent win rate
  const recentWins = this.recentTrades.filter(t => t.outcome === 'WIN').length;
  this.riskMetrics.recentWinRate = this.recentTrades.length > 0
    ? recentWins / this.recentTrades.length
    : 0.5;

  // Risk level adjustment
  if (this.riskMetrics.recentWinRate < 0.4) {
    this.riskMetrics.currentRiskLevel = Math.max(0.3, this.riskMetrics.currentRiskLevel * 0.8);
    console.log(`🔻 Risk reduced to ${(this.riskMetrics.currentRiskLevel * 100).toFixed(0)}% due to low win rate`);
  } else if (this.riskMetrics.recentWinRate > 0.6) {
    this.riskMetrics.currentRiskLevel = Math.min(1.5, this.riskMetrics.currentRiskLevel * 1.1);
    console.log(`🔺 Risk increased to ${(this.riskMetrics.currentRiskLevel * 100).toFixed(0)}% due to high win rate`);
  }

  // Cooldown
  if (this.riskMetrics.consecutiveLosses >= 5) {
    this.riskMetrics.lastCooldownEnd = Date.now() + (60 * 60 * 1000); // 1 hour
    console.log(`🛑 Trading paused for 1 hour after 5 consecutive losses`);
  }

  // Learn from profitable or losing trades
  if (isWin && position.pnlPercent > 1) {
    this.learnFromProfitableTrade(trade, position, marketData);
  } else if (!isWin && position.pnlPercent < -1) {
    this.learnFromLosingTrade(trade, position, marketData); // 👈 ekleyeceğimiz fonksiyon
  }

  // Reflection
  this.generateTradeReflection(trade, position, marketData, outcome);

  this.saveStoredData();
}
private learnFromLosingTrade(trade: Trade, position: Position, marketData: MarketData) {
  const hour = new Date(trade.timestamp).getUTCHours();
  let timeOfDay: string;
  if (hour >= 0 && hour < 6) timeOfDay = 'ASIAN';
  else if (hour >= 6 && hour < 14) timeOfDay = 'EUROPEAN';
  else if (hour >= 14 && hour < 22) timeOfDay = 'AMERICAN';
  else timeOfDay = 'OVERNIGHT';

  const bollingerPosition = this.getBollingerPosition(marketData);
  const duration = Date.now() - trade.timestamp;

  const pattern: TradePattern = {
    id: `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    conditions: {
      rsi: { min: marketData.rsi - 5, max: marketData.rsi + 5 },
      macd: { min: marketData.macd - 0.002, max: marketData.macd + 0.002 },
      volumeRatio: { min: marketData.volumeRatio - 0.3, max: marketData.volumeRatio + 0.3 },
      emaTrend: marketData.emaTrend,
      bollingerPosition,
      timeOfDay
    },
    outcome: {
      winRate: 0.0,
      avgProfit: position.pnlPercent, // negatif değer
      avgDuration: duration,
      tradeCount: 1
    },
    lastUsed: Date.now(),
    profitability: position.pnlPercent / 100
  };

  // Mevcut benzer bir kayıp örüntüsü var mı?
  const existingPattern = this.learnedPatterns.find(p => 
    this.patternsAreSimilar(p, pattern) && p.outcome.winRate <= 0.3
  );

  if (existingPattern) {
    existingPattern.outcome.tradeCount++;
    existingPattern.outcome.avgProfit =
      ((existingPattern.outcome.avgProfit * (existingPattern.outcome.tradeCount - 1)) + position.pnlPercent)
      / existingPattern.outcome.tradeCount;

    existingPattern.outcome.avgDuration =
      ((existingPattern.outcome.avgDuration * (existingPattern.outcome.tradeCount - 1)) + duration)
      / existingPattern.outcome.tradeCount;

    existingPattern.lastUsed = Date.now();
    existingPattern.profitability = existingPattern.outcome.avgProfit / 100;
  } else {
    this.learnedPatterns.push(pattern);
    console.log(`⚠️ New losing pattern recorded: ${trade.symbol} ${trade.side} (${position.pnlPercent.toFixed(2)}%)`);
  }

  // En fazla 50 örüntü sakla
  this.learnedPatterns.sort((a, b) => b.profitability - a.profitability);
  if (this.learnedPatterns.length > 50) {
    this.learnedPatterns = this.learnedPatterns.slice(0, 50);
  }
}
  private learnFromProfitableTrade(trade: Trade, position: Position, marketData: MarketData) {
  const hour = new Date(trade.timestamp).getUTCHours();
  const timeOfDay = hour < 6 ? 'ASIAN' :
                    hour < 14 ? 'EUROPEAN' :
                    hour < 22 ? 'AMERICAN' : 'OVERNIGHT';

  const bollingerPosition = this.getBollingerPosition(marketData);
  const duration = Date.now() - trade.timestamp;

  // Güncel market koşulunu al
  const marketCondition = this.analyzeMarketCondition(marketData);

  const pattern: TradePattern = {
    id: `pattern_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    conditions: {
      rsi: {
        min: Math.max(0, marketData.rsi - 5),
        max: Math.min(100, marketData.rsi + 5)
      },
      macd: {
        min: marketData.macd - 0.002,
        max: marketData.macd + 0.002
      },
      volumeRatio: {
        min: Math.max(0, marketData.volumeRatio - 0.3),
        max: marketData.volumeRatio + 0.3
      },
      emaTrend: marketData.emaTrend,
      bollingerPosition,
      timeOfDay,
      marketTrend: marketCondition.marketTrend
    },
    outcome: {
      winRate: 1.0,
      avgProfit: position.pnlPercent,
      avgDuration: duration,
      tradeCount: 1
    },
    lastUsed: Date.now(),
    profitability: position.pnlPercent / 100
  };

  const existingPattern = this.learnedPatterns.find(p =>
    this.patternsAreSimilar(p, pattern)
  );

  if (existingPattern) {
    const prevCount = existingPattern.outcome.tradeCount;

    existingPattern.outcome.tradeCount++;
    existingPattern.outcome.avgProfit =
      (existingPattern.outcome.avgProfit * prevCount + position.pnlPercent)
      / (prevCount + 1);

    existingPattern.outcome.avgDuration =
      (existingPattern.outcome.avgDuration * prevCount + duration)
      / (prevCount + 1);

    existingPattern.lastUsed = Date.now();
    existingPattern.profitability = existingPattern.outcome.avgProfit / 100;
  } else {
    this.learnedPatterns.push(pattern);
    console.log(`🧠 New profitable pattern learned: ${trade.symbol} ${trade.side} (+${position.pnlPercent.toFixed(2)}%)`);
  }

  // Keep only top 50 patterns
  this.learnedPatterns.sort((a, b) => b.profitability - a.profitability);
  this.learnedPatterns = this.learnedPatterns.slice(0, 50);
}

  private patternsAreSimilar(p1: TradePattern, p2: TradePattern): boolean {
  return (
    Math.abs(p1.conditions.rsi.min - p2.conditions.rsi.min) <= 10 &&
    Math.abs(p1.conditions.rsi.max - p2.conditions.rsi.max) <= 10 &&
    Math.abs(p1.conditions.macd.min - p2.conditions.macd.min) <= 0.003 &&
    Math.abs(p1.conditions.macd.max - p2.conditions.macd.max) <= 0.003 &&
    Math.abs(p1.conditions.volumeRatio.min - p2.conditions.volumeRatio.min) <= 0.4 &&
    Math.abs(p1.conditions.volumeRatio.max - p2.conditions.volumeRatio.max) <= 0.4 &&
    p1.conditions.emaTrend === p2.conditions.emaTrend &&
    p1.conditions.bollingerPosition === p2.conditions.bollingerPosition &&
    p1.conditions.timeOfDay === p2.conditions.timeOfDay &&
    p1.conditions.marketTrend === p2.conditions.marketTrend
  );
}


  private generateTradeReflection(
  trade: Trade,
  position: Position,
  marketData: MarketData,
  outcome: 'WIN' | 'LOSS'
) {
  const duration = Date.now() - trade.timestamp;

  const reflection = {
    timestamp: Date.now(),
    trade: {
      symbol: trade.symbol,
      side: trade.side,
      pnl: position.pnl,
      pnlPercent: position.pnlPercent,
      duration
    },
    reflection: this.createReflectionText(trade, position, marketData, outcome, duration)
  };

  this.tradeReflections.push(reflection);

  // Keep only last 10 reflections
  if (this.tradeReflections.length > 10) {
    this.tradeReflections.splice(0, this.tradeReflections.length - 10);
  }

  console.log(`💭 Trade Reflection: ${reflection.reflection}`);
}

  private createReflectionText(
  trade: Trade,
  position: Position,
  marketData: MarketData,
  outcome: 'WIN' | 'LOSS',
  durationMs: number
): string {
  const { rsi, macd, emaTrend, volumeRatio } = marketData;
  const durationMin = durationMs / 60000;

  if (outcome === 'WIN') {
    return `✅ ${trade.symbol} ${trade.side} worked (+${position.pnlPercent.toFixed(2)}% in ${durationMin.toFixed(0)}m). RSI ${rsi.toFixed(1)}, MACD ${macd.toFixed(4)}, ${emaTrend} trend, volume ${volumeRatio.toFixed(1)}x. Worth remembering.`;
  } else {
    const reasons: string[] = [];

    if (rsi > 70 && trade.side === 'BUY') reasons.push('Bought at overbought RSI');
    if (rsi < 30 && trade.side === 'SELL') reasons.push('Sold at oversold RSI');
    if (volumeRatio < 1) reasons.push('Weak volume');
    if (emaTrend === 'NEUTRAL') reasons.push('Unclear trend');

    if (reasons.length === 0) reasons.push('Market moved against position');

    return `❌ ${trade.symbol} ${trade.side} failed (${position.pnlPercent.toFixed(2)}% in ${durationMin.toFixed(0)}m). ${reasons.join(', ')}. RSI ${rsi.toFixed(1)}, MACD ${macd.toFixed(4)}. Avoid similar setups.`;
  }
}

  getMultiExitLevels(
  entryPrice: number,
  side: 'LONG' | 'SHORT',
  marketCondition?: MarketCondition,
  positionType: 'SPOT' | 'LONG' | 'SHORT' = 'SPOT',
  leverage: number = 1
): { tp1: number; tp2: number; tp3: number; sl: number } {
  // Base levels (default)
  let tp1Pct = 0.01;
  let tp2Pct = 0.025;
  let tp3Pct = 0.05;
  let slPct = 0.015;

  // Adjust based on market condition
  if (marketCondition) {
    switch (marketCondition.type) {
      case 'HIGH_VOLATILITY':
        tp1Pct = 0.015;
        tp2Pct = 0.035;
        tp3Pct = 0.07;
        slPct = 0.025;
        break;
      case 'SIDEWAYS':
        tp1Pct = 0.008;
        tp2Pct = 0.015;
        tp3Pct = 0.025;
        slPct = 0.01;
        break;
      case 'TRENDING_UP':
      case 'TRENDING_DOWN':
        tp1Pct = 0.012;
        tp2Pct = 0.03;
        tp3Pct = 0.08;
        slPct = 0.012;
        break;
      case 'UNCERTAIN':
        tp1Pct = 0.008;
        tp2Pct = 0.018;
        tp3Pct = 0.035;
        slPct = 0.012;
        break;
    }

    // Adjust for volatility (capped)
    const volatilityMultiplier = Math.max(0.7, Math.min(1.3, marketCondition.volatility * 25));
    tp1Pct *= volatilityMultiplier;
    tp2Pct *= volatilityMultiplier;
    tp3Pct *= volatilityMultiplier;
    slPct  *= volatilityMultiplier;
  }

  // Kaldıraçlı işlemlerde TP ve SL daraltma
  if (positionType !== 'SPOT') {
    const tpTightness = Math.max(0.5, 1 - 0.01 * leverage); // örn: 20x -> 0.8
    const slTightness = Math.max(0.5, 1 - 0.03 * leverage); // örn: 20x -> 0.4

    tp1Pct *= tpTightness;
    tp2Pct *= tpTightness;
    tp3Pct *= tpTightness;
    slPct  *= slTightness;
  }

  // TP seviyeleri (LONG için yukarı, SHORT için aşağı)
  const multiplier = side === 'LONG' ? 1 : -1;

  const tp1 = entryPrice * (1 + tp1Pct * multiplier);
  const tp2 = entryPrice * (1 + tp2Pct * multiplier);
  const tp3 = entryPrice * (1 + tp3Pct * multiplier);

  // SL yönü tam tersi olmalı
  const sl = side === 'LONG'
    ? entryPrice * (1 - slPct)
    : entryPrice * (1 + slPct);

  return { tp1, tp2, tp3, sl };
}

  getRiskMetrics(): RiskMetrics {
    return { ...this.riskMetrics };
  }

  getLearnedPatterns(): TradePattern[] {
    return [...this.learnedPatterns];
  }

  getRecentReflections(): Array<{ timestamp: number; reflection: string; trade: any }> {
    return [...this.tradeReflections];
  }

  private saveStoredData() {
    if (this.useMongoDB) return this.saveAdaptiveDataToMongo();
    try {
      localStorage.setItem('adaptive-strategy-patterns', JSON.stringify(this.learnedPatterns));
      localStorage.setItem('adaptive-strategy-risk', JSON.stringify(this.riskMetrics));
      localStorage.setItem('adaptive-strategy-trades', JSON.stringify(this.recentTrades));
      localStorage.setItem('adaptive-strategy-reflections', JSON.stringify(this.tradeReflections));
    } catch (error) {
      console.error('Failed to save adaptive strategy data:', error);
    }
  }

  private loadStoredData() {
    if (this.useMongoDB) return this.loadAdaptiveDataFromMongo();
    try {
      const patterns = localStorage.getItem('adaptive-strategy-patterns');
      if (patterns) this.learnedPatterns = JSON.parse(patterns);

      const risk = localStorage.getItem('adaptive-strategy-risk');
      if (risk) this.riskMetrics = { ...this.riskMetrics, ...JSON.parse(risk) };

      const trades = localStorage.getItem('adaptive-strategy-trades');
      if (trades) this.recentTrades = JSON.parse(trades);

      const reflections = localStorage.getItem('adaptive-strategy-reflections');
      if (reflections) this.tradeReflections = JSON.parse(reflections);

      console.log(`🧠 Loaded ${this.learnedPatterns.length} learned patterns, win rate: ${(this.riskMetrics.recentWinRate * 100).toFixed(1)}%`);
    } catch (error) {
      console.error('Failed to load adaptive strategy data:', error);
    }
  }
  private async saveAdaptiveDataToMongo() {
  try {
    const payload = {
      patterns: this.learnedPatterns,
      riskMetrics: this.riskMetrics,
      recentTrades: this.recentTrades,
      tradeReflections: this.tradeReflections
    };

    const response = await fetch('http://localhost:4000/api/adaptive/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error('API failed');
    console.log(`✅ Adaptive strateji MongoDB'ye kaydedildi.`);
  } catch (error) {
    console.error('❌ Mongo adaptive save hatası:', error);
  }
} 

private async loadAdaptiveDataFromMongo() {
  try {
    const response = await fetch('http://localhost:4000/api/adaptive/get');
    const data = await response.json();

    this.learnedPatterns = data.patterns || [];
    this.riskMetrics = data.riskMetrics || {};
    this.recentTrades = data.recentTrades || [];
    this.tradeReflections = data.tradeReflections || [];

    console.log(`📦 Adaptive strateji MongoDB'den yüklendi.`);
  } catch (error) {
    console.error('❌ Mongo adaptive load hatası:', error);
  }
}
  downloadAdaptiveDataAsJson() {
  try {
    const data = {
      patterns: this.learnedPatterns,
      riskMetrics: this.riskMetrics,
      recentTrades: this.recentTrades,
      tradeReflections: this.tradeReflections,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'adaptive_data_backup.json';
    a.click();

    URL.revokeObjectURL(url);
    console.log('✅ Adaptive strategy yedeği indirildi.');
  } catch (error) {
    console.error('❌ Adaptive verisi indirme hatası:', error);
  }
}

  resetLearning() {
    logService.learning('adaptiveStrategyReset', {}, 'Resetting adaptive strategy learning');
    
    // Reset learned patterns
    this.learnedPatterns = [];
    
    // Reset risk metrics to defaults completely
    this.riskMetrics = {
      recentWinRate: 0.5,
      consecutiveLosses: 0,
      currentRiskLevel: 1.0,
      lastCooldownEnd: 0,
      totalTrades: 0,
      profitableTrades: 0
    };
    
    // Clear all trade memory for fresh learning
    this.recentTrades = [];
    
    // Clear trade reflections
    this.tradeReflections = [];
    
    // Save reset state
    this.saveStoredData();
    
    logService.learning('adaptiveStrategyResetComplete', {}, 'Adaptive strategy learning reset complete');
  }
}

// Import logService at the top of the file
import { logService } from './logService';

export const adaptiveStrategy = new AdaptiveStrategyService();
