import { BotConfig, Portfolio, Position, Trade, MarketData } from '../types/trading';
import { binanceService } from './binanceService';
import { newsService } from './newsService';

class TradingBot {
  private config: BotConfig;
  private portfolio: Portfolio;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.config = {
      mode: 'SIMULATION',
      simulationBalance: 10000,
      maxRiskPerTrade: 0.02, // 2% of portfolio per trade
      stopLossPercent: 0.05, // 5% stop loss
      takeProfitPercent: 0.10, // 10% take profit
      maxPositions: 5,
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
    
    // Run trading loop every 30 seconds
    this.intervalId = setInterval(() => {
      this.runTradingLoop();
    }, 30000);
    
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
      // Fetch market data
      const tradingPairs = await binanceService.getTradingPairs();
      const news = await newsService.fetchCryptoNews();
      
      // Update existing positions
      await this.updatePositions();
      
      // Look for new trading opportunities
      for (const pair of tradingPairs.slice(0, 10)) {
        if (this.portfolio.positions.length >= this.config.maxPositions) break;
        
        const marketData = await binanceService.getMarketData(pair.symbol);
        if (!marketData) continue;
        
        const signal = await newsService.generateTradingSignal(pair.symbol, marketData, news);
        
        if (signal.action !== 'HOLD' && signal.confidence > 0.7) {
          await this.executeTrade(pair.symbol, signal.action, marketData);
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
      
      // Check for stop loss or take profit
      const pnlPercent = Math.abs(position.pnlPercent);
      
      if (position.pnlPercent <= -this.config.stopLossPercent * 100) {
        await this.closePosition(position, 'STOP_LOSS');
      } else if (position.pnlPercent >= this.config.takeProfitPercent * 100) {
        await this.closePosition(position, 'TAKE_PROFIT');
      }
    }
  }

  private async executeTrade(symbol: string, action: 'BUY' | 'SELL', marketData: MarketData) {
    const riskAmount = this.portfolio.availableBalance * this.config.maxRiskPerTrade;
    const quantity = riskAmount / marketData.price;
    
    if (quantity * marketData.price > this.portfolio.availableBalance) return;
    
    const trade: Trade = {
      id: Date.now().toString(),
      symbol,
      side: action,
      type: 'MARKET',
      quantity,
      price: marketData.price,
      status: 'FILLED',
      timestamp: Date.now(),
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
      id: trade.id,
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
    this.portfolio.availableBalance -= quantity * marketData.price;
    
    console.log(`${this.config.mode} trade executed: ${action} ${quantity.toFixed(6)} ${symbol} at ${marketData.price}`);
  }

  private async closePosition(position: Position, reason: string) {
    const trade: Trade = {
      id: Date.now().toString(),
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
      if (!realTrade) return;
      
      trade.id = realTrade.id;
      trade.price = realTrade.price;
      trade.status = realTrade.status;
    }
    
    this.portfolio.trades.push(trade);
    this.portfolio.availableBalance += position.size * position.currentPrice;
    
    // Remove position
    this.portfolio.positions = this.portfolio.positions.filter(p => p.id !== position.id);
    
    console.log(`Position closed (${reason}): ${position.symbol} PnL: ${position.pnl.toFixed(2)} (${position.pnlPercent.toFixed(2)}%)`);
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
    
    await this.closePosition(position, 'MANUAL_CLOSE');
    return true;
  }
}

export const tradingBot = new TradingBot();