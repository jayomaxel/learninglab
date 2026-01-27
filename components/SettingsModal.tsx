
import React from 'react';

interface SettingsModalProps {
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-slate-900/60"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-lg bg-white rounded-[32px] p-6 sm:p-8 border border-slate-200 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-2xl font-bold text-slate-800 tracking-tight">系统设置</h3>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-800 transition-all"
          >
            关闭
          </button>
        </div>

        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200">
            <h4 className="text-xs font-bold text-green-600 uppercase tracking-widest mb-3">API 连接状态</h4>
            <p className="text-sm text-slate-600 leading-relaxed mb-4">
              LinguistFlow AI 使用 Gemini API 提供支持。
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-white border border-slate-200">
              <p className="text-sm font-bold text-slate-800">默认模型</p>
              <div className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 font-mono font-bold">
                gemini-3-pro
              </div>
            </div>
          </div>
        </div>

        <button 
          onClick={onClose}
          className="w-full mt-8 py-4 rounded-2xl bg-green-400 hover:bg-green-500 text-white font-bold transition-all"
        >
          保存并关闭
        </button>
      </div>
    </div>
  );
};

export default SettingsModal;
