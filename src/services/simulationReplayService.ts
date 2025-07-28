import { MarketData, NewsItem, SimulationReplay, StrategyPerformance } from '../types/trading';
import { multiStrategyService } from './multiStrategyService';

class SimulationReplayService {
  private historicalData: Map<string, SimulationReplay> = new Map();
  private isReplaying: boolean = false;
  private replayResults: any = null;

  async runSimulationReplay(
    date: string,
    strategies: any,
    initialBalance: number = 10000,
    positionType: 'SPOT' | 'LONG' | 'SHORT' = 'SPOT',
  leverage: number = 1
  ): Promise<{
    totalPnL: number;
    totalTrades: number;
    strategyResults: StrategyPerformance[];
    tradeHistory: any[];
  }> {
    console.log(`🧪 Starting simulation replay for ${date}`);
    this.isReplaying = true;

    try {
      // Generate mock historical data for the selected date
      const { marketData, newsData } = this.generateHistoricalData(date);
      
      let balance = initialBalance;
      let totalTrades = 0;
      const tradeHistory: any[] = [];
      const strategyStats = new Map<string, { trades: number; wins: number; pnl: number }>();

      // Initialize strategy stats
      Object.keys(strategies).forEach(key => {
        if (strategies[key].enabled) {
          strategyStats.set(key.toUpperCase(), { trades: 0, wins: 0, pnl: 0 });
        }
      });

      // Simulate trading throughout the day (every 15 minutes)
      for (let i = 0; i < marketData.length - 1; i++) {
        const currentData = marketData[i];
        const nextData = marketData[i + 1];
        
        // Evaluate strategies
        const strategyResults = await multiStrategyService.evaluateStrategies(
          'BTCUSDT', // Mock symbol
          currentData,
          newsData,
          strategies
        );

        const combinedResult = multiStrategyService.combineStrategyResults(strategyResults);

        // Execute trade if confidence is high enough
        if (combinedResult.action !== 'HOLD' && combinedResult.confidence > 0.6) {
          const tradeAmount = balance * 0.1; // 10% of balance per trade
          // Pozisyon büyüklüğü (lot adedi)
          const quantity = tradeAmount / entryPrice;
          const entryPrice = currentData.price;
          const exitPrice = nextData.price;
          
          let rawPnl: number;
  if (combinedResult.action === 'BUY') {
    rawPnl = (exitPrice - entryPrice) * quantity;
  } else {
    rawPnl = (entryPrice - exitPrice) * quantity;
  }
         const pnl = rawPnl * (positionType === 'SPOT' ? 1 : leverage);
          balance += pnl;
          totalTrades++;

          const trade = {
            timestamp: currentData.timestamp,
            action: combinedResult.action,
            entryPrice,
            exitPrice,
            pnl,
            leverage: positionType === 'SPOT' ? 1 : leverage,
            positionType,
            strategy: combinedResult.bestStrategy,
            confidence: combinedResult.confidence
          };

          tradeHistory.push(trade);

          // Update strategy stats
          const strategyKey = combinedResult.bestStrategy;
          if (strategyStats.has(strategyKey)) {
            const stats = strategyStats.get(strategyKey)!;
            stats.trades++;
            stats.pnl += pnl;
            if (pnl > 0) stats.wins++;
          }
        }
      }

      // Convert strategy stats to performance objects
      const strategyResults: StrategyPerformance[] = Array.from(strategyStats.entries()).map(([name, stats]) => ({
        name,
        totalTrades: stats.trades,
        winningTrades: stats.wins,
        totalPnL: stats.pnl,
        winRate: stats.trades > 0 ? stats.wins / stats.trades : 0,
        avgTradeDuration: 15 * 60 * 1000, // 15 minutes in ms
        lastUsed: Date.now()
      }));

      const totalPnL = balance - initialBalance;

      // Save replay results
      const replayData: SimulationReplay = {
        date,
        marketData,
        newsData,
        strategies: strategyResults,
        totalPnL,
        totalTrades
      };

      this.historicalData.set(date, replayData);
      this.replayResults = {
        totalPnL,
        totalTrades,
        strategyResults,
        tradeHistory
      };

      console.log(`✅ Simulation replay complete: ${totalTrades} trades, $${totalPnL.toFixed(2)} P&L`);
      return this.replayResults;

    } finally {
      this.isReplaying = false;
    }
  }

  private generateHistoricalData(date: string): { marketData: MarketData[]; newsData: NewsItem[] } {
    const marketData: MarketData[] = [];
    const newsData: NewsItem[] = [];
    
    const baseDate = new Date(date);
    const basePrice = 43000 + (Math.random() * 2000); // Random BTC price around $43-45k

    // Generate 96 data points (every 15 minutes for 24 hours)
    for (let i = 0; i < 96; i++) {
      const timestamp = baseDate.getTime() + (i * 15 * 60 * 1000);
      const priceVariation = (Math.random() - 0.5) * 1000; // ±$500 variation
      const price = Math.max(basePrice + priceVariation, 30000); // Minimum $30k

      marketData.push({
        symbol: 'BTCUSDT',
        price,
        timestamp,
        volume: 50000 + (Math.random() * 100000),
        rsi: 30 + (Math.random() * 40), // RSI between 30-70
        macd: (Math.random() - 0.5) * 0.02,
        ema12: price * (1 + (Math.random() - 0.5) * 0.01),
        ema26: price * (1 + (Math.random() - 0.5) * 0.01),
        emaTrend: Math.random() > 0.5 ? 'BULLISH' : 'BEARISH',
        volumeRatio: 0.5 + (Math.random() * 2),
        bollinger: {
          upper: price * 1.02,
          middle: price,
          lower: price * 0.98
        }
      });
    }

    // Generate mock news for the day
    const newsCount = 3 + Math.floor(Math.random() * 5); // 3-8 news items
    for (let i = 0; i < newsCount; i++) {
      const timestamp = baseDate.getTime() + (Math.random() * 24 * 60 * 60 * 1000);
      const sentiments = ['BULLISH', 'BEARISH', 'NEUTRAL'];
      const sentiment = sentiments[Math.floor(Math.random() * sentiments.length)];

      newsData.push({
        id: `replay_news_${i}`,
        title: `Mock crypto news ${i + 1} for ${date}`,
        content: `Simulated news content with ${sentiment.toLowerCase()} sentiment`,
        source: 'Simulation',
        timestamp,
        sentiment: sentiment as any,
        impact: Math.random() * 10,
        coins: ['BTC', 'ETH']
      });
    }

    return { marketData, newsData };
  }

  getReplayResults() {
    return this.replayResults;
  }

  isCurrentlyReplaying(): boolean {
    return this.isReplaying;
  }

  getHistoricalReplays(): SimulationReplay[] {
    return Array.from(this.historicalData.values());
  }

  clearReplayHistory() {
    console.log('🔄 Clearing simulation replay history...');
    this.historicalData.clear();
    this.replayResults = null;
    console.log('✅ Simulation replay history cleared');
  }
}

export const simulationReplayService = new SimulationReplayService();
