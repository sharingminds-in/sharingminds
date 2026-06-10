"use client";

import React, { useState } from 'react';
import { addDays } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, Filler } from 'chart.js';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { useAdminAnalyticsQuery } from '@/hooks/queries/use-analytics-queries';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, Filler);

export default function AdminAnalyticsPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: addDays(new Date(), -29),
    to: new Date(),
  });
  const {
    data = null,
    isLoading: loading,
    error,
  } = useAdminAnalyticsQuery(
    {
      startDate: dateRange?.from?.toISOString(),
      endDate: dateRange?.to?.toISOString(),
    },
    Boolean(dateRange?.from && dateRange?.to)
  );

  // === LOADING AND ERROR STATES ===
  if (loading) {
    return <div className="p-6 text-center">Loading analytics...</div>;
  }
  if (error) {
    return <div className="p-6 text-center text-red-500">Error: {error instanceof Error ? error.message : 'Failed to load analytics'}</div>;
  }
  if (!data) {
    return <div className="p-6 text-center">No data available.</div>;
  }

  // === CHART DATA PREPARATION ===
  // ... (The rest of the file is exactly the same as before)
  const sessionsChartData = {
    labels: data.sessionsOverTime.map((d: any) => d.date),
    datasets: [{
      label: 'Sessions',
      data: data.sessionsOverTime.map((d: any) => d.sessions),
      tension: 0.3,
      fill: true,
      backgroundColor: 'rgba(59,130,246,0.08)',
      borderColor: 'rgba(59,130,246,1)',
      pointRadius: 2,
    }],
  };

  const hasUniversities = Array.isArray(data.topUniversities) && data.topUniversities.length > 0;
  const hasQuestions = Array.isArray(data.topMenteeQuestions) && data.topMenteeQuestions.length > 0;

  const uniPieData = hasUniversities
    ? {
        labels: data.topUniversities.map((u: any) => u.name),
        datasets: [{
          data: data.topUniversities.map((u: any) => u.mentions),
          backgroundColor: ['#60a5fa', '#7dd3fc', '#34d399', '#fbbf24', '#c7d2fe'],
        }],
      }
    : null;

  return (
    <div className="p-6 max-w-full mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">AI Mentor — Analytics</h1>
          <p className="text-sm text-gray-500">Overview dashboard for mentees, mentors, universities & course insights</p>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePicker range={dateRange} onDateChange={setDateRange} />
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-xs text-gray-400">Active Mentees</div>
          <div className="text-2xl font-bold">{data.kpis.activeMentees.current.toLocaleString()}</div>
          <div className={`text-sm ${data.kpis.activeMentees.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {data.kpis.activeMentees.change >= 0 ? '+' : ''}{data.kpis.activeMentees.change}% vs prev. period
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-xs text-gray-400">Sessions (chats/calls)</div>
          <div className="text-2xl font-bold">{data.kpis.totalSessions.current.toLocaleString()}</div>
          <div className={`text-sm ${data.kpis.totalSessions.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {data.kpis.totalSessions.change >= 0 ? '+' : ''}{data.kpis.totalSessions.change}% vs prev. period
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-xs text-gray-400">Conversion → Mentorship Paid</div>
          <div className="text-2xl font-bold">{data.kpis.paidConversionRate}%</div>
          <div className="text-sm text-gray-500">(from inquiries)</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-xs text-gray-400">Avg Session Rating</div>
          <div className="text-2xl font-bold">{data.kpis.averageSessionRating.toFixed(1)} / 5</div>
          <div className="text-sm text-gray-500">NPS & feedback</div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-lg font-medium">Traffic & Engagement</h3>
            <Line data={sessionsChartData} options={{ plugins: { legend: { display: false } } }} height={120} />
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-lg font-medium mb-3">Top Mentee Questions</h3>
            {hasQuestions ? (
              <ul className="space-y-2 text-sm text-gray-700">
                {data.topMenteeQuestions.map((q: any, i: number) => (
                  <li key={i} className="p-2 border-b">
                    <div className="flex justify-between">
                      <div>{q.query}</div>
                      <div className="text-xs text-gray-400">{q.mentions} mentions</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">Not enough chat data for this range.</p>
            )}
          </div>
        </div>
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-lg font-medium mb-2">Top Universities Searched</h3>
            {hasUniversities && uniPieData ? (
              <Doughnut data={uniPieData} options={{ plugins: { legend: { position: 'bottom' } } }} height={200} />
            ) : (
              <p className="text-sm text-gray-500">Not enough university searches in this period.</p>
            )}
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-lg font-medium mb-2">Mentor Leaderboard</h3>
            <ol className="list-decimal pl-5 text-sm text-gray-700">
              {data.mentorLeaderboard.map((m: any) => (
                <li key={m.mentorId} className="mb-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium">{m.name}</div>
                      <div className="text-xs text-gray-500">{m.sessionsCompleted} sessions</div>
                    </div>
                    <div className="text-sm text-yellow-600">★ {parseFloat(m.averageRating).toFixed(1)}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}
