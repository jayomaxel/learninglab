import React from 'react';

interface KeyboardShortcutsProps {
  onClose: () => void;
}

const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = ({ onClose }) => {
  const groups = [
    { title: '通用', keys: [{ key: 'Ctrl + T', desc: '切换 听力/阅读 模式' }, { key: 'Ctrl + 1/2/3', desc: '切换 英语/法语/韩语' }, { key: '?', desc: '显示/隐藏此帮助' }] },
    { title: '听力实验室', keys: [{ key: 'Space', desc: '在输入框中确认单词' }, { key: 'Ctrl + P', desc: '重听当前片段' }, { key: 'Ctrl + →', desc: '跳过当前片段' }, { key: 'Esc', desc: '显示/隐藏原文' }] },
    { title: '极速阅读', keys: [{ key: 'Space', desc: '开始/暂停 播放' }, { key: 'Ctrl + ↑/↓', desc: '调整 WPM 速度' }, { key: 'Ctrl + Backspace', desc: '重置阅读器' }, { key: 'Esc', desc: '全文翻译' }] }
  ];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-[32px] p-8 border border-slate-200 shadow-2xl">
        <h3 className="text-xl font-bold text-slate-900 mb-6">键盘快捷键</h3>
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.title}>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-1">{group.title}</h4>
              <div className="space-y-2">
                {group.keys.map(item => (
                  <div key={item.key} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">{item.desc}</span>
                    <kbd className="px-2 py-1 bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-mono font-bold text-slate-500">{item.key}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="w-full mt-8 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm transition-all">知道了</button>
      </div>
    </div>
  );
};

export default KeyboardShortcuts;