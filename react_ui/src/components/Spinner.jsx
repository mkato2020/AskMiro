export default function Spinner({size=24,color='var(--teal)'}){
  return(
    <div style={{display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{
        width:size,height:size,
        border:`2.5px solid ${color}30`,
        borderTopColor:color,
        borderRadius:'50%',
        animation:'spin 0.7s linear infinite',
      }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
