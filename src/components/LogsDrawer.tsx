import React, { useState, useEffect } from 'react';
import { ActivityLog } from '../types';
import { api } from '../services/api';
import { X, RefreshCw, Terminal, CheckCircle, XCircle, AlertCircle, PlayCircle } from 'lucide-react';

interface LogsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LogsDrawer: React.FC<LogsDrawerProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await api.getLogs();
      if (res.success && res.data) {
        setLogs(res.data);
      }
    } catch (err) {
      console.error('Lỗi khi tải logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadLogs();
    }
  }, [isOpen]);



  if (!isOpen) return null;

  return (
    <div
      id="logs-drawer-overlay"
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs"
    >
      <div
        id="logs-drawer-panel"
        className="w-full max-w-lg bg-slate-50 border-l border-slate-300 h-full flex flex-col text-slate-900 shadow-2xl"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-base text-slate-900">AMR Communication & State Logs</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              id="refresh-logs-btn"
              onClick={loadLogs}
              disabled={loading}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
              title="Làm mới"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              id="close-logs-btn"
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
              title="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {logs.length === 0 ? (
            <div className="text-center py-12 text-slate-600 text-sm">
              Chưa có sự kiện nào. Hãy thực hiện bấm GỌI LỆNH hoặc TRIGGER.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="p-3 bg-slate-100/70 border border-slate-300/80 rounded-xl space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold">
                    {log.success ? (
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-600" />
                    )}
                    <span
                      className={`px-1.5 py-0.5 rounded text-[11px] font-mono uppercase ${
                        log.type === 'ORDER'
                          ? 'bg-blue-100 text-blue-700'
                          : log.type === 'TRIGGER'
                          ? 'bg-emerald-100 text-emerald-700'
                          : log.type === 'RESET'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {log.type}
                    </span>
                    <span className="text-slate-700">
                      {log.line.toUpperCase()}{log.station ? ` / ${log.station.toUpperCase()}` : ''}
                    </span>
                  </div>
                  <span className="text-slate-600 font-mono text-[10px]">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                <div className="text-slate-800">{log.message}</div>

                {log.orderId && (
                  <div className="font-mono text-[11px] text-primary bg-slate-50/80 px-2 py-1 rounded">
                    orderId: {log.orderId}
                  </div>
                )}

                {log.durationMs !== undefined && (
                  <div className="text-slate-600 text-[10px]">
                    Thời gian phản hồi: {log.durationMs}ms
                  </div>
                )}

                {log.payload && (
                  <details className="text-[10px] text-slate-600">
                    <summary className="cursor-pointer hover:text-slate-800">Xem chi tiết Payload</summary>
                    <pre className="mt-1 p-2 bg-white rounded text-slate-700 overflow-x-auto font-mono text-[10px]">
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
