"use client";
import dynamic from "next/dynamic";

const FlowEditorMain = dynamic(() => import("./_FlowEditorMain"), {
  ssr: false,
  loading: () => (
    <div style={{ background: '#06070a', height: '100vh', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: 'rgba(255,255,255,0.6)', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  ),
});

export default function Page() {
  return <FlowEditorMain />;
}
