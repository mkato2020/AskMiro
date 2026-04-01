export function formatGBP(v){
  return '£'+Number(v||0).toLocaleString('en-GB',{minimumFractionDigits:0,maximumFractionDigits:0})
}

export function formatDate(d){
  if(!d)return '—'
  try{
    const dt=new Date(d)
    return dt.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})
  }catch{return String(d)}
}

export function timeAgo(d){
  if(!d)return '—'
  const s=Math.floor((Date.now()-new Date(d))/1000)
  if(s<60)return 'just now'
  if(s<3600)return Math.floor(s/60)+'m ago'
  if(s<86400)return Math.floor(s/3600)+'h ago'
  if(s<604800)return Math.floor(s/86400)+'d ago'
  return new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'})
}
