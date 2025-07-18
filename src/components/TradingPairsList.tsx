import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { TradingPair } from '../types/trading';
import { useLanguage } from '../contexts/LanguageContext';

interface TradingPairsListProps {
  pairs: TradingPair[];
}

export const TradingPairsList: React.FC<TradingPairsListProps> = ({ pairs }) => {
  const { t } = useLanguage();

  return (
    <div className="space-y-3">
      {pairs.map((pair) => (
        <div 
          key={pair.symbol}
          className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
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
        </div>
      ))}
    </div>
  );
};