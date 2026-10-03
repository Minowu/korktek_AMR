import React, { useState, useEffect } from 'react';
import { AllLinesConfig, LineState } from '../types';
import { api } from '../services/api';
import {
  Layers,
  ArrowRight,
  MonitorSmartphone,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Terminal,
} from 'lucide-react';

interface StationSelectorProps {
  onSelectStation: (lineKey: string, stationKey: string) => void;
  onOpenLogs: () => void;
  isAdmin?: boolean;
  permissions?: string[];
}

export const StationSelector: React.FC<StationSelectorProps> = ({
  onSelectStation,
  onOpenLogs,
  isAdmin = false,
  permissions = [],
}) => {
  const [config, setConfig] = useState<AllLinesConfig | null>(null);
  const [states, setStates] = useState<Record<string, LineState>>({});
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cfgRes, stateRes] = await Promise.all([
        api.getAllConfig(),
        api.getAllStates(),
      ]);
      if (cfgRes.success && cfgRes.data) {
        setConfig(cfgRes.data);
      }
      if (stateRes.success && stateRes.data) {
        setStates(stateRes.data);
      }
    } catch (err) {
      console.error('Lỗi tải dữ liệu danh sách station:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      api.getAllStates().then((res) => {
        if (res.success && res.data) {
          setStates(res.data);
        }
      });
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full max-w-md mx-auto space-y-5 pb-6">
      {/* Header */}
      <div className="text-center space-y-1.5 pt-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold">
          <MonitorSmartphone className="w-3.5 h-3.5" />
          <span>HỆ THỐNG ĐIỀU KHIỂN AMR</span>
        </div>
        <h1 className="text-2xl font-black text-main tracking-tight">
          Chọn Trạm Vận Hành (Station)
        </h1>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between px-1">
        <button
          id="refresh-selector-btn"
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Làm mới trạng thái</span>
        </button>

        {isAdmin && (
          <button
            id="selector-logs-btn"
            onClick={onOpenLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-primary rounded-lg text-xs font-medium"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Nhật ký giao tiếp</span>
          </button>
        )}
      </div>

      {/* Station List Cards */}
      <div className="space-y-4">
        {config?.lines.map((line) => {
          const allowedStations = line.stations.filter(station => {
            if (isAdmin) return true;
            const path = `/control/${line.key}/${station.key}`;
            return permissions.some(p => path === p || path.startsWith(p) || p === `*` || p === `/control/${line.key}/*`);
          });

          if (allowedStations.length === 0) return null;

          const lineStatus = states[line.key]?.status || 'idle';
          const isRunning = lineStatus === 'running';
          const isPending = lineStatus === 'pending';

          return (
            <div
              key={line.key}
              className="bg-white border-t-4 border-t-primary border-slate-200 rounded-2xl p-4 shadow-[0_8px_30px_rgb(23,54,58,0.08)] space-y-3"
            >
              {/* Line Header */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                <div className="flex items-center gap-2">
                  <div>
                    <h2 className="font-bold text-slate-900 text-base leading-tight">
                      {line.name}
                    </h2>
                    <span className="text-[11px] text-slate-600">
                      {line.orderLabel}
                    </span>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${isPending
                      ? 'bg-amber-100 text-amber-700 border border-amber-300 animate-pulse'
                      : isRunning
                        ? 'bg-accent/10 text-accent border border-accent/20 animate-pulse'
                        : 'bg-main text-white border border-main'
                    }`}
                >
                  {isPending ? 'Đang chờ...' : isRunning ? 'Đang chạy' : 'Sẵn sàng'}
                </span>
              </div>

              {/* Stations Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                {allowedStations.map((station) => (
                  <button
                    key={station.key}
                    id={`select-station-${station.code.toLowerCase()}`}
                    type="button"
                    onClick={() => onSelectStation(line.key, station.key)}
                    className="p-3.5 rounded-xl bg-slate-100/80 hover:bg-slate-200/90 active:bg-slate-300/90 border border-slate-300 text-left transition-all duration-150 flex flex-col justify-between min-h-[92px] group shadow-sm"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-black text-slate-900 font-mono group-hover:text-primary transition-colors">
                          {station.code}
                        </span>
                        <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </div>
                      <div className="text-xs font-semibold text-slate-800 mt-1">
                        {station.name}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
