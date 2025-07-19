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
  marketContext: {
    rsi: number;
    macd: number;
    bollinger: any;
    volume: number;
    price: number;
  };
  newsContext: any[];
  portfolioState: any;
  indicators: {
    rsi: number;
    macd: number;
    bollingerPosition: 'UPPER' | 'MIDDLE' | 'LOWER';
    volumeRatio: number;
  };
  outcome: 'PROFIT' | 'LOSS' | 'BREAKEVEN';
  confidence: number;
  signal?: any;
}

interface LearningInsights {
  successfulPatterns: string[];
  failedPatterns: string[];
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
  private llama3Url: string = 'http://localhost:11434';
  private llama3Model: string = 'llama3';

  constructor() {
    this.loadTradeHistory();
    this.loadLearningInsights();
  }

  setLlama3Config(url: string, model: string = 'llama3') {
    this.llama3Url = url;
    this.llama3Model = model;
  }

  async recordTrade(trade: Trade, position: Position, context: any) {
    const record: TradeRecord = {
      id: trade.id,
      timestamp: trade.timestamp,
      symbol: trade.symbol,
      action: trade.side,
      entryPrice: trade.price,
      quantity: trade.quantity,
      marketContext: {
        rsi: context.marketData.rsi || 50,
        macd: context.marketData.macd || 0,
        bollinger: context.marketData.bollinger,
        volume: context.marketData.volume || 0,
        price: context.marketData.price,
      },
      newsContext: context.newsContext || [],
      portfolioState: context.portfolioState,
      indicators: this.calculateIndicators(context.marketData),
      outcome: 'BREAKEVEN', // Will be updated when position closes
      confidence: context.signal?.confidence || 0.5,
      signal: context.signal,
    };

    this.tradeHistory.push(record);
    this.saveTradeHistory();
    
    console.log(`📊 Trade recorded for learning: ${trade.symbol} ${trade.side}`);
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

    this.saveTradeHistory();
    
    console.log(`📈 Position closed and recorded: ${position.symbol} P&L: ${position.pnl.toFixed(2)}`);
    
    // Trigger learning update if we have enough new trades
    if (this.tradeHistory.length % 10 === 0) {
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
    if (!insights || this.tradeHistory.length < 5) {
      return signal;
    }

    try {
      // Use LLaMA 3 to enhance the signal based on learning
      const prompt = `Based on trading history analysis:
Successful patterns: ${insights.successfulPatterns.join(', ')}
Failed patterns: ${insights.failedPatterns.join(', ')}
Current market: RSI ${marketData.rsi}, MACD ${marketData.macd}
Original signal: ${signal.action} with ${signal.confidence} confidence

Should we modify this signal? Respond with: ACTION CONFIDENCE REASONING
Where ACTION is BUY/SELL/HOLD, CONFIDENCE is 0.0-1.0, and REASONING explains why.`;

      const response = await this.queryLlama3(prompt);
      const enhanced = this.parseEnhancedSignal(response, signal);
      
      return enhanced;
    } catch (error) {
      console.log('LLaMA 3 enhancement failed, using original signal');
      return signal;
    }
  }

  async shouldExit(position: Position, marketData: MarketData): Promise<{ shouldExit: boolean; confidence: number; reason: string }> {
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
Market RSI: ${marketData.rsi}
Similar trades success rate: ${(holdingSuccessRate * 100).toFixed(1)}%

Should we exit this position? Respond with: EXIT/HOLD CONFIDENCE REASON`;

      const response = await this.queryLlama3(prompt);
      return this.parseExitDecision(response);
    } catch (error) {
      return { shouldExit: false, confidence: 0, reason: 'Analysis failed' };
    }
  }

  private async updateLearningInsights() {
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
      bestTimeframes: this.analyzeBestTimeframes(profitableTrades),
      profitableIndicators: this.analyzeProfitableIndicators(profitableTrades),
      marketConditions: this.analyzeMarketConditions(completedTrades),
    };

    this.learningInsights = insights;
    this.lastLearningUpdate = Date.now();
    this.saveLearningInsights();

    // Fine-tune LLaMA 3 with new insights
    await this.fineTuneLlama3(completedTrades);
    
    console.log('✅ Learning insights updated');
  }

  private async fineTuneLlama3(trades: TradeRecord[]) {
    try {
      // Create training dataset from successful trades
      const trainingData = trades
        .filter(t => t.outcome === 'PROFIT')
        .map(t => ({
          input: `Market: RSI ${t.marketContext.rsi}, MACD ${t.marketContext.macd}, Volume ${t.marketContext.volume}`,
          output: `Action: ${t.action}, Confidence: ${t.confidence}, Result: ${t.profitPercent?.toFixed(2)}% profit`
        }));

      if (trainingData.length < 3) return;

      // Save training dataset
      const dataset = {
        timestamp: Date.now(),
        trades: trainingData,
        metadata: {
          totalTrades: trades.length,
          profitableTrades: trades.filter(t => t.outcome === 'PROFIT').length,
          winRate: (trades.filter(t => t.outcome === 'PROFIT').length / trades.length * 100).toFixed(2)
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
    const response = await fetch(`${this.llama3Url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.llama3Model,
        prompt,
        stream: false,
      }),
    });

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
      
      const rsiSimilar = Math.abs(trade.marketContext.rsi - marketData.rsi) < 10;
      const symbolSimilar = trade.symbol === position.symbol;
      const actionSimilar = trade.action === (position.side === 'LONG' ? 'BUY' : 'SELL');
      
      return rsiSimilar && (symbolSimilar || actionSimilar);
    });
  }

  private extractPatterns(trades: TradeRecord[]): string[] {
    const patterns: string[] = [];
    
    trades.forEach(trade => {
      if (trade.marketContext.rsi < 30) patterns.push('RSI_OVERSOLD');
      if (trade.marketContext.rsi > 70) patterns.push('RSI_OVERBOUGHT');
      if (trade.marketContext.macd > 0) patterns.push('MACD_POSITIVE');
      if (trade.marketContext.macd < 0) patterns.push('MACD_NEGATIVE');
      if (trade.indicators.bollingerPosition === 'LOWER') patterns.push('BOLLINGER_LOWER');
      if (trade.indicators.bollingerPosition === 'UPPER') patterns.push('BOLLINGER_UPPER');
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

  private analyzeProfitableIndicators(trades: TradeRecord[]): string[] {
    const indicators: string[] = [];
    
    trades.forEach(trade => {
      if (trade.marketContext.rsi < 30 && trade.outcome === 'PROFIT') {
        indicators.push('RSI_OVERSOLD_BUY');
      }
      if (trade.marketContext.rsi > 70 && trade.outcome === 'PROFIT') {
        indicators.push('RSI_OVERBOUGHT_SELL');
      }
    });
    
    return [...new Set(indicators)];
  }

  private analyzeMarketConditions(trades: TradeRecord[]): LearningInsights['marketConditions'] {
    const bullish = trades.filter(t => t.marketContext.macd > 0);
    const bearish = trades.filter(t => t.marketContext.macd < 0);
    const neutral = trades.filter(t => Math.abs(t.marketContext.macd) < 0.1);

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
      rsi: marketData.rsi || 50,
      macd: marketData.macd || 0,
      bollingerPosition,
      volumeRatio: marketData.volume ? marketData.volume / 1000000 : 1
    };
  }

  private getDefaultInsights(): LearningInsights {
    return {
      successfulPatterns: ['RSI_OVERSOLD', 'MACD_POSITIVE'],
      failedPatterns: ['RSI_OVERBOUGHT', 'MACD_NEGATIVE'],
      bestTimeframes: [300000, 600000, 900000], // 5, 10, 15 minutes
      profitableIndicators: ['RSI_OVERSOLD_BUY'],
      marketConditions: {
        bullish: { winRate: 0.6, avgProfit: 2.5 },
        bearish: { winRate: 0.4, avgProfit: 1.2 },
        neutral: { winRate: 0.5, avgProfit: 1.8 }
      }
    };
  }

  private saveTradeHistory() {
    try {
      localStorage.setItem('trading-bot-history', JSON.stringify(this.tradeHistory));
    } catch (error) {
      console.error('Failed to save trade history:', error);
    }
  }

  private loadTradeHistory() {
    try {
      const saved = localStorage.getItem('trading-bot-history');
      if (saved) {
        this.tradeHistory = JSON.parse(saved);
        console.log(`📚 Loaded ${this.tradeHistory.length} historical trades`);
      }
    } catch (error) {
      console.error('Failed to load trade history:', error);
      this.tradeHistory = [];
    }
  }

  private saveLearningInsights() {
    try {
      localStorage.setItem('trading-bot-insights', JSON.stringify({
        insights: this.learningInsights,
        lastUpdate: this.lastLearningUpdate
      }));
    } catch (error) {
      console.error('Failed to save learning insights:', error);
    }
  }

  private loadLearningInsights() {
    try {
      const saved = localStorage.getItem('trading-bot-insights');
      if (saved) {
        const data = JSON.parse(saved);
        this.learningInsights = data.insights;
        this.lastLearningUpdate = data.lastUpdate;
        console.log('🧠 Loaded learning insights');
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
      winRate: completedTrades.length > 0 ? (profitableTrades.length / completedTrades.length * 100).toFixed(2) : '0',
      avgProfit: profitableTrades.length > 0 ? (profitableTrades.reduce((sum, t) => sum + (t.profitPercent || 0), 0) / profitableTrades.length).toFixed(2) : '0',
      lastLearningUpdate: new Date(this.lastLearningUpdate).toLocaleString()
    };
  }
}

export const learningService = new LearningService();