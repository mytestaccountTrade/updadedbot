import { MarketData, Position, Trade } from '../types/trading';

export interface MarketCondition {
  type: 'TRENDING_UP' | 'TRENDING_DOWN' | 'SIDEWAYS' | 'UNCERTAIN' | 'HIGH_VOLATILITY';
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
    const { rsi, macd, volumeRatio, emaTrend, bollinger, price } = marketData;
    
    // Calculate volatility from Bollinger Bands
    const volatility = bollinger ? (bollinger.upper - bollinger.lower) / bollinger.middle : 0.02;
    
    // Determine time of day
    const hour = new Date().getUTCHours();
    let timeOfDay: MarketCondition['timeOfDay'];
    if (hour >= 0 && hour < 6) timeOfDay = 'ASIAN';
    else if (hour >= 6 && hour < 14) timeOfDay = 'EUROPEAN';
    else if (hour >= 14 && hour < 22) timeOfDay = 'AMERICAN';
    else timeOfDay = 'OVERNIGHT';

    // Analyze market condition
    let type: MarketCondition['type'];
    let confidence = 0.5;

    // High volatility check
    if (volatility > 0.05) {
      type = 'HIGH_VOLATILITY';
      confidence = 0.8;
    }
    // Trending conditions
    else if (emaTrend === 'BULLISH' && rsi > 50 && macd > 0 && volumeRatio > 1.2) {
      type = 'TRENDING_UP';
      confidence = 0.8;
    }
    else if (emaTrend === 'BEARISH' && rsi < 50 && macd < 0 && volumeRatio > 1.2) {
      type = 'TRENDING_DOWN';
      confidence = 0.8;
    }
    // Sideways market
    else if (Math.abs(macd) < 0.001 && rsi > 40 && rsi < 60 && volatility < 0.02) {
      type = 'SIDEWAYS';
      confidence = 0.7;
    }
    // Uncertain conditions
    else {
      type = 'UNCERTAIN';
      confidence = 0.3;
    }

    return { type, confidence, volatility, volume: volumeRatio, timeOfDay };
  }

  selectOptimalStrategy(marketCondition: MarketCondition): TradingStrategy {
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

    return adjustedStrategy;
  }

  calculateSignalConfidence(marketData: MarketData, marketCondition: MarketCondition, confidenceThreshold: number = 0.8): number {
    const { rsi, macd, volumeRatio, emaTrend } = marketData;
    let confidence = 0.5;
    let indicatorCount = 0;
    let agreementScore = 0;

    // RSI analysis
    if (rsi < 30) {
      agreementScore += 1; // Oversold - bullish
      indicatorCount++;
    } else if (rsi > 70) {
      agreementScore -= 1; // Overbought - bearish
      indicatorCount++;
    }

    // MACD analysis
    if (macd > 0.001) {
      agreementScore += 1; // Bullish
      indicatorCount++;
    } else if (macd < -0.001) {
      agreementScore -= 1; // Bearish
      indicatorCount++;
    }

    // EMA trend analysis
    if (emaTrend === 'BULLISH') {
      agreementScore += 1;
      indicatorCount++;
    } else if (emaTrend === 'BEARISH') {
      agreementScore -= 1;
      indicatorCount++;
    }

    // Volume confirmation
    if (volumeRatio > 1.5) {
      agreementScore += 0.5; // High volume confirms signal
      indicatorCount++;
    } else if (volumeRatio < 0.8) {
      agreementScore -= 0.5; // Low volume weakens signal
      indicatorCount++;
    }

    // Calculate final confidence
    if (indicatorCount > 0) {
      const agreement = Math.abs(agreementScore) / indicatorCount;
      confidence = Math.min(0.95, 0.3 + (agreement * 0.6));
      
      // Reduce confidence if indicators conflict
      if (Math.abs(agreementScore) < indicatorCount * 0.3) {
        confidence *= 0.7; // Conflicting signals
      }
    }

    // Market condition adjustment
    confidence *= marketCondition.confidence;

    // Pattern matching bonus
    const patternBonus = this.getPatternMatchBonus(marketData);
    confidence = Math.min(0.95, confidence + patternBonus);

    return confidence;
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

  shouldTrade(marketData: MarketData, confidenceThreshold: number = 0.8): { shouldTrade: boolean; reason: string; confidence: number; strategy: TradingStrategy } {
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

    // Keep only last 20 trades for recent analysis
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
    this.riskMetrics.recentWinRate = this.recentTrades.length > 0 ? recentWins / this.recentTrades.length : 0.5;

    // Risk adjustments
    if (this.riskMetrics.recentWinRate < 0.4) {
      this.riskMetrics.currentRiskLevel = Math.max(0.3, this.riskMetrics.currentRiskLevel * 0.8);
      console.log(`🔻 Risk reduced to ${(this.riskMetrics.currentRiskLevel * 100).toFixed(0)}% due to low win rate`);
    } else if (this.riskMetrics.recentWinRate > 0.6) {
      this.riskMetrics.currentRiskLevel = Math.min(1.5, this.riskMetrics.currentRiskLevel * 1.1);
      console.log(`🔺 Risk increased to ${(this.riskMetrics.currentRiskLevel * 100).toFixed(0)}% due to high win rate`);
    }

    // Cooldown trigger
    if (this.riskMetrics.consecutiveLosses >= 5) {
      this.riskMetrics.lastCooldownEnd = Date.now() + (60 * 60 * 1000); // 1 hour cooldown
      console.log(`🛑 Trading paused for 1 hour after 5 consecutive losses`);
    }

    // Learn from profitable trades
    const threshold = this.config.aggressiveMode ? 1 : 2;
    if (isWin && position.pnlPercent > threshold) {
      this.learnFromProfitableTrade(trade, position, marketData);
    }

    // Generate trade reflection
    this.generateTradeReflection(trade, position, marketData, outcome);

    this.saveStoredData();
  }

  private learnFromProfitableTrade(trade: Trade, position: Position, marketData: MarketData) {
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
        winRate: 1.0,
        avgProfit: position.pnlPercent,
        avgDuration: duration,
        tradeCount: 1
      },
      lastUsed: Date.now(),
      profitability: position.pnlPercent / 100
    };

    // Check if similar pattern exists
    const existingPattern = this.learnedPatterns.find(p => 
      this.patternsAreSimilar(p, pattern)
    );

    if (existingPattern) {
      // Update existing pattern
      existingPattern.outcome.tradeCount++;
      existingPattern.outcome.avgProfit = (existingPattern.outcome.avgProfit + position.pnlPercent) / 2;
      existingPattern.outcome.avgDuration = (existingPattern.outcome.avgDuration + duration) / 2;
      existingPattern.lastUsed = Date.now();
      existingPattern.profitability = existingPattern.outcome.avgProfit / 100;
    } else {
      // Add new pattern
      this.learnedPatterns.push(pattern);
      console.log(`🧠 New profitable pattern learned: ${trade.symbol} ${trade.side} (+${position.pnlPercent.toFixed(2)}%)`);
    }

    // Keep only top 50 patterns
    this.learnedPatterns.sort((a, b) => b.profitability - a.profitability);
    if (this.learnedPatterns.length > 50) {
      this.learnedPatterns = this.learnedPatterns.slice(0, 50);
    }
  }

  private patternsAreSimilar(p1: TradePattern, p2: TradePattern): boolean {
    return (
      Math.abs(p1.conditions.rsi.min - p2.conditions.rsi.min) < 10 &&
      Math.abs(p1.conditions.rsi.max - p2.conditions.rsi.max) < 10 &&
      p1.conditions.emaTrend === p2.conditions.emaTrend &&
      p1.conditions.bollingerPosition === p2.conditions.bollingerPosition &&
      p1.conditions.timeOfDay === p2.conditions.timeOfDay
    );
  }

  private generateTradeReflection(trade: Trade, position: Position, marketData: MarketData, outcome: 'WIN' | 'LOSS') {
    const reflection = {
      timestamp: Date.now(),
      trade: {
        symbol: trade.symbol,
        side: trade.side,
        pnl: position.pnl,
        pnlPercent: position.pnlPercent,
        duration: Date.now() - trade.timestamp
      },
      reflection: this.createReflectionText(trade, position, marketData, outcome)
    };

    this.tradeReflections.push(reflection);

    // Keep only last 10 reflections
    if (this.tradeReflections.length > 10) {
      this.tradeReflections = this.tradeReflections.slice(-10);
    }

    console.log(`💭 Trade Reflection: ${reflection.reflection}`);
  }

  private createReflectionText(trade: Trade, position: Position, marketData: MarketData, outcome: 'WIN' | 'LOSS'): string {
    const { rsi, macd, emaTrend, volumeRatio } = marketData;
    const duration = (Date.now() - trade.timestamp) / (1000 * 60); // minutes

    if (outcome === 'WIN') {
      return `✅ ${trade.symbol} ${trade.side} worked well (+${position.pnlPercent.toFixed(2)}% in ${duration.toFixed(0)}m). RSI ${rsi.toFixed(1)}, MACD ${macd.toFixed(4)}, ${emaTrend} trend, volume ${volumeRatio.toFixed(1)}x. Pattern worth remembering.`;
    } else {
      let reason = '';
      if (rsi > 70 && trade.side === 'BUY') reason = 'Bought at overbought levels';
      else if (rsi < 30 && trade.side === 'SELL') reason = 'Sold at oversold levels';
      else if (volumeRatio < 1) reason = 'Low volume confirmation';
      else if (emaTrend === 'NEUTRAL') reason = 'Unclear trend direction';
      else reason = 'Market moved against position';

      return `❌ ${trade.symbol} ${trade.side} failed (${position.pnlPercent.toFixed(2)}% in ${duration.toFixed(0)}m). ${reason}. RSI ${rsi.toFixed(1)}, MACD ${macd.toFixed(4)}. Avoid similar setups.`;
    }
  }

  getMultiExitLevels(entryPrice: number, side: 'LONG' | 'SHORT', marketCondition?: any): { tp1: number; tp2: number; tp3: number; sl: number } {
    const multiplier = side === 'LONG' ? 1 : -1;
    
    // Base levels
    let tp1Pct = 0.01;   // 1%
    let tp2Pct = 0.025;  // 2.5%
    let tp3Pct = 0.05;   // 5%
    let slPct = 0.015;   // 1.5%
    
    // Adjust based on market condition
    if (marketCondition) {
      switch (marketCondition.type) {
        case 'HIGH_VOLATILITY':
          // Wider targets and stops for volatile markets
          tp1Pct = 0.015; // 1.5%
          tp2Pct = 0.035; // 3.5%
          tp3Pct = 0.07;  // 7%
          slPct = 0.025;  // 2.5%
          break;
        case 'SIDEWAYS':
          // Tighter targets for range-bound markets
          tp1Pct = 0.008; // 0.8%
          tp2Pct = 0.015; // 1.5%
          tp3Pct = 0.025; // 2.5%
          slPct = 0.01;   // 1%
          break;
        case 'TRENDING_UP':
        case 'TRENDING_DOWN':
          // Let winners run in trending markets
          tp1Pct = 0.012; // 1.2%
          tp2Pct = 0.03;  // 3%
          tp3Pct = 0.08;  // 8%
          slPct = 0.012;  // 1.2%
          break;
        case 'UNCERTAIN':
          // Conservative targets in uncertain markets
          tp1Pct = 0.008; // 0.8%
          tp2Pct = 0.018; // 1.8%
          tp3Pct = 0.035; // 3.5%
          slPct = 0.012;  // 1.2%
          break;
      }
      
      // Adjust for volatility
      const volatilityMultiplier = Math.max(0.7, Math.min(1.5, marketCondition.volatility * 25));
      tp1Pct *= volatilityMultiplier;
      tp2Pct *= volatilityMultiplier;
      tp3Pct *= volatilityMultiplier;
      slPct *= volatilityMultiplier;
    }
    
    return {
      tp1: entryPrice * (1 + (tp1Pct * multiplier)),
      tp2: entryPrice * (1 + (tp2Pct * multiplier)),
      tp3: entryPrice * (1 + (tp3Pct * multiplier)),
      sl: entryPrice * (1 - (slPct * multiplier))
    };
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