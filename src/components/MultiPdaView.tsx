import React, { useState } from 'react';
import { StationControl } from './StationControl';
import { Smartphone, Monitor } from 'lucide-react';

interface MultiPdaViewProps {
  onOpenLogs: () => void;
}

export const MultiPdaView: React.FC<MultiPdaViewProps> = ({ onOpenLogs }) => {
  const [selectedPair, setSelectedPair] = useState<'line-a' | 'line-b' | 'all'>('line-a');

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Monitor className="w-5 h-5 text-primary" />
            Mô phỏng Đa PDA Đồng thời (Multi-Device Simulator)
          </h2>
          <p className="text-xs text-slate-600">
            Dùng để kiểm thử tính năng khóa chéo nút GỌI LỆNH (Line Locking) giữa các Station cùng Line
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setSelectedPair('line-a')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              selectedPair === 'line-a'
                ? 'bg-blue-600 text-slate-900'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Line A (A1 + A2)
          </button>
          <button
            onClick={() => setSelectedPair('line-b')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              selectedPair === 'line-b'
                ? 'bg-blue-600 text-slate-900'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Line B (B1 + B2)
          </button>
          <button
            onClick={() => setSelectedPair('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              selectedPair === 'all'
                ? 'bg-blue-600 text-slate-900'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Tất cả 4 Station
          </button>
        </div>
      </div>

      <div
        className={`grid gap-6 ${
          selectedPair === 'all'
            ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
            : 'grid-cols-1 md:grid-cols-2'
        }`}
      >
        {(selectedPair === 'line-a' || selectedPair === 'all') && (
          <>
            {/* PDA A1 */}
            <div className="bg-white border-[6px] border-slate-200/80 rounded-3xl p-3 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] relative overflow-hidden">
              <div className="text-center py-1 text-[11px] font-mono text-slate-600 border-b border-slate-200 mb-3 flex items-center justify-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-primary" />
                <span>PDA #1: /control/line-a/pickup</span>
              </div>
              <StationControl
                lineKey="line-a"
                stationKey="pickup"
                onNavigateHome={() => {}}
                onOpenLogs={onOpenLogs}
              />
            </div>

            {/* PDA A2 */}
            <div className="bg-white border-[6px] border-slate-200/80 rounded-3xl p-3 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] relative overflow-hidden">
              <div className="text-center py-1 text-[11px] font-mono text-slate-600 border-b border-slate-200 mb-3 flex items-center justify-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-primary" />
                <span>PDA #2: /control/line-a/dropoff</span>
              </div>
              <StationControl
                lineKey="line-a"
                stationKey="dropoff"
                onNavigateHome={() => {}}
                onOpenLogs={onOpenLogs}
              />
            </div>
          </>
        )}

        {(selectedPair === 'line-b' || selectedPair === 'all') && (
          <>
            {/* PDA B1 */}
            <div className="bg-white border-[6px] border-slate-200/80 rounded-3xl p-3 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] relative overflow-hidden">
              <div className="text-center py-1 text-[11px] font-mono text-slate-600 border-b border-slate-200 mb-3 flex items-center justify-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-primary" />
                <span>PDA #3: /control/line-b/pickup</span>
              </div>
              <StationControl
                lineKey="line-b"
                stationKey="pickup"
                onNavigateHome={() => {}}
                onOpenLogs={onOpenLogs}
              />
            </div>

            {/* PDA B2 */}
            <div className="bg-white border-[6px] border-slate-200/80 rounded-3xl p-3 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] relative overflow-hidden">
              <div className="text-center py-1 text-[11px] font-mono text-slate-600 border-b border-slate-200 mb-3 flex items-center justify-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-primary" />
                <span>PDA #4: /control/line-b/dropoff</span>
              </div>
              <StationControl
                lineKey="line-b"
                stationKey="dropoff"
                onNavigateHome={() => {}}
                onOpenLogs={onOpenLogs}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
