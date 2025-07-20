import { NewsItem } from '../types/trading';

class NewsService {
  private cachedNews: NewsItem[] = [];
  private lastFetchTime: number = 0;
  private llama3Url: string = 'http://localhost:11434'; // Default Ollama URL
  private llama3Model: string = 'llama3';

  setLlama3Config(url: string, model: string = 'llama3') {
    this.llama3Url = url;
    this.llama3Model = model;
  }

  async fetchCryptoNews(): Promise<NewsItem[]> {
    const now = Date.now();

    // 🔒 6 saatlik rate limit (21600000 ms)
    const FETCH_INTERVAL = 6 * 60 * 60 * 1000;

    if (now - this.lastFetchTime < FETCH_INTERVAL && this.cachedNews.length > 0) {
      console.log('🕒 Using cached news data.');
      return this.cachedNews;
    }

    try {
      const apiKey = 'pub_9f9d4c2af53a4f4ea5c6647ce7cbc06d';
      const url = `https://newsdata.io/api/1/news?apikey=${apiKey}&q=bitcoin OR ethereum OR crypto&language=en&category=business`;

      const response = await fetch(url);

      if (response.status === 429) {
        console.warn('❗ Rate limit reached. Using cached data.');
        return this.cachedNews;
      }

      const json = await response.json();

      if (!json.results || !Array.isArray(json.results)) {
        console.warn('❌ Invalid news data received.');
        return this.cachedNews;
      }

      const news: NewsItem[] = json.results.map((item: any, index: number) => ({
        id: item.link || `news-${index}`,
        title: item.title || 'Untitled',
        content: item.description || item.title || 'No content',
        source: item.source_id || 'Unknown',
        timestamp: new Date(item.pubDate || '').getTime() || Date.now(),
        sentiment: 'NEUTRAL',
        impact: Math.random() * 10,
        coins: this.extractCoinsFromText(`${item.title} ${item.description}`),
      }));

      this.cachedNews = news;
      this.lastFetchTime = now;

      console.log('✅ News fetched and cached.');
      return news;
    } catch (error) {
      console.error('Failed to fetch crypto news:', error);
      return this.cachedNews;
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
    sentimentScore: number;
  }> {
    try {
      const relevantNews = this.getRelevantNews(news, symbol);
      const sentimentScore = this.calculateSentimentScore(relevantNews);
      
      // Try to use local Llama 3 for trading signal generation
      try {
        const prompt = `Given RSI: ${marketData.rsi?.toFixed(2)}, EMA Trend: ${marketData.emaTrend}, and News Sentiment: ${sentimentScore.toFixed(2)}, should we BUY, SELL or HOLD? Explain why.

Additional context:
- Price: ${marketData.price}
- Volume Ratio: ${marketData.volumeRatio?.toFixed(2)}
- MACD: ${marketData.macd?.toFixed(4)}

Respond with: ACTION CONFIDENCE REASONING`;

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
            
            return { action, confidence, reasoning: reasoning || 'AI analysis', sentimentScore };
          }
        }
      } catch (llama3Error) {
        console.log('Llama 3 not available for trading signals, using fallback');
      }

      // Fallback analysis
      const technicalScore = this.calculateTechnicalScore(marketData);
      const newsScore = sentimentScore;
      
      // Enhanced scoring for fast learning mode
      const isFastLearning = this.isFastLearningMode();
      let combinedScore = (technicalScore * 0.6) + (newsScore * 0.4);
      
      // Apply fast learning enhancements
      if (isFastLearning) {
        combinedScore = this.enhanceScoreForFastLearning(combinedScore, marketData, sentimentScore);
      }

      let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let confidence = 0.5;
      let reasoning = 'Market conditions are neutral';

      // Looser thresholds for fast learning
      const buyThreshold = isFastLearning ? 0.15 : 0.3;
      const sellThreshold = isFastLearning ? -0.15 : -0.3;
      
      if (combinedScore > buyThreshold) {
        action = 'BUY';
        confidence = Math.min(0.5 + Math.abs(combinedScore), 0.95);
        reasoning = `Bullish signals detected: RSI ${marketData.rsi?.toFixed(2)}, EMA trend ${marketData.emaTrend}, sentiment ${sentimentScore.toFixed(2)}`;
      } else if (combinedScore < sellThreshold) {
        action = 'SELL';
        confidence = Math.min(0.5 + Math.abs(combinedScore), 0.95);
        reasoning = `Bearish signals detected: RSI ${marketData.rsi?.toFixed(2)}, EMA trend ${marketData.emaTrend}, sentiment ${sentimentScore.toFixed(2)}`;
      }

      return { action, confidence, reasoning, sentimentScore };
    } catch (error) {
      console.error('Trading signal generation failed:', error);
      return { action: 'HOLD', confidence: 0.5, reasoning: 'Analysis failed', sentimentScore: 0 };
    }
  }

  private isFastLearningMode(): boolean {
    // Check if we're in fast learning mode - this would be passed from the trading bot
    return (globalThis as any).fastLearningMode === true;
  }

  private getRelevantNews(news: NewsItem[], symbol: string): NewsItem[] {
    const baseSymbol = symbol.replace('USDT', '').replace('BUSD', '');
    const isFastLearning = this.isFastLearningMode();
    
    if (!isFastLearning) {
      // Normal mode - strict matching
      return news.filter(item => item.coins.includes(baseSymbol));
    }
    
    // Fast learning mode - loose matching
    return news.filter(item => {
      const text = `${item.title} ${item.content}`.toLowerCase();
      
      // Direct symbol match
      if (item.coins.includes(baseSymbol)) return true;
      
      // Popular pairs get general crypto sentiment
      const popularPairs = ['BTC', 'ETH', 'BNB', 'ADA', 'SOL', 'DOT', 'MATIC', 'AVAX'];
      if (popularPairs.includes(baseSymbol)) {
        return text.includes('crypto') || text.includes('coin') || text.includes('market') || 
               text.includes('bullish') || text.includes('bearish') || text.includes('bitcoin') || 
               text.includes('ethereum') || text.includes('trading');
      }
      
      return false;
    });
  }

  private enhanceScoreForFastLearning(score: number, marketData: any, sentimentScore: number): number {
    let enhancedScore = score;
    
    // Boost based on sentiment strength
    if (sentimentScore > 0.4) {
      enhancedScore += 0.2; // Slight BUY boost
    }
    if (sentimentScore > 0.6) {
      enhancedScore += 0.3; // Strong BUY boost
    }
    if (sentimentScore < -0.4) {
      enhancedScore -= 0.2; // Slight SELL boost
    }
    if (sentimentScore < -0.6) {
      enhancedScore -= 0.3; // Strong SELL boost
    }
    
    // Bollinger band proximity bonus
    if (marketData.bollinger && marketData.price) {
      const price = marketData.price;
      const { upper, lower, middle } = marketData.bollinger;
      
      // Near lower band - potential BUY
      if (price < lower * 1.02) {
        enhancedScore += 0.25;
      }
      // Near upper band - potential SELL
      if (price > upper * 0.98) {
        enhancedScore -= 0.25;
      }
    }
    
    // Volume boost
    if (marketData.volumeRatio > 1.5) {
      enhancedScore += 0.15;
    }
    
    return enhancedScore;
  }

  private calculateSentimentScore(news: NewsItem[]): number {
    if (news.length === 0) return 0;
    
    let totalScore = 0;
    let totalWeight = 0;
    
    news.forEach(item => {
      const weight = Math.min(item.impact / 10, 1); // Normalize impact to 0-1
      let score = 0;
      
      // Convert sentiment to numeric score
      switch (item.sentiment) {
        case 'BULLISH':
          score = 1;
          break;
        case 'BEARISH':
          score = -1;
          break;
        default:
          score = 0;
      }
      
      // Additional keyword analysis
      const text = `${item.title} ${item.content}`.toLowerCase();
      const positiveKeywords = ['surge', 'rise', 'bull', 'positive', 'growth', 'adoption', 'upgrade', 'rally', 'moon'];
      const negativeKeywords = ['drop', 'fall', 'bear', 'negative', 'decline', 'crash', 'regulation', 'ban', 'dump'];
      
      const positiveCount = positiveKeywords.filter(word => text.includes(word)).length;
      const negativeCount = negativeKeywords.filter(word => text.includes(word)).length;
      
      if (positiveCount > negativeCount) {
        score += 0.3;
      } else if (negativeCount > positiveCount) {
        score -= 0.3;
      }
      
      totalScore += score * weight;
      totalWeight += weight;
    });
    
    return totalWeight > 0 ? Math.max(-1, Math.min(1, totalScore / totalWeight)) : 0;
  }

  private calculateTechnicalScore(marketData: any): number {
    if (!marketData) return 0;

    const isFastLearning = this.isFastLearningMode();
    let score = 0;
    
    // RSI analysis - looser thresholds for fast learning
    if (isFastLearning) {
      // More aggressive RSI signals for fast learning
      if (marketData.rsi < 45) score += 0.4; // Earlier oversold signal
      else if (marketData.rsi > 55) score -= 0.4; // Earlier overbought signal
      
      // Additional signals in the middle range
      if (marketData.rsi >= 45 && marketData.rsi <= 50) score += 0.2; // Mild bullish
      if (marketData.rsi >= 50 && marketData.rsi <= 55) score -= 0.2; // Mild bearish
    } else {
      // Normal mode - strict thresholds
      if (marketData.rsi < 30) score += 0.5; // Oversold
      else if (marketData.rsi > 70) score -= 0.5; // Overbought
    }
    
    // MACD analysis - accept weaker signals in fast learning
    if (isFastLearning) {
      // Accept any MACD direction as signal
      if (marketData.macd > -0.001) score += 0.25; // Very weak positive
      else score -= 0.25;
    } else {
      if (marketData.macd > 0) score += 0.3;
      else score -= 0.3;
    }
    
    // Bollinger Bands analysis
    if (marketData.bollinger && marketData.price < marketData.bollinger.lower) score += 0.4;
    else if (marketData.bollinger && marketData.price > marketData.bollinger.upper) score -= 0.4;
    
    return Math.max(-1, Math.min(1, score));
  }

  getLatestNews(): NewsItem[] {
    return this.cachedNews;
  }

  private extractCoinsFromText(text: string): string[] {
    const coins = ['BTC', 'ETH', 'ADA', 'SOL', 'DOT', 'LINK', 'MATIC', 'AVAX', 'UNI', 'LTC'];
    const foundCoins: string[] = [];
    const upperText = text.toUpperCase();
    
    coins.forEach(coin => {
      if (upperText.includes(coin) || upperText.includes(coin.toLowerCase())) {
        foundCoins.push(coin);
      }
    });
    
    // Add Bitcoin and Ethereum variations
    if (upperText.includes('BITCOIN')) foundCoins.push('BTC');
    if (upperText.includes('ETHEREUM')) foundCoins.push('ETH');
    
    return [...new Set(foundCoins)]; // Remove duplicates
  }
}

export const newsService = new NewsService();