import React, { createContext, useContext, useState, useEffect } from 'react';
import { getTranslation, TranslationKey } from '../utils/translations';

interface LanguageContextType {
  language: 'en' | 'tr';
  setLanguage: (lang: 'en' | 'tr') => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<'en' | 'tr'>(() => {
    const saved = localStorage.getItem('trading-bot-language');
    return (saved as 'en' | 'tr') || 'en';
  });

  useEffect(() => {
    localStorage.setItem('trading-bot-language', language);
  }, [language]);

  const t = (key: TranslationKey): string => {
    return getTranslation(key, language);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};