import React, { useState } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Trade,BotConfig } from '../types/trading';
import { formatDistanceToNow } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';
import { tradingBot } from '../services/tradingBot';

interface TradesHistoryProps {
  trades: Trade[];
}
const config = tradingBot.getConfig();
const ITEMS_PER_PAGE = 10;

// 🔧 Süreyi okunabilir formata çeviren yardımcı fonksiyon
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);

  return parts.join(' ');
}

export const TradesHistory: React.FC<TradesHistoryProps> = ({ trades }) => {
  const { t } = useLanguage();
  const [currentPage, setCurrentPage] = useState(1);

  if (trades.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>{t('noTradesExecuted')}</p>
      </div>
    );
  }

  const sortedTrades = [...trades].sort((a, b) => b.timestamp - a.timestamp);
  const totalPages = Math.ceil(sortedTrades.length / ITEMS_PER_PAGE);
  const notional = trade.quantity * trade.price;
  const leverage = trade.tradeMode === 'futures' ? config.leverage ?? 1 : 1;
  const invested = notional / leverage;
  const paginatedTrades = sortedTrades.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

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
            <th className="text-left py-3 px-4">{t('entryPrice')}</th>
            <th className="text-left py-3 px-4">{t('exitPrice')}</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">{t('positionSize')}</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">{t('status')}</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">{t('profit')}</th>
            <th className="text-left py-3 px-4 font-medium text-gray-600">{t('duration')}</th>    
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
              {config.tradeMode === 'futures' ? (
  <>
    <td>{invested.toFixed(2)}</td>
    <td>{notional.toFixed(2)}</td>
  </>
) : (
  <>
    <td>{notional.toFixed(2)}</td>
    <td>-</td>
  </>
)}
              <td className="py-4 px-4 text-gray-900">
                {trade.price ? `$${trade.price.toFixed(6)}` : '-'}
              </td>
              <td className="py-4 px-4 text-gray-900">
                {trade.exitPrice ? `$${trade.exitPrice.toFixed(6)}` : '-'}
              </td>
              <td className="py-4 px-4 text-gray-900">
              {trade.price ? `$${(trade.price * trade.quantity).toFixed(2)}` : '-'}
              </td>
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
              <td className="py-4 px-4 text-gray-900">
                {typeof trade.duration === 'number' ? formatDuration(trade.duration) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 🔽 Pagination Controls */}
      <div className="flex justify-center items-center mt-4 space-x-4">
        <button
          className="px-3 py-1 border rounded disabled:opacity-50"
          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
          disabled={currentPage === 1}
        >
          {t('prev')}
        </button>
        <span className="text-sm text-gray-600">
          {t('page')} {currentPage} / {totalPages}
        </span>
        <button
          className="px-3 py-1 border rounded disabled:opacity-50"
          onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
          disabled={currentPage === totalPages}
        >
          {t('next')}
        </button>
      </div>
    </div>
  );
};
