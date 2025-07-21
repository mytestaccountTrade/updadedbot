import React, { useState } from 'react';
import { Play, Calendar, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { simulationReplayService } from '../services/simulationReplayService';
import { tradingBot } from '../services/tradingBot';

export const SimulationReplayPanel: React.FC = () => {
  const { t } = useLanguage();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isRunning, setIsRunning] = useState(false);
  const [replayResults, setReplayResults] = useState<any>(null);

  const handleRunReplay = async () => {
    setIsRunning(true);
    try {
      const config = tradingBot.getConfig();
      const results = await simulationReplayService.runSimulationReplay(
        selectedDate,
        config.strategies,
        config.simulationBalance
      );
      setReplayResults(results);
    } catch (error) {
      console.error('Replay failed:', error);
    } finally {
      setIsRunning(false);
    }
  };

  const config = tradingBot.getConfig();

  if (!config.enableSimulationReplay) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>Simulation Replay is disabled. Enable it in Bot Settings to use this feature.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Replay Controls */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">🧪 {t('simulationReplay')}</h3>
        
        <div className="flex items-center space-x-4 mb-4">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-gray-500" />
            <label className="text-sm font-medium text-gray-700">{t('selectDate')}:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              max={new Date().toISOString().split('T')[0]}
            />
          </div>
          
          <button
            onClick={handleRunReplay}
            disabled={isRunning}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              isRunning
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <Play className="w-4 h-4" />
            <span>{isRunning ? 'Running...' : t('runReplay')}</span>
          </button>
        </div>
        
        {/* Strategy Status */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className={`p-3 rounded-lg ${config.strategies.rsiMacd.enabled ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-500'}`}>
            <div className="font-medium">RSI + MACD</div>
            <div>{config.strategies.rsiMacd.enabled ? `Weight: ${config.strategies.rsiMacd.weight}` : 'Disabled'}</div>
          </div>
          <div className={`p-3 rounded-lg ${config.strategies.newsSentiment.enabled ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-500'}`}>
            <div className="font-medium">News Sentiment</div>
            <div>{config.strategies.newsSentiment.enabled ? `Weight: ${config.strategies.newsSentiment.weight}` : 'Disabled'}</div>
          </div>
          <div className={`p-3 rounded-lg ${config.strategies.volumeSpike.enabled ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-500'}`}>
            <div className="font-medium">Volume Spike</div>
            <div>{config.strategies.volumeSpike.enabled ? `Weight: ${config.strategies.volumeSpike.weight}` : 'Disabled'}</div>
          </div>
        </div>
      </div>

      {/* Replay Results */}
      {replayResults && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 {t('replayResults')} - {selectedDate}</h3>
          
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{replayResults.totalTrades}</div>
              <div className="text-sm text-gray-600">Total Trades</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className={`text-2xl font-bold ${replayResults.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${replayResults.totalPnL.toFixed(2)}
              </div>
              <div className="text-sm text-gray-600">Total P&L</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {replayResults.strategyResults.length}
              </div>
              <div className="text-sm text-gray-600">Active Strategies</div>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {replayResults.strategyResults.reduce((sum: number, s: any) => sum + s.winningTrades, 0)}
              </div>
              <div className="text-sm text-gray-600">Winning Trades</div>
            </div>
          </div>

          {/* Strategy Performance */}
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-900">Strategy Performance</h4>
            {replayResults.strategyResults.map((strategy: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full ${
                    strategy.totalPnL > 0 ? 'bg-green-500' : strategy.totalPnL < 0 ? 'bg-red-500' : 'bg-gray-400'
                  }`} />
                  <div>
                    <div className="font-medium text-gray-900">{strategy.name}</div>
                    <div className="text-sm text-gray-600">
                      {strategy.totalTrades} trades • {(strategy.winRate * 100).toFixed(1)}% win rate
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-medium ${strategy.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${strategy.totalPnL.toFixed(2)}
                  </div>
                  <div className="text-sm text-gray-500">
                    {strategy.winningTrades}/{strategy.totalTrades}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Trade Timeline */}
          {replayResults.tradeHistory && replayResults.tradeHistory.length > 0 && (
            <div className="mt-6">
              <h4 className="font-semibold text-gray-900 mb-4">Trade Timeline</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {replayResults.tradeHistory.slice(0, 10).map((trade: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded text-sm">
                    <div className="flex items-center space-x-3">
                      <div className={`flex items-center space-x-1 ${
                        trade.action === 'BUY' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {trade.action === 'BUY' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        <span className="font-medium">{trade.action}</span>
                      </div>
                      <span className="text-gray-600">
                        ${trade.entryPrice.toFixed(2)} → ${trade.exitPrice.toFixed(2)}
                      </span>
                      <span className="text-xs text-gray-500">({trade.strategy})</span>
                    </div>
                    <div className={`font-medium ${trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                    </div>
                  </div>
                ))}
                {replayResults.tradeHistory.length > 10 && (
                  <div className="text-center text-sm text-gray-500 py-2">
                    ... and {replayResults.tradeHistory.length - 10} more trades
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};