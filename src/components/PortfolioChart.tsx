import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Portfolio } from '../types/trading';

interface PortfolioChartProps {
  portfolio: Portfolio;
}

export const PortfolioChart: React.FC<PortfolioChartProps> = ({ portfolio }) => {
  // Generate mock historical data for demonstration
  const generateHistoricalData = () => {
    const data = [];
    const baseValue = 10000;
    const days = 30;
    
    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      // Simulate portfolio growth with some volatility
      const progress = (days - i) / days;
      const trend = baseValue * (1 + (portfolio.totalPnlPercent / 100) * progress);
      const volatility = (Math.random() - 0.5) * 200;
      const value = trend + volatility;
      
      data.push({
        date: date.toISOString().split('T')[0], // YYYY-MM-DD format
        value: Math.max(value, baseValue * 0.8),
        timestamp: date.getTime(),
      });
    }
    
    return data;
  };

  const data = generateHistoricalData();

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis 
            dataKey="date" 
            stroke="#666"
            fontSize={12}
            tickFormatter={(value) => {
              try {
                const date = new Date(value);
                if (isNaN(date.getTime())) return value;
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              } catch (error) {
                return value;
              }
            }}
          />
          <YAxis 
            stroke="#666"
            fontSize={12}
            tickFormatter={(value) => `$${value.toFixed(0)}`}
          />
          <Tooltip 
            formatter={(value: number) => [`$${value.toFixed(2)}`, 'Portfolio Value']}
            labelFormatter={(label) => {
              try {
                const date = new Date(label);
                if (isNaN(date.getTime())) return `Date: ${label}`;
                return `Date: ${date.toLocaleDateString()}`;
              } catch (error) {
                return `Date: ${label}`;
              }
            }}
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
            }}
          />
          <Line 
            type="monotone" 
            dataKey="value" 
            stroke="#3b82f6" 
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#3b82f6' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};