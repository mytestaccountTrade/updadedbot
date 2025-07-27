import { Portfolio, Position, Trade, BotConfig, TradingSignal, MarketData } from '../types/trading';
import { binanceService } from './binanceService';
import { newsService } from './newsService';
import { learningService } from './learningService';
import { adaptiveStrategy } from './adaptiveStrategy';
import { multiStrategyService } from './multiStrategyService';
import { positionScalingService } from './positionScalingService';
import { logService } from './logService';

class TradingBot {
  private isRunning: boolean = false;
  private portfolio: Portfolio = {
    totalValue: 10000,
    totalPnl: 0,
    totalPnlPercent: 0,
    availableBalance: 10000,
    positions: [],
    trades: []
  };
  
  private config: BotConfig = {
    mode: 'SIMULATION',
    tradeMode: 'futures', // Default to futures
    simulationBalance: 10000,
    fastLearningMode: false,
    adaptiveStrategyEnabled: true,
    maxRiskPerTrade: 0.02,
    stopLossPercent: 0.03,
    takeProfitPercent: 0.06,
    maxPositions: 5,
    maxSymbolsToTrade: 50,
    enableNewsTrading: true,
    enableTechnicalAnalysis: true,
    confidenceThreshold: 0.7,
    enableMultiStrategy: true,
    strategies: {
      rsiMacd: { enabled: true, weight: 1.0 },
      newsSentiment: { enabled: true, weight: 0.8 },
      volumeSpike: { enabled: true, weight: 0.6 }
    },
    enableAutoRebalance: false,
    scaleInThreshold: 0.03,
    scaleOutThreshold: -0.01,
    enableTrailingStop: false,
    trailingStopPercent: 0.01,
    enableSimulationReplay: false,
    enableAggressiveMode: false
  };

  private tradingInterval: NodeJS.Timeout | null = null;
  private lastTradeTime: number = 0;
  private explorationTrades: number = 0;
  private totalTrades: number = 0;
  private consecutiveLosses: number = 0;
  private lastRebalanceCheck: number = 0;

  constructor() {
    this.loadConfig();
    this.loadPortfolio();
    
    // Set initial trade mode in binance service
    binanceService.setTradeMode(this.config.tradeMode);
    
    // Configure services
    newsService.setLlama3Config(
      this.config.llama3Url || 'http://localhost:11434',
      this.config.llama3Model || 'llama3'
    );
    
    learningService.setLlama3Config(
      this.config.llama3Url || 'http://localhost:11434',
      this.config.llama3Model || 'llama3'
    );

    // Set global fast learning mode flag
    (globalThis as any).fastLearningMode = this.config.fastLearningMode;
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    logService.info('botStarted', { mode: this.config.mode, tradeMode: this.config.tradeMode });
    
    // Set credentials if in real mode
    if (this.config.mode === 'REAL' && this.config.apiKey && this.config.apiSecret) {
      binanceService.setCredentials(this.config.apiKey, this.config.apiSecret, false);
    }

    // Update binance service trade mode
    binanceService.setTradeMode(this.config.tradeMode);
    
    const interval = this.config.fastLearningMode ? 2000 : 30000;
    this.tradingInterval = setInterval(() => this.executeTradingLoop(), interval);
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    logService.info('botStopped');
    
    if (this.tradingInterval) {
      clearInterval(this.tradingInterval);
      this.tradingInterval = null;
    }
  }

  private async executeTradingLoop() {
    try {
      const pairs = await binanceService.getTradingPairs(this.config.maxSymbolsToTrade);
      const news = await newsService.fetchCryptoNews();
      
      // Update portfolio
      await this.updatePortfolio();
      
      // Check for position exits first
      await this.checkPositionExits();
      
      // Check for new entries
      if (this.portfolio.positions.length < this.config.maxPositions) {
        await this.evaluateNewPositions(pairs, news);
      }
      
      // Auto-rebalance check (every 5 minutes)
      if (this.config.enableAutoRebalance && Date.now() - this.lastRebalanceCheck > 300000) {
        await this.checkAutoRebalance();
        this.lastRebalanceCheck = Date.now();
      }
      
    } catch (error) {
      logService.error('tradingLoopError', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async evaluateNewPositions(pairs: any[], news: any[]) {
    const maxNewPositions = Math.min(3, this.config.maxPositions - this.portfolio.positions.length);
    let newPositions = 0;

    for (const pair of pairs.slice(0, 20)) {
      if (newPositions >= maxNewPositions) break;
      
      // Skip if we already have a position in this symbol
      if (this.portfolio.positions.some(p => p.symbol === pair.symbol)) continue;

      const marketData = await binanceService.getMarketData(pair.symbol);
      if (!marketData) continue;

      let signal: TradingSignal;
      
      if (this.config.enableMultiStrategy) {
        const strategyResults = await multiStrategyService.evaluateStrategies(
          pair.symbol,
          marketData,
          news,
          this.config.strategies
        );
        
        const combinedResult = multiStrategyService.combineStrategyResults(strategyResults);
        
        signal = {
          action: combinedResult.action,
          confidence: combinedResult.confidence,
          reasoning: combinedResult.reasoning,
          sentimentScore: 0,
          marketData,
          newsContext: news.filter(n => n.coins.includes(pair.symbol.replace('USDT', '')))
        };
      } else {
        signal = await newsService.generateTradingSignal(pair.symbol, marketData, news);
      }

      // Apply adaptive strategy if enabled
      if (this.config.adaptiveStrategyEnabled) {
        const adaptiveDecision = adaptiveStrategy.shouldTrade(marketData, this.config.confidenceThreshold);
        
        if (!adaptiveDecision.shouldTrade) {
          logService.info('tradeBlocked', { 
            symbol: pair.symbol, 
            reason: adaptiveDecision.reason 
          });
          continue;
        }
        
        // Use adaptive strategy's confidence and strategy
        signal.confidence = Math.min(signal.confidence, adaptiveDecision.confidence);
        signal.reasoning = `${signal.reasoning} | Adaptive: ${adaptiveDecision.reason}`;
      }

      // Apply learning enhancements
      const insights = await learningService.getMarketInsights();
      const enhancedSignal = await learningService.enhanceSignal(signal, marketData, insights);

      // In spot mode, only allow BUY signals
      if (this.config.tradeMode === 'spot' && enhancedSignal.action === 'SELL') {
        continue;
      }

      if (enhancedSignal.action !== 'HOLD' && enhancedSignal.confidence >= this.config.confidenceThreshold) {
        const success = await this.executeSignal(enhancedSignal, pair.symbol);
        if (success) {
          newPositions++;
          logService.trade('signalEvaluation', {
            symbol: pair.symbol,
            action: enhancedSignal.action,
            confidence: enhancedSignal.confidence.toFixed(2)
          });
        }
      }
    }
  }

  private async executeSignal(signal: TradingSignal, symbol: string): Promise<boolean> {
    try {
      const riskAmount = this.portfolio.availableBalance * this.config.maxRiskPerTrade;
      const currentPrice = signal.marketData.price;
      
      if (currentPrice <= 0 || riskAmount <= 0) return false;

      let quantity = riskAmount / currentPrice;
      
      // Validate quantity for the specific trade mode
      const validation = binanceService.validateOrderQuantity(symbol, quantity);
      if (!validation.valid) {
        logService.warning('orderValidationFailed', { 
          symbol, 
          quantity, 
          reason: validation.error 
        });
        return false;
      }

      quantity = validation.adjustedQty!;
      
      // Execute trade
      const trade = this.config.mode === 'REAL' 
        ? await binanceService.placeTrade(symbol, signal.action, quantity)
        : this.simulateTrade(symbol, signal.action, quantity, currentPrice);

      if (!trade) return false;

      // Create position
      const position: Position = {
        id: trade.id,
        symbol,
        side: signal.action === 'BUY' ? 'LONG' : 'SHORT',
        size: quantity,
        entryPrice: currentPrice,
        currentPrice,
        pnl: 0,
        pnlPercent: 0,
        timestamp: Date.now()
      };

      this.portfolio.positions.push(position);
      this.portfolio.trades.push(trade);
      this.portfolio.availableBalance -= (quantity * currentPrice);
      
      // Initialize position scaling
      positionScalingService.initializePosition(position);
      
      // Record for learning
      await learningService.recordTrade(trade, position, {
        marketData: signal.marketData,
        signal,
        newsContext: signal.newsContext,
        portfolioState: { ...this.portfolio }
      });

      this.totalTrades++;
      this.savePortfolio();
      
      logService.trade('tradeExecuted', {
        action: signal.action,
        quantity: quantity.toFixed(6),
        symbol,
        price: currentPrice.toFixed(2)
      });

      return true;
    } catch (error) {
      logService.error('tradeExecutionFailed', { 
        symbol, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  private simulateTrade(symbol: string, side: 'BUY' | 'SELL', quantity: number, price: number): Trade {
    return {
      id: `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      symbol,
      side,
      type: 'MARKET',
      quantity,
      price,
      status: 'FILLED',
      timestamp: Date.now()
    };
  }

  private async checkPositionExits() {
    for (const position of [...this.portfolio.positions]) {
      const marketData = await binanceService.getMarketData(position.symbol);
      if (!marketData) {
        logService.warning('noMarketDataForPosition', { symbol: position.symbol });
        continue;
      }

      // Update position current price and P&L
      position.currentPrice = marketData.price;
      const priceDiff = position.side === 'LONG' 
        ? marketData.price - position.entryPrice
        : position.entryPrice - marketData.price;
      
      position.pnl = priceDiff * position.size;
      position.pnlPercent = (priceDiff / position.entryPrice) * 100;

      let shouldClose = false;
      let closeReason = '';

      // Traditional stop loss / take profit
      if (position.pnlPercent <= -this.config.stopLossPercent * 100) {
        shouldClose = true;
        closeReason = 'Stop loss triggered';
      } else if (position.pnlPercent >= this.config.takeProfitPercent * 100) {
        shouldClose = true;
        closeReason = 'Take profit triggered';
      }

      // Auto-rebalance and trailing stop
      if (this.config.enableAutoRebalance || this.config.enableTrailingStop) {
        const scalingResult = positionScalingService.evaluateScaling(
          position,
          marketData,
          this.config.enableAutoRebalance,
          this.config.enableTrailingStop
        );

        if (scalingResult.shouldTrailingStop) {
          shouldClose = true;
          closeReason = scalingResult.reasoning;
        } else if (scalingResult.shouldScaleIn || scalingResult.shouldScaleOut) {
          // Handle position scaling (not closing)
          if (scalingResult.newSize) {
            position.size = scalingResult.newSize;
            logService.info('positionScaled', {
              symbol: position.symbol,
              newSize: scalingResult.newSize,
              reason: scalingResult.reasoning
            });
          }
        }
      }

      // AI-based exit decision
      if (!shouldClose && this.config.adaptiveStrategyEnabled) {
        const exitDecision = await learningService.shouldExit(position, marketData);
        if (exitDecision.shouldExit && exitDecision.confidence > 0.7) {
          shouldClose = true;
          closeReason = exitDecision.reason;
        }
      }

      if (shouldClose) {
        await this.closePosition(position.id, closeReason);
      }
    }
  }

  async closePosition(positionId: string, reason: string = 'Manual close'): Promise<boolean> {
    const position = this.portfolio.positions.find(p => p.id === positionId);
    if (!position) return false;

    try {
      let closeTrade: Trade;
      
      if (this.config.mode === 'REAL') {
        // In spot mode, we need to sell the asset we own
        // In futures mode, we close the position with opposite side
        const closeAction = this.config.tradeMode === 'spot' ? 'SELL' : 
                           (position.side === 'LONG' ? 'SELL' : 'BUY');
        
        const realTrade = await binanceService.placeTrade(
          position.symbol, 
          closeAction, 
          position.size
        );
        
        if (!realTrade) {
          logService.error('realTradeExecutionFailed', { symbol: position.symbol });
          return false;
        }
        closeTrade = realTrade;
      } else {
        // Simulation mode
        closeTrade = this.simulateTrade(
          position.symbol,
          this.config.tradeMode === 'spot' ? 'SELL' : 
          (position.side === 'LONG' ? 'SELL' : 'BUY'),
          position.size,
          position.currentPrice
        );
      }

      // Update portfolio
      this.portfolio.availableBalance += (position.size * position.currentPrice);
      this.portfolio.totalPnl += position.pnl;
      this.portfolio.positions = this.portfolio.positions.filter(p => p.id !== positionId);
      this.portfolio.trades.push(closeTrade);

      // Record for learning
      await learningService.recordPositionClose(position, closeTrade, reason);

      // Record for adaptive strategy
      if (this.config.adaptiveStrategyEnabled) {
        const openTrade = this.portfolio.trades.find(t => t.id === position.id);
        if (openTrade) {
          const marketData = await binanceService.getMarketData(position.symbol);
          if (marketData) {
            adaptiveStrategy.recordTradeOutcome(openTrade, position, marketData);
          }
        }
      }

      // Record for multi-strategy
      if (this.config.enableMultiStrategy) {
        const duration = Date.now() - position.timestamp;
        multiStrategyService.recordStrategyOutcome('COMBINED', position.pnl, duration);
      }

      // Remove from position scaling
      positionScalingService.removePosition(positionId);

      // Update consecutive losses counter
      if (position.pnl < 0) {
        this.consecutiveLosses++;
      } else {
        this.consecutiveLosses = 0;
      }

      this.savePortfolio();
      
      logService.trade('positionClosed', {
        symbol: position.symbol,
        pnl: position.pnl.toFixed(2),
        reason
      });

      return true;
    } catch (error) {
      logService.error('positionCloseError', { 
        positionId, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  private async checkAutoRebalance() {
    // Update position scaling configuration
    positionScalingService.updateConfig({
      scaleInThreshold: this.config.scaleInThreshold,
      scaleOutThreshold: this.config.scaleOutThreshold,
      trailingStopPercent: this.config.trailingStopPercent
    });
  }

  private async updatePortfolio() {
    if (this.config.mode === 'REAL') {
      const accountInfo = await binanceService.getAccountInfo();
      if (accountInfo) {
        this.portfolio.totalValue = accountInfo.totalWalletBalance;
        this.portfolio.availableBalance = accountInfo.totalWalletBalance;
        
        // Subtract position values from available balance
        for (const position of this.portfolio.positions) {
          this.portfolio.availableBalance -= (position.size * position.currentPrice);
        }
      }
    } else {
      // Simulation mode - calculate total value
      let positionValue = 0;
      for (const position of this.portfolio.positions) {
        positionValue += (position.size * position.currentPrice);
      }
      this.portfolio.totalValue = this.portfolio.availableBalance + positionValue;
    }

    // Calculate total P&L percentage
    const initialBalance = this.config.mode === 'SIMULATION' ? this.config.simulationBalance : 10000;
    this.portfolio.totalPnlPercent = ((this.portfolio.totalValue - initialBalance) / initialBalance) * 100;

    logService.info('portfolioStatus', {
      positions: this.portfolio.positions.length,
      totalValue: this.portfolio.totalValue.toFixed(2),
      totalPnl: this.portfolio.totalPnl.toFixed(2)
    });
  }

  async updateRealWalletBalance() {
    if (this.config.mode === 'REAL') {
      const accountInfo = await binanceService.getAccountInfo();
      if (accountInfo) {
        this.portfolio.totalValue = accountInfo.totalWalletBalance;
        this.portfolio.availableBalance = accountInfo.totalWalletBalance;
        
        // Subtract position values
        for (const position of this.portfolio.positions) {
          this.portfolio.availableBalance -= (position.size * position.currentPrice);
        }
      }
    }
  }

  async buyAsset(symbol: string, amount: number): Promise<boolean> {
    const marketData = await binanceService.getMarketData(symbol);
    if (!marketData) return false;

    const quantity = amount / marketData.price;
    
    // In spot mode, this is straightforward - just buy the asset
    // In futures mode, this opens a LONG position
    const trade = this.config.mode === 'REAL' 
      ? await binanceService.placeTrade(symbol, 'BUY', quantity)
      : this.simulateTrade(symbol, 'BUY', quantity, marketData.price);

    if (!trade) return false;

    const position: Position = {
      id: trade.id,
      symbol,
      side: 'LONG',
      size: quantity,
      entryPrice: marketData.price,
      currentPrice: marketData.price,
      pnl: 0,
      pnlPercent: 0,
      timestamp: Date.now()
    };

    this.portfolio.positions.push(position);
    this.portfolio.trades.push(trade);
    this.portfolio.availableBalance -= amount;
    
    this.savePortfolio();
    return true;
  }

  async sellAsset(symbol: string, amount: number): Promise<boolean> {
    // In spot mode, we can only sell assets we own
    if (this.config.tradeMode === 'spot') {
      const position = this.portfolio.positions.find(p => p.symbol === symbol && p.side === 'LONG');
      if (!position) {
        logService.warning('spotSellNoPosition', { symbol });
        return false;
      }
      
      const marketData = await binanceService.getMarketData(symbol);
      if (!marketData) return false;
      
      const sellQuantity = Math.min(amount / marketData.price, position.size);
      
      const trade = this.config.mode === 'REAL' 
        ? await binanceService.placeTrade(symbol, 'SELL', sellQuantity)
        : this.simulateTrade(symbol, 'SELL', sellQuantity, marketData.price);

      if (!trade) return false;

      // Update or remove position
      position.size -= sellQuantity;
      if (position.size <= 0.000001) {
        this.portfolio.positions = this.portfolio.positions.filter(p => p.id !== position.id);
      }
      
      this.portfolio.trades.push(trade);
      this.portfolio.availableBalance += (sellQuantity * marketData.price);
      
      this.savePortfolio();
      return true;
    } else {
      // Futures mode - open a SHORT position
      const marketData = await binanceService.getMarketData(symbol);
      if (!marketData) return false;

      const quantity = amount / marketData.price;
      
      const trade = this.config.mode === 'REAL' 
        ? await binanceService.placeTrade(symbol, 'SELL', quantity)
        : this.simulateTrade(symbol, 'SELL', quantity, marketData.price);

      if (!trade) return false;

      const position: Position = {
        id: trade.id,
        symbol,
        side: 'SHORT',
        size: quantity,
        entryPrice: marketData.price,
        currentPrice: marketData.price,
        pnl: 0,
        pnlPercent: 0,
        timestamp: Date.now()
      };

      this.portfolio.positions.push(position);
      this.portfolio.trades.push(trade);
      this.portfolio.availableBalance -= amount;
      
      this.savePortfolio();
      return true;
    }
  }

  getPortfolio(): Portfolio {
    return { ...this.portfolio };
  }

  getConfig(): BotConfig {
    return { ...this.config };
  }

  setConfig(newConfig: BotConfig) {
    this.config = { ...newConfig };
    
    // Update binance service trade mode
    binanceService.setTradeMode(this.config.tradeMode);
    
    // Update services
    newsService.setLlama3Config(
      this.config.llama3Url || 'http://localhost:11434',
      this.config.llama3Model || 'llama3'
    );
    
    learningService.setLlama3Config(
      this.config.llama3Url || 'http://localhost:11434',
      this.config.llama3Model || 'llama3'
    );

    // Update global fast learning mode flag
    (globalThis as any).fastLearningMode = this.config.fastLearningMode;
    
    this.saveConfig();
    logService.info('configSaved', { tradeMode: this.config.tradeMode });
  }

  resetAILearning(): boolean {
    try {
      learningService.resetLearning();
      adaptiveStrategy.resetLearning();
      multiStrategyService.resetPerformance();
      positionScalingService.resetScalingData();
      
      logService.info('aiLearningResetComplete');
      return true;
    } catch (error) {
      logService.error('aiLearningResetFailed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  resetAllBotData(): boolean {
    try {
      // Reset AI learning
      this.resetAILearning();
      
      // Reset portfolio and trades
      this.portfolio = {
        totalValue: this.config.simulationBalance,
        totalPnl: 0,
        totalPnlPercent: 0,
        availableBalance: this.config.simulationBalance,
        positions: [],
        trades: []
      };
      
      // Reset counters
      this.totalTrades = 0;
      this.consecutiveLosses = 0;
      this.explorationTrades = 0;
      this.lastTradeTime = 0;
      this.lastRebalanceCheck = 0;
      
      this.savePortfolio();
      
      logService.info('allBotDataResetComplete');
      return true;
    } catch (error) {
      logService.error('allBotDataResetFailed', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  private saveConfig() {
    try {
      localStorage.setItem('trading-bot-config', JSON.stringify(this.config));
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  private loadConfig() {
    try {
      const saved = localStorage.getItem('trading-bot-config');
      if (saved) {
        const savedConfig = JSON.parse(saved);
        this.config = { ...this.config, ...savedConfig };
        
        // Ensure tradeMode exists (for backward compatibility)
        if (!this.config.tradeMode) {
          this.config.tradeMode = 'futures';
        }
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  }

  private savePortfolio() {
    try {
      localStorage.setItem('trading-bot-portfolio', JSON.stringify(this.portfolio));
    } catch (error) {
      console.error('Failed to save portfolio:', error);
    }
  }

  private loadPortfolio() {
    try {
      const saved = localStorage.getItem('trading-bot-portfolio');
      if (saved) {
        this.portfolio = JSON.parse(saved);
      }
    } catch (error) {
      console.error('Failed to load portfolio:', error);
    }
  }
}

export const tradingBot = new TradingBot();