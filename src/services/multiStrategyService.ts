import { MarketData, NewsItem, StrategyResult, StrategyPerformance } from '../types/trading';
import { newsService } from './newsService';

class MultiStrategyService {
  private strategyPerformance: Map<string, StrategyPerformance> = new Map();

  constructor() {
    this.initializeStrategies();
    this.loadPerformanceData();
  }

  private initializeStrategies() {
    const strategies = ['RSI_MACD', 'NEWS_SENTIMENT', 'VOLUME_SPIKE'];
    
    strategies.forEach(name => {
      if (!this.strategyPerformance.has(name)) {
        this.strategyPerformance.set(name, {
          name,
          totalTrades: 0,
          winningTrades: 0,
          totalPnL: 0,
          winRate: 0,
          avgTradeDuration: 0,
          lastUsed: 0
        });
      }
    });
  }

  async evaluateStrategies(
    symbol: string, 
    marketData: MarketData, 
    news: NewsItem[], 
    enabledStrategies: any,
    positionType: 'SPOT' | 'LONG' | 'SHORT' = 'SPOT',
    leverage: number = 1
  ): Promise<StrategyResult[]> {
    const results: StrategyResult[] = [];

    // RSI + MACD: spot modunda SELL sinyalleri önemsizleştir
  if (enabledStrategies.rsiMacd.enabled) {
    const rsiMacdResult = this.evaluateRsiMacdStrategy(marketData, enabledStrategies.rsiMacd.weight);
    // Spot modunda SELL sinyali gelirse HOLD olarak işaretle
    if (positionType === 'SPOT' && rsiMacdResult.action === 'SELL') {
      rsiMacdResult.action = 'HOLD';
      rsiMacdResult.confidence = 0;
      rsiMacdResult.reasoning += ' (SELL skipped in spot mode)';
    }
    results.push(rsiMacdResult);
  }

    // Strategy B: News Sentiment + Llama3
    if (enabledStrategies.newsSentiment.enabled) {
      const sentimentResult = await this.evaluateNewsSentimentStrategy(symbol, marketData, news, enabledStrategies.newsSentiment.weight);
      results.push(sentimentResult);
    }

    // Strategy C: Volume Spike + Volatility
    if (enabledStrategies.volumeSpike.enabled) {
    const volumeResult = this.evaluateVolumeSpikeStrategy(marketData, enabledStrategies.volumeSpike.weight);
    // Futures işlemlerinde güveni hafifçe artır
    if (positionType !== 'SPOT') {
      volumeResult.confidence = Math.min(0.95, volumeResult.confidence * (1 + leverage * 0.02));
    }
    results.push(volumeResult);
  }

    return results;
  }

  private evaluateRsiMacdStrategy(marketData: MarketData, weight: number): StrategyResult {
    const { rsi, macd } = marketData;
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0.5;
    let reasoning = 'RSI/MACD analysis';

    // RSI + MACD logic
    if (rsi < 30 && macd > 0) {
      action = 'BUY';
      confidence = 0.8;
      reasoning = 'RSI oversold + MACD bullish crossover';
    } else if (rsi > 70 && macd < 0) {
      action = 'SELL';
      confidence = 0.8;
      reasoning = 'RSI overbought + MACD bearish crossover';
    } else if (rsi < 40 && macd > 0.001) {
      action = 'BUY';
      confidence = 0.6;
      reasoning = 'RSI low + MACD positive momentum';
    } else if (rsi > 60 && macd < -0.001) {
      action = 'SELL';
      confidence = 0.6;
      reasoning = 'RSI high + MACD negative momentum';
    }

    return {
      strategyName: 'RSI_MACD',
      action,
      confidence: confidence * weight,
      reasoning,
      weight
    };
  }

  private async evaluateNewsSentimentStrategy(
    symbol: string, 
    marketData: MarketData, 
    news: NewsItem[], 
    weight: number
  ): Promise<StrategyResult> {
    const relevantNews = news.filter(item => 
      item.coins.includes(symbol.replace('USDT', '')) || 
      item.title.toLowerCase().includes('crypto') ||
      item.title.toLowerCase().includes('bitcoin') ||
      item.title.toLowerCase().includes('ethereum')
    );

    let sentimentScore = 0;
    let confidence = 0.5;
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';

    if (relevantNews.length > 0) {
      sentimentScore = relevantNews.reduce((sum, item) => {
        switch (item.sentiment) {
          case 'BULLISH': return sum + 1;
          case 'BEARISH': return sum - 1;
          default: return sum;
        }
      }, 0) / relevantNews.length;

      if (sentimentScore > 0.3) {
        action = 'BUY';
        confidence = Math.min(0.9, 0.5 + Math.abs(sentimentScore));
      } else if (sentimentScore < -0.3) {
        action = 'SELL';
        confidence = Math.min(0.9, 0.5 + Math.abs(sentimentScore));
      }
    }

    return {
      strategyName: 'NEWS_SENTIMENT',
      action,
      confidence: confidence * weight,
      reasoning: `News sentiment: ${sentimentScore.toFixed(2)} (${relevantNews.length} articles)`,
      weight
    };
  }

  private evaluateVolumeSpikeStrategy(marketData: MarketData, weight: number): StrategyResult {
    const { volumeRatio, bollinger, price } = marketData;
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let confidence = 0.5;
    let reasoning = 'Volume/Volatility analysis';

    // Volume spike detection
    const hasVolumeSpike = volumeRatio > 2.0;
    const hasHighVolume = volumeRatio > 1.5;

    // Volatility analysis using Bollinger Bands
    if (bollinger && hasVolumeSpike) {
      const { upper, lower, middle } = bollinger;
      const volatility = (upper - lower) / middle;

      if (price < lower * 1.02 && volatility > 0.04) {
        action = 'BUY';
        confidence = 0.85;
        reasoning = 'Volume spike + price near lower Bollinger band';
      } else if (price > upper * 0.98 && volatility > 0.04) {
        action = 'SELL';
        confidence = 0.85;
        reasoning = 'Volume spike + price near upper Bollinger band';
      }
    } else if (hasHighVolume) {
      confidence = 0.6;
      reasoning = 'Moderate volume increase detected';
    }

    return {
      strategyName: 'VOLUME_SPIKE',
      action,
      confidence: confidence * weight,
      reasoning,
      weight
    };
  }

  combineStrategyResults(results: StrategyResult[]): {
    action: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    reasoning: string;
    bestStrategy: string;
  } {
    if (results.length === 0) {
      return { action: 'HOLD', confidence: 0, reasoning: 'No strategies enabled', bestStrategy: 'NONE' };
    }

    // Calculate weighted average
    let buyScore = 0;
    let sellScore = 0;
    let totalWeight = 0;
    let reasoning = '';
    let bestStrategy = results[0].strategyName;
    let bestConfidence = 0;

    results.forEach(result => {
      totalWeight += result.weight;
      
      if (result.action === 'BUY') {
        buyScore += result.confidence;
      } else if (result.action === 'SELL') {
        sellScore += result.confidence;
      }

      if (result.confidence > bestConfidence) {
        bestConfidence = result.confidence;
        bestStrategy = result.strategyName;
      }

      reasoning += `${result.strategyName}: ${result.action} (${result.confidence.toFixed(2)}); `;
    });

    // Determine final action
    let finalAction: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let finalConfidence = 0;

    if (buyScore > sellScore && buyScore > 0.5) {
      finalAction = 'BUY';
      finalConfidence = buyScore / results.length;
    } else if (sellScore > buyScore && sellScore > 0.5) {
      finalAction = 'SELL';
      finalConfidence = sellScore / results.length;
    }

    return {
      action: finalAction,
      confidence: Math.min(0.95, finalConfidence),
      reasoning: reasoning.trim(),
      bestStrategy
    };
  }

  recordStrategyOutcome(strategyName: string, profit: number, duration: number) {
    const performance = this.strategyPerformance.get(strategyName);
    if (!performance) return;

    performance.totalTrades++;
    performance.totalPnL += profit;
    performance.lastUsed = Date.now();

    if (profit > 0) {
      performance.winningTrades++;
    }

    performance.winRate = performance.winningTrades / performance.totalTrades;
    performance.avgTradeDuration = (performance.avgTradeDuration + duration) / 2;

    this.savePerformanceData();
  }

  getBestPerformingStrategy(): StrategyPerformance | null {
    let best: StrategyPerformance | null = null;
    let bestScore = -Infinity;

    this.strategyPerformance.forEach(performance => {
      if (performance.totalTrades < 3) return; // Need minimum trades

      // Score based on win rate and total PnL
      const score = (performance.winRate * 0.6) + (performance.totalPnL / 1000 * 0.4);
      
      if (score > bestScore) {
        bestScore = score;
        best = performance;
      }
    });

    return best;
  }

  getStrategyPerformance(): StrategyPerformance[] {
    return Array.from(this.strategyPerformance.values());
  }

  private savePerformanceData() {
    try {
      const data = Array.from(this.strategyPerformance.entries());
      localStorage.setItem('multi-strategy-performance', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save strategy performance:', error);
    }
  }

  private loadPerformanceData() {
    try {
      const saved = localStorage.getItem('multi-strategy-performance');
      if (saved) {
        const data = JSON.parse(saved);
        this.strategyPerformance = new Map(data);
        console.log(`📊 Loaded performance data for ${this.strategyPerformance.size} strategies`);
      }
    } catch (error) {
      console.error('Failed to load strategy performance:', error);
    }
  }

  resetPerformance() {
    console.log('🔄 Resetting multi-strategy performance...');
    this.strategyPerformance.clear();
    this.initializeStrategies();
    this.savePerformanceData();
    console.log('✅ Multi-strategy performance reset complete');
  }
}

export const multiStrategyService = new MultiStrategyService();
