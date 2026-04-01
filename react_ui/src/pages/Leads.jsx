import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

/* ── score band colours ── */
const BAND_COLOURS = { A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#ef4444' };

/* ── sortable columns ── */
const COLUMNS = [
  { key: 'name',               label: 'Company' },
  { key: 'contact_name',       label: 'Contact' },
  { key: 'sector',             label: 'Sector' },
  { key: 'borough',            label: 'Borough' },
  { key: 'score',              label: 'Score' },
  { key: 'pipeline_stage',     label: 'Stage' },
  { key: 'phone',              label: 'Phone',  sortable: false },
  { key: 'email',              label: 'Email',  sortable: false },
  { key: 'last_activity_date', label: 'Last Activity' },
];

const PER_PAGE_OPTIONS = [25, 50, 100];

/* ── styles ── */
const s = {
  page: {
    fontFamily: 'Inter, sans-serif',
    color: 'var(--text-1)',
    padding: '24px 32px',
    minHeight: '100%',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  addBtn: {
    background: 'var(--teal)', color: '#fff', border: 'none',
    borderRadius: 'var(--r-sm)', padding: '8px 18px', fontWeight: 600,
    cursor: 'pointer', fontSize: 14, fontFamily: 'Inter, sans-serif',
  },
  kpiBar: {
    display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap',
  },
  kpiCard: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)', padding: '12px 20px', minWidth: 140,
  },
  kpiLabel: { fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 2 },
  kpiValue: { fontSize: 20, fontWeight: 700 },
  filterBar: {
    display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18, alignItems: 'flex-end',
  },
  filterGroup: { display: 'flex', flexDirection: 'column', gap: 3 },
  filterLabel: { fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 },
  input: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)', padding: '7px 12px', fontSize: 13,
    color: 'var(--text-1)', fontFamily: 'Inter, sans-serif', outline: 'none',
    minWidth: 140,
  },
  select: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)', padding: '7px 10px', fontSize: 13,
    color: 'var(--text-1)', fontFamily: 'Inter, sans-serif', outline: 'none',
    cursor: 'pointer',
  },
  tableWrap: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--r-lg)', overflow: 'hidden',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left', padding: '10px 14px', fontWeight: 600, fontSize: 11,
    textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border)', cursor: 'pointer', userSelect: 'none',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '10px 14px', borderBottom: '1px solid var(--border)',
    maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  row: { cursor: 'pointer', transition: 'background .1s' },
  badge: {
    display: 'inline-block', padding: '2px 10px', borderRadius: 10,
    fontWeight: 700, fontSize: 12, letterSpacing: '.3px',
  },
  stagePill: {
    display: 'inline-block', padding: '2px 10px', borderRadius: 10,
    fontSize: 11, fontWeight: 600, background: 'var(--bg-base)',
    border: '1px solid var(--border)',
  },
  pagination: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)',
  },
  pageBtn: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)', padding: '5px 12px', cursor: 'pointer',
    fontSize: 13, color: 'var(--text-1)', fontFamily: 'Inter, sans-serif',
  },
  pageBtnDisabled: { opacity: 0.4, cursor: 'default', pointerEvents: 'none' },
  empty: {
    padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14,
  },
  loading: {
    padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14,
  },
  exportBtn: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)', padding: '7px 14px', cursor: 'pointer',
    fontSize: 13, color: 'var(--text-1)', fontFamily: 'Inter, sans-serif',
    fontWeight: 600,
  },
};

/* ── helpers ── */
function scoreBadge(band) {
  if (!band) return '-';
  const bg = BAND_COLOURS[band] || '#888';
  return (
    <span style={{ ...s.badge, background: bg + '1a', color: bg }}>
      {band}
    </span>
  );
}

function formatDate(d) {
  if (!d) return '-';
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
}

function exportCSV(leads) {
  const header = ['Company', 'Contact', 'Sector', 'Borough', 'Score', 'Stage', 'Phone', 'Email', 'Last Activity'];
  const rows = leads.map(l => [
    l.name, l.contact_name, l.sector, l.borough, l.score_band,
    l.pipeline_stage, l.phone, l.email, l.last_activity_date,
  ]);
  const csv = [header, ...rows].map(r => r.map(c => `"${(c ?? '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leads_export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── component ── */
export default function Leads({ openLead }) {
  /* filters */
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('');
  const [borough, setBorough] = useState('');
  const [stage, setStage] = useState('');
  const [minScore, setMinScore] = useState('');
  const [maxScore, setMaxScore] = useState('');
  const [hasEmail, setHasEmail] = useState('');
  const [hasPhone, setHasPhone] = useState('');

  /* pagination + sort */
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [sort, setSort] = useState('score');
  const [order, setOrder] = useState('desc');

  /* fetch filter options */
  const { data: filterOpts } = useQuery({
    queryKey: ['lead-filters'],
    queryFn: () => api.filters(),
    staleTime: 5 * 60_000,
  });

  /* build params */
  const params = useMemo(() => {
    const p = { page, per_page: perPage, sort, order };
    if (q.trim()) p.q = q.trim();
    if (sector) p.sector = sector;
    if (borough) p.borough = borough;
    if (stage) p.stage = stage;
    if (minScore !== '') p.min_score = Number(minScore);
    if (maxScore !== '') p.max_score = Number(maxScore);
    if (hasEmail !== '') p.has_email = hasEmail === '1';
    if (hasPhone !== '') p.has_phone = hasPhone === '1';
    return p;
  }, [q, sector, borough, stage, minScore, maxScore, hasEmail, hasPhone, page, perPage, sort, order]);

  /* fetch leads */
  const { data, isLoading, isError } = useQuery({
    queryKey: ['leads', params],
    queryFn: () => api.leads(params),
    keepPreviousData: true,
  });

  const leads = data?.leads ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  /* KPI computations */
  const kpis = useMemo(() => {
    const withEmail = leads.filter(l => l.email).length;
    const withPhone = leads.filter(l => l.phone).length;
    const scores = leads.filter(l => l.score != null).map(l => l.score);
    const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '-';
    return { withEmail, withPhone, avg };
  }, [leads]);

  /* sort handler */
  const handleSort = useCallback((key) => {
    setPage(1);
    if (sort === key) {
      setOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(key);
      setOrder('desc');
    }
  }, [sort]);

  /* reset to page 1 on filter change */
  const updateFilter = (setter) => (val) => { setter(val); setPage(1); };

  /* hover state for rows */
  const [hoveredRow, setHoveredRow] = useState(null);

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <h1 style={s.title}>Leads</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={s.exportBtn} onClick={() => leads.length && exportCSV(leads)} title="Export current view to CSV">
            Export CSV
          </button>
          <button style={s.addBtn} onClick={() => {}}>+ Add Lead</button>
        </div>
      </div>

      {/* KPI Bar */}
      <div style={s.kpiBar}>
        <div style={s.kpiCard}>
          <div style={s.kpiLabel}>Total Results</div>
          <div style={s.kpiValue}>{isLoading ? '...' : total.toLocaleString()}</div>
        </div>
        <div style={s.kpiCard}>
          <div style={s.kpiLabel}>With Email</div>
          <div style={s.kpiValue}>{isLoading ? '...' : kpis.withEmail.toLocaleString()}</div>
        </div>
        <div style={s.kpiCard}>
          <div style={s.kpiLabel}>With Phone</div>
          <div style={s.kpiValue}>{isLoading ? '...' : kpis.withPhone.toLocaleString()}</div>
        </div>
        <div style={s.kpiCard}>
          <div style={s.kpiLabel}>Avg Score</div>
          <div style={s.kpiValue}>{isLoading ? '...' : kpis.avg}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={s.filterBar}>
        <div style={s.filterGroup}>
          <span style={s.filterLabel}>Search</span>
          <input
            style={{ ...s.input, minWidth: 200 }}
            placeholder="Company, contact, postcode..."
            value={q}
            onChange={e => updateFilter(setQ)(e.target.value)}
          />
        </div>

        <div style={s.filterGroup}>
          <span style={s.filterLabel}>Sector</span>
          <select style={s.select} value={sector} onChange={e => updateFilter(setSector)(e.target.value)}>
            <option value="">All</option>
            {(filterOpts?.sectors ?? []).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div style={s.filterGroup}>
          <span style={s.filterLabel}>Borough</span>
          <select style={s.select} value={borough} onChange={e => updateFilter(setBorough)(e.target.value)}>
            <option value="">All</option>
            {(filterOpts?.boroughs ?? []).map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <div style={s.filterGroup}>
          <span style={s.filterLabel}>Stage</span>
          <select style={s.select} value={stage} onChange={e => updateFilter(setStage)(e.target.value)}>
            <option value="">All</option>
            {(filterOpts?.stages ?? []).map(st => <option key={st} value={st}>{st}</option>)}
          </select>
        </div>

        <div style={s.filterGroup}>
          <span style={s.filterLabel}>Score Min</span>
          <input
            style={{ ...s.input, minWidth: 60, width: 60 }}
            type="number" min="0" max="100" placeholder="0"
            value={minScore}
            onChange={e => updateFilter(setMinScore)(e.target.value)}
          />
        </div>

        <div style={s.filterGroup}>
          <span style={s.filterLabel}>Score Max</span>
          <input
            style={{ ...s.input, minWidth: 60, width: 60 }}
            type="number" min="0" max="100" placeholder="100"
            value={maxScore}
            onChange={e => updateFilter(setMaxScore)(e.target.value)}
          />
        </div>

        <div style={s.filterGroup}>
          <span style={s.filterLabel}>Has Email</span>
          <select style={s.select} value={hasEmail} onChange={e => updateFilter(setHasEmail)(e.target.value)}>
            <option value="">Any</option>
            <option value="1">Yes</option>
            <option value="0">No</option>
          </select>
        </div>

        <div style={s.filterGroup}>
          <span style={s.filterLabel}>Has Phone</span>
          <select style={s.select} value={hasPhone} onChange={e => updateFilter(setHasPhone)(e.target.value)}>
            <option value="">Any</option>
            <option value="1">Yes</option>
            <option value="0">No</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={s.tableWrap}>
        {isLoading ? (
          <div style={s.loading}>Loading leads...</div>
        ) : isError ? (
          <div style={{ ...s.empty, color: '#ef4444' }}>Failed to load leads. Please try again.</div>
        ) : leads.length === 0 ? (
          <div style={s.empty}>No leads found. Adjust your filters or add a new lead.</div>
        ) : (
          <>
            <table style={s.table}>
              <thead>
                <tr>
                  {COLUMNS.map(col => {
                    const sortable = col.sortable !== false;
                    const active = sort === col.key;
                    return (
                      <th
                        key={col.key}
                        style={{
                          ...s.th,
                          cursor: sortable ? 'pointer' : 'default',
                          color: active ? 'var(--teal)' : undefined,
                        }}
                        onClick={() => sortable && handleSort(col.key)}
                      >
                        {col.label}
                        {active && (
                          <span style={{ marginLeft: 4, fontSize: 10 }}>
                            {order === 'asc' ? '\u25B2' : '\u25BC'}
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {leads.map(lead => (
                  <tr
                    key={lead.entity_id}
                    style={{
                      ...s.row,
                      background: hoveredRow === lead.entity_id ? 'var(--bg-base)' : 'transparent',
                    }}
                    onClick={() => openLead?.(lead.entity_id)}
                    onMouseEnter={() => setHoveredRow(lead.entity_id)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    <td style={{ ...s.td, fontWeight: 600 }}>{lead.name || '-'}</td>
                    <td style={s.td}>
                      {lead.contact_name || '-'}
                      {lead.contact_role && (
                        <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 4 }}>
                          ({lead.contact_role})
                        </span>
                      )}
                    </td>
                    <td style={s.td}>{lead.sector || '-'}</td>
                    <td style={s.td}>{lead.borough || '-'}</td>
                    <td style={s.td}>{scoreBadge(lead.score_band)}</td>
                    <td style={s.td}>
                      <span style={s.stagePill}>{lead.pipeline_stage || '-'}</span>
                    </td>
                    <td style={s.td}>{lead.phone || '-'}</td>
                    <td style={{ ...s.td, fontSize: 12 }}>{lead.email || '-'}</td>
                    <td style={{ ...s.td, color: 'var(--text-muted)', fontSize: 12 }}>
                      {formatDate(lead.last_activity_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div style={s.pagination}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Rows per page:</span>
                <select
                  style={{ ...s.select, padding: '4px 8px' }}
                  value={perPage}
                  onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                >
                  {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span>
                  {((page - 1) * perPage + 1).toLocaleString()}
                  {' - '}
                  {Math.min(page * perPage, total).toLocaleString()}
                  {' of '}
                  {total.toLocaleString()}
                </span>
                <button
                  style={{ ...s.pageBtn, ...(page <= 1 ? s.pageBtnDisabled : {}) }}
                  onClick={() => setPage(1)}
                  disabled={page <= 1}
                  title="First page"
                >
                  &laquo;
                </button>
                <button
                  style={{ ...s.pageBtn, ...(page <= 1 ? s.pageBtnDisabled : {}) }}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  &lsaquo; Prev
                </button>
                <button
                  style={{ ...s.pageBtn, ...(page >= totalPages ? s.pageBtnDisabled : {}) }}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next &rsaquo;
                </button>
                <button
                  style={{ ...s.pageBtn, ...(page >= totalPages ? s.pageBtnDisabled : {}) }}
                  onClick={() => setPage(totalPages)}
                  disabled={page >= totalPages}
                  title="Last page"
                >
                  &raquo;
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
