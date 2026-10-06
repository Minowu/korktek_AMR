import React, { useState, useEffect } from 'react';
import { StationControl } from './StationControl';
import { Smartphone, Monitor } from 'lucide-react';
import { AllLinesConfig } from '../types';
import { api } from '../services/api';

interface MultiPdaViewProps {
  onOpenLogs: () => void;
}

export const MultiPdaView: React.FC<MultiPdaViewProps> = ({ onOpenLogs }) => {
  const [config, setConfig] = useState<AllLinesConfig | null>(null);
  const [selectedPair, setSelectedPair] = useState<string>('all');

  useEffect(() => {
    api.getAllConfig().then(res => {
      if (res.success && res.data) {
        setConfig(res.data);
      }
    });
  }, []);

  if (!config) {
    return (
      <div className="w-full flex justify-center py-10">
        <div className="animate-pulse flex items-center gap-2 text-slate-500">
          Đang tải cấu hình hệ thống...
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Monitor className="w-5 h-5 text-primary" />
            Mô phỏng Đa PDA Đồng thời (Multi-Device Simulator)
          </h2>
          <p className="text-xs text-slate-600 mt-1">
            Kiểm thử cho gọi nhiều
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {config.lines.map(line => (
            <button
              key={line.key}
              onClick={() => setSelectedPair(line.key)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors shadow-sm border ${selectedPair === line.key
                ? 'bg-blue-600 text-white border-blue-700'
                : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'
                }`}
            >
              {line.name}
            </button>
          ))}
          <button
            onClick={() => setSelectedPair('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors shadow-sm border ${selectedPair === 'all'
              ? 'bg-slate-800 text-white border-slate-900'
              : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'
              }`}
          >
            Tất cả PDA
          </button>
        </div>
      </div>

      <div
        className={`grid gap-6 ${selectedPair === 'all'
          ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
          : 'grid-cols-1 md:grid-cols-2'
          }`}
      >
        {config.lines
          .filter(l => selectedPair === 'all' || selectedPair === l.key)
          .map(line => (
            <React.Fragment key={line.key}>
              {line.stations.map((station, idx) => (
                <div key={station.key} className="bg-white border-[6px] border-slate-200/80 rounded-3xl p-3 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)] relative overflow-hidden flex flex-col">
                  <div className="text-center py-1.5 text-[11px] font-mono text-slate-600 border-b border-slate-200 mb-3 flex items-center justify-center gap-1.5 bg-slate-50 rounded-lg">
                    <Smartphone className="w-3.5 h-3.5 text-primary" />
                    <span className="font-semibold text-slate-700 truncate" title={`${line.name} - ${station.name}`}>
                      {line.name} ({station.code})
                    </span>
                  </div>
                  <div className="flex-1">
                    <StationControl
                      lineKey={line.key}
                      stationKey={station.key}
                      onNavigateHome={() => { }}
                      onOpenLogs={onOpenLogs}
                    />
                  </div>
                </div>
              ))}
            </React.Fragment>
          ))}
      </div>
    </div>
  );
};
