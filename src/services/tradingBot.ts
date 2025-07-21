import { BotConfig, Portfolio, Position, Trade, MarketData } from '../types/trading';
import { binanceService } from './binanceService';
import { newsService } from './newsService';
import { learningService } from './learningService';
import { adaptiveStrategy } from './adaptiveStrategy';
import { logService } from './logService';

class TradingBot {
  private config: BotConfig;
  private portfolio: Portfolio;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private fastLearningIntervalId: NodeJS.Timeout | null = null;
  private activePositionIds: Set<string> = new Set();
  private subscribedSymbols: Set<string> = new Set();
  private fastLearningTradeCount: number = 0;
  private lastFastLearningTrade: number = 0;
  private fastLearningRetrainCounter: number = 0;
  private multiExitPositions: Map<string, { tp1Hit: boolean; tp2Hit: boolean; trailingSL: number }> = new Map();

  constructor() {
    // Load saved config or use defaults
    this.config = this.loadConfig();

    this.portfolio = {
      totalValue: this.config.simulationBalance,
      totalPnl: 0,
      totalPnlPercent: 0,
      availableBalance: this.config.simulationBalance,
      positions: [],
      trades: [],
    };
  }

  private loadConfig(): BotConfig {
    try {
      const saved = localStorage.getItem('trading-bot-config');
      if (saved) {
        const savedConfig = JSON.parse(saved);
        logService.info('configLoaded', {}, 'Loaded saved bot configuration');
        
        // Merge with defaults to ensure all fields exist
        const config = {
          mode: savedConfig.mode || 'SIMULATION',
          simulationBalance: savedConfig.simulationBalance || 10000,
          fastLearningMode: savedConfig.fastLearningMode || false,
          adaptiveStrategyEnabled: savedConfig.adaptiveStrategyEnabled !== undefined ? savedConfig.adaptiveStrategyEnabled : true,
          maxRiskPerTrade: savedConfig.maxRiskPerTrade || 0.05,
          stopLossPercent: savedConfig.stopLossPercent || 0.03,
          takeProfitPercent: savedConfig.takeProfitPercent || 0.06,
          maxPositions: savedConfig.maxPositions || 8,
          enableNewsTrading: savedConfig.enableNewsTrading !== undefined ? savedConfig.enableNewsTrading : true,
          enableTechnicalAnalysis: savedConfig.enableTechnicalAnalysis !== undefined ? savedConfig.enableTechnicalAnalysis : true,
          confidenceThreshold: savedConfig.confidenceThreshold || 0.80,
          apiKey: savedConfig.apiKey || '',
          apiSecret: savedConfig.apiSecret || '',
          llama3Url: savedConfig.llama3Url || 'http://localhost:11434',
          llama3Model: savedConfig.llama3Model || 'llama3',
          // Multi-strategy settings
          enableMultiStrategy: savedConfig.enableMultiStrategy !== undefined ? savedConfig.enableMultiStrategy : false,
          strategies: {
            rsiMacd: {
              enabled: savedConfig.strategies?.rsiMacd?.enabled !== undefined ? savedConfig.strategies.rsiMacd.enabled : true,
              weight: savedConfig.strategies?.rsiMacd?.weight || 1.0
            },
            newsSentiment: {
              enabled: savedConfig.strategies?.newsSentiment?.enabled !== undefined ? savedConfig.strategies.newsSentiment.enabled : true,
              weight: savedConfig.strategies?.newsSentiment?.weight || 1.0
            },
            volumeSpike: {
              enabled: savedConfig.strategies?.volumeSpike?.enabled !== undefined ? savedConfig.strategies.volumeSpike.enabled : true,
              weight: savedConfig.strategies?.volumeSpike?.weight || 1.0
            }
          },
          // Auto-rebalance settings
          enableAutoRebalance: savedConfig.enableAutoRebalance !== undefined ? savedConfig.enableAutoRebalance : false,
          scaleInThreshold: savedConfig.scaleInThreshold || 0.03,
          scaleOutThreshold: savedConfig.scaleOutThreshold || -0.01,
          enableTrailingStop: savedConfig.enableTrailingStop !== undefined ? savedConfig.enableTrailingStop : false,
          trailingStopPercent: savedConfig.trailingStopPercent || 0.01,
          // Simulation replay settings
          enableSimulationReplay: savedConfig.enableSimulationReplay !== undefined ? savedConfig.enableSimulationReplay : false
          // Aggressive mode settings
          enableAggressiveMode: savedConfig.enableAggressiveMode !== undefined ? savedConfig.enableAggressiveMode : false
        };
        return config;
      }
    } catch (error) {
      logService.error('configLoadError', { 
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to load saved config');
    }
    
    // Return default config
    logService.info('configLoaded', {}, 'Using default bot configuration');
    return {
      mode: 'SIMULATION',
      simulationBalance: 10000,
      fastLearningMode: false,
      adaptiveStrategyEnabled: true,
      maxRiskPerTrade: 0.05,
      stopLossPercent: 0.03,
      takeProfitPercent: 0.06,
      maxPositions: 8,
      enableNewsTrading: true,
      enableTechnicalAnalysis: true,
      confidenceThreshold: 0.80,
      apiKey: '',
      apiSecret: '',
      llama3Url: 'http://localhost:11434',
      llama3Model: 'llama3',
      // Multi-strategy settings
      enableMultiStrategy: false,
      strategies: {
        rsiMacd: {
          enabled: true,
          weight: 1.0
        },
        newsSentiment: {
          enabled: true,
          weight: 1.0
        },
        volumeSpike: {
          enabled: true,
          weight: 1.0
        }
      },
      // Auto-rebalance settings
      enableAutoRebalance: false,
      scaleInThreshold: 0.03,
      scaleOutThreshold: -0.01,
      enableTrailingStop: false,
      trailingStopPercent: 0.01,
      // Simulation replay settings
      enableSimulationReplay: false,
      // Aggressive mode settings
      enableAggressiveMode: false
    };
  }

  private saveConfig(): void {
    try {
      localStorage.setItem('trading-bot-config', JSON.stringify(this.config));
      logService.info('configSaved');
    } catch (error) {
      logService.error('configSaveError', { 
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to save config');
    }
  }

  setConfig(config: Partial<BotConfig>) {
    this.config = { ...this.config, ...config };
    
    // Save configuration immediately
    this.saveConfig();
    
    // Update simulation balance if changed
    if (config.simulationBalance && this.config.mode === 'SIMULATION') {
      const currentValue = this.portfolio.totalValue;
      const newBalance = config.simulationBalance;
      this.portfolio.availableBalance = newBalance;
      this.portfolio.totalValue = newBalance;
      this.portfolio.totalPnl = 0;
      this.portfolio.totalPnlPercent = 0;
      this.portfolio.positions = [];
      this.portfolio.trades = [];
    }
    
    // Update Binance service credentials if provided
    if (config.apiKey && config.apiSecret !== undefined) {
      binanceService.setCredentials(
        config.apiKey,
        config.apiSecret,
        config.mode === 'SIMULATION'
      );
    }
    
    // Update Llama 3 configuration if provided
    if (config.llama3Url || config.llama3Model) {
      newsService.setLlama3Config(
        config.llama3Url || 'http://localhost:11434',
        config.llama3Model || 'llama3'
      );
      learningService.setLlama3Config(
        config.llama3Url || 'http://localhost:11434',
        config.llama3Model || 'llama3'
      );
    }
  }

  getConfig(): BotConfig {
    return this.config;
  }

  getPortfolio(): Portfolio {
    return this.portfolio;
  }

  async updateRealWalletBalance() {
    if (this.config.mode === 'REAL') {
      const accountInfo = await binanceService.getAccountInfo();
      if (accountInfo) {
        this.portfolio.totalValue = accountInfo.totalWalletBalance;
        this.portfolio.availableBalance = accountInfo.totalWalletBalance;
        console.log(`Real wallet balance updated: $${accountInfo.totalWalletBalance.toFixed(2)}`);
      }
    }
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    // Set global flag for fast learning mode
    (globalThis as any).fastLearningMode = this.config.fastLearningMode;
    
    logService.info('botStarted', { mode: this.config.mode });
    
    // Subscribe to WebSocket data for top trading pairs
    this.initializeWebSocketSubscriptions();
    
    // Update real wallet balance if in real mode
    if (this.config.mode === 'REAL') {
      this.updateRealWalletBalance();
      this.syncRealPositions();
    }
    
    if (this.config.fastLearningMode && this.config.mode === 'SIMULATION') {
      logService.info('fastLearningActivated', {}, 'Fast Learning Mode activated - WebSocket-driven aggressive trading');
      // Fast learning is now driven by WebSocket updates, not intervals
    } else {
      // Run trading loop every 10 seconds for normal execution
      this.intervalId = setInterval(() => {
        this.runTradingLoop();
      }, 10000);
      // Run initial loop
      this.runTradingLoop();
    }
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    if (this.fastLearningIntervalId) {
      clearInterval(this.fastLearningIntervalId);
      this.fastLearningIntervalId = null;
    }
    
    // Disconnect WebSocket connections
    binanceService.disconnectAll();
    this.subscribedSymbols.clear();
    
    logService.info('botStopped');
  }

  isActive(): boolean {
    return this.isRunning;
  }

  private async initializeWebSocketSubscriptions() {
    try {
      const tradingPairs = await binanceService.getTradingPairs();
      const topPairs = tradingPairs.slice(0, 10);
      
      for (const pair of topPairs) {
        if (!this.subscribedSymbols.has(pair.symbol)) {
          binanceService.subscribeToMarketData(pair.symbol, (marketData) => {
            this.onMarketDataUpdate(marketData);
          });
          this.subscribedSymbols.add(pair.symbol);
        }
      }
      
      logService.info('websocketSubscribed', { count: topPairs.length }, `Subscribed to ${topPairs.length} WebSocket streams`);
    } catch (error) {
      logService.error('websocketSubscriptionFailed', {   error: error instanceof Error ? error.message : String(error)  }, 'Failed to initialize WebSocket subscriptions');
    }
  }

  private onMarketDataUpdate(marketData: MarketData) {
    // WebSocket-driven Fast Learning Mode
    if (this.config.fastLearningMode && this.config.mode === 'SIMULATION') {
      // Execute aggressive trading on every WebSocket update
      this.executeWebSocketFastLearning(marketData);
    }
  }

  private async executeWebSocketFastLearning(marketData: MarketData) {
    try {
      const now = Date.now();
      
      // Minimum 500ms between trades to prevent spam
      if (now - this.lastFastLearningTrade < 500) {
        return;
      }
      
      console.log(`⚡ WebSocket Fast Learning: ${marketData.symbol} - Price: $${marketData.price.toFixed(2)}, RSI: ${marketData.rsi.toFixed(1)}`);
      
      // Skip if we already have a position in this symbol
      if (this.activePositionIds.has(marketData.symbol)) {
        return;
      }
      
      // Skip if we're at max positions
      // Aggressive mode: Allow up to 40 positions, normal mode: use configured max
      const maxPositions = this.config.enableAggressiveMode ? 40 : this.config.maxPositions;
      if (this.portfolio.positions.length >= maxPositions) {
        return;
      }
      
      // Get news for signal generation
      const news = newsService.getLatestNews();
      
      // Generate trading signal
      const signal = await newsService.generateTradingSignal(marketData.symbol, marketData, news);
      
      // Get learning insights
      const learningInsights = await learningService.getMarketInsights();
      
      // Apply learning insights to improve decision making
      const enhancedSignal = await learningService.enhanceSignal(signal, marketData, learningInsights);
      
      // Apply adaptive strategy analysis
      const adaptiveDecision = this.config.adaptiveStrategyEnabled 
        ? adaptiveStrategy.shouldTrade(marketData, this.config.confidenceThreshold)
        : { shouldTrade: true, reason: 'Static strategy mode', confidence: 0.7, strategy: { entryThreshold: 0.6, riskMultiplier: 1.0 } };
      
      // Log adaptive decision
      if (this.config.adaptiveStrategyEnabled) {
        logService.learning('adaptiveDecision', {
          decision: adaptiveDecision.shouldTrade ? 'ALLOW' : 'BLOCK',
          reason: adaptiveDecision.reason,
          confidence: adaptiveDecision.confidence.toFixed(3),
          threshold: this.config.confidenceThreshold.toFixed(3)
        });
      }
      
      if (this.config.adaptiveStrategyEnabled && !adaptiveDecision.shouldTrade) {
        logService.warning('tradeBlocked', {
          symbol: marketData.symbol,
          reason: adaptiveDecision.reason
        });
        return;
      }
      
      // Combine signals with adaptive confidence
      const finalConfidence = (enhancedSignal.confidence + adaptiveDecision.confidence) / 2;
      const finalSignal = {
        ...enhancedSignal,
        confidence: finalConfidence,
        reasoning: `${enhancedSignal.reasoning} | ${adaptiveDecision.reason}`
      };
      
      logService.info('signalEvaluation', {
        symbol: marketData.symbol,
        action: enhancedSignal.action,
        confidence: enhancedSignal.confidence.toFixed(3),
        threshold: this.config.confidenceThreshold.toFixed(3)
      });
      
      // Fast learning trading logic
      const shouldTrade = finalSignal.action !== 'HOLD' && finalSignal.confidence > this.config.confidenceThreshold;
      const randomTrade = Math.random() < 0.1; // 10% chance of random trade
      
      if (shouldTrade || randomTrade) {
        let action = finalSignal.action;
        
        // If random trade, pick random action
        if (randomTrade && !shouldTrade) {
          action = Math.random() > 0.5 ? 'BUY' : 'SELL';
          logService.learning('randomExplorationTrade', {
            action,
            symbol: marketData.symbol
          });
        }
        
        logService.learning('fastLearningTradeExecuted', {
          action,
          symbol: marketData.symbol,
          confidence: enhancedSignal.confidence.toFixed(2)
        });
        await this.executeTrade(marketData.symbol, action, marketData, finalSignal, adaptiveDecision.strategy);
        
        this.fastLearningTradeCount++;
        this.lastFastLearningTrade = now;
        
        // Log portfolio status
        logService.info('portfolioStatus', {
          positions: this.portfolio.positions.length,
          totalValue: this.portfolio.totalValue.toFixed(2),
          totalPnl: this.portfolio.totalPnl.toFixed(2)
        });
        
        // Trigger learning every 3-5 trades (randomized)
        const retrainInterval = 3 + Math.floor(Math.random() * 3); // 3-5 trades
        if (this.fastLearningTradeCount % retrainInterval === 0) {
          logService.learning('earlyRetraining', {
            tradeCount: this.fastLearningTradeCount
          });
          await learningService.retrainModel();
        }
      }
      
    } catch (error) {
      logService.error('fastLearningLoopError', { 
        symbol: marketData.symbol, 
        error: error instanceof Error ? error.message : String(error) 
      }, `Fast learning loop error for ${marketData.symbol}`);
    }
  }

  private async syncRealPositions() {
    if (this.config.mode !== 'REAL') return;
    
    try {
      const openPositions = await binanceService.getOpenPositions();
      console.log(`🔄 Synced ${openPositions.length} real positions`);
      
      // Update portfolio with real positions
      // This would need more complex logic to convert Binance orders to our Position format
    } catch (error) {
      console.error('Failed to sync real positions:', error);
    }
  }

  private async runFastLearningLoop() {
    try {
      console.log(`🧠 Fast Learning Loop #${this.fastLearningTradeCount + 1}`);
      
      // Get learning insights before making decisions
      const learningInsights = await learningService.getMarketInsights();
      
      // Get top trading pairs and news
      const tradingPairs = await binanceService.getTradingPairs();
      const news = newsService.getLatestNews();
      
      // Update existing positions
      await this.updatePositions();
      
      console.log(`📊 Fast Learning: Checking ${tradingPairs.length} pairs, ${this.portfolio.positions.length}/${this.config.maxPositions} positions`);
      
      // Execute micro-trades more aggressively - check more pairs
      for (const pair of tradingPairs.slice(0, 10)) {
        if (this.portfolio.positions.length >= this.config.maxPositions) break;
        
        if (this.activePositionIds.has(pair.symbol)) continue;
        
        // Try to get WebSocket data first, fallback to REST
        let marketData = await binanceService.getMarketData(pair.symbol);
        
        // If no WebSocket data, create basic market data from pair info
        if (!marketData) {
          console.log(`⚠️ No market data for ${pair.symbol}, creating basic data`);
          marketData = {
            symbol: pair.symbol,
            price: pair.price,
            timestamp: Date.now(),
            volume: pair.volume,
            rsi: 40 + (Math.random() * 30), // Random RSI between 40-70 for more signals
            macd: (Math.random() - 0.5) * 0.01, // Small random MACD
            ema12: pair.price * (1 + (Math.random() - 0.5) * 0.02),
            ema26: pair.price * (1 + (Math.random() - 0.5) * 0.02),
            emaTrend: Math.random() > 0.33 ? (Math.random() > 0.5 ? 'BULLISH' : 'BEARISH') : 'NEUTRAL' as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
            volumeRatio: 0.5 + (Math.random() * 2), // 0.5 to 2.5 for more variety
            bollinger: {
              upper: pair.price * 1.02,
              middle: pair.price,
              lower: pair.price * 0.98,
            },
          };
        }
        
        const signal = await newsService.generateTradingSignal(pair.symbol, marketData, news);
        const enhancedSignal = await learningService.enhanceSignal(signal, marketData, learningInsights);
        
        console.log(`🔍 ${pair.symbol}: ${enhancedSignal.action} (confidence: ${enhancedSignal.confidence.toFixed(2)}, RSI: ${marketData.rsi.toFixed(1)})`);
        
        // Much lower confidence threshold for fast learning + more random trades
        const shouldTrade = enhancedSignal.action !== 'HOLD' && enhancedSignal.confidence > 0.2;
        const randomTrade = Math.random() < 0.3; // 30% chance of random trade for exploration
        
        if (shouldTrade || randomTrade) {
          let action = enhancedSignal.action;
          
          // If random trade, pick random action
          if (randomTrade && !shouldTrade) {
            action = Math.random() > 0.5 ? 'BUY' : 'SELL';
            console.log(`🎲 Random exploration trade: ${action} ${pair.symbol}`);
          }
          
          console.log(`⚡ Fast Learning Trade: ${action} ${pair.symbol} (confidence: ${enhancedSignal.confidence.toFixed(2)})`);
          await this.executeTrade(pair.symbol, action, marketData, enhancedSignal);
          this.fastLearningTradeCount++;
          
          // Trigger learning every 3-5 trades instead of 20
          if (this.fastLearningTradeCount % 3 === 0) {
            console.log('🧠 Fast Learning: Triggering early model retraining...');
            await learningService.retrainModel();
          }
          
          // Break after first trade to allow position updates
          break;
        }
      }
      
      // If no trades executed, try a forced exploration trade
      if (this.fastLearningTradeCount === 0 || (this.fastLearningTradeCount % 10 === 0 && tradingPairs.length > 0)) {
        const randomPair = tradingPairs[Math.floor(Math.random() * Math.min(5, tradingPairs.length))];
        if (!this.activePositionIds.has(randomPair.symbol) && this.portfolio.positions.length < this.config.maxPositions) {
          logService.learning('forcedExplorationTrade', {
            symbol: randomPair.symbol
          });
          
          const basicMarketData = {
            symbol: randomPair.symbol,
            price: randomPair.price,
            timestamp: Date.now(),
            volume: randomPair.volume,
            rsi: 50,
            macd: 0,
            ema12: randomPair.price,
            ema26: randomPair.price,
            emaTrend: 'NEUTRAL' as 'NEUTRAL',
            volumeRatio: 1,
            bollinger: {
              upper: randomPair.price * 1.02,
              middle: randomPair.price,
              lower: randomPair.price * 0.98,
            },
          };
          
          const action = Math.random() > 0.5 ? 'BUY' : 'SELL';
          await this.executeTrade(randomPair.symbol, action, basicMarketData, { action, confidence: 0.5, reasoning: 'Exploration trade' });
          this.fastLearningTradeCount++;
        }
      }
      
      this.updatePortfolioMetrics();
      
    } catch (error) {
      logService.error('fastLearningLoopError', { 
        error: error instanceof Error ? error.message : String(error) 
      }, 'Fast learning loop error');
    }
  }

  private async runTradingLoop() {
    try {
      // Get learning insights before making decisions
      const learningInsights = await learningService.getMarketInsights();
      
      // Fetch market data
      const tradingPairs = await binanceService.getTradingPairs();
      const news = await newsService.fetchCryptoNews();
      
      // Update existing positions
      await this.updatePositions();
      
      logService.info('portfolioStatus', {
        positions: this.portfolio.positions.length,
        totalValue: this.portfolio.totalValue.toFixed(2),
        totalPnl: this.portfolio.totalPnl.toFixed(2)
      });
      
      // Process trading pairs in batches to prevent resource overload
      const batchSize = 3;
      const pairs = tradingPairs.slice(0, 12); // Reduced from 20 to 12
      
      for (let i = 0; i < pairs.length; i += batchSize) {
        // Check if we've reached max positions before processing batch
        // Aggressive mode: Allow up to 40 positions, normal mode: use configured max
        const maxPositions = this.config.enableAggressiveMode ? 40 : this.config.maxPositions;
        if (this.portfolio.positions.length >= maxPositions) break;
        
        const batch = pairs.slice(i, i + batchSize);
        
        // Process batch in parallel but with limited concurrency
        await Promise.all(batch.map(async (pair) => {
          // Skip if we already have a position in this symbol
          if (this.activePositionIds.has(pair.symbol)) return;
          
          const marketData = await binanceService.getMarketData(pair.symbol);
          if (!marketData) return;
          
          const signal = await newsService.generateTradingSignal(pair.symbol, marketData, news);
          
          // Apply learning insights to improve decision making
          const enhancedSignal = await learningService.enhanceSignal(signal, marketData, learningInsights);
          
          // Apply adaptive strategy analysis
          const adaptiveDecision = this.config.adaptiveStrategyEnabled 
            ? adaptiveStrategy.shouldTrade(marketData, this.config.confidenceThreshold)
            : { shouldTrade: true, reason: 'Static strategy mode', confidence: 0.7, strategy: { entryThreshold: 0.6, riskMultiplier: 1.0 } };
          
          if (!adaptiveDecision.shouldTrade) {
            return; // Skip this pair
          }
          
          // Combine signals
          const finalConfidence = (enhancedSignal.confidence + adaptiveDecision.confidence) / 2;
          const finalSignal = {
            ...enhancedSignal,
            confidence: finalConfidence
          };
          
          // Log confidence threshold for debugging
          console.log(`🎯 Active confidence threshold: ${this.config.confidenceThreshold}, Final confidence: ${finalConfidence.toFixed(3)}`);
          
          // More aggressive entry - lower confidence threshold
          // Aggressive mode: Use lower confidence threshold and faster decision making
          const confidenceThreshold = this.config.enableAggressiveMode ? 0.4 : this.config.confidenceThreshold;
          if (finalSignal.action !== 'HOLD' && finalSignal.confidence > confidenceThreshold) {
            console.log(`🎯 Trading signal: ${finalSignal.action} ${pair.symbol} (confidence: ${finalSignal.confidence.toFixed(2)})`);
            await this.executeTrade(pair.symbol, finalSignal.action, marketData, finalSignal, adaptiveDecision.strategy);
          }
        }));
        
        // Add small delay between batches to prevent overwhelming the system
        if (i + batchSize < pairs.length) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        }
      }
      
      // Update portfolio metrics
      this.updatePortfolioMetrics();
      
    } catch (error) {
      logService.error('tradingLoopError', { 
        error: error instanceof Error ? error.message : String(error) 
      }, 'Trading loop error');
    }
  }

  private async updatePositions() {
    if (this.portfolio.positions.length === 0) return;
    
    console.log(`🔄 Updating ${this.portfolio.positions.length} positions...`);
    
    for (const position of this.portfolio.positions) {
      const marketData = await binanceService.getMarketData(position.symbol);
      if (!marketData) {
        console.log(`⚠️ No market data for position ${position.symbol}`);
        continue;
      }
      
      // Get current market condition for exit decisions
      const marketCondition = adaptiveStrategy.analyzeMarketCondition(marketData);
      const strategy = adaptiveStrategy.selectOptimalStrategy(marketCondition);
      
      position.currentPrice = marketData.price;
      position.pnl = (marketData.price - position.entryPrice) * position.size * (position.side === 'LONG' ? 1 : -1);
      position.pnlPercent = (position.pnl / (position.entryPrice * position.size)) * 100;
      
      // Priority 1: Check multi-exit levels (highest priority)
      const exitResult = this.checkMultiExitLevels(position, marketData.price);
      if (exitResult.shouldExit) {
        console.log(`🎯 Multi-exit triggered for ${position.symbol}: ${exitResult.reason}`);
        await this.closePositionInternal(position, exitResult.reason);
        continue;
      }
      
      // Priority 2: Market regime-based exits
      const regimeExit = this.checkMarketRegimeExit(position, marketData, marketCondition, strategy);
      if (regimeExit.shouldExit) {
        console.log(`📊 Market regime exit for ${position.symbol}: ${regimeExit.reason}`);
        await this.closePositionInternal(position, regimeExit.reason);
        continue;
      }
      
      // Priority 3: Time-based and learning exits
      const timeBasedExit = this.checkTimeBasedExit(position, marketData);
      if (timeBasedExit.shouldExit) {
        console.log(`⏰ Time-based exit for ${position.symbol}: ${timeBasedExit.reason}`);
        await this.closePositionInternal(position, timeBasedExit.reason);
        continue;
      }
      
      // Priority 4: Traditional stop-loss and take-profit (fallback)
      const traditionalExit = this.checkTraditionalExit(position, marketData);
      if (traditionalExit.shouldExit) {
        console.log(`🛑 Traditional exit for ${position.symbol}: ${traditionalExit.reason}`);
        await this.closePositionInternal(position, traditionalExit.reason);
        continue;
      }
    }
  }

  private checkMarketRegimeExit(position: Position, marketData: MarketData, marketCondition: any, strategy: any): { shouldExit: boolean; reason: string } {
    const { type, volatility, confidence } = marketCondition;
    const positionAge = Date.now() - position.timestamp;
    const ageInMinutes = positionAge / (1000 * 60);
    
    // High volatility regime - tighter exits
    if (type === 'HIGH_VOLATILITY') {
      if (Math.abs(position.pnlPercent) > 3) {
        return { shouldExit: true, reason: 'HIGH_VOLATILITY_PROTECTION' };
      }
    }
    
    // Uncertain market - exit on any reasonable profit
    if (type === 'UNCERTAIN' && confidence < 0.4) {
      if (position.pnlPercent > 0.5) {
        return { shouldExit: true, reason: 'UNCERTAIN_MARKET_PROFIT_TAKE' };
      }
      if (position.pnlPercent < -1) {
        return { shouldExit: true, reason: 'UNCERTAIN_MARKET_LOSS_CUT' };
      }
    }
    
    // Trending market - let winners run but cut losers quickly
    if (type === 'TRENDING_UP' || type === 'TRENDING_DOWN') {
      const isWithTrend = (type === 'TRENDING_UP' && position.side === 'LONG') || 
                         (type === 'TRENDING_DOWN' && position.side === 'SHORT');
      
      if (!isWithTrend && position.pnlPercent < -1.5) {
        return { shouldExit: true, reason: 'AGAINST_TREND_CUT' };
      }
    }
    
    // Sideways market - quick scalping exits
    if (type === 'SIDEWAYS') {
      if (position.pnlPercent > 1.5) {
        return { shouldExit: true, reason: 'SIDEWAYS_SCALP_PROFIT' };
      }
      if (position.pnlPercent < -1) {
        return { shouldExit: true, reason: 'SIDEWAYS_SCALP_LOSS' };
      }
    }
    
    return { shouldExit: false, reason: '' };
  }

  private checkTimeBasedExit(position: Position, marketData: MarketData): { shouldExit: boolean; reason: string } {
    const positionAge = Date.now() - position.timestamp;
    const ageInMinutes = positionAge / (1000 * 60);
    const ageInHours = ageInMinutes / 60;
    
    // Fast learning mode - quicker exits
    if (this.config.fastLearningMode) {
      // Exit losing positions quickly in fast mode
      if (ageInMinutes > 10 && position.pnlPercent < -0.5) {
        return { shouldExit: true, reason: 'FAST_LEARNING_TIME_LOSS' };
      }
      
      // Exit any position after 30 minutes in fast mode
      if (ageInMinutes > 30) {
        return { shouldExit: true, reason: 'FAST_LEARNING_MAX_TIME' };
      }
    }
    
    // Normal mode time-based exits
    else {
      // Exit losing positions after 2 hours
      if (ageInHours > 2 && position.pnlPercent < 0) {
        return { shouldExit: true, reason: 'TIME_BASED_LOSS_CUT' };
      }
      
      // Exit any position after 24 hours
      if (ageInHours > 24) {
        return { shouldExit: true, reason: 'MAX_HOLD_TIME' };
      }
      
      // Exit stagnant positions (no movement for 4 hours)
      if (ageInHours > 4 && Math.abs(position.pnlPercent) < 0.1) {
        return { shouldExit: true, reason: 'STAGNANT_POSITION' };
      }
    }
    
    return { shouldExit: false, reason: '' };
  }

  private checkTraditionalExit(position: Position, marketData: MarketData): { shouldExit: boolean; reason: string } {
    // Aggressive mode: Quick exits with lower profit targets and tighter stop losses
    let stopLossThreshold: number;
    let takeProfitThreshold: number;
    
    if (this.config.enableAggressiveMode) {
      // Aggressive mode: Quick 1-2% profit target, 2% stop loss
      stopLossThreshold = -2.0;
      takeProfitThreshold = 1.5; // 1.5% profit target
    } else if (this.config.fastLearningMode) {
      stopLossThreshold = -1.5;
      takeProfitThreshold = 2.5;
    } else {
      stopLossThreshold = -this.config.stopLossPercent * 100;
      takeProfitThreshold = this.config.takeProfitPercent * 100;
    }
      
    // Adaptive thresholds based on volatility
    const volatility = marketData.bollinger ? 
      (marketData.bollinger.upper - marketData.bollinger.lower) / marketData.bollinger.middle : 0.02;
    
    const volatilityMultiplier = Math.max(0.5, Math.min(2, volatility * 50));
    const adaptiveStopLoss = stopLossThreshold * volatilityMultiplier;
    const adaptiveTakeProfit = takeProfitThreshold * volatilityMultiplier;
      
    // Check stop loss
    if (position.pnlPercent <= adaptiveStopLoss) {
      return { shouldExit: true, reason: 'ADAPTIVE_STOP_LOSS' };
    }
    // Check take profit
    if (position.pnlPercent >= adaptiveTakeProfit) {
      return { shouldExit: true, reason: 'ADAPTIVE_TAKE_PROFIT' };
    }
    
    return { shouldExit: false, reason: '' };
  }

  private checkMultiExitLevels(position: Position, currentPrice: number): { shouldExit: boolean; reason: string } {
    const exitData = this.multiExitPositions.get(position.id);
    if (!exitData) {
      // Initialize if not exists
      const exitLevels = adaptiveStrategy.getMultiExitLevels(position.entryPrice, position.side);
      this.multiExitPositions.set(position.id, {
        tp1Hit: false,
        tp2Hit: false,
        trailingSL: exitLevels.sl
      });
      return { shouldExit: false, reason: '' };
    }
    
    const exitLevels = adaptiveStrategy.getMultiExitLevels(position.entryPrice, position.side);
    const isLong = position.side === 'LONG';
    
    // Check stop loss first (highest priority)
    if ((isLong && currentPrice <= exitData.trailingSL) || (!isLong && currentPrice >= exitData.trailingSL)) {
      return { shouldExit: true, reason: 'TRAILING_STOP_LOSS' };
    }
    
    // Check take profit levels
    if (!exitData.tp1Hit) {
      if ((isLong && currentPrice >= exitLevels.tp1) || (!isLong && currentPrice <= exitLevels.tp1)) {
        exitData.tp1Hit = true;
        // Move trailing stop to breakeven
        exitData.trailingSL = position.entryPrice;
        console.log(`🎯 TP1 hit for ${position.symbol} at ${currentPrice.toFixed(2)} - trailing SL moved to breakeven`);
        
        // Close 33% of position at TP1 (for now, close entire position)
        return { shouldExit: true, reason: 'TP1_REACHED' };
      }
    } else if (!exitData.tp2Hit) {
      if ((isLong && currentPrice >= exitLevels.tp2) || (!isLong && currentPrice <= exitLevels.tp2)) {
        exitData.tp2Hit = true;
        // Move trailing stop to TP1
        exitData.trailingSL = exitLevels.tp1;
        console.log(`🎯 TP2 hit for ${position.symbol} at ${currentPrice.toFixed(2)} - trailing SL moved to TP1`);
        
        // Close another 33% at TP2 (for now, close entire position)
        return { shouldExit: true, reason: 'TP2_REACHED' };
      }
    } else {
      // Both TP1 and TP2 hit, check TP3 for final exit
      if ((isLong && currentPrice >= exitLevels.tp3) || (!isLong && currentPrice <= exitLevels.tp3)) {
        return { shouldExit: true, reason: 'TP3_FINAL_EXIT' };
      }
      
      // Update trailing stop if price moves favorably
      const trailDistance = isLong ? 0.015 : -0.015; // 1.5% trail
      const newTrailingSL = isLong 
        ? Math.max(exitData.trailingSL, currentPrice * (1 - 0.015))
        : Math.min(exitData.trailingSL, currentPrice * (1 + 0.015));
      
      if (newTrailingSL !== exitData.trailingSL) {
        exitData.trailingSL = newTrailingSL;
        console.log(`📈 Trailing stop updated for ${position.symbol}: ${newTrailingSL.toFixed(2)}`);
      }
    }
    
    return { shouldExit: false, reason: '' };
  }

  private async shouldExitBasedOnLearning(position: Position, marketData: MarketData): Promise<boolean> {
    try {
      // Enhanced learning-based exit with market regime context
      const marketCondition = adaptiveStrategy.analyzeMarketCondition(marketData);
      const exitSignal = await learningService.shouldExit(position, marketData);
      
      // Adjust confidence threshold based on market condition
      let confidenceThreshold = 0.7;
      if (marketCondition.type === 'HIGH_VOLATILITY') confidenceThreshold = 0.6;
      if (marketCondition.type === 'UNCERTAIN') confidenceThreshold = 0.5;
      
      return exitSignal.shouldExit && exitSignal.confidence > confidenceThreshold;
    } catch (error) {
      console.error('Learning-based exit analysis failed:', error);
      return false;
    }
  }

  private async executeTrade(symbol: string, action: 'BUY' | 'SELL', marketData: MarketData, signal?: any, strategy?: any) {
    // Prevent duplicate positions
    if (this.activePositionIds.has(symbol)) {
      console.log(`⚠️ Skipping ${symbol} - already have position`);
      return;
    }
    
    // Enhanced entry validation with market regime context
    const marketCondition = adaptiveStrategy.analyzeMarketCondition(marketData);
    const entryValidation = this.validateTradeEntry(symbol, action, marketData, marketCondition, signal);
    if (!entryValidation.valid) {
      console.log(`🚫 Entry blocked for ${symbol}: ${entryValidation.reason}`);
      return;
    }
    
    // Apply adaptive risk sizing
    const adaptiveRisk = adaptiveStrategy.getRiskMetrics();
    const baseRiskMultiplier = this.config.fastLearningMode ? 0.5 : 1;
    const strategyRiskMultiplier = strategy?.riskMultiplier || 1;
    const adaptiveRiskMultiplier = adaptiveRisk.currentRiskLevel;
    const marketRiskMultiplier = this.getMarketRiskMultiplier(marketCondition);
    
    const finalRiskMultiplier = baseRiskMultiplier * strategyRiskMultiplier * adaptiveRiskMultiplier * marketRiskMultiplier;
    const riskAmount = this.portfolio.availableBalance * this.config.maxRiskPerTrade * finalRiskMultiplier;
    const quantity = riskAmount / marketData.price;
    
    if (quantity * marketData.price > this.portfolio.availableBalance) {
      console.log(`⚠️ Insufficient balance for ${symbol}: need $${(quantity * marketData.price).toFixed(2)}, have $${this.portfolio.availableBalance.toFixed(2)}`);
      return;
    }
    
    // Minimum trade validation
    if (quantity * marketData.price < 10) {
      console.log(`⚠️ Trade too small for ${symbol}: $${(quantity * marketData.price).toFixed(2)} < $10 minimum`);
      return;
    }
    
    // Generate unique trade ID
    const tradeId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const trade: Trade = {
      id: tradeId,
      symbol,
      side: action,
      type: 'MARKET',
      quantity,
      price: marketData.price,
      status: 'FILLED',
      timestamp: Date.now(),
    };
    
    // Store trade context for learning
    const tradeContext = {
      marketData,
      signal,
      marketCondition,
      newsContext: newsService.getLatestNews().filter(item => 
        item.coins.includes(symbol.replace('USDT', ''))
      ),
      portfolioState: { ...this.portfolio }
    };
    
    if (this.config.mode === 'REAL') {
      // Execute real trade via Binance API
      const realTrade = await binanceService.placeTrade(symbol, action, quantity);
      if (!realTrade) return;
      
      trade.id = realTrade.id;
      trade.price = realTrade.price;
      trade.status = realTrade.status;
    }
    
    this.portfolio.trades.push(trade);
    
    // Create position
    const position: Position = {
      id: tradeId,
      symbol,
      side: action === 'BUY' ? 'LONG' : 'SHORT',
      size: quantity,
      entryPrice: marketData.price,
      currentPrice: marketData.price,
      pnl: 0,
      pnlPercent: 0,
      timestamp: Date.now(),
    };
    
    this.portfolio.positions.push(position);
    this.activePositionIds.add(symbol);
    
    // Set up multi-exit levels with market regime adjustments
    const exitLevels = adaptiveStrategy.getMultiExitLevels(marketData.price, position.side, marketCondition);
    this.multiExitPositions.set(position.id, {
      tp1Hit: false,
      tp2Hit: false,
      trailingSL: exitLevels.sl
    });
    
    // Record trade for learning
    await learningService.recordTrade(trade, position, tradeContext);
    this.portfolio.availableBalance -= quantity * marketData.price;
    
    console.log(`✅ ${this.config.mode} trade executed: ${action} ${quantity.toFixed(6)} ${symbol} at $${marketData.price.toFixed(2)}`);
    console.log(`   📊 Market: ${marketCondition.type}, Risk: ${(finalRiskMultiplier * 100).toFixed(0)}%, Confidence: ${signal?.confidence?.toFixed(2) || 'N/A'}`);
    console.log(`   🎯 Exits: TP1=${exitLevels.tp1.toFixed(2)}, TP2=${exitLevels.tp2.toFixed(2)}, TP3=${exitLevels.tp3.toFixed(2)}, SL=${exitLevels.sl.toFixed(2)}`);
  }

  private validateTradeEntry(symbol: string, action: 'BUY' | 'SELL', marketData: MarketData, marketCondition: any, signal?: any): { valid: boolean; reason: string } {
    const { rsi, macd, volumeRatio, emaTrend } = marketData;
    
    // Aggressive mode: Simplified validation based on EMA trend and volume only
    if (this.config.enableAggressiveMode) {
      // Aggressive mode: Only check EMA trend and volume spikes
      if (volumeRatio < 1.2) {
        return { valid: false, reason: 'AGGRESSIVE_LOW_VOLUME' };
      }
      
      // Allow trades based on EMA trend alignment
      if (emaTrend === 'BEARISH' && action === 'BUY') {
        return { valid: false, reason: 'AGGRESSIVE_TREND_CONFLICT' };
      }
      if (emaTrend === 'BULLISH' && action === 'SELL') {
        return { valid: false, reason: 'AGGRESSIVE_TREND_CONFLICT' };
      }
      
      return { valid: true, reason: 'AGGRESSIVE_ENTRY_VALIDATED' };
    }
    
    // Normal mode: Full validation with conflicting signals check
    else {
      // Check for conflicting signals
      let conflictCount = 0;
      let totalSignals = 0;
      
      // RSI vs Action conflict
      if (rsi > 70 && action === 'BUY') conflictCount++;
      if (rsi < 30 && action === 'SELL') conflictCount++;
      totalSignals++;
      
      // MACD vs Action conflict
      if (macd < 0 && action === 'BUY') conflictCount++;
      if (macd > 0 && action === 'SELL') conflictCount++;
      totalSignals++;
      
      // EMA Trend vs Action conflict
      if (emaTrend === 'BEARISH' && action === 'BUY') conflictCount++;
      if (emaTrend === 'BULLISH' && action === 'SELL') conflictCount++;
      totalSignals++;
      
      // Too many conflicts
      if (conflictCount >= 2) {
        return { valid: false, reason: 'CONFLICTING_INDICATORS' };
      }
    }
    
    // Low volume validation
    if (volumeRatio < 0.5) {
      return { valid: false, reason: this.config.enableAggressiveMode ? 'AGGRESSIVE_LOW_VOLUME' : 'LOW_VOLUME' };
    }
    
    // Market condition validation
    if (marketCondition.type === 'UNCERTAIN' && marketCondition.confidence < 0.3) {
      return { valid: false, reason: 'UNCERTAIN_MARKET' };
    }
    
    // Time-based validation
    const hour = new Date().getUTCHours();
    const isLowLiquidityTime = hour >= 22 || hour < 6; // Overnight
    
    if (isLowLiquidityTime && marketCondition.type === 'HIGH_VOLATILITY') {
      return { valid: false, reason: 'HIGH_VOLATILITY_OVERNIGHT' };
    }
    
    // Signal confidence validation
    if (signal && signal.confidence < 0.4) {
      return { valid: false, reason: 'LOW_SIGNAL_CONFIDENCE' };
    }
    
    return { valid: true, reason: 'ENTRY_VALIDATED' };
  }

  private getMarketRiskMultiplier(marketCondition: any): number {
    switch (marketCondition.type) {
      case 'HIGH_VOLATILITY':
        return 0.6; // Reduce risk in high volatility
      case 'UNCERTAIN':
        return 0.7; // Reduce risk in uncertain conditions
      case 'TRENDING_UP':
      case 'TRENDING_DOWN':
        return 1.1; // Slightly increase risk in trending markets
      case 'SIDEWAYS':
        return 0.9; // Slightly reduce risk in sideways markets
      default:
        return 1.0;
    }
  }

  private async closePositionInternal(position: Position, reason: string) {
    const closeTradeId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const trade: Trade = {
      id: closeTradeId,
      symbol: position.symbol,
      side: position.side === 'LONG' ? 'SELL' : 'BUY',
      type: 'MARKET',
      quantity: position.size,
      price: position.currentPrice,
      status: 'FILLED',
      timestamp: Date.now(),
      profit: position.pnl,
    };
    
    if (this.config.mode === 'REAL') {
      const realTrade = await binanceService.placeTrade(
        position.symbol,
        position.side === 'LONG' ? 'SELL' : 'BUY',
        position.size
      );
      if (!realTrade) {
        console.error(`❌ Failed to execute real trade for closing position ${position.symbol}`);
        return false;
      }
      
      trade.id = realTrade.id;
      trade.price = realTrade.price;
      trade.status = realTrade.status;
    }
    
    this.portfolio.trades.push(trade);
    this.portfolio.availableBalance += position.size * position.currentPrice;
    
    // Record position close for learning
    await learningService.recordPositionClose(position, trade, reason);
    
    // Record for adaptive strategy learning
    const originalTrade = this.portfolio.trades.find(t => t.id === position.id);
    if (originalTrade) {
      const marketData = await binanceService.getMarketData(position.symbol);
      if (marketData) {
        adaptiveStrategy.recordTradeOutcome(originalTrade, position, marketData);
      }
    }
    
    // Remove position
    this.portfolio.positions = this.portfolio.positions.filter(p => p.id !== position.id);
    this.activePositionIds.delete(position.symbol);
    this.multiExitPositions.delete(position.id);
    
    console.log(`Position closed (${reason}): ${position.symbol} PnL: ${position.pnl.toFixed(2)} (${position.pnlPercent.toFixed(2)}%)`);
    return true;
  }

  private updatePortfolioMetrics() {
    const positionsValue = this.portfolio.positions.reduce((sum, pos) => sum + (pos.size * pos.currentPrice), 0);
    
    // Calculate total invested capital (what we paid for all positions)
    const investedCapital = this.portfolio.positions.reduce((sum, pos) => sum + (pos.size * pos.entryPrice), 0);
    
    // Calculate unrealized P&L from active positions
    const unrealizedPnl = this.portfolio.positions.reduce((sum, pos) => sum + pos.pnl, 0);
    
    // Calculate realized P&L from completed trades
    const realizedPnl = this.portfolio.trades
      .filter(trade => trade.profit !== undefined)
      .reduce((sum, trade) => sum + (trade.profit || 0), 0);
    
    // Total P&L is unrealized + realized
    const totalPnl = unrealizedPnl + realizedPnl;
    
    this.portfolio.totalValue = this.portfolio.availableBalance + positionsValue;
    this.portfolio.totalPnl = totalPnl;
    
    // Calculate P&L percentage based on initial balance
    const initialBalance = this.config.mode === 'SIMULATION' ? this.config.simulationBalance : 10000;
    this.portfolio.totalPnlPercent = (totalPnl / initialBalance) * 100;
    
    // Debug logging to help track the calculation
    if (this.portfolio.positions.length > 0) {
      console.log(`💰 Portfolio Debug: Available: $${this.portfolio.availableBalance.toFixed(2)}, Positions Value: $${positionsValue.toFixed(2)}, Invested: $${investedCapital.toFixed(2)}, Unrealized P&L: $${unrealizedPnl.toFixed(2)}, Realized P&L: $${realizedPnl.toFixed(2)}, Total P&L: $${totalPnl.toFixed(2)}`);
    }
  }
  

  // Manual trading methods
  async buyAsset(symbol: string, amount: number) {
    const marketData = await binanceService.getMarketData(symbol);
    if (!marketData) return false;
    
    const quantity = amount / marketData.price;
    await this.executeTrade(symbol, 'BUY', marketData);
    return true;
  }

  async sellAsset(symbol: string, amount: number) {
    const marketData = await binanceService.getMarketData(symbol);
    if (!marketData) return false;
    
    await this.executeTrade(symbol, 'SELL', marketData);
    return true;
  }

  async openLongPosition(symbol: string, amount: number) {
    return await this.buyAsset(symbol, amount);
  }

  async openShortPosition(symbol: string, amount: number) {
    return await this.sellAsset(symbol, amount);
  }

  async closePosition(positionId: string) {
    const position = this.portfolio.positions.find(p => p.id === positionId);
    if (!position) return false;

    const marketData = await binanceService.getMarketData(position.symbol);
    if (!marketData) return false;

    position.currentPrice = marketData.price;
    position.pnl = (marketData.price - position.entryPrice) * position.size * (position.side === 'LONG' ? 1 : -1);
    
    return await this.closePositionInternal(position, 'MANUAL_CLOSE');
  }

  resetAILearning() {
    logService.info('aiLearningReset', {}, 'Resetting AI learning across all services');
    
    // Reset adaptive strategy learning
    adaptiveStrategy.resetLearning();
    
    // Reset learning service
    learningService.resetLearning();
    
    // Reset news service learning
    newsService.resetLearning();
    
    // Clear multi-exit positions (fresh start for position management)
    this.multiExitPositions.clear();
    
    // Reset fast learning counters
    this.fastLearningTradeCount = 0;
    this.lastFastLearningTrade = 0;
    this.fastLearningRetrainCounter = 0;
    
    logService.info('aiLearningResetComplete', {}, 'Complete AI learning reset finished');
    
    return true;
  }

  resetAllBotData() {
    logService.warning('allBotDataReset', {}, 'Resetting ALL bot data (AI learning + trade history + statistics)');
    
    // Reset AI learning first
    this.resetAILearning();
    
    // Reset portfolio to initial state
    const initialBalance = this.config.mode === 'SIMULATION' ? this.config.simulationBalance : 10000;
    this.portfolio = {
      totalValue: initialBalance,
      totalPnl: 0,
      totalPnlPercent: 0,
      availableBalance: initialBalance,
      positions: [],
      trades: [],
    };
    
    // Clear all position tracking
    this.activePositionIds.clear();
    this.multiExitPositions.clear();
    
    // Reset fast learning counters
    this.fastLearningTradeCount = 0;
    this.lastFastLearningTrade = 0;
    this.fastLearningRetrainCounter = 0;
    
    // Clear all localStorage data
    localStorage.removeItem('trading-bot-history');
    localStorage.removeItem('trading-bot-insights');
    localStorage.removeItem('trading-bot-training-data');
    localStorage.removeItem('adaptive-strategy-patterns');
    localStorage.removeItem('adaptive-strategy-risk');
    localStorage.removeItem('adaptive-strategy-trades');
    localStorage.removeItem('adaptive-strategy-reflections');
    localStorage.removeItem('multi-strategy-performance');
    localStorage.removeItem('position-scaling-data');
    
    logService.warning('allBotDataResetComplete', {}, 'Complete bot data reset finished - all history and statistics cleared');
    
    return true;
  }
}

export const tradingBot = new TradingBot();