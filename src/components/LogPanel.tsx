import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, Info, TrendingUp, Brain, Filter, Trash2, Search } from 'lucide-react';
import { logService, LogEntry, LogLevel, LogFilter } from '../services/logService';
import { useLanguage } from '../contexts/LanguageContext';
import { formatDistanceToNow } from 'date-fns';

export const LogPanel: React.FC = () => {
  const { t } = useLanguage();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogFilter>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
  // Subscribe to log updates
  const unsubscribe = logService.subscribe((newLogs) => {
    setLogs([...newLogs].reverse()); // yeni loglar aşağıya eklensin
  });

  // Load initial logs
  setLogs([...logService.getLogs()].reverse()); // başta da aynı şekilde

  return unsubscribe;
}, []);

  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getLogIcon = (level: LogLevel) => {
    switch (level) {
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'trade':
        return <TrendingUp className="w-4 h-4 text-blue-500" />;
      case 'learning':
        return <Brain className="w-4 h-4 text-purple-500" />;
      default:
        return <Info className="w-4 h-4 text-gray-500" />;
    }
  };

  const getLogColor = (level: LogLevel) => {
    switch (level) {
      case 'error':
        return 'border-l-red-500 bg-red-50';
      case 'warning':
        return 'border-l-yellow-500 bg-yellow-50';
      case 'trade':
        return 'border-l-blue-500 bg-blue-50';
      case 'learning':
        return 'border-l-purple-500 bg-purple-50';
      default:
        return 'border-l-gray-500 bg-gray-50';
    }
  };

  const formatLogMessage = (entry: LogEntry): string => {
    if (entry.rawMessage) {
      return entry.rawMessage;
    }

    // Try to get localized message, fallback to messageKey
    try {
      const message = t(entry.messageKey as any);
      if (message === entry.messageKey) {
        // No translation found, use raw message key
        return entry.messageKey;
      }
      
      // Replace parameters in the message
      if (entry.params) {
        let formattedMessage = message;
        Object.entries(entry.params).forEach(([key, value]) => {
          formattedMessage = formattedMessage.replace(`{${key}}`, String(value));
        });
        return formattedMessage;
      }
      
      return message;
    } catch (error) {
      return entry.messageKey;
    }
  };

  const filteredLogs = logs.filter(log => {
    if (filter.level && log.level !== filter.level) return false;
    if (searchTerm) {
      const message = formatLogMessage(log).toLowerCase();
      if (!message.includes(searchTerm.toLowerCase())) return false;
    }
    return true;
  });

  const handleClearLogs = () => {
    logService.clearLogs();
  };

  const levelCounts = logs.reduce((acc, log) => {
    acc[log.level] = (acc[log.level] || 0) + 1;
    return acc;
  }, {} as Record<LogLevel, number>);

  return (
    <div className="bg-white rounded-xl shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">📋 {t('botLogs')}</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-lg transition-colors ${
                showFilters ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Filter className="w-4 h-4" />
            </button>
            <button
              onClick={handleClearLogs}
              className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              title={t('clearLogs')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('searchLogs')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilter({})}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  !filter.level ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t('all')} ({logs.length})
              </button>
              {(['info', 'trade', 'learning', 'warning', 'error'] as LogLevel[]).map(level => (
                <button
                  key={level}
                  onClick={() => setFilter({ level })}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    filter.level === level 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t(level)} ({levelCounts[level] || 0})
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Log Entries */}
      <div 
        ref={scrollRef}
        className="h-80 overflow-y-auto p-4 space-y-2"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>{searchTerm || filter.level ? t('noLogsMatchFilter') : t('noLogsYet')}</p>
          </div>
        ) : (
          filteredLogs.map((entry) => (
            <div
              key={entry.id}
              className={`border-l-4 p-3 rounded-r-lg ${getLogColor(entry.level)}`}
            >
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getLogIcon(entry.level)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-500 uppercase">
                      {t(entry.level)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-900 break-words">
                    {formatLogMessage(entry)}
                  </p>
                  {entry.params && Object.keys(entry.params).length > 0 && (
                    <div className="mt-2 text-xs text-gray-600">
                      <details className="cursor-pointer">
                        <summary className="hover:text-gray-800">Details</summary>
                        <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                          {JSON.stringify(entry.params, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Stats */}
      <div className="p-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{t('totalLogs')}: {logs.length}</span>
          <span>{t('showing')}: {filteredLogs.length}</span>
        </div>
      </div>
    </div>
  );
};