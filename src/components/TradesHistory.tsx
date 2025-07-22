import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Trade } from '../types/trading';
import { formatDistanceToNow } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';

interface TradesHistoryProps {
  trades: Trade[];
}

export const TradesHistory: React.FC<TradesHistoryProps> = ({ trades }) => {
  const { t } = useLanguage();

  if (trades.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>{t('noTradesExecuted')}</p>
      </div>
    );
  }

  const sortedTrades = [...trades].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-3 px-4 font-medium text-gray-600">{t('time')}</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">{t('symbol')}</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">{t('side')}</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">{t('type')}</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">{t('quantity')}</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">{t('price')}</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">{t('status')}</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">{t('profit')}</th>
          </tr>
        </thead>
        <tbody>
          {sortedTrades.map((trade) => (
            <tr key={trade.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-4 px-4 text-sm text-gray-500">
                {formatDistanceToNow(new Date(trade.timestamp), { addSuffix: true })}
              </td>
              <td className="py-4 px-4 font-medium text-gray-900">{trade.symbol}</td>
              <td className="py-4 px-4">
                <span className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${
                  trade.side === 'BUY' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {trade.side === 'BUY' ? (
                    <ArrowUpRight className="w-3 h-3" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3" />
                  )}
                  <span>{t(trade.side.toLowerCase() as any)}</span>
                </span>
              </td>
              <td className="py-4 px-4 text-gray-900">{trade.type}</td>
              <td className="py-4 px-4 text-gray-900">{trade.quantity.toFixed(6)}</td>
              <td className="py-4 px-4 text-gray-900">${trade.price.toFixed(6)}</td>
              <td className="py-4 px-4">
                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                  trade.status === 'FILLED' 
                    ? 'bg-green-100 text-green-800'
                    : trade.status === 'PENDING'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {t(trade.status.toLowerCase() as any)}
                </span>
              </td>
              <td className={`py-4 px-4 font-medium ${
                trade.profit 
                  ? trade.profit >= 0 ? 'text-green-600' : 'text-red-600'
                  : 'text-gray-400'
              }`}>
                {trade.profit ? `$${trade.profit.toFixed(6)}` : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};