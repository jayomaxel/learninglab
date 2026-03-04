
import React, { useRef, useState, useEffect } from 'react';
import { parseDictionaryFileStream, previewDictionaryFile } from '../services/fileParser';
import { Language, DictionarySource } from '../types';
import { db } from '../services/db';
import { downloadAndImportDictionary } from '../services/sync';
import { DictionaryImportDeduper } from '../services/dictionaryDedup';
import { checkProxyHealth } from '../services/gemini';

interface SettingsModalProps {
    onClose: () => void;
    currentAppLanguage: Language;
    onCacheRefreshNeeded: () => void;
}

const RECOMMENDED_DICTS: Record<Language, { name: string, url: string, size: string }[]> = {
    'KR': [
        { name: '韩汉大词典 (KR-CN)', url: 'https://raw.githubusercontent.com/e9t/korean-hanja-dictionary/master/korean_hanja.csv', size: '~2MB' } // Placeholder URL
    ],
    'EN': [],
    'FR': []
};

type SettingsTab = Language | 'API';
const SETTINGS_TAB_KEY = 'settings_modal_selected_tab';
const VALID_TABS: SettingsTab[] = ['EN', 'FR', 'KR', 'API'];

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, currentAppLanguage, onCacheRefreshNeeded }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('');

    const initialTab = (() => {
        const saved = localStorage.getItem(SETTINGS_TAB_KEY) as SettingsTab | null;
        if (saved && VALID_TABS.includes(saved))
            return saved;
        return currentAppLanguage;
    })();

    const [selectedTab, setSelectedTab] = useState<SettingsTab>(initialTab);
    const [dictionaries, setDictionaries] = useState<DictionarySource[]>([]);
    const [newDictName, setNewDictName] = useState('');
    const [importMode, setImportMode] = useState(false);
    const [proxyCheckLoading, setProxyCheckLoading] = useState(false);
    const [proxyCheckMessage, setProxyCheckMessage] = useState('');

    // Preview State
    const [previewData, setPreviewData] = useState<{ word: string, translation: string }[] | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    useEffect(() => {
        if (selectedTab === 'API')
            return;
        loadDictionaries();
    }, [selectedTab]);

    useEffect(() => {
        localStorage.setItem(SETTINGS_TAB_KEY, selectedTab);
    }, [selectedTab]);

    const loadDictionaries = async () => {
        if (selectedTab === 'API') {
            setDictionaries([]);
            return;
        }
        const list = await db.getDictionaries(selectedTab);
        setDictionaries(list);
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setSelectedFile(file);
        if (!newDictName) setNewDictName(file.name.split('.')[0]);

        // Generate Preview
        try {
            const preview = await previewDictionaryFile(file);
            setPreviewData(preview);
        } catch (err) {
            setStatus('读取文件预览失败。');
        }
    };

    const handleDownloadDict = async (url: string, name: string) => {
        if (selectedTab === 'API')
            return;
        setLoading(true);
        setStatus('正在初始化流式导入...');
        setProgress(0);
        try {
            await downloadAndImportDictionary(url, name, selectedTab, (msg, pct) => {
                setStatus(msg);
                setProgress(pct);
            });
            onCacheRefreshNeeded();
            loadDictionaries();
            setTimeout(() => setLoading(false), 1500);
        } catch (e: any) {
            setStatus('下载失败：' + e.message);
            setTimeout(() => setLoading(false), 3000);
        }
    };

    const confirmImport = async () => {
        if (!selectedFile) return;
        if (selectedTab === 'API') return;

        setLoading(true);
        setProgress(0);
        setStatus('正在初始化本地词库存储...');
        setPreviewData(null); // Clear preview to show progress

        try {
            const dictId = await db.createDictionary(newDictName, selectedTab, 'IMPORTED');
            const deduper = new DictionaryImportDeduper();
            let importedCount = 0;
            let droppedCount = 0;

            const { total, bloomBuffer } = await parseDictionaryFileStream(
                selectedFile,
                (percent, count) => {
                    setProgress(percent);
                    setStatus(`正在导入... ${count.toLocaleString()} 条词条`);
                },
                async (batch) => {
                    const { entries, dropped } = deduper.dedupeBatch(batch);
                    droppedCount += dropped;
                    if (entries.length > 0) {
                        const { inserted, duplicates } = await db.importBatchToDict(entries, dictId);
                        importedCount += inserted;
                        droppedCount += duplicates;
                    }
                }
            );

            if (bloomBuffer) {
                // bloomBuffer actually contains Cuckoo filter buckets now
                // We can't easily merge simple cuckoo filters without rebuild, 
                // but we can replace or implement a re-insertion logic.
                // For now, let's acknowledge the transition.
            }

            setStatus(
                `导入完成：新增 ${importedCount.toLocaleString()} 条唯一词条，跳过 ${droppedCount.toLocaleString()} 条重复项（原始总数 ${total.toLocaleString()}）。`
            );
            onCacheRefreshNeeded();
            setTimeout(() => {
                setImportMode(false);
                setLoading(false);
                setNewDictName('');
                setSelectedFile(null);
                loadDictionaries();
            }, 1000);

        } catch (err: any) {
            setStatus('导入失败：' + err.message);
            console.error(err);
            setLoading(false);
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const toggleDictionary = async (dict: DictionarySource) => {
        const updated = { ...dict, enabled: !dict.enabled };
        await db.updateDictionaryMeta(updated);
        onCacheRefreshNeeded();
        loadDictionaries();
    };

    const handleProxyCheck = async () => {
        const proxyUrl = (localStorage.getItem('GEMINI_PROXY_URL') || '').trim();
        setProxyCheckLoading(true);
        setProxyCheckMessage('');
        try {
            const result = await checkProxyHealth(proxyUrl);
            if (result.ok) {
                setProxyCheckMessage(`连接成功：${result.url}`);
            } else {
                const reason = result.body?.error || `HTTP ${result.status}`;
                setProxyCheckMessage(`连接失败：${reason}`);
            }
        } catch (err: any) {
            setProxyCheckMessage(`连接失败：${err?.message || '未知错误'}`);
        } finally {
            setProxyCheckLoading(false);
        }
    };

    const deleteDictionary = async (dict: DictionarySource) => {
        if (!confirm(`警告：该操作不可撤销。\n\n是否永久删除“${dict.name}”及其全部 ${dict.count.toLocaleString()} 条词条？`)) return;
        try {
            await db.deleteDictionary(dict.id);
            onCacheRefreshNeeded();
            await loadDictionaries();
            setStatus(`已删除“${dict.name}”。`);
        } catch (err: any) {
            setStatus(`删除失败：${err?.message || '未知错误'}`);
        }
    };

    const clearDictionary = async (dict: DictionarySource) => {
        if (!confirm(`确认清空“${dict.name}”中的 ${dict.count.toLocaleString()} 条词条吗？将保留词典名称和优先级等元数据。`)) return;
        try {
            await db.clearDictionaryEntries(dict.id);
            onCacheRefreshNeeded();
            await loadDictionaries();
            setStatus(`已清空“${dict.name}”的词条。`);
        } catch (err: any) {
            setStatus(`清空失败：${err?.message || '未知错误'}`);
        }
    };

    const movePriority = async (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === dictionaries.length - 1) return;

        const newOrder = [...dictionaries];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];

        // Update priority numbers based on new index
        const updates = newOrder.map((d, i) => ({ ...d, priority: i }));
        for (const dict of updates) {
            await db.updateDictionaryMeta(dict);
        }
        setDictionaries(updates);
    };

    const disableAll = async () => {
        const updates = dictionaries.map(d => ({ ...d, enabled: false }));
        for (const dict of updates) await db.updateDictionaryMeta(dict);
        setDictionaries(updates);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-4xl bg-white rounded-[32px] border border-slate-200 shadow-2xl overflow-hidden flex flex-col h-[85vh] animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white z-10">
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                            <span className="bg-slate-900 text-white px-2 py-0.5 rounded text-sm tracking-widest">VFS</span> 词典中心
                        </h3>
                        <p className="text-slate-500 text-sm mt-1 font-medium">管理本地词典、检索优先级与导入任务。</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-900 transition-all" title="关闭设置" aria-label="关闭设置对话框">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Layout */}
                <div className="flex flex-1 overflow-hidden">
                    <div className="w-24 bg-slate-50 border-r border-slate-100 flex flex-col items-center py-6 gap-4">
                        {(['EN', 'FR', 'KR'] as Language[]).map(lang => (
                            <button
                                key={lang}
                                onClick={() => setSelectedTab(lang)}
                                className={`w-14 h-14 rounded-2xl flex items-center justify-center text-sm font-black transition-all ${selectedTab === lang ? 'bg-white shadow-lg text-indigo-600 scale-110 border border-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                {lang}
                            </button>
                        ))}
                        <div className="h-px w-10 bg-slate-200 my-2" />
                        <button
                            onClick={() => setSelectedTab('API')}
                            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${selectedTab === 'API' ? 'bg-white shadow-lg text-indigo-600 scale-110 border border-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 flex flex-col bg-slate-50/50 relative overflow-y-auto">
                        {selectedTab === 'API' ? (
                            <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-2">
                                <div>
                                    <h4 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                        <span className="bg-orange-100 text-orange-600 p-1.5 rounded-lg"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg></span>
                                        安全与接口配置
                                    </h4>
                                    <p className="text-slate-500 text-sm mt-2">为避免接口密钥泄漏，建议优先使用代理转发或本地自带密钥方案。</p>
                                </div>

                                <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Gemini 接口密钥</label>
                                        <input
                                            type="password"
                                            value={localStorage.getItem('GEMINI_API_KEY') || ''}
                                            onChange={(e) => {
                                                localStorage.setItem('GEMINI_API_KEY', e.target.value);
                                                setNewDictName(n => n); // Dummy set to force re-render
                                            }}
                                            placeholder="请输入接口密钥"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-indigo-500"
                                        />
                                        <p className="text-[10px] text-slate-400">仅保存在当前浏览器本地，请勿将密钥硬编码到源码中。</p>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">后端代理地址（可选）</label>
                                        <input
                                            value={localStorage.getItem('GEMINI_PROXY_URL') || ''}
                                            onChange={(e) => {
                                                localStorage.setItem('GEMINI_PROXY_URL', e.target.value);
                                                setNewDictName(n => n);
                                            }}
                                            placeholder="例如：http://localhost:3001/api/proxy"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-indigo-500"
                                        />
                                        <p className="text-[10px] text-slate-400">设置后，请求将通过你的后端转发，从而隐藏接口密钥。</p>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">代理访问令牌</label>
                                        <input
                                            type="password"
                                            value={localStorage.getItem('GEMINI_PROXY_TOKEN') || ''}
                                            onChange={(e) => {
                                                localStorage.setItem('GEMINI_PROXY_TOKEN', e.target.value);
                                                setNewDictName(n => n);
                                            }}
                                            placeholder="用于 /api/proxy 的访问令牌"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-indigo-500"
                                        />
                                        <p className="text-[10px] text-slate-400">启用代理地址后，该令牌会作为授权请求头发送。</p>
                                    </div>

                                    <div className="pt-2">
                                        <button
                                            onClick={handleProxyCheck}
                                            disabled={proxyCheckLoading}
                                            className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 disabled:opacity-50"
                                        >
                                            {proxyCheckLoading ? '检测中...' : '检测代理连接'}
                                        </button>
                                        {proxyCheckMessage && (
                                            <p className="mt-2 text-xs text-slate-500">{proxyCheckMessage}</p>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-indigo-50 p-6 rounded-[24px] border border-indigo-100 flex gap-4">
                                    <div className="bg-indigo-100 text-indigo-600 p-3 rounded-2xl h-fit">
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </div>
                                    <div>
                                        <h5 className="font-bold text-indigo-900 text-sm">部署提示</h5>
                                        <p className="text-indigo-700/70 text-xs mt-1 leading-relaxed">
                                            部署到公网环境时，建议在设置里留空接口密钥，并改用代理地址。
                                            代理服务端应通过环境变量保存 `API_KEY`。
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="p-6 pb-0">
                                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center mb-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">当前分区：</span>
                                            <span className="font-black text-slate-800 text-lg">{selectedTab}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={disableAll} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all" title="禁用全部词典" aria-label="批量禁用全部词典">批量禁用</button>
                                            <button
                                                onClick={() => { setImportMode(!importMode); setPreviewData(null); setSelectedFile(null); }}
                                                className={`px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${importMode ? 'bg-slate-200 text-slate-600' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200'}`}
                                                title={importMode ? "取消导入" : "导入词典"}
                                                aria-label={importMode ? "取消导入词典" : "导入新词典"}
                                            >
                                                {importMode ? '取消导入' : '导入新词典'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Store / Recommended Section */}
                                    {!importMode && RECOMMENDED_DICTS[selectedTab].length > 0 && (
                                        <div className="mb-4">
                                            <div className="flex items-center gap-2 mb-2 px-1">
                                                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">推荐词典</span>
                                                <div className="h-px bg-slate-200 flex-1"></div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {RECOMMENDED_DICTS[selectedTab].map((rec, i) => {
                                                    const isInstalled = dictionaries.some(d => d.name === rec.name);
                                                    return (
                                                        <div key={i} className="bg-white p-3 rounded-xl border border-indigo-100 shadow-sm flex items-center justify-between">
                                                            <div>
                                                                <div className="font-bold text-slate-800 text-sm">{rec.name}</div>
                                                                <div className="text-[10px] text-slate-400">{rec.size} • 云端同步</div>
                                                            </div>
                                                            <button
                                                                onClick={() => handleDownloadDict(rec.url, rec.name)}
                                                                disabled={isInstalled || loading}
                                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isInstalled ? 'bg-green-100 text-green-600' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
                                                            >
                                                                {isInstalled ? '已安装' : '下载'}
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Progress Bar (Global for Import/Sync) */}
                                    {loading && (
                                        <div className="bg-white p-4 rounded-2xl border border-indigo-100 shadow-lg mb-4 animate-pulse">
                                            <div className="flex justify-between text-xs font-bold text-indigo-600 mb-2"><span>{status}</span><span>{Math.round(progress)}%</span></div>
                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div></div>
                                        </div>
                                    )}
                                    {!loading && status && (
                                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm mb-4 text-xs text-slate-600">
                                            {status}
                                        </div>
                                    )}

                                    {importMode && (
                                        <div className="bg-white p-6 rounded-3xl border border-indigo-100 shadow-xl relative overflow-hidden mb-6 animate-in slide-in-from-top-2">
                                            <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500" />
                                            <h4 className="text-lg font-bold text-slate-800 mb-4">导入词典数据</h4>

                                            {/* Import Inputs */}
                                            <div className="flex gap-4 items-end mb-4">
                                                <div className="flex-1 space-y-2">
                                                    <label className="text-xs font-bold text-slate-500">名称（可选）</label>
                                                    <input
                                                        value={newDictName}
                                                        onChange={e => setNewDictName(e.target.value)}
                                                        placeholder="例如：牛津高阶..."
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-indigo-500"
                                                    />
                                                </div>
                                                <div className="flex-1 space-y-2">
                                                    <label className="text-xs font-bold text-slate-500">来源文件（CSV/TXT）</label>
                                                    <div className="relative">
                                                        <input type="file" accept=".csv,.txt" ref={fileInputRef} onChange={handleFileSelect} className="hidden" id="dict-upload" />
                                                        <label htmlFor="dict-upload" className={`block w-full text-center px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer text-sm font-bold transition-all ${loading ? 'bg-slate-100 border-slate-300 text-slate-400' : 'bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100'}`}>
                                                            {loading ? '处理中...' : (selectedFile ? selectedFile.name : '选择文件')}
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Preview Section */}
                                            {previewData && !loading && (
                                                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 mb-4">
                                                    <h5 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">预览（前 5 行）</h5>
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-left border-collapse">
                                                            <thead>
                                                                <tr className="text-xs text-slate-400 border-b border-slate-200">
                                                                    <th className="py-1 px-2">单词</th>
                                                                    <th className="py-1 px-2">解析后释义</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {previewData.slice(0, 5).map((row, i) => (
                                                                    <tr key={i} className="text-xs font-medium text-slate-700 border-b border-slate-100 last:border-0">
                                                                        <td className="py-2 px-2 font-bold">{row.word}</td>
                                                                        <td className="py-2 px-2 truncate max-w-[200px]">{row.translation}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                    <div className="mt-4 flex justify-end">
                                                        <button onClick={confirmImport} className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-bold shadow-md transition-all" title="确认并导入词典" aria-label="确认导入词典">
                                                            预览无误，开始导入
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="p-6 pt-0 flex-1 overflow-y-auto custom-scrollbar space-y-3">
                                    {dictionaries.length === 0 ? (
                                        <div className="text-center py-20 opacity-50">
                                            <p className="text-xl font-bold text-slate-400">暂无词典。</p>
                                        </div>
                                    ) : (
                                        dictionaries.map((dict, idx) => (
                                            <div key={dict.id} className={`bg-white p-4 rounded-2xl border transition-all flex items-center justify-between group ${dict.enabled ? 'border-slate-200 shadow-sm' : 'border-slate-100 opacity-60 bg-slate-50'}`}>
                                                <div className="flex items-center gap-4">
                                                    <div className="flex flex-col items-center gap-1 text-slate-300 w-6">
                                                        <button onClick={() => movePriority(idx, 'up')} disabled={idx === 0} className="hover:text-indigo-600 disabled:opacity-30" title="上移" aria-label={`上移 ${dict.name}`}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" /></svg></button>
                                                        <span className="text-[10px] font-black">{idx + 1}</span>
                                                        <button onClick={() => movePriority(idx, 'down')} disabled={idx === dictionaries.length - 1} className="hover:text-indigo-600 disabled:opacity-30" title="下移" aria-label={`下移 ${dict.name}`}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg></button>
                                                    </div>
                                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg shadow-sm ${dict.type === 'USER' ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500'}`}>
                                                        {dict.name.substring(0, 1).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-slate-800">{dict.name}</h4>
                                                        <div className="flex items-center gap-3 text-xs font-medium text-slate-400">
                                                            <span className="bg-slate-100 px-1.5 rounded text-slate-600 font-bold border border-slate-200">{dict.count.toLocaleString()} 条词条</span>
                                                            <span>{new Date(dict.importedAt).toLocaleDateString()}</span>
                                                            {dict.type === 'USER' && <span className="text-green-600 font-bold">可写入</span>}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-6">
                                                    <label className="relative inline-flex items-center cursor-pointer">
                                                        <input type="checkbox" checked={dict.enabled} onChange={() => toggleDictionary(dict)} className="sr-only peer" />
                                                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                                                    </label>

                                                    <div className="flex items-center gap-1">
                                                        <button onClick={() => clearDictionary(dict)} className="p-2 text-slate-300 hover:text-orange-500 transition-colors" title="清空词条">
                                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                        </button>
                                                        <button onClick={() => deleteDictionary(dict)} className="p-2 text-slate-300 hover:text-red-600 transition-colors" title="删除词典">
                                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
