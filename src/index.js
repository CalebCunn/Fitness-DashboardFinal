import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// If a screen crashes, show a way back instead of a blank page, and (public site) email a short report once per visit.
let reported=false;
function report(error){
  if(reported||process.env.REACT_APP_PUBLIC!=='true')return;reported=true;
  import('./apexAuth').then(({sendFeedback})=>sendFeedback(`[Automatic crash report]\n${String(error?.stack||error?.message||error).slice(0,1500)}`,window.location.hash.slice(1)||'home')).catch(()=>{});
}
class Safety extends React.Component{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error){report(error);}
  render(){
    if(!this.state.failed)return this.props.children;
    return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:24,background:'#F3EDE2',color:'#0F3D2F',fontFamily:"'Inter Tight',-apple-system,sans-serif",textAlign:'center'}}>
      <div style={{maxWidth:360}}>
        <p style={{font:"italic 400 44px/1 'DM Serif Display',Georgia,serif",margin:0}}>Apex</p>
        <h1 style={{fontSize:24,margin:'28px 0 10px'}}>Something went wrong.</h1>
        <p style={{fontSize:16,lineHeight:1.5,margin:'0 0 24px',opacity:.8}}>Your data is safe. Reload to carry on. If it keeps happening, email hello@apexrunning.app.</p>
        <button onClick={()=>{window.location.hash='';window.location.reload();}} style={{background:'#0F3D2F',color:'#F3EDE2',border:0,borderRadius:30,padding:'14px 30px',font:'600 16px inherit',cursor:'pointer'}}>Reload</button>
      </div>
    </div>;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><Safety><App /></Safety></React.StrictMode>);
