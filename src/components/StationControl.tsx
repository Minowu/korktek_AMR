import React, { useState, useEffect, useRef } from 'react';
import { StationConfig, LineState } from '../types';
import { api } from '../services/api';
import { ConfirmModal } from './ConfirmModal';
import {
  Send,
  Zap,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Wifi,
  WifiOff,
  Sliders,
  ChevronLeft,
  Undo2,
  PackagePlus,
  PackageMinus,
} from 'lucide-react';

interface StationControlProps {
  lineKey: string;
  stationKey: string;
  onNavigateHome: () => void;
  onOpenLogs: () => void;
}

export const StationControl: React.FC<StationControlProps> = ({
  lineKey,
  stationKey,
  onNavigateHome,
  onOpenLogs,
}) => {
  const [config, setConfig] = useState<StationConfig | null>(null);
  const [lineState, setLineState] = useState<LineState | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  // Action states
  const [isOrdering, setIsOrdering] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Modals
  const [showOrderConfirm, setShowOrderConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  // Trigger state
  const [pendingTriggerId, setPendingTriggerId] = useState<string | null>(null);
  const [activeTriggerId, setActiveTriggerId] = useState<string | null>(null);

  // Notification Banner
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    title: string;
    message: string;
    orderId?: string;
  } | null>(null);

  // Connectivity
  const [isOnline, setIsOnline] = useState(true);
  const isMountedRef = useRef(true);

  // Fetch initial config
  const fetchConfig = async () => {
    try {
      setLoadingConfig(true);
      setConfigError(null);
      const res = await api.getStationConfig(lineKey, stationKey);
      if (res.success && res.data) {
        setConfig(res.data);
      } else {
        setConfigError(res.message || 'Không thể tải cấu hình station');
      }
    } catch (err: any) {
      setConfigError('Không thể kết nối đến Backend: ' + err.message);
    } finally {
      setLoadingConfig(false);
    }
  };

  // Poll Line State (Decision 3 - Option A)
  const pollState = async () => {
    try {
      const res = await api.getLineState(lineKey);
      if (res.success && res.data) {
        setLineState(res.data);
        setIsOnline(true);
      }
    } catch (err) {
      setIsOnline(false);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    fetchConfig();
    pollState();

    // Short polling every 2.5s for multi-PDA synchronization
    const timer = setInterval(() => {
      if (isMountedRef.current) {
        pollState();
      }
    }, 2500);

    return () => {
      isMountedRef.current = false;
      clearInterval(timer);
    };
  }, [lineKey, stationKey]);

  // Execute Order (after confirmation)
  const handleConfirmOrder = async () => {
    if (!config) return;
    setIsOrdering(true);
    setShowOrderConfirm(false);
    setFeedback(null);

    try {
      const res = await api.sendOrder(lineKey, stationKey);
      if (res.success) {
        setFeedback({
          type: 'success',
          title: 'GỌI LỆNH THÀNH CÔNG',
          message: `Đã phát lệnh tới AMR System (${res.durationMs || 0}ms)`,
          orderId: res.orderId,
        });
        // Immediately refresh state
        pollState();
      } else {
        setFeedback({
          type: 'error',
          title: res.errorCode === 'LINE_LOCKED' ? 'LINE ĐANG BỊ KHÓA' : 'GỌI LỆNH THẤT BẠI',
          message: res.message || 'Lỗi không xác định khi gửi lệnh',
          orderId: res.orderId,
        });
        pollState();
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        title: 'LỖI KẾT NỐI BACKEND',
        message: 'Không thể liên lạc với Small Backend: ' + err.message,
      });
    } finally {
      setIsOrdering(false);
    }
  };

  // Execute Trigger
  const handleTrigger = async (triggerId: string) => {
    if (!config) return;
    setIsTriggering(true);
    setActiveTriggerId(triggerId);
    setPendingTriggerId(null);
    setFeedback(null);

    try {
      const res = await api.sendTrigger(lineKey, stationKey, triggerId);
      if (res.success) {
        setFeedback({
          type: 'success',
          title: 'TRIGGER THÀNH CÔNG',
          message: `Đã kích hoạt điểm ${res.currentStation} cho AMR (${res.durationMs || 0}ms)`,
        });
      } else {
        setFeedback({
          type: 'error',
          title: 'TRIGGER THẤT BẠI',
          message: res.message || 'Lỗi khi kích hoạt Trigger',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        title: 'LỖI KẾT NỐI',
        message: 'Không thể gửi Trigger đến Backend: ' + err.message,
      });
    } finally {
      setIsTriggering(false);
      setActiveTriggerId(null);
    }
  };

  // Execute Reset (Decision 1 Option A)
  const handleConfirmReset = async () => {
    setIsResetting(true);
    setShowResetConfirm(false);

    try {
      const res = await api.resetLine(lineKey);
      if (res.success) {
        setFeedback({
          type: 'success',
          title: 'ĐÃ MỞ KHÓA LINE',
          message: `Đã đưa ${config?.lineName || lineKey.toUpperCase()} về trạng thái IDLE sẵn sàng`,
        });
        pollState();
      } else {
        setFeedback({
          type: 'error',
          title: 'RESET THẤT BẠI',
          message: res.message || 'Không thể mở khóa',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        title: 'LỖI KẾT NỐI',
        message: err.message,
      });
    } finally {
      setIsResetting(false);
    }
  };

  if (loadingConfig) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center">
        <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4" />
        <div className="text-lg font-bold text-slate-900">Đang tải cấu hình Station...</div>
        <div className="text-sm text-slate-600 mt-1 font-mono">{lineKey} / {stationKey}</div>
      </div>
    );
  }

  if (configError || !config) {
    return (
      <div className="p-6 max-w-md mx-auto text-center space-y-4">
        <div className="w-16 h-16 bg-rose-500/20 text-rose-600 rounded-2xl flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Không tìm thấy Station</h2>
        <p className="text-sm text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-200">
          {configError}
        </p>
        <button
          onClick={onNavigateHome}
          className="w-full min-h-[50px] px-4 py-2 bg-blue-600 hover:bg-blue-700 font-bold rounded-xl text-slate-900"
        >
          Quay lại danh sách Station
        </button>
      </div>
    );
  }

  const isLineRunning = lineState?.status === 'running';
  const isLinePending = lineState?.status === 'pending';
  const isLineBusy = isLineRunning || isLinePending;

  return (
    <div className="w-full max-w-md mx-auto flex flex-col min-h-[92vh] justify-between pb-4">
      {/* 1. Station Header Bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200">
          <div className="flex items-center gap-2 text-xs">
            <button
              id="open-logs-btn"
              onClick={onOpenLogs}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-primary font-mono"
              title="Xem nhật ký giao tiếp"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Logs</span>
            </button>

            <span
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-semibold ${isOnline
                ? 'bg-main text-white border-main'
                : 'bg-accent/10 text-accent border-accent/20'
                }`}
            >
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5 animate-pulse" />
                  <span>Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5" />
                  <span>Mất mạng</span>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Station Title Banner - High Readability for PDA */}
        <div
          id="station-header-card"
          className="bg-slate-50 border-2 border-slate-300/80 rounded-2xl p-4 shadow-lg"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-primary">
                {config.lineName}
              </div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 mt-0.5">
                {config.stationName.toUpperCase()}{' '}
                <span className="text-primary text-xl font-mono">({config.stationCode})</span>
              </h1>
            </div>

            {/* Line Status Badge */}
            <div className="text-right">
              <span
                id="line-status-badge"
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-xs ${
                  isLinePending
                    ? 'bg-amber-100 text-amber-700 border border-amber-300 animate-pulse'
                    : isLineRunning
                    ? 'bg-accent/10 text-accent border border-accent/20 animate-pulse'
                    : 'bg-main text-white border border-main'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isLinePending ? 'bg-amber-500'
                    : isLineRunning ? 'bg-accent'
                    : 'bg-emerald-400'
                  }`}
                />
                {isLinePending ? 'ĐANG CHỜ RCS...' : isLineRunning ? 'ĐANG CHẠY' : 'SẴN SÀNG'}
              </span>
              {isLineRunning && lineState?.currentOrderId && (
                <div className="text-[10px] text-amber-700 font-mono mt-1 truncate max-w-[150px]">
                  {lineState.currentOrderId}
                </div>
              )}
            </div>
          </div>

          {/* Config Parameters Display */}
          <div className="mt-3 pt-3 border-t border-slate-200/80 grid grid-cols-1 gap-2 text-xs">
            <div className="bg-white/70 p-2 rounded-lg border border-slate-200 flex items-center justify-between">
              <span className="text-slate-600 font-medium">Chu trình tổng:</span>
              <span className="text-slate-800 font-bold bg-slate-200/50 px-2 py-0.5 rounded">{config.orderLabel}</span>
            </div>
          </div>
        </div>

        {/* 2. Notification / Feedback Banner */}
        {feedback && (
          <div
            id="station-feedback-banner"
            className={`p-3.5 rounded-xl border flex items-start gap-3 transition-all ${feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 text-xs">
              <div className="font-bold text-sm">{feedback.title}</div>
              <div className="mt-0.5 text-slate-800 leading-relaxed">{feedback.message}</div>
              {feedback.orderId && (
                <div className="mt-1 font-mono text-[11px] text-primary bg-slate-50/80 px-2 py-1 rounded inline-block">
                  ID: {feedback.orderId}
                </div>
              )}
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-slate-600 hover:text-slate-900 text-xs px-1"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* 3. PRIMARY ACTION BUTTONS (PDA Optimized Vertical Stack) */}
      <div className="my-6 space-y-4">
        {/* ACTION 1: GỌI LỆNH */}
        <div className="space-y-1">
          <button
            id="order-action-btn"
            type="button"
            disabled={isLineBusy || isOrdering}
            onClick={() => setShowOrderConfirm(true)}
            className={`w-full min-h-[78px] px-6 py-4 rounded-2xl font-black text-xl tracking-wide uppercase transition-all duration-150 flex flex-col items-center justify-center gap-1 shadow-xl border-2 ${
              isLinePending || isOrdering
                ? 'bg-amber-100/90 text-amber-600 border-amber-300 cursor-wait shadow-none'
                : isLineRunning
                ? 'bg-slate-100/90 text-slate-500 border-slate-300 cursor-not-allowed shadow-none'
                : 'bg-main hover:opacity-90 active:scale-[0.98] text-white border-main/50 hover:border-main'
            }`}
          >
            <div className="flex items-center gap-2">
              {isLinePending || isOrdering ? (
                <span className="w-6 h-6 border-3 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
              ) : (
                <Send className="w-6 h-6" />
              )}
              <span>
                {isLinePending || isOrdering ? 'ĐANG CHỜ RCS...' : `GỌI chu trình ${config.orderLabel.toUpperCase()}`}
              </span>
            </div>
            <span className="text-[11px] font-medium tracking-normal normal-case opacity-80">
              {isLinePending || isOrdering
                ? 'Hệ thống đang chờ RCS phản hồi...'
                : isLineRunning
                ? 'Nút bị khóa vì Line đang chạy lệnh'
                : 'Yêu cầu AMR đến lấy hàng'}
            </span>
          </button>
        </div>

        {/* ACTION 2: DYNAMIC TRIGGERS */}
        {config.triggers?.map((t) => {
          const isThisTriggering = isTriggering && activeTriggerId === t.id;
          
          let bgColor = 'bg-emerald-600 hover:bg-emerald-700 border-emerald-400/50 hover:border-emerald-300';
          let TriggerIcon = Zap;
          
          if (t.id === 'rotate') {
            bgColor = 'bg-amber-500 hover:bg-amber-600 border-amber-400/50 hover:border-amber-400';
            TriggerIcon = Undo2;
          } else if (t.id === 'supply') {
            bgColor = 'bg-blue-500 hover:bg-blue-600 border-blue-400/50 hover:border-blue-400';
            TriggerIcon = PackagePlus;
          } else if (t.id === 'unload') {
            bgColor = 'bg-[#C96A6A] hover:bg-[#b55c5c] border-[#C96A6A]/50 hover:border-[#b55c5c]';
            TriggerIcon = PackageMinus;
          }

          return (
            <div key={t.id} className="space-y-1">
              <button
                id={`trigger-btn-${t.id}`}
                type="button"
                disabled={isTriggering}
                onClick={() => setPendingTriggerId(t.id)}
                className={`w-full min-h-[78px] px-6 py-4 rounded-2xl font-black text-xl tracking-wide uppercase text-white border-2 transition-all duration-150 flex flex-col items-center justify-center gap-1 shadow-xl disabled:opacity-70 disabled:scale-100 ${bgColor} active:scale-[0.98]`}
              >
                <div className="flex items-center gap-2">
                  {isThisTriggering ? (
                    <span className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <TriggerIcon className="w-6 h-6" />
                  )}
                  <span>{t.name}</span>
                </div>
                <span className="text-[11px] font-medium tracking-normal normal-case opacity-80 font-mono">
                  Mã điểm: {t.triggerStation}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {/* 4. UTILITY / RESET ACTION (Decision 1 - Option A) */}
      <div className="pt-3 border-t border-slate-200/80 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-600 px-1">
          <span>Quản trị Line:</span>
          <span className="font-mono">
            Line {config.lineName.replace('Line ', '')} ({isLineRunning ? 'Locked' : 'Idle'})
          </span>
        </div>

        <button
          id="reset-line-btn"
          type="button"
          disabled={isResetting}
          onClick={() => setShowResetConfirm(true)}
          className={`w-full min-h-[48px] px-4 py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 border ${isLineRunning
            ? 'bg-amber-100 hover:bg-amber-200 text-amber-700 border-amber-300'
            : 'bg-slate-100/60 hover:bg-slate-100 text-slate-600 border-slate-300/50'
            }`}
        >
          <RotateCcw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
          <span>MỞ KHÓA / RESET {config.lineName.toUpperCase()}</span>
        </button>
      </div>

      {/* 5. Confirmation Modals */}
      {/* GỌI LỆNH Confirm Modal (Requirement Section 14) */}
      <ConfirmModal
        isOpen={showOrderConfirm}
        title="XÁC NHẬN GỌI LỆNH"
        message={`Bạn có chắc muốn gọi ${config.orderLabel} cho ${config.lineName} không? (Thao tác này sẽ gửi lệnh di chuyển tới AMR System và khóa nút gọi của Line).`}
        confirmText="XÁC NHẬN"
        cancelText="HỦY"
        variant="primary"
        isLoading={isOrdering}
        onConfirm={handleConfirmOrder}
        onCancel={() => setShowOrderConfirm(false)}
      />

      {/* TRIGGER Confirm Modal */}
      <ConfirmModal
        isOpen={!!pendingTriggerId}
        title="XÁC NHẬN AMR ĐÃ ĐẾN"
        message={`Xác nhận AMR đã đến và xử lý xong để tiếp tục hành trình?`}
        confirmText="XÁC NHẬN"
        cancelText="HỦY"
        variant="primary"
        isLoading={isTriggering}
        onConfirm={() => pendingTriggerId && handleTrigger(pendingTriggerId)}
        onCancel={() => setPendingTriggerId(null)}
      />

      {/* RESET Line Confirm Modal (Decision 1 Option A) */}
      <ConfirmModal
        isOpen={showResetConfirm}
        title="XÁC NHẬN MỞ KHÓA LINE"
        message={`Bạn có chắc muốn mở khóa ${config.lineName} về trạng thái IDLE không? Nút GỌI LỆNH sẽ được kích hoạt lại cho cả 2 Station của Line.`}
        confirmText="MỞ KHÓA"
        cancelText="HỦY"
        variant="warning"
        isLoading={isResetting}
        onConfirm={handleConfirmReset}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
};
