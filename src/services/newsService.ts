import { NewsItem } from '../types/trading';

class NewsService {
  private cachedNews: NewsItem[] = [];
  private lastFetchTime: number = 0;
  private llama3Url: string = 'http://localhost:11434'; // Default Ollama URL
  private llama3Model: string = 'llama3';
  
  // Throttling and health monitoring for Llama 3
  private llama3LastCheck: number = 0;
  private llama3HealthCheckInterval: number = 60000; // 1 minute
  private llama3Available: boolean = true;
  private llama3RequestThrottle: number = 2000; // 2 seconds between requests
  private lastLlama3Request: number = 0;
  private llama3RequestQueue: Array<() => Promise<any>> = [];
  private maxConcurrentLlama3Requests: number = 1;
  private activeLlama3Requests: number = 0;

  setLlama3Config(url: string, model: string = 'llama3') {
    this.llama3Url = url;
    this.llama3Model = model;
    // Reset health status when config changes
    this.llama3Available = true;
    this.llama3LastCheck = 0;
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
        if (await this.isLlama3Available()) {
          const prompt = `Analyze the sentiment of this crypto news text and respond with only "BULLISH", "BEARISH", or "NEUTRAL" followed by a confidence score from 0.0 to 1.0. Text: "${text}"`;
          const response = await this.queryLlama3Throttled(prompt);
          
          if (response) {
            const result = response.trim().toUpperCase();
            
            // Parse Llama 3 response
            const sentimentMatch = result.match(/(BULLISH|BEARISH|NEUTRAL)/);
            const confidenceMatch = result.match(/(\d+\.?\d*)/);
            
            if (sentimentMatch) {
              const sentiment = sentimentMatch[1] as 'BULLISH' | 'BEARISH' | 'NEUTRAL';
              const confidence = confidenceMatch ? Math.min(parseFloat(confidenceMatch[1]), 1.0) : 0.7;
              return { sentiment, confidence };
            }
          }
        }
      } catch (llama3Error) {
        console.log('Llama 3 sentiment analysis failed, using fallback');
        this.llama3Available = false;
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
      
      // Get market condition for context
      const marketCondition = this.analyzeMarketCondition(marketData);
      
      // Try to use local Llama 3 for trading signal generation
      try {
        if (await this.isLlama3Available()) {
        const prompt = `Market Analysis for ${symbol}:
RSI: ${marketData.rsi?.toFixed(2)}
EMA Trend: ${marketData.emaTrend}
MACD: ${marketData.macd?.toFixed(4)}
Volume Ratio: ${marketData.volumeRatio?.toFixed(2)}
Market Condition: ${marketCondition.type}
News Sentiment: ${sentimentScore.toFixed(2)}

Should we BUY, SELL or HOLD? Consider market regime and risk.

Respond with: ACTION CONFIDENCE REASONING`;

          const response = await this.queryLlama3Throttled(prompt);

          if (response) {
            const result = response.trim();
          
          const actionMatch = result.match(/(BUY|SELL|HOLD)/);
          const confidenceMatch = result.match(/(\d+\.?\d*)/);
          
          if (actionMatch) {
            const action = actionMatch[1] as 'BUY' | 'SELL' | 'HOLD';
            const confidence = confidenceMatch ? Math.min(parseFloat(confidenceMatch[1]), 1.0) : 0.6;
            const reasoning = result.replace(/(BUY|SELL|HOLD)/, '').replace(/\d+\.?\d*/, '').trim();
            
            return { 
              action, 
              confidence: this.adjustConfidenceForMarketCondition(confidence, marketCondition), 
              reasoning: reasoning || 'AI analysis', 
              sentimentScore 
            };
          }
          }
        }
      } catch (llama3Error) {
        this.llama3Available = false;
        console.log('Llama 3 not available for trading signals, using fallback');
      }

      // Fallback analysis
      const technicalScore = this.calculateTechnicalScore(marketData);
      const newsScore = sentimentScore;
      
      // Enhanced scoring for fast learning mode
      const isFastLearning = this.isFastLearningMode();
      let combinedScore = (technicalScore * 0.7) + (newsScore * 0.3);
      
      // Apply fast learning enhancements
      if (isFastLearning) {
        combinedScore = this.enhanceScoreForFastLearning(combinedScore, marketData, sentimentScore);
      }
      
      // Apply market condition adjustments
      combinedScore = this.adjustScoreForMarketCondition(combinedScore, marketCondition);

      let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let confidence = 0.5;
      let reasoning = 'Market conditions are neutral';

      // Looser thresholds for fast learning
      const buyThreshold = isFastLearning ? 0.15 : 0.3;
      const sellThreshold = isFastLearning ? -0.15 : -0.3;
      
      if (combinedScore > buyThreshold) {
        action = 'BUY';
        confidence = Math.min(0.5 + Math.abs(combinedScore), 0.95);
        reasoning = `Bullish signals in ${marketCondition.type} market: RSI ${marketData.rsi?.toFixed(2)}, EMA ${marketData.emaTrend}, sentiment ${sentimentScore.toFixed(2)}`;
      } else if (combinedScore < sellThreshold) {
        action = 'SELL';
        confidence = Math.min(0.5 + Math.abs(combinedScore), 0.95);
        reasoning = `Bearish signals in ${marketCondition.type} market: RSI ${marketData.rsi?.toFixed(2)}, EMA ${marketData.emaTrend}, sentiment ${sentimentScore.toFixed(2)}`;
      }

      // Final confidence adjustment for market condition
      confidence = this.adjustConfidenceForMarketCondition(confidence, marketCondition);

      return { action, confidence, reasoning, sentimentScore };
    } catch (error) {
      console.error('Trading signal generation failed:', error);
      return { action: 'HOLD', confidence: 0.5, reasoning: 'Analysis failed', sentimentScore: 0 };
    }
  }

  private analyzeMarketCondition(marketData: any): any {
    // Simple market condition analysis (can be enhanced)
    const { rsi, macd, volumeRatio, emaTrend, bollinger } = marketData;
    
    // Calculate volatility
    const volatility = bollinger ? (bollinger.upper - bollinger.lower) / bollinger.middle : 0.02;
    
    let type = 'UNCERTAIN';
    let confidence = 0.5;
    
    if (volatility > 0.05) {
      type = 'HIGH_VOLATILITY';
      confidence = 0.8;
    } else if (emaTrend === 'BULLISH' && rsi > 50 && macd > 0) {
      type = 'TRENDING_UP';
      confidence = 0.7;
    } else if (emaTrend === 'BEARISH' && rsi < 50 && macd < 0) {
      type = 'TRENDING_DOWN';
      confidence = 0.7;
    } else if (Math.abs(macd) < 0.001 && rsi > 40 && rsi < 60) {
      type = 'SIDEWAYS';
      confidence = 0.6;
    }
    
    return { type, confidence, volatility, volume: volumeRatio };
  }

  private adjustScoreForMarketCondition(score: number, marketCondition: any): number {
    switch (marketCondition.type) {
      case 'HIGH_VOLATILITY':
        return score * 0.8; // Reduce signal strength in volatile markets
      case 'UNCERTAIN':
        return score * 0.7; // Reduce signal strength in uncertain markets
      case 'TRENDING_UP':
      case 'TRENDING_DOWN':
        return score * 1.1; // Boost signal strength in trending markets
      case 'SIDEWAYS':
        return score * 0.9; // Slightly reduce in sideways markets
      default:
        return score;
    }
  }

  private adjustConfidenceForMarketCondition(confidence: number, marketCondition: any): number {
    let adjustment = 1.0;
    
    switch (marketCondition.type) {
      case 'HIGH_VOLATILITY':
        adjustment = 0.8; // Lower confidence in volatile markets
        break;
      case 'UNCERTAIN':
        adjustment = 0.7; // Lower confidence in uncertain markets
        break;
      case 'TRENDING_UP':
      case 'TRENDING_DOWN':
        adjustment = 1.1; // Higher confidence in trending markets
        break;
      case 'SIDEWAYS':
        adjustment = 0.9; // Slightly lower confidence in sideways markets
        break;
    }
    
    // Also adjust based on market condition confidence
    adjustment *= marketCondition.confidence;
    
    return Math.max(0.1, Math.min(0.95, confidence * adjustment));
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

  // Llama 3 health monitoring and throttling
  private async isLlama3Available(): Promise<boolean> {
    const now = Date.now();
    
    // Check health periodically
    if (now - this.llama3LastCheck > this.llama3HealthCheckInterval) {
      this.llama3LastCheck = now;
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const response = await fetch(`${this.llama3Url}/api/tags`, {
          method: 'GET',
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        this.llama3Available = response.ok;
        
        if (!this.llama3Available) {
          console.warn('🔴 Llama 3 health check failed - server not responding properly');
        } else {
          console.log('🟢 Llama 3 health check passed');
        }
      } catch (error) {
        this.llama3Available = false;
        console.warn('🔴 Llama 3 health check failed:', error instanceof Error ? error.message : 'Unknown error');
      }
    }
    
    return this.llama3Available;
  }

  private async queryLlama3Throttled(prompt: string): Promise<string | null> {
    // Check if Llama 3 is available
    if (!this.llama3Available) {
      return null;
    }
    
    // Throttle requests
    const now = Date.now();
    if (now - this.lastLlama3Request < this.llama3RequestThrottle) {
      console.log('🕒 Llama 3 request throttled');
      return null;
    }
    
    // Queue request if too many concurrent requests
    if (this.activeLlama3Requests >= this.maxConcurrentLlama3Requests) {
      return new Promise((resolve) => {
        this.llama3RequestQueue.push(async () => {
          const result = await this.executeLlama3Request(prompt);
          resolve(result);
          return result;
        });
      });
    }
    
    return this.executeLlama3Request(prompt);
  }

  private async executeLlama3Request(prompt: string): Promise<string | null> {
    this.activeLlama3Requests++;
    this.lastLlama3Request = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(`${this.llama3Url}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.llama3Model,
          prompt,
          stream: false,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        this.llama3Available = false;
        throw new Error(`Llama 3 request failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('🕒 Llama 3 request timed out');
      } else {
        console.error('Llama 3 request failed:', error);
      }
      this.llama3Available = false;
      return null;
    } finally {
      this.activeLlama3Requests--;
      this.processLlama3RequestQueue();
    }
  }

  private async processLlama3RequestQueue(): Promise<void> {
    if (this.llama3RequestQueue.length > 0 && this.activeLlama3Requests < this.maxConcurrentLlama3Requests) {
      const nextRequest = this.llama3RequestQueue.shift();
      if (nextRequest) {
        try {
          await nextRequest();
        } catch (error) {
          console.error('Queued Llama 3 request failed:', error);
        }
      }
    }
  }

  getLatestNews(): NewsItem[] {
    return this.cachedNews;
  }

  resetLearning() {
    logService.info('newsServiceReset', {}, 'Resetting news service learning');
    
    // Reset Llama 3 throttling and health monitoring
    this.llama3LastCheck = 0;
    this.llama3Available = true;
    this.lastLlama3Request = 0;
    this.llama3RequestQueue = [];
    this.activeLlama3Requests = 0;
    
    logService.info('newsServiceResetComplete', {}, 'News service learning reset complete');
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