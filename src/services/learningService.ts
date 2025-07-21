import { Trade, Position, MarketData } from '../types/trading';

interface TradeRecord {
  id: string;
  timestamp: number;
  symbol: string;
  action: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  profit?: number;
  profitPercent?: number;
  duration?: number;
  reason?: string;
  marketDataSnapshot: MarketData;
  originalSignal: any;
  tradeResult?: {
    pnl: number;
    pnlPercent: number;
    outcome: 'PROFIT' | 'LOSS' | 'BREAKEVEN';
  };
  sentimentScore: number;
  newsContext: any[];
  portfolioState: any;
  indicators: {
    rsi: number;
    macd: number;
    ema12: number;
    ema26: number;
    emaTrend: string;
    volumeRatio: number;
    bollingerPosition: 'UPPER' | 'MIDDLE' | 'LOWER';
  };
  outcome: 'PROFIT' | 'LOSS' | 'BREAKEVEN';
  confidence: number;
}

interface LearnedPattern {
  id: string;
  conditions: {
    rsi?: { min?: number; max?: number };
    sentimentScore?: { min?: number; max?: number };
    emaTrend?: string;
    volumeRatio?: { min?: number; max?: number };
  };
  action: 'BUY' | 'SELL' | 'HOLD';
  confidenceModifier: number; // -1 to 1, multiplied with original confidence
  successRate: number;
  avgProfit: number;
  tradeCount: number;
  description: string;
}

interface LearningInsights {
  successfulPatterns: string[];
  failedPatterns: string[];
  learnedPatterns: LearnedPattern[];
  bestTimeframes: number[];
  profitableIndicators: string[];
  marketConditions: {
    bullish: { winRate: number; avgProfit: number };
    bearish: { winRate: number; avgProfit: number };
    neutral: { winRate: number; avgProfit: number };
  };
}

class LearningService {
  private tradeHistory: TradeRecord[] = [];
  private learningInsights: LearningInsights | null = null;
  private lastLearningUpdate: number = 0;
  private lastRetrainCount: number = 0;
  private llama3Url: string = 'http://localhost:11434';
  private llama3Model: string = 'llama3';
  private db: IDBDatabase | null = null;
  private llama3RequestQueue: Array<() => Promise<any>> = [];
  private llama3Available: boolean = true;
  private llama3LastCheck: number = 0;
  
  // Throttling for learning operations
  private learningOperationThrottle: number = 5000; // 5 seconds
  private lastLearningOperation: number = 0;
  private llama3RequestThrottle: number = 3000; // 3 seconds between LLM requests
  private lastLlama3Request: number = 0;
  private maxConcurrentLearningOps: number = 1;
  private activeLearningOps: number = 0;

  constructor() {
    this.initIndexedDB();
  }

  setLlama3Config(url: string, model: string = 'llama3') {
    this.llama3Url = url;
    this.llama3Model = model;
  }

  private async initIndexedDB() {
    try {
      const request = indexedDB.open('TradingBotDB', 1);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains('trades')) {
          db.createObjectStore('trades', { keyPath: 'id' });
        }
        
        if (!db.objectStoreNames.contains('insights')) {
          db.createObjectStore('insights', { keyPath: 'id' });
        }
      };
      
      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        this.loadTradeHistory();
        this.loadLearningInsights();
      };
      
      request.onerror = () => {
        console.warn('IndexedDB not available, using memory storage');
        this.loadFromLocalStorage();
      };
    } catch (error) {
      console.warn('IndexedDB initialization failed, using memory storage');
      this.loadFromLocalStorage();
    }
  }

  private loadFromLocalStorage() {
    try {
      const trades = localStorage.getItem('trading-bot-history');
      if (trades) {
        this.tradeHistory = JSON.parse(trades);
      }
      
      const insights = localStorage.getItem('trading-bot-insights');
      if (insights) {
        const data = JSON.parse(insights);
        this.learningInsights = data.insights;
        this.lastLearningUpdate = data.lastUpdate;
      }
    } catch (error) {
      console.error('Failed to load from localStorage:', error);
    }
  }

  async recordTrade(trade: Trade, position: Position, context: any) {
    const record: TradeRecord = {
      id: trade.id,
      timestamp: trade.timestamp,
      symbol: trade.symbol,
      action: trade.side,
      entryPrice: trade.price,
      quantity: trade.quantity,
      marketDataSnapshot: context.marketData,
      originalSignal: context.signal,
      sentimentScore: context.signal?.sentimentScore || 0,
      newsContext: context.newsContext || [],
      portfolioState: context.portfolioState,
      indicators: this.calculateIndicators(context.marketData),
      outcome: 'BREAKEVEN', // Will be updated when position closes
      confidence: context.signal?.confidence || 0.5,
    };

    this.tradeHistory.push(record);
    await this.saveTradeHistory();
    
    console.log(`📊 Trade recorded for learning: ${trade.symbol} ${trade.side} (RSI: ${context.marketData.rsi?.toFixed(2)}, Sentiment: ${record.sentimentScore.toFixed(2)})`);
  }

  async recordPositionClose(position: Position, closeTrade: Trade, reason: string) {
    const openRecord = this.tradeHistory.find(r => r.id === position.id);
    if (!openRecord) return;

    // Update the record with exit information
    openRecord.exitPrice = closeTrade.price;
    openRecord.profit = position.pnl;
    openRecord.profitPercent = position.pnlPercent;
    openRecord.duration = Date.now() - openRecord.timestamp;
    openRecord.reason = reason;
    openRecord.outcome = position.pnl > 0 ? 'PROFIT' : position.pnl < 0 ? 'LOSS' : 'BREAKEVEN';
    openRecord.tradeResult = {
      pnl: position.pnl,
      pnlPercent: position.pnlPercent,
      outcome: openRecord.outcome
    };

    await this.saveTradeHistory();
    
    console.log(`📈 Position closed and recorded: ${position.symbol} P&L: ${position.pnl.toFixed(2)} (${openRecord.outcome})`);
    
    // Trigger retraining every 20 trades
    if (this.tradeHistory.length - this.lastRetrainCount >= 20) {
      await this.retrainModelInternal();
      this.lastRetrainCount = this.tradeHistory.length;
    } else if (this.tradeHistory.length % 10 === 0) {
      await this.updateLearningInsights();
    }
  }

  async getMarketInsights(): Promise<LearningInsights> {
    if (!this.learningInsights || Date.now() - this.lastLearningUpdate > 24 * 60 * 60 * 1000) {
      await this.updateLearningInsights();
    }
    
    return this.learningInsights || this.getDefaultInsights();
  }

  async enhanceSignal(signal: any, marketData: MarketData, insights: LearningInsights): Promise<any> {
    // Throttle signal enhancement to prevent overload
    const now = Date.now();
    if (now - this.lastLearningOperation < this.learningOperationThrottle) {
      return signal; // Return original signal if throttled
    }
    
    this.lastLearningOperation = now;
    
    if (!insights || this.tradeHistory.length < 5) {
      return signal;
    }

    const isFastLearning = (globalThis as any).fastLearningMode === true;

    // First check against learned patterns
    const patternResult = this.checkLearnedPatterns(signal, marketData, insights);
    if (patternResult.modified) {
      console.log(`🧠 Pattern-based signal modification: ${signal.action} → ${patternResult.signal.action} (${patternResult.reason})`);
      return patternResult.signal;
    }

    // Enhanced learning influence for fast learning mode
    if (isFastLearning) {
      const enhancedSignal = this.applyFastLearningEnhancements(signal, marketData, insights);
      if (enhancedSignal.modified) {
        return enhancedSignal.signal;
      }
    }

    try {
      // Throttle Llama 3 requests
      if (now - this.lastLlama3Request < this.llama3RequestThrottle) {
        console.log('🕒 Learning LLM request throttled');
        return signal;
      }
      
      // Use LLaMA 3 to enhance the signal based on learning
      const prompt = `Based on trading history analysis:
Successful patterns: ${insights.successfulPatterns.join(', ')}
Failed patterns: ${insights.failedPatterns.join(', ')}
Current market: RSI ${marketData.rsi}, EMA Trend ${marketData.emaTrend}, Sentiment ${signal.sentimentScore}
Original signal: ${signal.action} with ${signal.confidence} confidence

Should we modify this signal? Respond with: ACTION CONFIDENCE REASONING
Where ACTION is BUY/SELL/HOLD, CONFIDENCE is 0.0-1.0, and REASONING explains why.`;

      const response = await this.queryLlama3(prompt);
      this.lastLlama3Request = Date.now();
      const enhanced = this.parseEnhancedSignal(response, signal);
      
      return enhanced;
    } catch (error) {
      console.log('LLaMA 3 enhancement failed, using original signal');
      return signal;
    }
  }

  private applyFastLearningEnhancements(signal: any, marketData: MarketData, insights: LearningInsights): { modified: boolean; signal: any } {
    let confidence = signal.confidence;
    let reasoning = signal.reasoning;
    let modified = false;
    
    // Find similar profitable trades
    const similarTrades = this.tradeHistory.filter(trade => {
      if (!trade.indicators || !trade.exitPrice) return false;
      
      const rsiSimilar = Math.abs((trade.indicators.rsi || 50) - marketData.rsi) < 15;
      const macdSimilar = Math.abs((trade.indicators.macd || 0) - marketData.macd) < 0.01;
      
      return rsiSimilar && macdSimilar && trade.outcome === 'PROFIT';
    });
    
    if (similarTrades.length >= 2) {
      confidence += 0.2;
      reasoning += ' (Similar profitable setups found)';
      modified = true;
    }
    
    // Volume ratio bonus
    if (marketData.volumeRatio > 1.5) {
      confidence += 0.15;
      reasoning += ' (High volume support)';
      modified = true;
    }
    
    // Bollinger band edge bonus
    if (marketData.bollinger) {
      const price = marketData.price;
      const { upper, lower } = marketData.bollinger;
      
      if (price < lower * 1.02 && signal.action === 'BUY') {
        confidence += 0.2;
        reasoning += ' (Near Bollinger lower band)';
        modified = true;
      } else if (price > upper * 0.98 && signal.action === 'SELL') {
        confidence += 0.2;
        reasoning += ' (Near Bollinger upper band)';
        modified = true;
      }
    }
    
    confidence = Math.min(0.95, confidence);
    
    return {
      modified,
      signal: modified ? { ...signal, confidence, reasoning } : signal
    };
  }

  private checkLearnedPatterns(signal: any, marketData: MarketData, insights: LearningInsights): { modified: boolean; signal: any; reason: string } {
    if (!insights.learnedPatterns || insights.learnedPatterns.length === 0) {
      return { modified: false, signal, reason: '' };
    }

    for (const pattern of insights.learnedPatterns) {
      if (this.matchesPattern(marketData, signal, pattern)) {
        const newConfidence = Math.max(0.1, Math.min(1.0, signal.confidence * (1 + pattern.confidenceModifier)));
        
        // If pattern suggests different action and has high success rate
        if (pattern.action !== signal.action && pattern.successRate > 0.7) {
          return {
            modified: true,
            signal: {
              ...signal,
              action: pattern.action,
              confidence: newConfidence,
              reasoning: `Pattern override: ${pattern.description}`
            },
            reason: pattern.description
          };
        }
        
        // If confidence modifier is significant
        if (Math.abs(pattern.confidenceModifier) > 0.2) {
          return {
            modified: true,
            signal: {
              ...signal,
              confidence: newConfidence,
              reasoning: `${signal.reasoning} (Pattern: ${pattern.description})`
            },
            reason: pattern.description
          };
        }
      }
    }

    return { modified: false, signal, reason: '' };
  }

  private matchesPattern(marketData: MarketData, signal: any, pattern: LearnedPattern): boolean {
    const conditions = pattern.conditions;
    
    // Check RSI condition
    if (conditions.rsi) {
      if (conditions.rsi.min !== undefined && marketData.rsi < conditions.rsi.min) return false;
      if (conditions.rsi.max !== undefined && marketData.rsi > conditions.rsi.max) return false;
    }
    
    // Check sentiment condition
    if (conditions.sentimentScore) {
      if (conditions.sentimentScore.min !== undefined && signal.sentimentScore < conditions.sentimentScore.min) return false;
      if (conditions.sentimentScore.max !== undefined && signal.sentimentScore > conditions.sentimentScore.max) return false;
    }
    
    // Check EMA trend condition
    if (conditions.emaTrend && marketData.emaTrend !== conditions.emaTrend) return false;
    
    // Check volume ratio condition
    if (conditions.volumeRatio) {
      if (conditions.volumeRatio.min !== undefined && marketData.volumeRatio < conditions.volumeRatio.min) return false;
      if (conditions.volumeRatio.max !== undefined && marketData.volumeRatio > conditions.volumeRatio.max) return false;
    }
    
    return true;
  }

  async shouldExit(position: Position, marketData: MarketData): Promise<{ shouldExit: boolean; confidence: number; reason: string }> {
    // Throttle exit analysis
    const now = Date.now();
    if (now - this.lastLearningOperation < this.learningOperationThrottle) {
      return { shouldExit: false, confidence: 0, reason: 'Analysis throttled' };
    }
    
    if (this.tradeHistory.length < 3) {
      return { shouldExit: false, confidence: 0, reason: 'Insufficient learning data' };
    }

    try {
      // Find similar historical positions
      const similarTrades = this.findSimilarTrades(position, marketData);
      
      if (similarTrades.length === 0) {
        return { shouldExit: false, confidence: 0, reason: 'No similar historical trades' };
      }

      // Calculate success rate of holding vs exiting in similar conditions
      const holdingSuccessRate = similarTrades.filter(t => t.outcome === 'PROFIT').length / similarTrades.length;
      
      const prompt = `Position analysis:
Symbol: ${position.symbol}
Current P&L: ${position.pnlPercent.toFixed(2)}%
Position age: ${Math.floor((Date.now() - position.timestamp) / 60000)} minutes
Market RSI: ${marketData.rsi}, EMA Trend: ${marketData.emaTrend}
Similar trades success rate: ${(holdingSuccessRate * 100).toFixed(1)}%

Should we exit this position? Respond with: EXIT/HOLD CONFIDENCE REASON`;

      // Throttle Llama 3 requests
      if (now - this.lastLlama3Request < this.llama3RequestThrottle) {
        return { shouldExit: false, confidence: 0, reason: 'LLM request throttled' };
      }
      
      this.lastLlama3Request = Date.now();
      const response = await this.queryLlama3(prompt);
      return this.parseExitDecision(response);
    } catch (error) {
      return { shouldExit: false, confidence: 0, reason: 'Analysis failed' };
    }
  }

  // Public method to trigger retraining manually
  async retrainModel() {
    await this.retrainModelInternal();
  }

  private async retrainModelInternal() {
    // Prevent concurrent retraining operations
    if (this.activeLearningOps > 0) {
      console.log('🕒 Retraining skipped - operation already in progress');
      return;
    }
    
    this.activeLearningOps++;
    
    try {
    console.log('🧠 Starting model retraining...');
    
    const completedTrades = this.tradeHistory.filter(t => t.exitPrice !== undefined);
    if (completedTrades.length < 10) {
      console.log('Not enough completed trades for retraining');
      return;
    }

    // Analyze last 50 trades for patterns
    const recentTrades = completedTrades.slice(-50);
    const patterns = this.extractLearnedPatterns(recentTrades);
    
    // Update insights with new patterns
    if (!this.learningInsights) {
      this.learningInsights = this.getDefaultInsights();
    }
    
    this.learningInsights.learnedPatterns = patterns;
    await this.saveLearningInsights();
    
    // Log insights
    console.log('🎯 Retraining complete! New insights:');
    patterns.forEach(pattern => {
      console.log(`   ${pattern.description} (Success: ${(pattern.successRate * 100).toFixed(1)}%, Avg Profit: ${pattern.avgProfit.toFixed(2)}%)`);
    });
    
    // Find most profitable pattern
    const mostProfitable = patterns.reduce((best, current) => 
      current.avgProfit > best.avgProfit ? current : best, patterns[0]);
    
    if (mostProfitable) {
      console.log(`💰 Most profitable pattern: ${mostProfitable.description}`);
    }
    } finally {
      this.activeLearningOps--;
    }
  }

  private extractLearnedPatterns(trades: TradeRecord[]): LearnedPattern[] {
    const patterns: LearnedPattern[] = [];
    
    // Pattern 1: RSI Oversold + Positive Sentiment
    const oversoldBullish = trades.filter(t => 
      t.indicators && t.indicators.rsi < 30 && 
      t.sentimentScore > 0.5 && 
      t.action === 'BUY'
    );
    
    if (oversoldBullish.length >= 3) {
      const successRate = oversoldBullish.filter(t => t.outcome === 'PROFIT').length / oversoldBullish.length;
      const avgProfit = oversoldBullish.reduce((sum, t) => sum + (t.profitPercent || 0), 0) / oversoldBullish.length;
      
      patterns.push({
        id: 'rsi_oversold_bullish_sentiment',
        conditions: {
          rsi: { max: 30 },
          sentimentScore: { min: 0.5 }
        },
        action: 'BUY',
        confidenceModifier: successRate > 0.7 ? 0.3 : -0.2,
        successRate,
        avgProfit,
        tradeCount: oversoldBullish.length,
        description: 'RSI < 30 & sentiment > 0.5 → BUY'
      });
    }
    
    // Pattern 2: RSI Overbought + Negative Sentiment
    const overboughtBearish = trades.filter(t => 
      t.indicators && t.indicators.rsi > 70 && 
      t.sentimentScore < -0.3 && 
      t.action === 'SELL'
    );
    
    if (overboughtBearish.length >= 3) {
      const successRate = overboughtBearish.filter(t => t.outcome === 'PROFIT').length / overboughtBearish.length;
      const avgProfit = overboughtBearish.reduce((sum, t) => sum + (t.profitPercent || 0), 0) / overboughtBearish.length;
      
      patterns.push({
        id: 'rsi_overbought_bearish_sentiment',
        conditions: {
          rsi: { min: 70 },
          sentimentScore: { max: -0.3 }
        },
        action: 'SELL',
        confidenceModifier: successRate > 0.7 ? 0.3 : -0.2,
        successRate,
        avgProfit,
        tradeCount: overboughtBearish.length,
        description: 'RSI > 70 & sentiment < -0.3 → SELL'
      });
    }
    
    // Pattern 3: Bullish EMA + High Volume
    const emaBullishVolume = trades.filter(t => 
      t.indicators && t.indicators.emaTrend === 'BULLISH' && 
      t.indicators && t.indicators.volumeRatio > 1.5 && 
      t.action === 'BUY'
    );
    
    if (emaBullishVolume.length >= 3) {
      const successRate = emaBullishVolume.filter(t => t.outcome === 'PROFIT').length / emaBullishVolume.length;
      const avgProfit = emaBullishVolume.reduce((sum, t) => sum + (t.profitPercent || 0), 0) / emaBullishVolume.length;
      
      patterns.push({
        id: 'ema_bullish_high_volume',
        conditions: {
          emaTrend: 'BULLISH',
          volumeRatio: { min: 1.5 }
        },
        action: 'BUY',
        confidenceModifier: successRate > 0.6 ? 0.2 : -0.1,
        successRate,
        avgProfit,
        tradeCount: emaBullishVolume.length,
        description: 'EMA Bullish & Volume > 1.5x → BUY'
      });
    }
    
    // Pattern 4: Avoid BUY when RSI > 75 and sentiment > 0.6
    const avoidOverboughtBullish = trades.filter(t => 
      t.indicators && t.indicators.rsi > 75 && 
      t.sentimentScore > 0.6 && 
      t.action === 'BUY'
    );
    
    if (avoidOverboughtBullish.length >= 3) {
      const successRate = avoidOverboughtBullish.filter(t => t.outcome === 'PROFIT').length / avoidOverboughtBullish.length;
      
      if (successRate < 0.4) { // If this pattern fails often
        patterns.push({
          id: 'avoid_overbought_bullish',
          conditions: {
            rsi: { min: 75 },
            sentimentScore: { min: 0.6 }
          },
          action: 'HOLD',
          confidenceModifier: -0.3,
          successRate,
          avgProfit: avoidOverboughtBullish.reduce((sum, t) => sum + (t.profitPercent || 0), 0) / avoidOverboughtBullish.length,
          tradeCount: avoidOverboughtBullish.length,
          description: 'RSI > 75 & sentiment > 0.6 → downgrade BUY to HOLD'
        });
      }
    }
    
    return patterns.filter(p => p.tradeCount >= 3); // Only return patterns with sufficient data
  }

  private async updateLearningInsights() {
    // Prevent concurrent insight updates
    if (this.activeLearningOps > 0) {
      return;
    }
    
    this.activeLearningOps++;
    
    try {
    if (this.tradeHistory.length < 5) return;

    console.log('🧠 Updating learning insights...');
    
    const completedTrades = this.tradeHistory.filter(t => t.exitPrice !== undefined);
    
    if (completedTrades.length === 0) return;

    // Analyze successful vs failed patterns
    const profitableTrades = completedTrades.filter(t => t.outcome === 'PROFIT');
    const losingTrades = completedTrades.filter(t => t.outcome === 'LOSS');

    const insights: LearningInsights = {
      successfulPatterns: this.extractPatterns(profitableTrades),
      failedPatterns: this.extractPatterns(losingTrades),
      learnedPatterns: this.learningInsights?.learnedPatterns || [],
      bestTimeframes: this.analyzeBestTimeframes(profitableTrades),
      profitableIndicators: this.analyzeProfitableIndicators(profitableTrades),
      marketConditions: this.analyzeMarketConditions(completedTrades),
    };

    this.learningInsights = insights;
    this.lastLearningUpdate = Date.now();
    await this.saveLearningInsights();

    // Fine-tune LLaMA 3 with new insights
    await this.fineTuneLlama3(completedTrades);
    
    console.log('✅ Learning insights updated');
    } finally {
      this.activeLearningOps--;
    }
  }

  private async fineTuneLlama3(trades: TradeRecord[]) {
    try {
      // Create training dataset from successful trades
      const validTrades = trades.filter(t => {
        // Ensure basic trade data exists
        if (!t.outcome || !t.indicators || !t.marketDataSnapshot) return false;
        
        // Ensure indicators have valid values with fallbacks
        const indicators = {
          rsi: typeof t.indicators.rsi === 'number' ? t.indicators.rsi : 50,
          macd: typeof t.indicators.macd === 'number' ? t.indicators.macd : 0,
          emaTrend: t.indicators.emaTrend || 'NEUTRAL',
          volumeRatio: typeof t.indicators.volumeRatio === 'number' ? t.indicators.volumeRatio : 1
        };
        
        // Update the trade with safe indicators
        t.indicators = { ...t.indicators, ...indicators };
        
        return t.outcome === 'PROFIT' && typeof t.marketDataSnapshot.price === 'number';
      });
      
      if (validTrades.length === 0) {
        console.log('No valid trades for fine-tuning');
        return;
      }
      
      const trainingData = validTrades
        .map(t => ({
          input: `Market: RSI ${t.indicators.rsi || 50}, MACD ${(t.indicators.macd || 0).toFixed(4)}, EMA Trend ${t.indicators.emaTrend || 'NEUTRAL'}, Sentiment ${t.sentimentScore || 0}`,
          output: `Action: ${t.action}, Confidence: ${t.confidence}, Result: ${t.profitPercent?.toFixed(2)}% profit`
        }));

      if (trainingData.length < 3) {
        console.log('Insufficient valid training data');
        return;
      }

      // Save training dataset
      const dataset = {
        timestamp: Date.now(),
        trades: trainingData,
        metadata: {
          totalTrades: validTrades.length,
          profitableTrades: validTrades.filter(t => t.outcome === 'PROFIT').length,
          winRate: (validTrades.filter(t => t.outcome === 'PROFIT').length / validTrades.length * 100).toFixed(2)
        }
      };

      localStorage.setItem('trading-bot-training-data', JSON.stringify(dataset));
      
      console.log(`💾 Training dataset saved: ${trainingData.length} examples`);
      
      // Note: Actual fine-tuning would require additional setup
      // This creates the dataset for manual fine-tuning
      
    } catch (error) {
      console.error('Fine-tuning preparation failed:', error);
    }
  }

  private async queryLlama3(prompt: string): Promise<string> {
    // Add timeout and error handling for Llama 3 requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    const response = await fetch(`${this.llama3Url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.llama3Model,
        prompt,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    
    if (!response.ok) throw new Error('LLaMA 3 query failed');
    
    const data = await response.json();
    return data.response.trim();
  }

  private parseEnhancedSignal(response: string, originalSignal: any): any {
    try {
      const parts = response.split(' ');
      const action = parts[0]?.toUpperCase();
      const confidence = parseFloat(parts[1]) || originalSignal.confidence;
      const reasoning = parts.slice(2).join(' ') || originalSignal.reasoning;

      if (['BUY', 'SELL', 'HOLD'].includes(action)) {
        return { ...originalSignal, action, confidence, reasoning };
      }
    } catch (error) {
      console.log('Failed to parse enhanced signal');
    }
    
    return originalSignal;
  }

  private parseExitDecision(response: string): { shouldExit: boolean; confidence: number; reason: string } {
    try {
      const parts = response.split(' ');
      const decision = parts[0]?.toUpperCase();
      const confidence = parseFloat(parts[1]) || 0;
      const reason = parts.slice(2).join(' ') || 'AI analysis';

      return {
        shouldExit: decision === 'EXIT',
        confidence,
        reason
      };
    } catch (error) {
      return { shouldExit: false, confidence: 0, reason: 'Parse error' };
    }
  }

  private findSimilarTrades(position: Position, marketData: MarketData): TradeRecord[] {
    return this.tradeHistory.filter(trade => {
      if (!trade.exitPrice) return false;
      
      const rsiSimilar = Math.abs(trade.indicators.rsi - marketData.rsi) < 10;
      const symbolSimilar = trade.symbol === position.symbol;
      const actionSimilar = trade.action === (position.side === 'LONG' ? 'BUY' : 'SELL');
      
      return rsiSimilar && (symbolSimilar || actionSimilar);
    });
  }

  private extractPatterns(trades: TradeRecord[]): string[] {
    const patterns: string[] = [];
    
    trades.forEach(trade => {
      // Safe indicator access with fallbacks
      const indicators = trade.indicators || {};
      const rsi = typeof indicators.rsi === 'number' ? indicators.rsi : 50;
      const macd = typeof indicators.macd === 'number' ? indicators.macd : 0;
      const emaTrend = indicators.emaTrend || 'NEUTRAL';
      const sentimentScore = typeof trade.sentimentScore === 'number' ? trade.sentimentScore : 0;
      
      // RSI patterns
      if (rsi < 30) patterns.push('RSI_OVERSOLD');
      if (rsi > 70) patterns.push('RSI_OVERBOUGHT');
      
      // MACD patterns
      if (macd > 0) patterns.push('MACD_POSITIVE');
      if (macd < 0) patterns.push('MACD_NEGATIVE');
      
      // EMA trend patterns
      if (emaTrend === 'BULLISH') patterns.push('EMA_BULLISH');
      if (emaTrend === 'BEARISH') patterns.push('EMA_BEARISH');
      
      // Sentiment patterns
      if (sentimentScore > 0.5) patterns.push('SENTIMENT_POSITIVE');
      if (sentimentScore < -0.5) patterns.push('SENTIMENT_NEGATIVE');
      
      // Bollinger patterns
      if (indicators.bollingerPosition === 'LOWER') patterns.push('BOLLINGER_LOWER');
      if (indicators.bollingerPosition === 'UPPER') patterns.push('BOLLINGER_UPPER');
    });
    
    // Return most common patterns
    const patternCounts = patterns.reduce((acc, pattern) => {
      acc[pattern] = (acc[pattern] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.entries(patternCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([pattern]) => pattern);
  }

  private analyzeBestTimeframes(trades: TradeRecord[]): number[] {
    const timeframes = trades
      .filter(t => t.duration)
      .map(t => t.duration!)
      .sort((a, b) => a - b);
    
    if (timeframes.length === 0) return [300000]; // 5 minutes default
    
    const median = timeframes[Math.floor(timeframes.length / 2)];
    return [median * 0.5, median, median * 1.5];
  }

  private isValidTradeRecord(trade: TradeRecord): boolean {
    return !!(
      trade &&
      trade.indicators &&
      typeof trade.indicators.rsi === 'number' &&
      typeof trade.indicators.macd === 'number' &&
      trade.indicators.emaTrend &&
      typeof trade.sentimentScore === 'number' &&
      trade.outcome
    );
  }
  private analyzeProfitableIndicators(trades: TradeRecord[]): string[] {
    const indicators: string[] = [];
    
    trades.filter(trade => this.isValidTradeRecord(trade)).forEach(trade => {
      const tradeIndicators = trade.indicators!; // Safe after validation
      
      if (tradeIndicators.rsi < 30 && trade.outcome === 'PROFIT') {
        indicators.push('RSI_OVERSOLD_BUY');
      }
      if (tradeIndicators.rsi > 70 && trade.outcome === 'PROFIT') {
        indicators.push('RSI_OVERBOUGHT_SELL');
      }
      if (tradeIndicators.emaTrend === 'BULLISH' && trade.action === 'BUY' && trade.outcome === 'PROFIT') {
        indicators.push('EMA_BULLISH_BUY');
      }
      if (trade.sentimentScore > 0.5 && trade.action === 'BUY' && trade.outcome === 'PROFIT') {
        indicators.push('SENTIMENT_POSITIVE_BUY');
      }
    });
    
    return [...new Set(indicators)];
  }

  private analyzeMarketConditions(trades: TradeRecord[]): LearningInsights['marketConditions'] {
    const validTrades = trades.filter(trade => this.isValidTradeRecord(trade));
    const bullish = validTrades.filter(t => t.indicators!.emaTrend === 'BULLISH');
    const bearish = validTrades.filter(t => t.indicators!.emaTrend === 'BEARISH');
    const neutral = validTrades.filter(t => t.indicators!.emaTrend === 'NEUTRAL');

    return {
      bullish: {
        winRate: bullish.length > 0 ? bullish.filter(t => t.outcome === 'PROFIT').length / bullish.length : 0,
        avgProfit: bullish.length > 0 ? bullish.reduce((sum, t) => sum + (t.profitPercent || 0), 0) / bullish.length : 0
      },
      bearish: {
        winRate: bearish.length > 0 ? bearish.filter(t => t.outcome === 'PROFIT').length / bearish.length : 0,
        avgProfit: bearish.length > 0 ? bearish.reduce((sum, t) => sum + (t.profitPercent || 0), 0) / bearish.length : 0
      },
      neutral: {
        winRate: neutral.length > 0 ? neutral.filter(t => t.outcome === 'PROFIT').length / neutral.length : 0,
        avgProfit: neutral.length > 0 ? neutral.reduce((sum, t) => sum + (t.profitPercent || 0), 0) / neutral.length : 0
      }
    };
  }

  private calculateIndicators(marketData: any): TradeRecord['indicators'] {
    const bollinger = marketData.bollinger || { upper: 0, middle: 0, lower: 0 };
    const price = marketData.price || 0;
    
    let bollingerPosition: 'UPPER' | 'MIDDLE' | 'LOWER' = 'MIDDLE';
    if (price > bollinger.upper) bollingerPosition = 'UPPER';
    else if (price < bollinger.lower) bollingerPosition = 'LOWER';
    
    return {
      rsi: typeof marketData.rsi === 'number' ? marketData.rsi : 50,
      macd: typeof marketData.macd === 'number' ? marketData.macd : 0,
      ema12: typeof marketData.ema12 === 'number' ? marketData.ema12 : price,
      ema26: typeof marketData.ema26 === 'number' ? marketData.ema26 : price,
      emaTrend: marketData.emaTrend || 'NEUTRAL',
      volumeRatio: typeof marketData.volumeRatio === 'number' ? marketData.volumeRatio : 1,
      bollingerPosition,
    };
  }

  private getDefaultInsights(): LearningInsights {
    return {
      successfulPatterns: ['RSI_OVERSOLD', 'MACD_POSITIVE'],
      failedPatterns: ['RSI_OVERBOUGHT', 'MACD_NEGATIVE'],
      learnedPatterns: [],
      bestTimeframes: [300000, 600000, 900000], // 5, 10, 15 minutes
      profitableIndicators: ['RSI_OVERSOLD_BUY'],
      marketConditions: {
        bullish: { winRate: 0.6, avgProfit: 2.5 },
        bearish: { winRate: 0.4, avgProfit: 1.2 },
        neutral: { winRate: 0.5, avgProfit: 1.8 }
      }
    };
  }

  private async saveTradeHistory() {
    try {
      if (this.db) {
        const transaction = this.db.transaction(['trades'], 'readwrite');
        const store = transaction.objectStore('trades');
        await store.clear();
        
        for (const trade of this.tradeHistory) {
          await store.add(trade);
        }
      } else {
        localStorage.setItem('trading-bot-history', JSON.stringify(this.tradeHistory));
      }
    } catch (error) {
      console.error('Failed to save trade history:', error);
      // Fallback to localStorage
      localStorage.setItem('trading-bot-history', JSON.stringify(this.tradeHistory));
    }
  }

  private async loadTradeHistory() {
    try {
      if (this.db) {
        const transaction = this.db.transaction(['trades'], 'readonly');
        const store = transaction.objectStore('trades');
        const request = store.getAll();
        
        request.onsuccess = () => {
          this.tradeHistory = request.result || [];
          console.log(`📚 Loaded ${this.tradeHistory.length} historical trades from IndexedDB`);
        };
      } else {
        const saved = localStorage.getItem('trading-bot-history');
        if (saved) {
          this.tradeHistory = JSON.parse(saved);
          console.log(`📚 Loaded ${this.tradeHistory.length} historical trades from localStorage`);
        }
      }
    } catch (error) {
      console.error('Failed to load trade history:', error);
      this.tradeHistory = [];
    }
  }

  private async saveLearningInsights() {
    try {
      const data = {
        id: 'insights',
        insights: this.learningInsights,
        lastUpdate: this.lastLearningUpdate
      };
      
      if (this.db) {
        const transaction = this.db.transaction(['insights'], 'readwrite');
        const store = transaction.objectStore('insights');
        await store.put(data);
      } else {
        localStorage.setItem('trading-bot-insights', JSON.stringify(data));
      }
    } catch (error) {
      console.error('Failed to save learning insights:', error);
      // Move data declaration outside try block to fix scope issue
      const fallbackData = {
        id: 'insights',
        insights: this.learningInsights,
        lastUpdate: this.lastLearningUpdate
      };
      localStorage.setItem('trading-bot-insights', JSON.stringify(fallbackData));
    }
  }

  private async loadLearningInsights() {
    try {
      if (this.db) {
        const transaction = this.db.transaction(['insights'], 'readonly');
        const store = transaction.objectStore('insights');
        const request = store.get('insights');
        
        request.onsuccess = () => {
          if (request.result) {
            this.learningInsights = request.result.insights;
            this.lastLearningUpdate = request.result.lastUpdate;
            console.log('🧠 Loaded learning insights from IndexedDB');
          }
        };
      } else {
        const saved = localStorage.getItem('trading-bot-insights');
        if (saved) {
          const data = JSON.parse(saved);
          this.learningInsights = data.insights;
          this.lastLearningUpdate = data.lastUpdate;
          console.log('🧠 Loaded learning insights from localStorage');
        }
      }
    } catch (error) {
      console.error('Failed to load learning insights:', error);
    }
  }

  // Public method to get training data for manual fine-tuning
  getTrainingDataset(): any {
    const saved = localStorage.getItem('trading-bot-training-data');
    return saved ? JSON.parse(saved) : null;
  }

  // Public method to get learning statistics
  getLearningStats(): any {
    const completedTrades = this.tradeHistory.filter(t => t.exitPrice !== undefined);
    const profitableTrades = completedTrades.filter(t => t.outcome === 'PROFIT');
    
    return {
      totalTrades: this.tradeHistory.length,
      completedTrades: completedTrades.length,
      totalWins: profitableTrades.length,
      totalLosses: completedTrades.length - profitableTrades.length,
      totalProfit: profitableTrades.reduce((sum, t) => sum + (t.profitPercent || 0), 0),
      winRate: completedTrades.length > 0 ? (profitableTrades.length / completedTrades.length * 100).toFixed(2) : '0',
      avgProfit: profitableTrades.length > 0 ? (profitableTrades.reduce((sum, t) => sum + (t.profitPercent || 0), 0) / profitableTrades.length).toFixed(2) : '0',
      lastLearningUpdate: new Date(this.lastLearningUpdate).toLocaleString()
    };
  }

  resetLearning() {
    logService.learning('learningServiceReset', {}, 'Resetting learning service');
    
    // Clear all trade history and statistics
    this.tradeHistory = [];
    
    // Reset learning insights to default structure
    this.learningInsights = this.getDefaultInsights();
    this.lastLearningUpdate = 0;
    this.lastRetrainCount = 0;
    
    // Reset throttling and operation counters
    this.lastLearningOperation = 0;
    this.lastLlama3Request = 0;
    this.activeLearningOps = 0;
    
    // Clear request queue
    this.llama3RequestQueue = [];
    
    // Reset Llama 3 availability status
    this.llama3Available = true;
    this.llama3LastCheck = 0;
    
    // Save reset state and clear persistent storage
    this.saveTradeHistory();
    this.saveLearningInsights();
    
    // Clear training dataset
    localStorage.removeItem('trading-bot-training-data');
    
    // Clear all learning-related localStorage data
    localStorage.removeItem('trading-bot-history');
    localStorage.removeItem('trading-bot-insights');
    
    logService.learning('learningServiceResetComplete', {}, 'Learning service reset complete');
  }
}

export const learningService = new LearningService();