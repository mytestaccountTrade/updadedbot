import React, { useState } from 'react';
import { X, Save, AlertTriangle, Globe } from 'lucide-react';
import { BotConfig } from '../types/trading';
import { useLanguage } from '../contexts/LanguageContext';

interface BotSettingsProps {
  config: BotConfig;
  onSave: (config: BotConfig) => void;
  onClose: () => void;
}

export const BotSettings: React.FC<BotSettingsProps> = ({ config, onSave, onClose }) => {
  const { t, language, setLanguage } = useLanguage();
  const [formData, setFormData] = useState<BotConfig>(config);

  const handleSave = () => {
    // Handle adaptive strategy toggle
    if (formData.adaptiveStrategyEnabled !== config.adaptiveStrategyEnabled) {
      (window as any).tradingBot?.toggleAdaptiveStrategy(formData.adaptiveStrategyEnabled);
    }
    
    onSave(formData);
  };

  const handleChange = (field: keyof BotConfig, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">{t('botSettings')}</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Language Settings */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">{t('language')}</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setLanguage('en')}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  language === 'en'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <div className="text-left">
                  <div className="font-medium">English</div>
                  <div className="text-sm text-gray-600">English language</div>
                </div>
              </button>
              <button
                onClick={() => setLanguage('tr')}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  language === 'tr'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <div className="text-left">
                  <div className="font-medium">Türkçe</div>
                  <div className="text-sm text-gray-600">Türkçe dil</div>
                </div>
              </button>
            </div>
          </div>

          {/* Trading Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">{t('tradingMode')}</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => handleChange('mode', 'SIMULATION')}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  formData.mode === 'SIMULATION'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <div className="text-left">
                  <div className="font-medium">{t('simulation')}</div>
                  <div className="text-sm text-gray-600">{t('paperTradingFakeMoney')}</div>
                </div>
              </button>
              <button
                onClick={() => handleChange('mode', 'REAL')}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  formData.mode === 'REAL'
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <div className="text-left">
                  <div className="font-medium">{t('realTrading')}</div>
                  <div className="text-sm text-gray-600">{t('liveTradingRealMoney')}</div>
                </div>
              </button>
            </div>
            {formData.mode === 'REAL' && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-600" />
                  <span className="text-sm font-medium text-yellow-800">
                    {t('warningRealTrading')}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Simulation Balance */}
          {formData.mode === 'SIMULATION' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('simulationBalance')} (${formData.simulationBalance.toLocaleString()})
              </label>
              <input
                type="range"
                min="100"
                max="100000"
                step="100"
                value={formData.simulationBalance}
                onChange={(e) => handleChange('simulationBalance', parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>$100</span>
                <span>$100,000</span>
              </div>
            </div>
          )}

          {/* Llama 3 Configuration */}
        {/* Fast Learning Mode */}
        {formData.mode === 'SIMULATION' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Fast Learning Mode</label>
            <div className="flex items-center justify-between p-4 rounded-lg border-2 border-gray-300">
              <div>
                <div className="font-medium text-gray-900">Fast Learning Mode</div>
                <div className="text-sm text-gray-600">Execute micro-trades every 2 seconds for rapid learning (Simulation only)</div>
              </div>
              <button
                onClick={() => handleChange('fastLearningMode', !formData.fastLearningMode)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.fastLearningMode ? 'bg-purple-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.fastLearningMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {formData.fastLearningMode && (
              <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-purple-800">
                    ⚡ Fast Learning: Executes trades every 2 seconds, retrains AI every 3 trades
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">{t('llama3Configuration')}</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('llama3Url')}
              </label>
              <input
                type="text"
                value={formData.llama3Url || 'http://localhost:11434'}
                onChange={(e) => handleChange('llama3Url', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="http://localhost:11434"
              />
              <p className="text-xs text-gray-500 mt-1">{t('llama3UrlDescription')}</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('llama3Model')}
              </label>
              <input
                type="text"
                value={formData.llama3Model || 'llama3'}
                onChange={(e) => handleChange('llama3Model', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="llama3"
              />
              <p className="text-xs text-gray-500 mt-1">{t('llama3ModelDescription')}</p>
            </div>
          </div>

          {/* Risk Management */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">{t('riskManagement')}</h3>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('binanceApiKey')}
              </label>
              <input
                type="password"
                value={formData.apiKey || ''}
                onChange={(e) => handleChange('apiKey', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={t('enterApiKey')}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('binanceApiSecret')}
              </label>
              <input
                type="password"
                value={formData.apiSecret || ''}
                onChange={(e) => handleChange('apiSecret', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={t('enterApiSecret')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('maxRiskPerTrade')} ({(formData.maxRiskPerTrade * 100).toFixed(1)}%)
              </label>
              <input
                type="range"
                min="0.01"
                max="0.1"
                step="0.001"
                value={formData.maxRiskPerTrade}
                onChange={(e) => handleChange('maxRiskPerTrade', parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>1%</span>
                <span>10%</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('stopLoss')} ({(formData.stopLossPercent * 100).toFixed(1)}%)
              </label>
              <input
                type="range"
                min="0.01"
                max="0.2"
                step="0.001"
                value={formData.stopLossPercent}
                onChange={(e) => handleChange('stopLossPercent', parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>1%</span>
                <span>20%</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('takeProfit')} ({(formData.takeProfitPercent * 100).toFixed(1)}%)
              </label>
              <input
                type="range"
                min="0.05"
                max="0.5"
                step="0.001"
                value={formData.takeProfitPercent}
                onChange={(e) => handleChange('takeProfitPercent', parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>5%</span>
                <span>50%</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('maxPositions')} ({formData.maxPositions})
              </label>
              <input
                type="range"
                min="1"
                max="20"
                step="1"
                value={formData.maxPositions}
                onChange={(e) => handleChange('maxPositions', parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>1</span>
                <span>20</span>
              </div>
            </div>
          </div>

          {/* Trading Features */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">{t('tradingFeatures')}</h3>
            
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900">{t('newsBasedTrading')}</div>
                <div className="text-sm text-gray-600">{t('tradeBasedSentiment')}</div>
              </div>
              <button
                onClick={() => handleChange('enableNewsTrading', !formData.enableNewsTrading)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.enableNewsTrading ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.enableNewsTrading ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900">{t('technicalAnalysis')}</div>
                <div className="text-sm text-gray-600">{t('useRsiMacdBollinger')}</div>
              </div>
              <button
                onClick={() => handleChange('enableTechnicalAnalysis', !formData.enableTechnicalAnalysis)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.enableTechnicalAnalysis ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.enableTechnicalAnalysis ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200">
          <div className="flex justify-end space-x-4">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleSave}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{t('saveSettings')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};