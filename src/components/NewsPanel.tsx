import React from 'react';
import { TrendingUp, TrendingDown, Minus, ExternalLink } from 'lucide-react';
import { NewsItem } from '../types/trading';
import { formatDistanceToNow } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';

interface NewsPanelProps {
  news: NewsItem[];
}

export const NewsPanel: React.FC<NewsPanelProps> = ({ news }) => {
  const { t } = useLanguage();

  if (news.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>{t('noNewsAvailable')}</p>
      </div>
    );
  }

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'BULLISH':
        return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'BEARISH':
        return <TrendingDown className="w-4 h-4 text-red-600" />;
      default:
        return <Minus className="w-4 h-4 text-gray-600" />;
    }
  };

  const getSentimentBadge = (sentiment: string) => {
    switch (sentiment) {
      case 'BULLISH':
        return 'bg-green-100 text-green-800';
      case 'BEARISH':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getImpactColor = (impact: number) => {
    if (impact >= 8) return 'bg-red-500';
    if (impact >= 6) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="space-y-4">
      {news.map((item) => (
        <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-2">
                <h3 className="font-semibold text-gray-900 text-lg">{item.title}</h3>
                <ExternalLink className="w-4 h-4 text-gray-400" />
              </div>
              <p className="text-gray-600 mb-3 line-clamp-2">{item.content}</p>
              <div className="flex items-center space-x-4 text-sm text-gray-500">
                <span>{item.source}</span>
                <span>•</span>
                <span>{formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}</span>
              </div>
            </div>
            
            <div className="flex flex-col items-end space-y-2 ml-4">
              <div className="flex items-center space-x-2">
                <span className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${getSentimentBadge(item.sentiment)}`}>
                  {getSentimentIcon(item.sentiment)}
                  <span>{t(item.sentiment.toLowerCase() as any)}</span>
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500">{t('impact')}:</span>
                <div className="flex items-center space-x-1">
                  <div className={`w-3 h-3 rounded-full ${getImpactColor(item.impact)}`} />
                  <span className="text-xs font-medium">{item.impact.toFixed(1)}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-600">{t('affects')}:</span>
              <div className="flex space-x-1">
                {item.coins.map((coin) => (
                  <span
                    key={coin}
                    className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {coin}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};