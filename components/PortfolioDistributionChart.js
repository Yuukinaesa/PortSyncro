import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Sector } from 'recharts';
import { formatIDR } from '../lib/utils';
import { useLanguage } from '../lib/languageContext';

export default function PortfolioDistributionChart({ data = [], title, totalReference }) {
    const { t } = useLanguage();
    const [activeIndex, setActiveIndex] = useState(0);

    if (!data || data.length === 0) return null;

    // Use passed totalReference (denominator) if available, otherwise sum data
    const totalValue = totalReference || data.reduce((acc, curr) => acc + curr.value, 0);

    const formatPercent = (val) => {
        let formatted = val.toFixed(2);
        // Remove trailing zeros and decimal point if whole number
        formatted = formatted.replace(/\.?0+$/, '');
        return formatted;
    };

    const onPieEnter = (_, index) => {
        setActiveIndex(index);
    };

    const renderActiveShape = (props) => {
        const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;

        return (
            <g>
                {/* Popped out active slice */}
                <Sector
                    cx={cx}
                    cy={cy}
                    innerRadius={innerRadius}
                    outerRadius={outerRadius + 8}
                    startAngle={startAngle}
                    endAngle={endAngle}
                    fill={fill}
                    cornerRadius={5}
                />
                {/* Thin outer decorative line for premium feel */}
                <Sector
                    cx={cx}
                    cy={cy}
                    startAngle={startAngle}
                    endAngle={endAngle}
                    innerRadius={outerRadius + 12}
                    outerRadius={outerRadius + 14}
                    fill={fill}
                />
            </g>
        );
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

    // Get active item info for HTML overlay
    const activeItem = data[activeIndex] || data[0];
    const activePercent = totalValue > 0 && activeItem ? (activeItem.value / totalValue) * 100 : 0;

    return (
        <div className="bg-white dark:bg-[#161b22] rounded-2xl p-6 border border-gray-200 dark:border-gray-800 relative shadow-sm h-96 flex flex-col justify-center items-center">
            <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wide self-start mb-2">{title || t('assetAllocation')}</h3>
            <div className="w-full flex-1 min-h-[220px] relative">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart style={{ outline: 'none' }}>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="value"
                            stroke="none"
                            cornerRadius={5}
                            labelLine={false}
                            label={renderCustomizedLabel}
                            activeIndex={activeIndex}
                            activeShape={renderActiveShape}
                            style={{ outline: 'none' }}
                            onMouseEnter={(_, index) => setActiveIndex(index)}
                            onClick={(_, index) => setActiveIndex(index)}
                        >
                            {data.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={entry.color}
                                    className="cursor-pointer focus:outline-none"
                                    style={{ outline: 'none' }}
                                />
                            ))}
                        </Pie>
                    </PieChart>
                </ResponsiveContainer>
                {/* HTML overlay for center info - always visible, independent of Recharts */}
                {activeItem && (
                    <div
                        className="absolute inset-0 flex items-center justify-center pointer-events-none"
                        style={{ zIndex: 10 }}
                    >
                        <div className="flex flex-col items-center text-center transition-all duration-300">
                            <span className="font-bold text-sm" style={{ color: activeItem.color }}>
                                {activeItem.name}
                            </span>
                            <span className="text-xs text-gray-400 font-mono mt-0.5">
                                {formatIDR(activeItem.value)}
                            </span>
                            <span className="text-xs font-bold text-blue-400 mt-0.5">
                                {formatPercent(activePercent)}%
                            </span>
                        </div>
                    </div>
                )}
            </div>
            {/* Custom clickable legend */}
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2">
                {data.map((entry, index) => (
                    <div
                        key={`legend-${index}`}
                        className={`flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded-lg transition-all duration-200 select-none
                            ${activeIndex === index
                                ? 'bg-gray-100 dark:bg-gray-800 scale-105'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 opacity-70 hover:opacity-100'
                            }`}
                        onClick={() => setActiveIndex(index)}
                        onTouchStart={() => setActiveIndex(index)}
                    >
                        <span
                            className="w-3 h-3 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: entry.color }}
                        />
                        <span className={`text-xs font-bold ${activeIndex === index ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                            {entry.name}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
