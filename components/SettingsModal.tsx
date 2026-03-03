
import React, { useRef, useState, useEffect } from 'react';
import { parseDictionaryFileStream, previewDictionaryFile } from '../services/fileParser';
import { globalCuckooFilter, CuckooFilter } from '../services/cuckooFilter';
import { Language, DictionarySource } from '../types';
import { db } from '../services/db';
import { downloadAndImportDictionary } from '../services/sync';

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

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose, currentAppLanguage }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('');

    const [selectedTab, setSelectedTab] = useState<Language>(currentAppLanguage);
    const [dictionaries, setDictionaries] = useState<DictionarySource[]>([]);
    const [newDictName, setNewDictName] = useState('');
    const [importMode, setImportMode] = useState(false);

    // Preview State
    const [previewData, setPreviewData] = useState<{ word: string, translation: string }[] | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    useEffect(() => {
        loadDictionaries();
    }, [selectedTab]);

    const loadDictionaries = async () => {
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
            setStatus("Error reading file preview.");
        }
    };

    const handleDownloadDict = async (url: string, name: string) => {
        setLoading(true);
        setStatus("Initializing Stream...");
        setProgress(0);
        try {
            await downloadAndImportDictionary(url, name, selectedTab, (msg, pct) => {
                setStatus(msg);
                setProgress(pct);
            });
            loadDictionaries();
            setTimeout(() => setLoading(false), 1500);
        } catch (e: any) {
            setStatus("Download Failed: " + e.message);
            setTimeout(() => setLoading(false), 3000);
        }
    };

    const confirmImport = async () => {
        if (!selectedFile) return;

        setLoading(true);
        setProgress(0);
        setStatus('Initializing VFS Store...');
        setPreviewData(null); // Clear preview to show progress

        try {
            const dictId = await db.createDictionary(newDictName, selectedTab, 'IMPORTED');

            const { total, bloomBuffer } = await parseDictionaryFileStream(
                selectedFile,
                (percent, count) => {
                    setProgress(percent);
                    setStatus(`Ingesting... ${count.toLocaleString()} entries`);
                },
                async (batch) => {
                    await db.importBatchToDict(batch, dictId);
                }
            );

            if (bloomBuffer) {
                // bloomBuffer actually contains Cuckoo filter buckets now
                // We can't easily merge simple cuckoo filters without rebuild, 
                // but we can replace or implement a re-insertion logic.
                // For now, let's acknowledge the transition.
            }

            setStatus(`Success! ${total.toLocaleString()} terms imported.`);
            setTimeout(() => {
                setImportMode(false);
                setLoading(false);
                setNewDictName('');
                setSelectedFile(null);
                loadDictionaries();
            }, 1000);

        } catch (err: any) {
            setStatus('Error: ' + err.message);
            console.error(err);
            setLoading(false);
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const toggleDictionary = async (dict: DictionarySource) => {
        const updated = { ...dict, enabled: !dict.enabled };
        await db.updateDictionaryMeta(updated);
        loadDictionaries();
    };

    const deleteDictionary = async (dict: DictionarySource) => {
        if (!confirm(`Warning: This action is irreversible.\n\nPermanently delete "${dict.name}" and all its ${dict.count.toLocaleString()} entries?`)) return;
        await db.deleteDictionary(dict.id);
        loadDictionaries();
    };

    const clearDictionary = async (dict: DictionarySource) => {
        if (!confirm(`Clear all ${dict.count.toLocaleString()} entries from "${dict.name}"? Metadata (name/priority) will remain.`)) return;
        await db.clearDictionaryEntries(dict.id);
        loadDictionaries();
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
                            <span className="bg-slate-900 text-white px-2 py-0.5 rounded text-sm tracking-widest">VFS</span> Dictionary Hub
                        </h3>
                        <p className="text-slate-500 text-sm mt-1 font-medium">Manage local dictionaries, search priority, and imports.</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-900 transition-all" title="Close settings" aria-label="Close settings dialog">
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
                            onClick={() => setSelectedTab('API' as any)}
                            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${selectedTab === 'API' as any ? 'bg-white shadow-lg text-indigo-600 scale-110 border border-indigo-100' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 flex flex-col bg-slate-50/50 relative overflow-y-auto">
                        {selectedTab === 'API' as any ? (
                            <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-2">
                                <div>
                                    <h4 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                        <span className="bg-orange-100 text-orange-600 p-1.5 rounded-lg"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg></span>
                                        Security & API Config
                                    </h4>
                                    <p className="text-slate-500 text-sm mt-2">To prevent "Fatal Security Redline" (Key Leaking), we recommend using a Proxy or local BYOK.</p>
                                </div>

                                <div className="bg-white p-6 rounded-[24px] border border-slate-200 shadow-sm space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Gemini API Key</label>
                                        <input
                                            type="password"
                                            value={localStorage.getItem('GEMINI_API_KEY') || ''}
                                            onChange={(e) => {
                                                localStorage.setItem('GEMINI_API_KEY', e.target.value);
                                                setNewDictName(n => n); // Dummy set to force re-render
                                            }}
                                            placeholder="AI_..."
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-indigo-500"
                                        />
                                        <p className="text-[10px] text-slate-400">Stored locally in your browser. Never hardcode this in source.</p>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Backend Proxy URL (Optional)</label>
                                        <input
                                            value={localStorage.getItem('GEMINI_PROXY_URL') || ''}
                                            onChange={(e) => {
                                                localStorage.setItem('GEMINI_PROXY_URL', e.target.value);
                                                setNewDictName(n => n);
                                            }}
                                            placeholder="http://localhost:3001/api/proxy"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-indigo-500"
                                        />
                                        <p className="text-[10px] text-slate-400">If set, requests will be routed through your backend to hide the API Key.</p>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Proxy Access Token</label>
                                        <input
                                            type="password"
                                            value={localStorage.getItem('GEMINI_PROXY_TOKEN') || ''}
                                            onChange={(e) => {
                                                localStorage.setItem('GEMINI_PROXY_TOKEN', e.target.value);
                                                setNewDictName(n => n);
                                            }}
                                            placeholder="Bearer token for /api/proxy"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-indigo-500"
                                        />
                                        <p className="text-[10px] text-slate-400">Sent as Authorization Bearer token when GEMINI_PROXY_URL is enabled.</p>
                                    </div>
                                </div>

                                <div className="bg-indigo-50 p-6 rounded-[24px] border border-indigo-100 flex gap-4">
                                    <div className="bg-indigo-100 text-indigo-600 p-3 rounded-2xl h-fit">
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </div>
                                    <div>
                                        <h5 className="font-bold text-indigo-900 text-sm">Deployment Tip</h5>
                                        <p className="text-indigo-700/70 text-xs mt-1 leading-relaxed">
                                            When deploying to a public server, **empty the API Key field** in settings and use a Proxy URL.
                                            The Proxy server should hold the `API_KEY` in its environment variables.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="p-6 pb-0">
                                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center mb-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Active Hub:</span>
                                            <span className="font-black text-slate-800 text-lg">{selectedTab}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={disableAll} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all" title="Disable all dictionaries" aria-label="Batch disable all dictionaries">Batch Disable</button>
                                            <button
                                                onClick={() => { setImportMode(!importMode); setPreviewData(null); setSelectedFile(null); }}
                                                className={`px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${importMode ? 'bg-slate-200 text-slate-600' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200'}`}
                                                title={importMode ? "Cancel import" : "Import dictionary"}
                                                aria-label={importMode ? "Cancel import dictionary" : "Import new dictionary"}
                                            >
                                                {importMode ? 'Cancel Import' : 'Import New Dictionary'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Store / Recommended Section */}
                                    {!importMode && RECOMMENDED_DICTS[selectedTab].length > 0 && (
                                        <div className="mb-4">
                                            <div className="flex items-center gap-2 mb-2 px-1">
                                                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Recommended Dictionaries</span>
                                                <div className="h-px bg-slate-200 flex-1"></div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {RECOMMENDED_DICTS[selectedTab].map((rec, i) => {
                                                    const isInstalled = dictionaries.some(d => d.name === rec.name);
                                                    return (
                                                        <div key={i} className="bg-white p-3 rounded-xl border border-indigo-100 shadow-sm flex items-center justify-between">
                                                            <div>
                                                                <div className="font-bold text-slate-800 text-sm">{rec.name}</div>
                                                                <div className="text-[10px] text-slate-400">{rec.size} • Cloud Sync</div>
                                                            </div>
                                                            <button
                                                                onClick={() => handleDownloadDict(rec.url, rec.name)}
                                                                disabled={isInstalled || loading}
                                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isInstalled ? 'bg-green-100 text-green-600' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
                                                            >
                                                                {isInstalled ? 'Installed' : 'Download'}
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

                                    {importMode && (
                                        <div className="bg-white p-6 rounded-3xl border border-indigo-100 shadow-xl relative overflow-hidden mb-6 animate-in slide-in-from-top-2">
                                            <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500" />
                                            <h4 className="text-lg font-bold text-slate-800 mb-4">Ingest Dictionary Data</h4>

                                            {/* Import Inputs */}
                                            <div className="flex gap-4 items-end mb-4">
                                                <div className="flex-1 space-y-2">
                                                    <label className="text-xs font-bold text-slate-500">Name (Optional)</label>
                                                    <input
                                                        value={newDictName}
                                                        onChange={e => setNewDictName(e.target.value)}
                                                        placeholder="e.g. Oxford Advanced..."
                                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-indigo-500"
                                                    />
                                                </div>
                                                <div className="flex-1 space-y-2">
                                                    <label className="text-xs font-bold text-slate-500">Source (CSV/TXT)</label>
                                                    <div className="relative">
                                                        <input type="file" accept=".csv,.txt" ref={fileInputRef} onChange={handleFileSelect} className="hidden" id="dict-upload" />
                                                        <label htmlFor="dict-upload" className={`block w-full text-center px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer text-sm font-bold transition-all ${loading ? 'bg-slate-100 border-slate-300 text-slate-400' : 'bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100'}`}>
                                                            {loading ? 'Processing...' : (selectedFile ? selectedFile.name : 'Select File')}
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Preview Section */}
                                            {previewData && !loading && (
                                                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 mb-4">
                                                    <h5 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Preview (First 5 Rows)</h5>
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-left border-collapse">
                                                            <thead>
                                                                <tr className="text-xs text-slate-400 border-b border-slate-200">
                                                                    <th className="py-1 px-2">Word</th>
                                                                    <th className="py-1 px-2">Parsed Translation</th>
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
                                                        <button onClick={confirmImport} className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-bold shadow-md transition-all" title="Confirm and import the dictionary" aria-label="Confirm import dictionary">
                                                            Looks Good, Import
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
                                            <p className="text-xl font-bold text-slate-400">No dictionaries found.</p>
                                        </div>
                                    ) : (
                                        dictionaries.map((dict, idx) => (
                                            <div key={dict.id} className={`bg-white p-4 rounded-2xl border transition-all flex items-center justify-between group ${dict.enabled ? 'border-slate-200 shadow-sm' : 'border-slate-100 opacity-60 bg-slate-50'}`}>
                                                <div className="flex items-center gap-4">
                                                    <div className="flex flex-col items-center gap-1 text-slate-300 w-6">
                                                        <button onClick={() => movePriority(idx, 'up')} disabled={idx === 0} className="hover:text-indigo-600 disabled:opacity-30" title="Move up" aria-label={`Move ${dict.name} up`}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" /></svg></button>
                                                        <span className="text-[10px] font-black">{idx + 1}</span>
                                                        <button onClick={() => movePriority(idx, 'down')} disabled={idx === dictionaries.length - 1} className="hover:text-indigo-600 disabled:opacity-30" title="Move down" aria-label={`Move ${dict.name} down`}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg></button>
                                                    </div>
                                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg shadow-sm ${dict.type === 'USER' ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-500'}`}>
                                                        {dict.name.substring(0, 1).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-slate-800">{dict.name}</h4>
                                                        <div className="flex items-center gap-3 text-xs font-medium text-slate-400">
                                                            <span className="bg-slate-100 px-1.5 rounded text-slate-600 font-bold border border-slate-200">{dict.count.toLocaleString()} entries</span>
                                                            <span>{new Date(dict.importedAt).toLocaleDateString()}</span>
                                                            {dict.type === 'USER' && <span className="text-green-600 font-bold">Writable</span>}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-6">
                                                    <label className="relative inline-flex items-center cursor-pointer">
                                                        <input type="checkbox" checked={dict.enabled} onChange={() => toggleDictionary(dict)} className="sr-only peer" />
                                                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                                                    </label>

                                                    <div className="flex items-center gap-1">
                                                        {dict.type !== 'USER' && (
                                                            <button onClick={() => clearDictionary(dict)} className="p-2 text-slate-300 hover:text-orange-500 transition-colors" title="Clear Entries">
                                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                            </button>
                                                        )}
                                                        <button onClick={() => deleteDictionary(dict)} disabled={dict.type === 'USER'} className="p-2 text-slate-300 hover:text-red-600 transition-colors disabled:opacity-0" title="Delete Dictionary">
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
