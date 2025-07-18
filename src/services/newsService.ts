import { NewsItem } from '../types/trading';

class NewsService {
  private newsData: NewsItem[] = [];
  private llama3Url: string = 'http://localhost:11434'; // Default Ollama URL
  private llama3Model: string = 'llama3';

  setLlama3Config(url: string, model: string = 'llama3') {
    this.llama3Url = url;
    this.llama3Model = model;
  }

  async fetchCryptoNews(): Promise<NewsItem[]> {
    try {
      // Simulated news data - in production, integrate with real news APIs
      const mockNews: NewsItem[] = [
        {
          id: '1',
          title: 'Bitcoin Reaches New All-Time High',
          content: 'Bitcoin has surged to unprecedented levels following institutional adoption...',
          source: 'CoinDesk',
          timestamp: Date.now() - 3600000,
          sentiment: 'BULLISH',
          impact: 8.5,
          coins: ['BTC', 'ETH'],
        },
        {
          id: '2',
          title: 'Ethereum Upgrade Reduces Gas Fees',
          content: 'The latest Ethereum upgrade has significantly reduced transaction costs...',
          source: 'CoinTelegraph',
          timestamp: Date.now() - 7200000,
          sentiment: 'BULLISH',
          impact: 7.2,
          coins: ['ETH'],
        },
        {
          id: '3',
          title: 'Regulatory Concerns Impact Market',
          content: 'New regulatory proposals have created uncertainty in the crypto market...',
          source: 'Bloomberg',
          timestamp: Date.now() - 10800000,
          sentiment: 'BEARISH',
          impact: 6.8,
          coins: ['BTC', 'ETH', 'ADA'],
        },
      ];

      this.newsData = mockNews;
      return mockNews;
    } catch (error) {
      console.error('Failed to fetch crypto news:', error);
      return [];
    }
  }

  async analyzeSentiment(text: string): Promise<{ sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; confidence: number }> {
    try {
      // Try to use local Llama 3 first, fallback to simple analysis
      try {
        const response = await fetch(`${this.llama3Url}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.llama3Model,
            prompt: `Analyze the sentiment of this crypto news text and respond with only "BULLISH", "BEARISH", or "NEUTRAL" followed by a confidence score from 0.0 to 1.0. Text: "${text}"`,
            stream: false,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const result = data.response.trim().toUpperCase();
          
          // Parse Llama 3 response
          const sentimentMatch = result.match(/(BULLISH|BEARISH|NEUTRAL)/);
          const confidenceMatch = result.match(/(\d+\.?\d*)/);
          
          if (sentimentMatch) {
            const sentiment = sentimentMatch[1] as 'BULLISH' | 'BEARISH' | 'NEUTRAL';
            const confidence = confidenceMatch ? Math.min(parseFloat(confidenceMatch[1]), 1.0) : 0.7;
            return { sentiment, confidence };
          }
        }
      } catch (llama3Error) {
        console.log('Llama 3 not available, using fallback analysis');
      }
      
      // Fallback to simple keyword analysis
      const bullishWords = ['surge', 'rise', 'bull', 'positive', 'growth', 'adoption', 'upgrade'];
      const bearishWords = ['drop', 'fall', 'bear', 'negative', 'decline', 'crash', 'regulation'];
      
      const lowerText = text.toLowerCase();
      const bullishCount = bullishWords.filter(word => lowerText.includes(word)).length;
      const bearishCount = bearishWords.filter(word => lowerText.includes(word)).length;
      
      let sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
      let confidence = 0.5;
      
      if (bullishCount > bearishCount) {
        sentiment = 'BULLISH';
        confidence = Math.min(0.5 + (bullishCount * 0.1), 0.95);
      } else if (bearishCount > bullishCount) {
        sentiment = 'BEARISH';
        confidence = Math.min(0.5 + (bearishCount * 0.1), 0.95);
      }
      
      return { sentiment, confidence };
    } catch (error) {
      console.error('Sentiment analysis failed:', error);
      return { sentiment: 'NEUTRAL', confidence: 0.5 };
    }
  }

  async generateTradingSignal(symbol: string, marketData: any, news: NewsItem[]): Promise<{
    action: 'BUY' | 'SELL' | 'HOLD';
    confidence: number;
    reasoning: string;
  }> {
    try {
      const relevantNews = news.filter(item => item.coins.includes(symbol.replace('USDT', '')));
      
      // Try to use local Llama 3 for trading signal generation
      try {
        const newsContext = relevantNews.map(item => `${item.title}: ${item.sentiment}`).join('. ');
        const prompt = `Based on this market data and news for ${symbol}:
Price: ${marketData.price}
RSI: ${marketData.rsi}
MACD: ${marketData.macd}
News: ${newsContext}

Generate a trading signal. Respond with only: BUY, SELL, or HOLD followed by confidence (0.0-1.0) and brief reasoning.`;

        const response = await fetch(`${this.llama3Url}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.llama3Model,
            prompt,
            stream: false,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const result = data.response.trim();
          
          const actionMatch = result.match(/(BUY|SELL|HOLD)/);
          const confidenceMatch = result.match(/(\d+\.?\d*)/);
          
          if (actionMatch) {
            const action = actionMatch[1] as 'BUY' | 'SELL' | 'HOLD';
            const confidence = confidenceMatch ? Math.min(parseFloat(confidenceMatch[1]), 1.0) : 0.6;
            const reasoning = result.replace(/(BUY|SELL|HOLD)/, '').replace(/\d+\.?\d*/, '').trim();
            
            return { action, confidence, reasoning: reasoning || 'AI analysis' };
          }
        }
      } catch (llama3Error) {
        console.log('Llama 3 not available for trading signals, using fallback');
      }

      // Fallback analysis
      const avgSentiment = relevantNews.length > 0 
        ? relevantNews.reduce((acc, item) => acc + (item.sentiment === 'BULLISH' ? 1 : item.sentiment === 'BEARISH' ? -1 : 0), 0) / relevantNews.length
        : 0;

      const technicalScore = this.calculateTechnicalScore(marketData);
      const newsScore = avgSentiment;
      const combinedScore = (technicalScore * 0.6) + (newsScore * 0.4);

      let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let confidence = 0.5;
      let reasoning = 'Market conditions are neutral';

      if (combinedScore > 0.3) {
        action = 'BUY';
        confidence = Math.min(0.5 + Math.abs(combinedScore), 0.95);
        reasoning = `Bullish signals detected: RSI ${marketData.rsi?.toFixed(2)}, positive news sentiment`;
      } else if (combinedScore < -0.3) {
        action = 'SELL';
        confidence = Math.min(0.5 + Math.abs(combinedScore), 0.95);
        reasoning = `Bearish signals detected: RSI ${marketData.rsi?.toFixed(2)}, negative news sentiment`;
      }

      return { action, confidence, reasoning };
    } catch (error) {
      console.error('Trading signal generation failed:', error);
      return { action: 'HOLD', confidence: 0.5, reasoning: 'Analysis failed' };
    }
  }

  private calculateTechnicalScore(marketData: any): number {
    if (!marketData) return 0;

    let score = 0;
    
    // RSI analysis
    if (marketData.rsi < 30) score += 0.5; // Oversold
    else if (marketData.rsi > 70) score -= 0.5; // Overbought
    
    // MACD analysis
    if (marketData.macd > 0) score += 0.3;
    else score -= 0.3;
    
    // Bollinger Bands analysis
    if (marketData.bollinger && marketData.price < marketData.bollinger.lower) score += 0.4;
    else if (marketData.bollinger && marketData.price > marketData.bollinger.upper) score -= 0.4;
    
    return Math.max(-1, Math.min(1, score));
  }

  getLatestNews(): NewsItem[] {
    return this.newsData;
  }
}

export const newsService = new NewsService();