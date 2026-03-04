import React, { useEffect, useState } from 'react';
import { CEFRLevel, VocabularyItem } from '../types';

const GenderBadge: React.FC<{ gender: 'M' | 'F' }> = ({ gender }) => (
  <span
    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ml-2 ${
      gender === 'F'
        ? 'text-rose-600 bg-rose-50 border-rose-200'
        : 'text-green-600 bg-green-50 border-green-200'
    }`}
  >
    {gender === 'F' ? '阴性' : '阳性'}
  </span>
);

const SpeechLevelBadge: React.FC<{ level: string }> = ({ level }) => (
  <span className="px-2 py-0.5 rounded bg-green-50 text-green-600 border border-green-200 text-[9px] font-bold uppercase ml-2">
    {level}
  </span>
);

interface VocabularyBankProps {
  items: VocabularyItem[];
  onRemove: (id: string) => void;
  onUpdateStrength: (id: string, isCorrect: boolean) => void;
  level: CEFRLevel;
  reviewMode?: boolean;
}

const VocabularyBank: React.FC<VocabularyBankProps> = ({
  items,
  onRemove,
  onUpdateStrength,
  reviewMode = false,
}) => {
  const [revealed, setRevealed] = useState<string | null>(null);
  const currentItem = reviewMode ? items[0] : null;

  useEffect(() => {
    if (!reviewMode || !currentItem) return;
    if (revealed !== currentItem.id) {
      setRevealed(null);
    }
  }, [reviewMode, currentItem?.id, revealed]);

  useEffect(() => {
    if (!reviewMode || !currentItem) return;

    const handler = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (key === ' ') {
        event.preventDefault();
        setRevealed((prev) => (prev === currentItem.id ? null : currentItem.id));
      }

      if (revealed === currentItem.id && key === '1') {
        event.preventDefault();
        onUpdateStrength(currentItem.id, false);
        setRevealed(null);
      }

      if (revealed === currentItem.id && key === '2') {
        event.preventDefault();
        onUpdateStrength(currentItem.id, true);
        setRevealed(null);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [reviewMode, currentItem?.id, revealed, onUpdateStrength]);

  if (reviewMode) {
    if (!currentItem) {
      return (
        <div className="bg-white border-2 border-dashed border-green-200 rounded-xl p-10 text-center">
          <p className="text-slate-700 font-bold mb-2">今日复习完成</p>
          <p className="text-slate-500 text-sm">当前没有需要复习的卡片。</p>
        </div>
      );
    }

    const isRevealed = revealed === currentItem.id;
    const answer = currentItem.translation || currentItem.contextSentence || '暂无释义';

    return (
      <div className="space-y-3">
        <div className="text-xs text-slate-500 font-semibold">
          复习队列：{items.length} 张卡片 · 快捷键 `Space` 翻面，`1` 模糊，`2` 认识
        </div>

        <div
          onClick={() => setRevealed(isRevealed ? null : currentItem.id)}
          className={`p-8 rounded-3xl border-2 bg-white min-h-[300px] flex flex-col justify-between cursor-pointer ${
            isRevealed ? 'border-green-500' : 'border-green-100 hover:border-green-300'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-4xl font-black text-slate-900 tracking-tight">{currentItem.word}</p>
              <p className="text-xs text-slate-400 mt-2">{isRevealed ? '答案已显示' : '点击卡片显示答案'}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(currentItem.id);
              }}
              className="text-slate-300 hover:text-red-500"
              title="删除词条"
              aria-label="删除词条"
            >
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mt-6 min-h-[100px]">
            {isRevealed ? (
              <p className="text-3xl text-slate-600 italic leading-relaxed">"{answer}"</p>
            ) : (
              <p className="text-slate-300 text-sm">翻面后可评分</p>
            )}
          </div>

          <div className="flex gap-3 pt-8">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isRevealed) return;
                onUpdateStrength(currentItem.id, false);
                setRevealed(null);
              }}
              disabled={!isRevealed}
              className="flex-1 py-3 rounded-xl text-lg font-bold border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
            >
              模糊
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isRevealed) return;
                onUpdateStrength(currentItem.id, true);
                setRevealed(null);
              }}
              disabled={!isRevealed}
              className="flex-1 py-3 rounded-xl bg-green-600 text-white text-lg font-bold disabled:opacity-50"
            >
              认识
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {items.map((item) => {
        const isRevealed = revealed === item.id;
        const detail = item.translation || item.contextSentence || '暂无释义';

        return (
          <div
            key={item.id}
            onClick={() => setRevealed(isRevealed ? null : item.id)}
            className={`p-6 rounded-2xl border-2 transition-all cursor-pointer min-h-[200px] flex flex-col justify-between bg-white ${
              isRevealed ? 'border-green-500' : 'border-green-100 hover:border-green-300'
            }`}
          >
            <div className="flex justify-between items-start">
              <div className="flex items-center flex-wrap gap-1">
                <span className="text-xl font-bold text-slate-800">{item.word}</span>
                {item.metadata?.gender && <GenderBadge gender={item.metadata.gender} />}
                {item.metadata?.speechLevel && <SpeechLevelBadge level={item.metadata.speechLevel} />}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item.id);
                }}
                className="text-slate-300 hover:text-red-500"
                title="删除词条"
                aria-label="删除词条"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 flex-1">
              <p className={`text-sm text-slate-500 italic leading-relaxed ${isRevealed ? '' : 'line-clamp-3'}`}>
                "{detail}"
              </p>
            </div>

            {isRevealed && (
              <div className="flex gap-2 pt-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateStrength(item.id, false);
                    setRevealed(null);
                  }}
                  className="flex-1 py-1.5 rounded-lg text-[10px] font-bold border border-slate-200 text-slate-400 hover:bg-slate-50"
                >
                  模糊
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateStrength(item.id, true);
                    setRevealed(null);
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-green-600 text-white text-[10px] font-bold"
                >
                  认识
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default VocabularyBank;
