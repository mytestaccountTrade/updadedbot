import React, { useState, useEffect } from 'react';
import { Play, Pause, Settings, TrendingUp, TrendingDown, DollarSign, Activity, Globe } from 'lucide-react';
import { tradingBot } from '../services/tradingBot';
import { binanceService } from '../services/binanceService';
import { newsService } from '../services/newsService';
import { Portfolio, TradingPair, NewsItem } from '../types/trading';
import { PortfolioChart } from './PortfolioChart';
import { TradingPairsList } from './TradingPairsList';
import { NewsPanel } from './NewsPanel';
import { PositionsTable } from './PositionsTable';
import { TradesHistory } from './TradesHistory';
import { BotSettings } from './BotSettings';
import { useLanguage } from '../contexts/LanguageContext';

export const Dashboard: React.FC = () => {
  const { t, language, setLanguage } = useLanguage();
  const [portfolio, setPortfolio] = useState<Portfolio>(tradingBot.getPortfolio());
  const [tradingPairs, setTradingPairs] = useState<TradingPair[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'positions' | 'trades' | 'news'>('overview');
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [pairs, newsData] = await Promise.all([
        binanceService.getTradingPairs(),
        newsService.fetchCryptoNews()
      ]);
      
      setTradingPairs(pairs);
      setNews(newsData);
      setPortfolio(tradingBot.getPortfolio());
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  const handleStartStop = () => {
    if (isRunning) {
      tradingBot.stop();
    } else {
      tradingBot.start();
    }
    setIsRunning(!isRunning);
  };

  const config = tradingBot.getConfig();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Activity className="w-8 h-8 text-blue-600" />
                <h1 className="text-2xl font-bold text-gray-900">{t('cryptoTradingBot')}</h1>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${isRunning ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm font-medium text-gray-600">
                  {isRunning ? t('running') : t('stopped')} ({config.mode})
                </span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="relative">
                <button
                  onClick={() => setShowLanguageMenu(!showLanguageMenu)}
                  className="flex items-center space-x-2 p-2 text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <Globe className="w-5 h-5" />
                  <span className="text-sm font-medium">{language.toUpperCase()}</span>
                </button>
                {showLanguageMenu && (
                  <div className="absolute right-0 mt-2 w-32 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <button
                      onClick={() => {
                        setLanguage('en');
                        setShowLanguageMenu(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                        language === 'en' ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                      }`}
                    >
                      English
                    </button>
                    <button
                      onClick={() => {
                        setLanguage('tr');
                        setShowLanguageMenu(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                        language === 'tr' ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                      }`}
                    >
                      Türkçe
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button
                onClick={handleStartStop}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  isRunning
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
              >
                {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{isRunning ? t('stopBot') : t('startBot')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Portfolio Stats */}
      <div className="px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('totalValue')}</p>
                <p className="text-2xl font-bold text-gray-900">${portfolio.totalValue.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <DollarSign className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('totalPnL')}</p>
                <p className={`text-2xl font-bold ${portfolio.totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${portfolio.totalPnl.toFixed(2)}
                </p>
              </div>
              <div className={`p-3 rounded-lg ${portfolio.totalPnl >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                {portfolio.totalPnl >= 0 ? (
                  <TrendingUp className="w-6 h-6 text-green-600" />
                ) : (
                  <TrendingDown className="w-6 h-6 text-red-600" />
                )}
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('availableBalance')}</p>
                <p className="text-2xl font-bold text-gray-900">${portfolio.availableBalance.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-lg">
                <DollarSign className="w-6 h-6 text-yellow-600" />
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('activePositions')}</p>
                <p className="text-2xl font-bold text-gray-900">{portfolio.positions.length}</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <Activity className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white rounded-xl shadow-sm mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              {[
                { id: 'overview', label: t('overview') },
                { id: 'positions', label: t('positions') },
                { id: 'trades', label: t('trades') },
                { id: 'news', label: t('news') },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('portfolioPerformance')}</h3>
                  <PortfolioChart portfolio={portfolio} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('topTradingPairs')}</h3>
                  <TradingPairsList pairs={tradingPairs.slice(0, 10)} />
                </div>
              </div>
            )}
            
            {activeTab === 'positions' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('activePositions')}</h3>
                <PositionsTable positions={portfolio.positions} />
              </div>
            )}
            
            {activeTab === 'trades' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('tradingHistory')}</h3>
                <TradesHistory trades={portfolio.trades} />
              </div>
            )}
            
            {activeTab === 'news' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('cryptoNewsAnalysis')}</h3>
                <NewsPanel news={news} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <BotSettings
          config={config}
          onSave={(newConfig) => {
            tradingBot.setConfig(newConfig);
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
};