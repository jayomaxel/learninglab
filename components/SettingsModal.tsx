
import React, { useRef, useState } from 'react';
import { parseDictionaryFileInWorker } from '../services/fileParser';
import { DictionaryEntry } from '../types';

interface SettingsModalProps {
  onClose: () => void;
  localDictSize: number;
  onImportDict: (entries: DictionaryEntry[], onProgress: (p: number) => void) => Promise<void>;
  onClearDict: () => Promise<void>;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, localDictSize, onImportDict, onClearDict }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [msg, setMsg] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setProgress(0);
    setStatus('初始化 Worker...');
    setMsg('');

    try {
      // 1. Worker Parse
      const entries = await parseDictionaryFileInWorker(file, (p, s) => {
        setProgress(p * 0.5); // Parser is first 50% of total visual progress (0-50)
        setStatus(s || '解析文件中...');
      });
      
      // 2. Import to IndexedDB
      setStatus(`正在导入数据库 (${entries.length} 条)...`);
      await onImportDict(entries, (dbPercent) => {
          // DB Import is second 50% (50-100)
          setProgress(50 + (dbPercent * 0.5));
      });
      
      setMsg(`成功导入 ${entries.length} 个词条！`);
      setProgress(100);
      setStatus('完成');
    } catch (err: any) {
      setMsg(err.message || '导入失败');
      setStatus('错误');
      console.error(err);
    } finally {
      setLoading(false);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  
  const handleClear = async () => {
      setLoading(true);
      setStatus('正在清空...');
      try {
          await onClearDict();
          setMsg('词库已清空');
      } finally {
          setLoading(false);
          setStatus('');
      }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-slate-900/60"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-lg bg-white rounded-[32px] p-6 sm:p-8 border border-slate-200 animate-in zoom-in-95 duration-200 shadow-2xl">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-2xl font-bold text-slate-800 tracking-tight">系统设置</h3>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-800 transition-all"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
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
             {/* Offline Dictionary Section */}
             <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                   <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                     <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                     离线词库 (Local Dictionary)
                   </h4>
                   <span className="text-xs font-mono font-bold text-slate-400">{localDictSize.toLocaleString()} entries (当前语言)</span>
                </div>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  导入 JSON 或 CSV 词表。使用 Web Worker 后台解析 + IndexedDB 事务分块存储，支持百万级词条。
                </p>
                
                <div className="flex gap-3">
                   <input 
                     type="file" 
                     accept=".json,.csv,.txt" 
                     ref={fileInputRef} 
                     className="hidden" 
                     onChange={handleFileChange}
                   />
                   <button 
                     onClick={() => fileInputRef.current?.click()}
                     disabled={loading}
                     className="flex-1 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-xs font-bold transition-all border border-indigo-100 disabled:opacity-50"
                   >
                     {loading ? '后台处理中...' : '导入词库'}
                   </button>
                   {localDictSize > 0 && (
                     <button 
                       onClick={handleClear}
                       disabled={loading}
                       className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl text-xs font-bold transition-all border border-red-100 disabled:opacity-50"
                     >
                       清空
                     </button>
                   )}
                </div>

                {/* Progress Bar */}
                {loading && (
                    <div className="mt-4 space-y-2">
                        <div className="flex justify-between text-xs font-bold text-slate-500">
                            <span>{status}</span>
                            <span>{Math.round(progress)}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
                        </div>
                    </div>
                )}
                
                {msg && !loading && <p className="text-xs text-green-600 font-bold mt-2 text-center animate-pulse">{msg}</p>}
             </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-sm font-bold text-slate-800">默认模型</p>
              <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-600 font-mono font-bold">
                gemini-3-pro
              </div>
            </div>
          </div>
        </div>

        <button 
          onClick={onClose}
          className="w-full mt-8 py-4 rounded-2xl bg-green-400 hover:bg-green-500 text-white font-bold transition-all shadow-lg shadow-green-100"
        >
          保存并关闭
        </button>
      </div>
    </div>
  );
};

export default SettingsModal;
