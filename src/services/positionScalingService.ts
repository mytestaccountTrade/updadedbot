import { Position, PositionScaling, MarketData } from '../types/trading';

class PositionScalingService {
  private scalingData: Map<string, PositionScaling> = new Map();
  private config = {
    scaleInThreshold: 0.02, // 2% profit to scale in
    scaleOutThreshold: -0.015, // -1.5% loss to scale out
    trailingStopPercent: 0.02, // 2% trailing stop
    maxScaleInCount: 3,
    maxScaleOutCount: 2,
    scaleInMultiplier: 0.5, // Scale in by 50% of original size
    scaleOutMultiplier: 0.3 // Scale out by 30% of current size
  };

  updateConfig(newConfig: any) {
    this.config = { ...this.config, ...newConfig };
  }

  initializePosition(position: Position) {
    this.scalingData.set(position.id, {
      positionId: position.id,
      originalSize: position.size,
      currentSize: position.size,
      scaleInCount: 0,
      scaleOutCount: 0,
      highWaterMark: position.currentPrice,
      trailingStopPrice: undefined
    });
  }

  evaluateScaling(
  position: Position,
  marketData: MarketData,
  enableAutoRebalance: boolean,
  enableTrailingStop: boolean
): {
  shouldScaleIn: boolean;
  shouldScaleOut: boolean;
  shouldTrailingStop: boolean;
  newSize?: number;
  trailingStopPrice?: number;
  reasoning: string;
} {
    
    if (!enableAutoRebalance && !enableTrailingStop) {
      return { shouldScaleIn: false, shouldScaleOut: false, shouldTrailingStop: false, reasoning: 'Auto-rebalance disabled' };
    }

    const scaling = this.scalingData.get(position.id);
    if (!scaling) {
      this.initializePosition(position);
      return { shouldScaleIn: false, shouldScaleOut: false, shouldTrailingStop: false, reasoning: 'Position initialized' };
    }

    const currentPrice = marketData.price;
    const pnlPercent = position.pnlPercent / 100;
    const isLong = position.side === 'LONG';

    // Update high water mark
    if ((isLong && currentPrice > scaling.highWaterMark) || (!isLong && currentPrice < scaling.highWaterMark)) {
      scaling.highWaterMark = currentPrice;
    }

    let shouldScaleIn = false;
    let shouldScaleOut = false;
    let shouldTrailingStop = false;
    let newSize = scaling.currentSize;
    let reasoning = '';

    // Scale In Logic (when profitable)
    if (enableAutoRebalance && pnlPercent > this.config.scaleInThreshold && scaling.scaleInCount < this.config.maxScaleInCount) {
      shouldScaleIn = true;
      newSize = scaling.currentSize + (scaling.originalSize * this.config.scaleInMultiplier);
      scaling.scaleInCount++;
      reasoning = `Scale in: +${(pnlPercent * 100).toFixed(2)}% profit, increasing position size`;
    }

    // Scale Out Logic (when losing)
    else if (enableAutoRebalance && pnlPercent < this.config.scaleOutThreshold && scaling.scaleOutCount < this.config.maxScaleOutCount) {
      shouldScaleOut = true;
      newSize = scaling.currentSize * (1 - this.config.scaleOutMultiplier);
      scaling.scaleOutCount++;
      reasoning = `Scale out: ${(pnlPercent * 100).toFixed(2)}% loss, reducing position size`;
    }

    // Trailing Stop Logic
    let trailingStopPrice = scaling.trailingStopPrice;
    if (enableTrailingStop && pnlPercent > 0.01) { // Only activate trailing stop when in profit
      const trailingDistance = scaling.highWaterMark * this.config.trailingStopPercent;
      const newTrailingStop = isLong 
        ? scaling.highWaterMark - trailingDistance
        : scaling.highWaterMark + trailingDistance;

      if (!trailingStopPrice || 
          (isLong && newTrailingStop > trailingStopPrice) || 
          (!isLong && newTrailingStop < trailingStopPrice)) {
        trailingStopPrice = newTrailingStop;
        scaling.trailingStopPrice = trailingStopPrice;
      }

      // Check if trailing stop is hit
      if ((isLong && currentPrice <= trailingStopPrice) || (!isLong && currentPrice >= trailingStopPrice)) {
        shouldTrailingStop = true;
        reasoning = `Trailing stop triggered at ${trailingStopPrice.toFixed(2)}`;
      }
    }

    // Update scaling data
    if (shouldScaleIn || shouldScaleOut) {
      scaling.currentSize = newSize;
    }

    this.saveScalingData();

    return {
      shouldScaleIn,
      shouldScaleOut,
      shouldTrailingStop,
      newSize: shouldScaleIn || shouldScaleOut ? newSize : undefined,
      trailingStopPrice,
      reasoning: reasoning || 'No scaling action needed'
    };
  }

  getScalingInfo(positionId: string): PositionScaling | null {
    return this.scalingData.get(positionId) || null;
  }

  removePosition(positionId: string) {
    this.scalingData.delete(positionId);
    this.saveScalingData();
  }

  private saveScalingData() {
    try {
      const data = Array.from(this.scalingData.entries());
      localStorage.setItem('position-scaling-data', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save scaling data:', error);
    }
  }

  private loadScalingData() {
    try {
      const saved = localStorage.getItem('position-scaling-data');
      if (saved) {
        const data = JSON.parse(saved);
        this.scalingData = new Map(data);
        console.log(`📊 Loaded scaling data for ${this.scalingData.size} positions`);
      }
    } catch (error) {
      console.error('Failed to load scaling data:', error);
    }
  }

  resetScalingData() {
    console.log('🔄 Resetting position scaling data...');
    this.scalingData.clear();
    this.saveScalingData();
    console.log('✅ Position scaling data reset complete');
  }

  constructor() {
    this.loadScalingData();
  }
}

export const positionScalingService = new PositionScalingService();
