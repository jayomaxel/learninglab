import React from 'react';

export interface VocabularyManagerSourceItem {
  id: string;
  name: string;
  count: number;
  type: 'ALL' | 'LOCAL' | 'DICT';
  enabled?: boolean;
}

export interface VocabularyManagerMeaningGroup {
  sourceId: string;
  sourceName: string;
  meanings: string[];
}

export interface VocabularyManagerRow {
  id: string;
  word: string;
  pos?: string;
  meanings: VocabularyManagerMeaningGroup[];
  sources: string[];
  example?: string;
  localItemIds?: string[];
}

interface VocabularyManagerTableProps {
  sources: VocabularyManagerSourceItem[];
  selectedSourceId: string;
  onSelectSource: (sourceId: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  rows: VocabularyManagerRow[];
  loading?: boolean;
  onRemoveLocalWords?: (itemIds: string[]) => void;
}

const VocabularyManagerTable: React.FC<VocabularyManagerTableProps> = ({
  sources,
  selectedSourceId,
  onSelectSource,
  search,
  onSearchChange,
  rows,
  loading = false,
  onRemoveLocalWords,
}) => {
  return (
    <div className="bg-white border border-green-200 rounded-2xl overflow-hidden">
      <div className="grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)] min-h-[540px]">
        <aside className="border-b xl:border-b-0 xl:border-r border-green-100 bg-green-50/50 p-3">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-500 px-2 py-1">词库列表</p>
          <div className="space-y-1.5 mt-1 max-h-[240px] xl:max-h-[calc(100vh-320px)] overflow-auto pr-1">
            {sources.map((source) => {
              const active = source.id === selectedSourceId;
              return (
                <button
                  key={source.id}
                  onClick={() => onSelectSource(source.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
                    active
                      ? 'border-green-300 bg-white text-green-700'
                      : 'border-transparent text-slate-600 hover:bg-white hover:border-green-200'
                  }`}
                  title={`切换到 ${source.name}`}
                  aria-label={`切换到 ${source.name}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold truncate">{source.name}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-500">
                      {source.count}
                    </span>
                  </div>
                  {source.type === 'DICT' && (
                    <p className={`text-[10px] mt-1 ${source.enabled ? 'text-green-600' : 'text-slate-400'}`}>
                      {source.enabled ? '已启用' : '未启用'}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        <section className="min-w-0 p-4 lg:p-5">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-3 items-start mb-3">
            <div className="min-w-0">
              <h3 className="text-lg font-black text-slate-900">词条管理</h3>
              <p className="text-xs text-slate-500 mt-0.5">同词自动合并，来源信息在来源列展示。</p>
            </div>
            <div className="min-w-0">
              <input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="搜索单词 / 释义 / 来源"
                className="w-full bg-white border border-green-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-green-400"
                aria-label="搜索词条"
              />
            </div>
          </div>

          <div className="text-xs text-slate-500 mb-2">共 {rows.length.toLocaleString()} 条</div>

          <div className="border border-green-100 rounded-xl overflow-hidden">
            <div className="overflow-auto max-h-[420px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-green-50 z-10">
                  <tr className="text-left text-[11px] font-black uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2 w-14">#</th>
                    <th className="px-3 py-2 min-w-[160px]">单词</th>
                    <th className="px-3 py-2 w-20">词性</th>
                    <th className="px-3 py-2 min-w-[340px]">中文释义</th>
                    <th className="px-3 py-2 min-w-[180px]">来源</th>
                    <th className="px-3 py-2 min-w-[260px]">例句/上下文</th>
                    <th className="px-3 py-2 w-24">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                        正在加载词库...
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                        没有匹配的词条
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, idx) => (
                      <tr key={row.id} className="border-t border-green-50 align-top">
                        <td className="px-3 py-2.5 text-slate-400">{idx + 1}</td>
                        <td className="px-3 py-2.5">
                          <span className="font-bold text-slate-900">{row.word}</span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-500">{row.pos || '-'}</td>
                        <td className="px-3 py-2.5">
                          {(() => {
                            const merged = Array.from(
                              new Set(row.meanings.flatMap((group) => group.meanings.map((m) => m.trim()).filter(Boolean)))
                            );
                            return (
                              <span className="text-[12px] text-slate-600">
                                {merged.length > 0 ? merged.join('；') : '-'}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1.5">
                            {row.sources.map((sourceName) => (
                              <span
                                key={`${row.id}_${sourceName}`}
                                className="px-2 py-0.5 rounded-full text-[10px] border border-slate-200 text-slate-500 bg-slate-50"
                              >
                                {sourceName}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-[12px] text-slate-500">{row.example || '-'}</td>
                        <td className="px-3 py-2.5">
                          {onRemoveLocalWords && row.localItemIds && row.localItemIds.length > 0 ? (
                            <button
                              onClick={() => onRemoveLocalWords(row.localItemIds || [])}
                              className="px-2.5 py-1 rounded-lg border border-red-200 text-red-600 text-[11px] font-bold hover:bg-red-50"
                              title="删除本地词条"
                              aria-label="删除本地词条"
                            >
                              删除
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default VocabularyManagerTable;
