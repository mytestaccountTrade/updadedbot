import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Position } from '../types/trading';
import { formatDistanceToNow } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';

interface PositionsTableProps {
  positions: Position[];
}

export const PositionsTable: React.FC<PositionsTableProps> = ({ positions }) => {
  const { t } = useLanguage();

  if (positions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>{t('noActivePositions')}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-3 px-4 font-medium text-gray-600">{t('symbol')}</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">{t('side')}</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">{t('size')}</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">{t('entryPrice')}</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">{t('currentPrice')}</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">P&L</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">P&L %</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">{t('age')}</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((position) => (
            <tr key={position.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-4 px-4 font-medium text-gray-900">{position.symbol}</td>
              <td className="py-4 px-4">
                <span className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${
                  position.side === 'LONG' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {position.side === 'LONG' ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  <span>{t(position.side.toLowerCase() as any)}</span>
                </span>
              </td>
              <td className="py-4 px-4 text-gray-900">{position.size.toFixed(6)}</td>
              <td className="py-4 px-4 text-gray-900">${position.entryPrice.toFixed(2)}</td>
              <td className="py-4 px-4 text-gray-900">${position.currentPrice.toFixed(2)}</td>
              <td className={`py-4 px-4 font-medium ${
                position.pnl >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                ${position.pnl.toFixed(2)}
              </td>
              <td className={`py-4 px-4 font-medium ${
                position.pnlPercent >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
              </td>
              <td className="py-4 px-4 text-gray-500 text-sm">
                {formatDistanceToNow(new Date(position.timestamp), { addSuffix: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};