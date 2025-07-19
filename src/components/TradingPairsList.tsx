import React from 'react';
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { TradingPair } from '../types/trading';
import { useLanguage } from '../contexts/LanguageContext';
import { tradingBot } from '../services/tradingBot';

interface TradingPairsListProps {
  pairs: TradingPair[];
  onTradeExecuted?: () => void;
}

export const TradingPairsList: React.FC<TradingPairsListProps> = ({ pairs, onTradeExecuted }) => {
  const { t } = useLanguage();

  const handleQuickTrade = async (symbol: string, action: 'BUY' | 'SELL') => {
    const amount = 100; // $100 quick trade
    let success = false;
    
    if (action === 'BUY') {
      success = await tradingBot.buyAsset(symbol, amount);
    } else {
      success = await tradingBot.sellAsset(symbol, amount);
    }
    
    if (success && onTradeExecuted) {
      onTradeExecuted();
    }
  };

  return (
    <div className="space-y-3">
      {pairs.map((pair) => (
        <div 
          key={pair.symbol}
          className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group"
        >
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-xs font-bold text-blue-600">
                  {pair.symbol.replace('USDT', '')}
                </span>
              </div>
            </div>
            <div>
              <h4 className="font-medium text-gray-900">{pair.symbol}</h4>
              <p className="text-sm text-gray-500">
                {t('volume')}: {(pair.volume / 1000000).toFixed(1)}M
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-900">
                  ${pair.price.toFixed(pair.price < 1 ? 6 : 2)}
                </span>
                <div className={`flex items-center space-x-1 ${
                  pair.change24h >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {pair.change24h >= 0 ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  <span className="text-sm font-medium">
                    {pair.change24h >= 0 ? '+' : ''}{pair.change24h.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => handleQuickTrade(pair.symbol, 'BUY')}
                className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors"
                title="Quick Buy $100"
              >
                <ArrowUpRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleQuickTrade(pair.symbol, 'SELL')}
                className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-colors"
                title="Quick Sell $100"
              >
                <ArrowDownRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};