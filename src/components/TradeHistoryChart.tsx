import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TradeRecord } from '../services/learningService';

interface TradeHistoryChartProps {
  trades: TradeRecord[];
}

const TradeHistoryChart: React.FC<TradeHistoryChartProps> = ({ trades }) => {
  // 📊 Aynı gün yapılan işlemleri grupla
  const groupedTrades: { [date: string]: number } = {};

  trades.forEach((trade) => {
    if (trade.exitPrice !== undefined && trade.timestamp) {
      const date = new Date(trade.timestamp).toISOString().split('T')[0];
      const pnl = trade.tradeResult?.pnl || 0;
      groupedTrades[date] = (groupedTrades[date] || 0) + pnl;
    }
  });

  // 🧮 Kümülatif PnL hesapla
  const closedTrades = Object.entries(groupedTrades).map(([date, pnl]) => ({
    date,
    pnl,
    cumulative: 0,
  }));

  let total = 0;
  for (let i = 0; i < closedTrades.length; i++) {
    total += closedTrades[i].pnl;
    closedTrades[i].cumulative = total;
  }

  return (
    <div className="h-80 bg-white dark:bg-card p-4 rounded-lg shadow">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-foreground mb-2">
        Trade History (Grouped by Day)
      </h2>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={closedTrades}>
          <CartesianGrid strokeDasharray="3 3" stroke="#ccc" />
          <XAxis dataKey="date" stroke="#666" fontSize={12} />
          <YAxis stroke="#666" fontSize={12} />
          <Tooltip
            formatter={(value: number) => [`$${value.toFixed(2)}`, 'PnL']}
            labelFormatter={(label) => `Date: ${label}`}
          />
          <Line
            type="monotone"
            dataKey="cumulative"
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

export default TradeHistoryChart;
