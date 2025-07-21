import React, { useState } from 'react';
import { X, Save, AlertTriangle, Globe, RotateCcw } from 'lucide-react';
import { BotConfig } from '../types/trading';
import { useLanguage } from '../contexts/LanguageContext';
import { tradingBot } from '../services/tradingBot';

interface BotSettingsProps {
  config: BotConfig;
  onSave: (config: BotConfig) => void;
  onClose: () => void;
}

export const BotSettings: React.FC<BotSettingsProps> = ({ config, onSave, onClose }) => {
  const { t, language, setLanguage } = useLanguage();
  const [formData, setFormData] = useState<BotConfig>(config);
  const [showResetToast, setShowResetToast] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetType, setResetType] = useState<'ai' | 'all'>('ai');

  const handleSave = () => {
    // Log changes
    if (formData.adaptiveStrategyEnabled !== config.adaptiveStrategyEnabled) {
      console.log(`[AI SYSTEM] Adaptive strategy toggled ${formData.adaptiveStrategyEnabled ? 'ON' : 'OFF'}`);
    }
    if (formData.confidenceThreshold !== config.confidenceThreshold) {
      console.log(`[AI SYSTEM] Confidence threshold changed to ${formData.confidenceThreshold}`);
    }
    
    onSave(formData);
  };

  const handleResetAILearning = (type: 'ai' | 'all') => {
    setResetType(type);
    setShowResetConfirm(true);
  };

  const confirmResetAILearning = async () => {
    try {
      if (resetType === 'ai') {
        console.log('[AI SYSTEM] Learning reset manually');
        const success = tradingBot.resetAILearning();
      } else {
        console.log('[AI SYSTEM] All bot data reset manually');
        // Reset all bot data including trade history and statistics
        const success = tradingBot.resetAllBotData();
      }
      const success = true;
      if (success) {
        setShowResetToast(true);
        setTimeout(() => setShowResetToast(false), 3000);
      }
    } catch (error) {
      console.error('Failed to reset AI learning:', error);
    } finally {
      setShowResetConfirm(false);
    }
  };

  const handleChange = (field: keyof BotConfig, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <>
      {showResetToast && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50">
          ✅ {t('resetAiLearningSuccess')}
        </div>
      )}
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

          {/* AI Preferences */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900">🧠 {t('aiPreferences')}</h3>
            
            {/* Adaptive Strategy Toggle */}
            <div className="p-4 rounded-lg border-2 border-gray-300">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{t('enableAdaptiveStrategy')}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {t('adaptiveStrategyDescription')}
                  </div>
                </div>
                <button
                  onClick={() => handleChange('adaptiveStrategyEnabled', !formData.adaptiveStrategyEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.adaptiveStrategyEnabled ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                  title={t('adaptiveStrategyDescription')}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.adaptiveStrategyEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              
              {!formData.adaptiveStrategyEnabled && (
                <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-600" />
                    <span className="text-sm font-medium text-yellow-800">
                      📊 {t('staticModeWarning')}
                    </span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Confidence Threshold Slider */}
            <div className="p-4 rounded-lg border-2 border-gray-300">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('confidenceThreshold')} ({(formData.confidenceThreshold * 100).toFixed(0)}%)
                </label>
                <div className="text-sm text-gray-600 mb-3">
                  {t('confidenceThresholdDescription')}
                </div>
                <input
                  type="range"
                  min="0.50"
                  max="0.95"
                  step="0.01"
                  value={formData.confidenceThreshold}
                  onChange={(e) => handleChange('confidenceThreshold', parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>50%</span>
                  <span>95%</span>
                </div>
              </div>
            </div>
            
            {/* Reset AI Learning */}
            <div className="p-4 rounded-lg border-2 border-gray-300">
              <div className="mb-4">
                <div className="font-medium text-gray-900 mb-2">{t('resetAiLearning')}</div>
                <div className="text-sm text-gray-600 mb-3">
                  {t('resetAiLearningDescription')}
                </div>
              </div>
              
              <div className="space-y-2">
                <button
                  onClick={() => handleResetAILearning('ai')}
                  className="flex items-center space-x-2 px-4 py-2 text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors border border-purple-200 w-full"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span className="font-medium">{t('resetAiOnly')}</span>
                </button>
                
                <button
                  onClick={() => handleResetAILearning('all')}
                  className="flex items-center space-x-2 px-4 py-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors border border-red-200 w-full"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span className="font-medium">{t('resetAllBotData')}</span>
                </button>
              </div>
            </div>
          </div>

        {/* Multi-Strategy Settings */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">🔀 {t('multiStrategySettings')}</h3>
          
          <div className="p-4 rounded-lg border-2 border-gray-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                <div className="font-medium text-gray-900">{t('enableMultiStrategy')}</div>
                <div className="text-sm text-gray-600 mt-1">
                  {t('multiStrategyDescription')}
                </div>
              </div>
              <button
                onClick={() => handleChange('enableMultiStrategy', !formData.enableMultiStrategy)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.enableMultiStrategy ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.enableMultiStrategy ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            
            {formData.enableMultiStrategy && (
              <div className="space-y-4 mt-4 pt-4 border-t border-gray-200">
                {/* RSI + MACD Strategy */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => handleChange('strategies', {
                        ...formData.strategies,
                        rsiMacd: { ...formData.strategies.rsiMacd, enabled: !formData.strategies.rsiMacd.enabled }
                      })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        formData.strategies.rsiMacd.enabled ? 'bg-green-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                          formData.strategies.rsiMacd.enabled ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className="text-sm font-medium text-gray-900">{t('rsiMacdStrategy')}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500">{t('strategyWeight')}:</span>
                    <input
                      type="range"
                      min="0.1"
                      max="2.0"
                      step="0.1"
                      value={formData.strategies.rsiMacd.weight}
                      onChange={(e) => handleChange('strategies', {
                        ...formData.strategies,
                        rsiMacd: { ...formData.strategies.rsiMacd, weight: parseFloat(e.target.value) }
                      })}
                      className="w-16"
                      disabled={!formData.strategies.rsiMacd.enabled}
                    />
                    <span className="text-xs text-gray-600 w-8">{formData.strategies.rsiMacd.weight.toFixed(1)}</span>
                  </div>
                </div>
                
                {/* News Sentiment Strategy */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => handleChange('strategies', {
                        ...formData.strategies,
                        newsSentiment: { ...formData.strategies.newsSentiment, enabled: !formData.strategies.newsSentiment.enabled }
                      })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        formData.strategies.newsSentiment.enabled ? 'bg-green-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                          formData.strategies.newsSentiment.enabled ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className="text-sm font-medium text-gray-900">{t('newsSentimentStrategy')}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500">{t('strategyWeight')}:</span>
                    <input
                      type="range"
                      min="0.1"
                      max="2.0"
                      step="0.1"
                      value={formData.strategies.newsSentiment.weight}
                      onChange={(e) => handleChange('strategies', {
                        ...formData.strategies,
                        newsSentiment: { ...formData.strategies.newsSentiment, weight: parseFloat(e.target.value) }
                      })}
                      className="w-16"
                      disabled={!formData.strategies.newsSentiment.enabled}
                    />
                    <span className="text-xs text-gray-600 w-8">{formData.strategies.newsSentiment.weight.toFixed(1)}</span>
                  </div>
                </div>
                
                {/* Volume Spike Strategy */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => handleChange('strategies', {
                        ...formData.strategies,
                        volumeSpike: { ...formData.strategies.volumeSpike, enabled: !formData.strategies.volumeSpike.enabled }
                      })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        formData.strategies.volumeSpike.enabled ? 'bg-green-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                          formData.strategies.volumeSpike.enabled ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className="text-sm font-medium text-gray-900">{t('volumeSpikeStrategy')}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500">{t('strategyWeight')}:</span>
                    <input
                      type="range"
                      min="0.1"
                      max="2.0"
                      step="0.1"
                      value={formData.strategies.volumeSpike.weight}
                      onChange={(e) => handleChange('strategies', {
                        ...formData.strategies,
                        volumeSpike: { ...formData.strategies.volumeSpike, weight: parseFloat(e.target.value) }
                      })}
                      className="w-16"
                      disabled={!formData.strategies.volumeSpike.enabled}
                    />
                    <span className="text-xs text-gray-600 w-8">{formData.strategies.volumeSpike.weight.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Auto-Rebalance Settings */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">⚖️ {t('autoRebalanceSettings')}</h3>
          
          <div className="p-4 rounded-lg border-2 border-gray-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                <div className="font-medium text-gray-900">{t('enableAutoRebalance')}</div>
                <div className="text-sm text-gray-600 mt-1">
                  {t('autoRebalanceDescription')}
                </div>
              </div>
              <button
                onClick={() => handleChange('enableAutoRebalance', !formData.enableAutoRebalance)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.enableAutoRebalance ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.enableAutoRebalance ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            
            {formData.enableAutoRebalance && (
              <div className="space-y-4 mt-4 pt-4 border-t border-gray-200">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('scaleInThreshold')} ({((formData.scaleInThreshold || 0.03) * 100).toFixed(1)}%)
                  </label>
                  <input
                    type="range"
                    min="0.005"
                    max="0.05"
                    step="0.001"
                    value={formData.scaleInThreshold || 0.03}
                    onChange={(e) => handleChange('scaleInThreshold', parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0.5%</span>
                    <span>5%</span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('scaleOutThreshold')} ({(Math.abs(formData.scaleOutThreshold || -0.01) * 100).toFixed(1)}%)
                  </label>
                  <input
                    type="range"
                    min="-0.03"
                    max="-0.005"
                    step="0.001"
                    value={formData.scaleOutThreshold || -0.01}
                    onChange={(e) => handleChange('scaleOutThreshold', parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>-3%</span>
                    <span>-0.5%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Trailing Stop */}
          <div className="p-4 rounded-lg border-2 border-gray-300">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                <div className="font-medium text-gray-900">{t('enableTrailingStop')}</div>
                <div className="text-sm text-gray-600 mt-1">
                  Automatically move stop loss to secure profits as price moves favorably
                </div>
              </div>
              <button
                onClick={() => handleChange('enableTrailingStop', !formData.enableTrailingStop)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.enableTrailingStop ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.enableTrailingStop ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            
            {formData.enableTrailingStop && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('trailingStopPercent')} ({((formData.trailingStopPercent || 0.01) * 100).toFixed(1)}%)
                  </label>
                  <input
                    type="range"
                    min="0.005"
                    max="0.03"
                    step="0.001"
                    value={formData.trailingStopPercent || 0.01}
                    onChange={(e) => handleChange('trailingStopPercent', parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0.5%</span>
                    <span>3%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Simulation Replay */}
        {formData.mode === 'SIMULATION' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">🧪 {t('simulationReplay')}</h3>
            
            <div className="p-4 rounded-lg border-2 border-gray-300">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{t('enableSimulationReplay')}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {t('simulationReplayDescription')}
                  </div>
                </div>
                <button
                  onClick={() => handleChange('enableSimulationReplay', !formData.enableSimulationReplay)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.enableSimulationReplay ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.enableSimulationReplay ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

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
      
      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">{t('resetConfirmTitle')}</h3>
            </div>
            <p className="text-gray-600 mb-6">
              {resetType === 'ai' ? t('resetConfirmMessage') : t('resetAllConfirmMessage')}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={confirmResetAILearning}
                className={`px-4 py-2 text-white rounded-lg hover:opacity-90 transition-colors ${
                  resetType === 'ai' ? 'bg-purple-600' : 'bg-red-600'
                }`}
              >
                {resetType === 'ai' ? t('resetAiOnly') : t('resetAllBotData')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
};