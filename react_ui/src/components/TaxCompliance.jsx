// ════════════════════════════════════════════════════════════════════════════
// Tax & Compliance panel — surfaces /api/finance/compliance (the accountant brain)
// HMRC / Companies House filing position. Drops into the Finance page.
// ════════════════════════════════════════════════════════════════════════════
import {useQuery} from '@tanstack/react-query'
import {api} from '../api'
import {Card, KPICard, Badge, EmptyState, Skeleton, SkeletonKPIs, SectionTitle} from './ui'
import {formatGBP, formatDate} from '../utils'

const PRIORITY_TONE = {high:'danger', medium:'warning', low:'neutral'}

function daysBadge(days){
  if(days==null) return null
  const tone = days<30?'danger':days<90?'warning':'success'
  return <Badge tone={tone}>{days} days</Badge>
}

export default function TaxCompliance(){
  const {data,isLoading,error}=useQuery({queryKey:['finance-compliance'],queryFn:api.financeCompliance})

  if(isLoading) return <div style={{display:'flex',flexDirection:'column',gap:16}}><SkeletonKPIs count={4}/><Skeleton h={180} r={12}/></div>
  if(error) return <EmptyState icon="⚠️" title="Compliance engine unavailable" message={String(error.message||error)}/>
  if(!data) return null

  const {company,accounting_period:ap,filing_deadlines:fd,profit_and_tax:pt,vat,accounts_basis:ab,books_completeness:bc,directors_loan:dla,actions}=data
  const dl = fd||{}

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      {/* Headline filing deadlines */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14}}>
        <KPICard label="CH Accounts Due" value={formatDate(dl.companies_house_accounts?.due)}
          color="var(--teal)" hint={`${dl.companies_house_accounts?.days_left??'—'} days left`}/>
        <KPICard label="Corp. Tax Payment" value={formatDate(dl.corporation_tax_payment?.due)}
          color="var(--info)" hint={`${dl.corporation_tax_payment?.days_left??'—'} days left`}/>
        <KPICard label="Confirmation Stmt" value={formatDate(dl.confirmation_statement?.due)}
          color="var(--warning)" hint={`${dl.confirmation_statement?.days_left??'—'} days left`}/>
        <KPICard label="Books Complete" value={`${bc?.score_pct??0}%`}
          color={bc?.score_pct>=100?'var(--success)':'var(--warning)'} hint="Records on file (CA2006 s386)"/>
      </div>

      {/* Statutory snapshot */}
      <Card>
        <SectionTitle action={<Badge tone="info">{company?.company_number}</Badge>}>
          {company?.name} — Statutory Position
        </SectionTitle>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'14px 28px',fontSize:'.84rem'}}>
          <Row label="Accounting period" value={`${formatDate(ap?.start)} → ${formatDate(ap?.end)}`}/>
          <Row label="Accounting Reference Date" value={formatDate(ap?.ard)}/>
          <Row label="Recommended filing basis" value={ab?.recommended_filing}/>
          <Row label="Revenue (this period)" value={formatGBP(pt?.revenue)}/>
          <Row label="Estimated profit" value={formatGBP(pt?.profit)}/>
          <Row label={`Corporation Tax est. (${pt?.ct_rate_pct||0}%)`} value={formatGBP(pt?.corporation_tax_estimate)}/>
        </div>
        {ab?.dormant_candidate && (
          <div style={{marginTop:16,padding:'12px 14px',background:'var(--info-wash)',borderRadius:'var(--r-sm)',
            fontSize:'.8rem',color:'var(--text-2)',lineHeight:1.5}}>
            <strong style={{color:'var(--info)'}}>Opportunity:</strong> No trading detected in this period —
            you may be able to file <strong>dormant accounts (AA02)</strong>, which are far simpler and carry
            no Corporation Tax. Confirm no income/expense occurred before {formatDate(ap?.ard)}.
          </div>
        )}
      </Card>

      {/* VAT threshold */}
      <Card>
        <SectionTitle>VAT Threshold (rolling 12 months)</SectionTitle>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          <div style={{flex:1,height:10,background:'var(--bg-subtle)',borderRadius:6,overflow:'hidden'}}>
            <div style={{height:'100%',width:`${Math.min(100,vat?.used_pct||0)}%`,
              background:vat?.used_pct>=80?'var(--danger)':vat?.used_pct>=50?'var(--warning)':'var(--success)',
              transition:'width .4s'}}/>
          </div>
          <div style={{fontSize:'.82rem',fontWeight:700,whiteSpace:'nowrap'}}>
            {formatGBP(vat?.rolling_12m_turnover)} / {formatGBP(vat?.threshold)}
          </div>
        </div>
        <div style={{fontSize:'.76rem',color:'var(--text-muted)',marginTop:8}}>
          {vat?.status==='registered'?'VAT registered.'
            :vat?.status==='threshold_breached'?'⚠️ Threshold exceeded — must register within 30 days.'
            :`${formatGBP(vat?.headroom)} of headroom before mandatory registration.`}
        </div>
      </Card>

      {/* Director's loan exposure */}
      {dla?.outflow_unevidenced>0 && (
        <Card style={{borderLeft:'3px solid var(--danger)'}}>
          <SectionTitle action={<Badge tone="danger">s455 risk</Badge>}>Director's Loan — unevidenced</SectionTitle>
          <div style={{display:'flex',gap:28,flexWrap:'wrap',marginBottom:10}}>
            <Row label="Paid to director (no receipt)" value={formatGBP(dla.outflow_unevidenced)}/>
            <Row label="Transfers" value={dla.records}/>
            <Row label="s455 tax if unrepaid (33.75%)" value={formatGBP(dla.s455_risk_estimate)}/>
          </div>
          <div style={{fontSize:'.8rem',color:'var(--text-2)',lineHeight:1.5}}>{dla.note}</div>
        </Card>
      )}

      {/* Prioritised actions */}
      <div>
        <SectionTitle>Filing Actions</SectionTitle>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {(actions||[]).map((a,i)=>(
            <Card key={i} hover padding={16} style={{borderLeft:`3px solid var(--${PRIORITY_TONE[a.priority]==='danger'?'danger':PRIORITY_TONE[a.priority]==='warning'?'warning':'border-strong'})`}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start'}}>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                    <Badge tone={PRIORITY_TONE[a.priority]||'neutral'}>{a.priority}</Badge>
                    <span style={{fontSize:'.88rem',fontWeight:700,color:'var(--text-1)'}}>{a.title}</span>
                  </div>
                  <div style={{fontSize:'.8rem',color:'var(--text-muted)',lineHeight:1.5}}>{a.detail}</div>
                </div>
                <div style={{textAlign:'right',flexShrink:0}}>
                  {a.due && <div style={{fontSize:'.76rem',fontWeight:600,color:'var(--text-2)',marginBottom:4}}>{formatDate(a.due)}</div>}
                  {daysBadge(a.days_left)}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div style={{fontSize:'.7rem',color:'var(--text-muted)',fontStyle:'italic',padding:'4px 2px'}}>{data.disclaimer}</div>
    </div>
  )
}

function Row({label,value}){
  return (
    <div>
      <div style={{fontSize:'.68rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.03em',marginBottom:3}}>{label}</div>
      <div style={{fontWeight:700,color:'var(--text-1)'}}>{value??'—'}</div>
    </div>
  )
}
