import React, { useState, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Trade } from '../types/trading';
import { formatDistanceToNow } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';

interface TradesHistoryProps {
  trades: Trade[];
}

const ITEMS_PER_PAGE = 10;

const formatDuration = (seconds: number, t: (key: string) => string) => {
  if (seconds < 60) return `${seconds} ${t('seconds')}`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${t('minutes')}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${t('hours')}`;
  const days = Math.floor(hours / 24);
  return `${days} ${t('days')}`;
};

export const TradesHistory: React.FC<TradesHistoryProps> = ({ trades }) => {
  const { t } = useLanguage();
  const [currentPage, setCurrentPage] = useState(1);

  const mergedTrades = useMemo(() => {
    const map = new Map<string, Trade>();

    for (const trade of trades) {
      const existing = map.get(trade.id);
      if (existing) {
        if (trade.profit !== undefined) {
          map.set(trade.id, { ...existing, profit: trade.profit, status: 'FILLED' });
        }
      } else {
        const status = trade.profit === undefined ? 'PENDING' : 'FILLED';
        map.set(trade.id, { ...trade, status });
      }
    }

    return [...map.values()].sort((a, b) => b.timestamp - a.timestamp);
  }, [trades]);

  const totalPages = Math.ceil(mergedTrades.length / ITEMS_PER_PAGE);
  const paginatedTrades = mergedTrades.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  if (mergedTrades.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>{t('noTradesExecuted')}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
  <tr className="border-b border-gray-200">
    <th className="text-left py-3 px-4">{t('time')}</th>
    <th className="text-left py-3 px-4">{t('symbol')}</th>
    <th className="text-left py-3 px-4">{t('side')}</th>
    <th className="text-left py-3 px-4">{t('type')}</th>
    <th className="text-left py-3 px-4">{t('quantity')}</th>
    <th className="text-left py-3 px-4">{t('entryPrice')}</th>
    <th className="text-left py-3 px-4">{t('exitPrice')}</th>
    <th className="text-left py-3 px-4">{t('status')}</th>
    <th className="text-left py-3 px-4">{t('profit')}</th>
    <th className="text-left py-3 px-4">{t('duration')}</th>
  </tr>
</thead>
<tbody>
  {paginatedTrades.map((trade) => (
    <tr key={trade.id} className="border-b border-gray-100 hover:bg-gray-50">
      <td className="py-4 px-4 text-sm text-gray-500">
        {formatDistanceToNow(new Date(trade.timestamp), { addSuffix: true })}
      </td>
      <td className="py-4 px-4 font-medium text-gray-900">{trade.symbol}</td>
      <td className="py-4 px-4">
        <span className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${
          trade.side === 'BUY' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {trade.side === 'BUY' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          <span>{t(trade.side.toLowerCase())}</span>
        </span>
      </td>
      <td className="py-4 px-4 text-gray-900">{trade.type}</td>
      <td className="py-4 px-4 text-gray-900">{trade.quantity.toFixed(6)}</td>
      <td className="py-4 px-4 text-gray-900">
        {trade.price ? `$${trade.price.toFixed(6)}` : '-'}
      </td>
      <td className="py-4 px-4 text-gray-900">
        {trade.exitPrice ? `$${trade.exitPrice.toFixed(6)}` : '-'}
      </td>
      <td className="py-4 px-4">
        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
          trade.status === 'FILLED' ? 'bg-green-100 text-green-800'
            : trade.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800'
            : 'bg-red-100 text-red-800'
        }`}>
          {t(trade.status.toLowerCase())}
        </span>
      </td>
      <td className={`py-4 px-4 font-medium ${
        trade.profit !== undefined
          ? trade.profit >= 0 ? 'text-green-600' : 'text-red-600'
          : 'text-gray-400'
      }`}>
        {trade.profit !== undefined ? `$${trade.profit.toFixed(6)}` : '-'}
      </td>
      <td className="py-4 px-4 text-gray-700 text-sm">
        {trade.duration !== undefined ? formatDuration(trade.duration, t) : '-'}
      </td>
    </tr>
  ))}
</tbody>
      </table>

      <div className="flex justify-between items-center mt-4">
        <button
          onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
          disabled={currentPage === 1}
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded disabled:opacity-50"
        >
          {t('prev')}
        </button>
        <span className="text-sm text-gray-600">
          {t('page')} {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
          disabled={currentPage === totalPages}
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded disabled:opacity-50"
        >
          {t('next')}
        </button>
      </div>
    </div>
  );
};
