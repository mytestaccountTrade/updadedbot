import { BotConfig, Portfolio, Position, Trade, MarketData } from '../types/trading';
import { binanceService } from './binanceService';
import { newsService } from './newsService';
import { learningService } from './learningService';

class TradingBot {
  private config: BotConfig;
  private portfolio: Portfolio;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private activePositionIds: Set<string> = new Set();

  constructor() {
    this.config = {
      mode: 'SIMULATION',
      simulationBalance: 10000,
      maxRiskPerTrade: 0.05, // 5% of portfolio per trade - more aggressive
      stopLossPercent: 0.03, // 3% stop loss - tighter for faster exits
      takeProfitPercent: 0.06, // 6% take profit - lower target for faster profits
      maxPositions: 8, // More positions for more opportunities
      enableNewsTrading: true,
      enableTechnicalAnalysis: true,
    };

    this.portfolio = {
      totalValue: 10000,
      totalPnl: 0,
      totalPnlPercent: 0,
      availableBalance: 10000,
      positions: [],
      trades: [],
    };
  }

  setConfig(config: Partial<BotConfig>) {
    this.config = { ...this.config, ...config };
    
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
    console.log(`Trading bot started in ${this.config.mode} mode`);
    
    // Update real wallet balance if in real mode
    if (this.config.mode === 'REAL') {
      this.updateRealWalletBalance();
    }
    
    // Run trading loop every 10 seconds for faster execution
    this.intervalId = setInterval(() => {
      this.runTradingLoop();
    }, 10000);
    
    // Run initial loop
    this.runTradingLoop();
  }

  stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    console.log('Trading bot stopped');
  }

  isActive(): boolean {
    return this.isRunning;
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
      
      console.log(`📊 Portfolio Status: ${this.portfolio.positions.length} positions, $${this.portfolio.totalValue.toFixed(2)} total value, $${this.portfolio.totalPnl.toFixed(2)} P&L`);
      
      // Look for new trading opportunities - check more pairs for better opportunities
      for (const pair of tradingPairs.slice(0, 20)) {
        if (this.portfolio.positions.length >= this.config.maxPositions) break;
        
        // Skip if we already have a position in this symbol
        if (this.activePositionIds.has(pair.symbol)) continue;
        
        const marketData = await binanceService.getMarketData(pair.symbol);
        if (!marketData) continue;
        
        const signal = await newsService.generateTradingSignal(pair.symbol, marketData, news);
        
        // Apply learning insights to improve decision making
        const enhancedSignal = await learningService.enhanceSignal(signal, marketData, learningInsights);
        
        // More aggressive entry - lower confidence threshold
        if (enhancedSignal.action !== 'HOLD' && enhancedSignal.confidence > 0.6) {
          console.log(`🎯 Trading signal: ${enhancedSignal.action} ${pair.symbol} (confidence: ${enhancedSignal.confidence.toFixed(2)})`);
          await this.executeTrade(pair.symbol, enhancedSignal.action, marketData, enhancedSignal);
        }
      }
      
      // Update portfolio metrics
      this.updatePortfolioMetrics();
      
    } catch (error) {
      console.error('Trading loop error:', error);
    }
  }

  private async updatePositions() {
    for (const position of this.portfolio.positions) {
      const marketData = await binanceService.getMarketData(position.symbol);
      if (!marketData) continue;
      
      position.currentPrice = marketData.price;
      position.pnl = (marketData.price - position.entryPrice) * position.size * (position.side === 'LONG' ? 1 : -1);
      position.pnlPercent = (position.pnl / (position.entryPrice * position.size)) * 100;
      
      // More aggressive exit conditions
      let shouldExit = false;
      let exitReason = '';
      
      // Check stop loss
      if (position.pnlPercent <= -this.config.stopLossPercent * 100) {
        shouldExit = true;
        exitReason = 'STOP_LOSS';
      }
      // Check take profit
      else if (position.pnlPercent >= this.config.takeProfitPercent * 100) {
        shouldExit = true;
        exitReason = 'TAKE_PROFIT';
      }
      // Check learning-based exit
      else {
        const learningExit = await this.shouldExitBasedOnLearning(position, marketData);
        if (learningExit) {
          shouldExit = true;
          exitReason = 'LEARNING_EXIT';
        }
      }
      
      if (shouldExit) {
        console.log(`🔄 Closing position ${position.symbol} - Reason: ${exitReason}, P&L: ${position.pnlPercent.toFixed(2)}%`);
        await this.closePositionInternal(position, exitReason);
      }
    }
  }

  private async shouldExitBasedOnLearning(position: Position, marketData: MarketData): Promise<boolean> {
    try {
      const exitSignal = await learningService.shouldExit(position, marketData);
      return exitSignal.shouldExit && exitSignal.confidence > 0.7;
    } catch (error) {
      console.error('Learning-based exit analysis failed:', error);
      return false;
    }
  }

  private async executeTrade(symbol: string, action: 'BUY' | 'SELL', marketData: MarketData, signal?: any) {
    // Prevent duplicate positions
    if (this.activePositionIds.has(symbol)) {
      return;
    }
    
    const riskAmount = this.portfolio.availableBalance * this.config.maxRiskPerTrade;
    const quantity = riskAmount / marketData.price;
    
    if (quantity * marketData.price > this.portfolio.availableBalance) return;
    
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
    
    // Record trade for learning
    await learningService.recordTrade(trade, position, tradeContext);
    this.portfolio.availableBalance -= quantity * marketData.price;
    
    console.log(`${this.config.mode} trade executed: ${action} ${quantity.toFixed(6)} ${symbol} at ${marketData.price}`);
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
    
    // Remove position
    this.portfolio.positions = this.portfolio.positions.filter(p => p.id !== position.id);
    this.activePositionIds.delete(position.symbol);
    
    console.log(`Position closed (${reason}): ${position.symbol} PnL: ${position.pnl.toFixed(2)} (${position.pnlPercent.toFixed(2)}%)`);
    return true;
  }

  private updatePortfolioMetrics() {
    const positionsValue = this.portfolio.positions.reduce((sum, pos) => sum + (pos.size * pos.currentPrice), 0);
    const totalPnl = this.portfolio.positions.reduce((sum, pos) => sum + pos.pnl, 0);
    
    this.portfolio.totalValue = this.portfolio.availableBalance + positionsValue;
    this.portfolio.totalPnl = totalPnl;
    this.portfolio.totalPnlPercent = (totalPnl / this.config.simulationBalance) * 100;
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
}

export const tradingBot = new TradingBot();