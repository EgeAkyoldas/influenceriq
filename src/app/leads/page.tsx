'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Search, Filter, Play, Square, Trash2, ChevronLeft, ChevronRight, RefreshCw, Plus, X, Download } from 'lucide-react';

interface Lead {
  id: number;
  username: string;
  instagram_url: string;
  csv_niche: string;
  csv_followers_range: string;
  csv_hq_score: number;
  csv_hq: number;
  fetch_status: string;
  error_message: string | null;
  profile_id: number | null;
  followers_count: number | null;
  full_name: string | null;
  profile_pic_url: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

interface BatchJob {
  id: number;
  total_leads: number;
  processed: number;
  fetched: number;
  unfetchable: number;
  errors: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
}


const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  fetching: 'bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse',
  fetched: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  unfetchable: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const NICHE_COLORS: Record<string, string> = {
  Dating: 'bg-pink-500/20 text-pink-400',
  Mindset: 'bg-violet-500/20 text-violet-400',
  Masculinity: 'bg-amber-500/20 text-amber-400',
  Relationship: 'bg-cyan-500/20 text-cyan-400',
  Performance: 'bg-green-500/20 text-green-400',
  Leadership: 'bg-indigo-500/20 text-indigo-400',
  Health: 'bg-teal-500/20 text-teal-400',
  Other: 'bg-zinc-500/20 text-zinc-400',
};

const SOURCE_COLORS: Record<string, string> = {
  csv_import: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  manual: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

function getSourceStyle(source: string | null): string {
  if (!source) return SOURCE_COLORS.csv_import;
  if (SOURCE_COLORS[source]) return SOURCE_COLORS[source];
  // Date-based sources (e.g. '11 March') get a special cyan style
  return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [niches, setNiches] = useState<Array<{ csv_niche: string; count: number }>>([]);
  const [statusCounts, setStatusCounts] = useState<Array<{ fetch_status: string; count: number }>>([]);
  const [sourceCounts, setSourceCounts] = useState<Array<{ source: string; count: number }>>([]);
  const [search, setSearch] = useState('');
  const [nicheFilter, setNicheFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [hqOnly, setHqOnly] = useState(false);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchJob, setBatchJob] = useState<BatchJob | null>(null);
  const [importResult, setImportResult] = useState<Record<string, number> | null>(null);
  const [importing, setImporting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importSource, setImportSource] = useState('11 March');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchPollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchLeads = useCallback(async (page = 1, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      if (search) params.set('search', search);
      if (nicheFilter) params.set('niche', nicheFilter);
      if (statusFilter) params.set('fetch_status', statusFilter);
      if (sourceFilter) params.set('source', sourceFilter);
      if (hqOnly) params.set('hq_only', 'true');

      const res = await fetch(`/api/leads?${params}`);
      const data = await res.json();
      if (data.data) setLeads(data.data);
      if (data.pagination) setPagination(data.pagination);
      if (data.filters?.niches) setNiches(data.filters.niches);
      if (data.filters?.statusCounts) setStatusCounts(data.filters.statusCounts);
      if (data.filters?.sourceCounts) setSourceCounts(data.filters.sourceCounts);
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    }
    if (!silent) setLoading(false);
  }, [search, nicheFilter, statusFilter, sourceFilter, hqOnly, sortBy, sortDir]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const fetchBatchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/leads/batch');
      const data = await res.json();
      setBatchJob(data.current || null);
      if (data.current?.status === 'running') {
        fetchLeads(pagination.page, true); // silent refresh — no loading spinner
      }
    } catch (err) {
      console.error('Batch status error:', err);
    }
  }, [fetchLeads, pagination.page]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBatchStatus();
    const interval = setInterval(fetchBatchStatus, 3000);
    batchPollRef.current = interval;
    return () => clearInterval(interval);
  }, [fetchBatchStatus]);

  const handleCSVUpload = async (file: File, source: string) => {
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_data: text, source }),
      });
      const data = await res.json();
      if (res.ok) {
        setImportResult(data);
        fetchLeads();
        if (data.imported > 0) startBatch();
      } else {
        alert(`Import failed: ${data.error}`);
      }
    } catch (err) {
      alert(`Import error: ${(err as Error).message}`);
    }
    setImporting(false);
  };

  const handleFileSelect = (file: File) => {
    setPendingFile(file);
    setShowImportDialog(true);
  };

  const confirmImport = () => {
    if (pendingFile) {
      handleCSVUpload(pendingFile, importSource);
      setPendingFile(null);
      setShowImportDialog(false);
    }
  };

  const startBatch = async () => {
    try {
      const res = await fetch('/api/leads/batch', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setBatchJob({ id: data.batch_id, total_leads: data.pending_leads, processed: 0, fetched: 0, unfetchable: 0, errors: 0, status: 'running', started_at: null, completed_at: null });
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert(`Batch error: ${(err as Error).message}`);
    }
  };

  const cancelBatch = async () => {
    if (!batchJob) return;
    await fetch('/api/leads/batch', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch_id: batchJob.id }) });
    setBatchJob(null);
    fetchLeads(pagination.page);
  };

  const resetErrors = async () => {
    const res = await fetch('/api/leads/batch', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset_errors' }) });
    const data = await res.json();
    alert(`Reset ${data.reset} error leads to pending`);
    fetchLeads(pagination.page);
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} leads?`)) return;
    await fetch('/api/leads', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(selected) }) });
    setSelected(new Set());
    fetchLeads(pagination.page);
  };

  const addLead = async () => {
    if (!newUsername.trim()) return;
    const res = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: newUsername.trim() }) });
    setNewUsername('');
    setShowAddModal(false);
    fetchLeads(pagination.page);
    if (res.ok) startBatch();
  };

  const toggleAll = () => {
    if (selected.size === leads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map(l => l.id)));
    }
  };

  const toggleOne = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold bg-linear-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
            Lead Management
          </h1>
          <p className="text-zinc-400 mt-1 text-sm sm:text-base">Import CSV, fetch profiles, classify and manage leads</p>
        </div>
        <div className="flex gap-2 sm:gap-3">
          <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 transition-colors text-sm">
            <Plus size={16} /> Add Lead
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors text-sm font-medium">
            <Upload size={16} /> Import CSV
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); e.target.value = ''; }} />
        </div>
      </div>

      {/* Import Result */}
      {importResult && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3 sm:gap-6 text-sm">
            <span className="text-emerald-400 font-semibold">✓ Import Complete</span>
            <span>Imported: <strong>{importResult.imported}</strong></span>
            <span>Duplicates: <strong>{importResult.duplicates_in_csv}</strong></span>
            <span>Total: <strong>{importResult.total_leads_in_db}</strong></span>
          </div>
          <button onClick={() => setImportResult(null)} className="text-zinc-400 hover:text-white shrink-0"><X size={16} /></button>
        </div>
      )}
      {importing && (
        <div className="bg-violet-500/10 border border-violet-500/30 rounded-lg p-4 text-center text-violet-300 animate-pulse">
          <Upload size={20} className="inline mr-2" /> Importing CSV...
        </div>
      )}

      {/* Batch Progress */}
      {batchJob && batchJob.status === 'running' && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <RefreshCw size={18} className="text-blue-400 animate-spin" />
              <span className="font-semibold">Batch Processing</span>
              <span className="text-zinc-400 text-sm">{batchJob.processed}/{batchJob.total_leads}</span>
            </div>
            <button onClick={cancelBatch} className="flex items-center gap-1 px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 text-sm">
              <Square size={14} /> Cancel
            </button>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2.5">
            <div className="bg-linear-to-r from-violet-500 to-cyan-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${batchJob.total_leads > 0 ? (batchJob.processed / batchJob.total_leads) * 100 : 0}%` }} />
          </div>
          <div className="flex flex-wrap gap-3 sm:gap-6 mt-3 text-sm text-zinc-400">
            <span>✓ Fetched: <strong className="text-emerald-400">{batchJob.fetched}</strong></span>
            <span>✗ Unfetchable: <strong className="text-zinc-300">{batchJob.unfetchable}</strong></span>
            <span>⚠ Errors: <strong className="text-red-400">{batchJob.errors}</strong></span>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        {statusCounts.map(s => (
          <button key={s.fetch_status} onClick={() => setStatusFilter(statusFilter === s.fetch_status ? '' : s.fetch_status)}
            className={`p-2.5 sm:p-3 rounded-lg border text-center transition-all ${statusFilter === s.fetch_status ? 'ring-2 ring-violet-500' : ''} ${STATUS_COLORS[s.fetch_status] || 'bg-zinc-800 border-zinc-700'}`}>
            <div className="text-xl sm:text-2xl font-bold">{s.count}</div>
            <div className="text-[10px] sm:text-xs uppercase tracking-wider mt-1">{s.fetch_status}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        <div className="relative flex-1 min-w-0 w-full sm:w-auto sm:min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search username or niche..."
            className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm" />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-zinc-400" />
          <select value={nicheFilter} onChange={e => setNicheFilter(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
            <option value="">All Niches</option>
            {niches.map(n => <option key={n.csv_niche} value={n.csv_niche}>{n.csv_niche} ({n.count})</option>)}
          </select>
        </div>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
          <option value="">All Sources</option>
          {sourceCounts.map(s => <option key={s.source} value={s.source}>{s.source || 'unknown'} ({s.count})</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={hqOnly} onChange={e => setHqOnly(e.target.checked)} className="accent-violet-500" />
          HQ Only
        </label>
        {selected.size > 0 && (
          <button onClick={deleteSelected} className="flex items-center gap-1 px-3 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 text-sm">
            <Trash2 size={14} /> Delete ({selected.size})
          </button>
        )}
        {statusCounts.some(s => s.fetch_status === 'error' && s.count > 0) && (
          <button onClick={resetErrors} className="flex items-center gap-2 px-4 py-2 bg-amber-600/20 text-amber-400 border border-amber-500/30 hover:bg-amber-600/30 rounded-lg transition-colors text-sm font-medium ml-auto">
            <RefreshCw size={14} /> Reset Errors
          </button>
        )}
        <button onClick={startBatch} disabled={!!batchJob?.status && batchJob.status === 'running'}
          className={`flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors text-sm font-medium ${statusCounts.some(s => s.fetch_status === 'error' && s.count > 0) ? '' : 'ml-auto'}`}>
          <Play size={14} /> Start Batch Fetch
        </button>
      </div>

      {/* Data Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-800/50">
              <tr className="text-left text-zinc-400 uppercase tracking-wider text-xs">
                <th className="p-3 w-10">
                  <input type="checkbox" checked={selected.size === leads.length && leads.length > 0} onChange={toggleAll} className="accent-violet-500" />
                </th>
                <th className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort('username')}>
                  Username {sortBy === 'username' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort('csv_niche')}>
                  Niche {sortBy === 'csv_niche' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort('csv_followers_range')}>
                  Followers {sortBy === 'csv_followers_range' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort('csv_hq_score')}>
                  HQ Score {sortBy === 'csv_hq_score' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort('fetch_status')}>
                  Status {sortBy === 'fetch_status' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="p-3">Source</th>
                <th className="p-3">Live Followers</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {loading ? (
                <tr><td colSpan={9} className="p-12 text-center text-zinc-500"><RefreshCw size={24} className="inline animate-spin mr-2" /> Loading...</td></tr>
              ) : leads.length === 0 ? (
                <tr><td colSpan={9} className="p-12 text-center text-zinc-500">
                  <Download size={32} className="mx-auto mb-3 text-zinc-600" />
                  No leads found. Import a CSV to get started.
                </td></tr>
              ) : leads.map(lead => (
                <tr key={lead.id} className={`hover:bg-zinc-800/50 transition-colors ${selected.has(lead.id) ? 'bg-violet-500/5' : ''}`}>
                  <td className="p-3"><input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleOne(lead.id)} className="accent-violet-500" /></td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {lead.profile_pic_url && (
                        <img src={lead.profile_pic_url} alt="" className="w-7 h-7 rounded-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      )}
                      <div>
                        <a href={`https://instagram.com/${lead.username}`} target="_blank" rel="noopener noreferrer"
                          className="text-violet-400 hover:text-violet-300 font-medium">@{lead.username}</a>
                        {lead.full_name && <div className="text-xs text-zinc-500">{lead.full_name}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    {lead.csv_niche && (
                      <span className={`px-2 py-0.5 rounded-full text-xs ${NICHE_COLORS[lead.csv_niche] || NICHE_COLORS.Other}`}>
                        {lead.csv_niche}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-zinc-300">{lead.csv_followers_range || '—'}</td>
                  <td className="p-3">
                    {lead.csv_hq_score > 0 && (
                      <span className={`font-mono text-sm ${lead.csv_hq_score >= 6.7 ? 'text-emerald-400' : lead.csv_hq_score >= 6.5 ? 'text-yellow-400' : 'text-zinc-400'}`}>
                        {lead.csv_hq_score.toFixed(1)}
                      </span>
                    )}
                    {lead.csv_hq === 1 && <span className="ml-1 text-xs text-amber-400">★</span>}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_COLORS[lead.fetch_status]}`}>
                      {lead.fetch_status}
                    </span>
                  </td>
                  <td className="p-3">
                    {lead.source && lead.source !== 'csv_import' ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${getSourceStyle(lead.source)}`}>
                        🆕 {lead.source}
                      </span>
                    ) : (
                      <span className="text-zinc-600 text-xs">—</span>
                    )}
                  </td>
                  <td className="p-3 text-zinc-300 font-mono text-sm">
                    {lead.followers_count !== null ? lead.followers_count.toLocaleString() : '—'}
                  </td>
                  <td className="p-3">
                    <button onClick={async () => {
                      await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' });
                      fetchLeads(pagination.page);
                    }} className="text-zinc-500 hover:text-red-400 transition-colors" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-zinc-800">
            <span className="text-sm text-zinc-400">
              Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </span>
            <div className="flex gap-2">
              <button onClick={() => fetchLeads(pagination.page - 1)} disabled={pagination.page <= 1}
                className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed">
                <ChevronLeft size={16} />
              </button>
              <span className="flex items-center px-3 text-sm text-zinc-300">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button onClick={() => fetchLeads(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}
                className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Lead Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-[400px]" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Add Lead</h3>
            <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="Instagram username"
              className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 mb-4"
              onKeyDown={e => e.key === 'Enter' && addLead()} autoFocus />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 text-sm">Cancel</button>
              <button onClick={addLead} className="px-4 py-2 bg-violet-600 rounded-lg hover:bg-violet-500 text-sm font-medium">Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Source Dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setShowImportDialog(false); setPendingFile(null); }}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-[420px]" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Import CSV</h3>
            <p className="text-zinc-400 text-sm mb-4">Bu CSV hangi kaynak / tarih olarak etiketlensin?</p>
            <input type="text" value={importSource} onChange={e => setImportSource(e.target.value)} placeholder="Kaynak etiketi (ör: 11 March)"
              className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-2"
              onKeyDown={e => e.key === 'Enter' && confirmImport()} autoFocus />
            <p className="text-zinc-500 text-xs mb-4">Dosya: {pendingFile?.name}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setShowImportDialog(false); setPendingFile(null); }} className="px-4 py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700 text-sm">İptal</button>
              <button onClick={confirmImport} className="px-4 py-2 bg-cyan-600 rounded-lg hover:bg-cyan-500 text-sm font-medium">Import Et</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
