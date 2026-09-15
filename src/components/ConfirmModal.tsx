import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'primary' | 'warning' | 'danger';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'XÁC NHẬN',
  cancelText = 'HỦY',
  variant = 'primary',
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const getButtonBg = () => {
    switch (variant) {
      case 'warning':
        return 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white';
      case 'danger':
        return 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white';
      default:
        return 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white';
    }
  };

  return (
    <div
      id="confirm-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div
        id="confirm-modal-content"
        className="w-full max-w-sm bg-slate-50 border-2 border-slate-300 rounded-2xl shadow-2xl p-5 text-slate-900"
      >
        <div className="flex items-center gap-3 mb-3">
          {variant === 'warning' || variant === 'danger' ? (
            <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-600 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          )}
          <h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2>
        </div>

        <p className="text-slate-700 text-base leading-relaxed mb-6 font-normal">
          {message}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <button
            id="modal-cancel-btn"
            type="button"
            disabled={isLoading}
            onClick={onCancel}
            className="w-full min-h-[52px] px-4 py-3 rounded-xl font-semibold text-base bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 border border-slate-300 transition-colors"
          >
            {cancelText}
          </button>
          <button
            id="modal-confirm-btn"
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className={`w-full min-h-[52px] px-4 py-3 rounded-xl font-bold text-base shadow-lg transition-colors flex items-center justify-center ${getButtonBg()}`}
          >
            {isLoading ? (
              <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
