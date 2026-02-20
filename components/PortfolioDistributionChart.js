import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatIDR } from '../lib/utils';
import { useLanguage } from '../lib/languageContext';

export default function PortfolioDistributionChart({ data = [], title, totalReference }) {
    const { t } = useLanguage();

    if (!data || data.length === 0) return null;

    // Use passed totalReference (denominator) if available, otherwise sum data
    const totalValue = totalReference || data.reduce((acc, curr) => acc + curr.value, 0);

    const formatPercent = (val) => {
        let formatted = val.toFixed(2);
        // Remove trailing zeros and decimal point if whole number
        formatted = formatted.replace(/\.?0+$/, '');
        return formatted;
    };

    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const pct = totalValue > 0 ? (payload[0].value / totalValue) * 100 : 0;
            return (
                <div className="bg-white dark:bg-[#1f2937] p-3 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800">
                    <p className="text-sm font-bold text-gray-900 dark:text-white mb-1">{payload[0].name}</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 font-mono mb-1">{formatIDR(payload[0].value)}</p>
                    <p className="text-xs font-bold text-blue-600 dark:text-blue-400">
                        {formatPercent(pct)}%
                    </p>
                </div>
            );
        }
        return null;
    };

    const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, value, index }) => {
        const RADIAN = Math.PI / 180;
        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);

        if (percent < 0.05) return null; // Don't show text if slice is too small graphically

        // Calculate actual percent based on our chosen totalValue context
        const actualPercent = totalValue > 0 ? (value / totalValue) * 100 : 0;

        return (
            <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize="11" fontWeight="bold">
                {`${formatPercent(actualPercent)}%`}
            </text>
        );
    };

    return (
        <div className="bg-white dark:bg-[#161b22] rounded-2xl p-6 border border-gray-200 dark:border-gray-800 relative shadow-sm h-96 flex flex-col justify-center items-center">
            <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wide self-start mb-2">{title || t('assetAllocation')}</h3>
            <div className="w-full h-full min-h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="value"
                            stroke="none"
                            cornerRadius={5}
                            labelLine={false}
                            label={renderCustomizedLabel}
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                        <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
