/**
 * Login.jsx — Full-screen Google OAuth login for AskMiro OS
 */
import React from 'react'

export default function Login() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-base)',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      <div style={{
        width: 380,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        padding: '48px 40px',
        textAlign: 'center',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 32 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, var(--teal), #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
              <path d="M1 13L4.5 5L8 9L11.5 5L15 13" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
              <span style={{ color: 'var(--text-1)' }}>Ask</span>
              <span style={{ color: 'var(--teal)' }}>Miro</span>
            </div>
            <div style={{ fontSize: '0.55rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Business OS</div>
          </div>
        </div>

        <h1 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px' }}>
          Welcome back
        </h1>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 32px', lineHeight: 1.5 }}>
          Sign in with your Google account to access the dashboard
        </p>

        {/* Google Sign-in Button */}
        <a
          href="/auth/login"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            width: '100%',
            padding: '12px 20px',
            background: 'white',
            color: '#1f2937',
            border: '1px solid #e5e7eb',
            borderRadius: 'var(--r-sm)',
            fontSize: '0.88rem',
            fontWeight: 600,
            textDecoration: 'none',
            cursor: 'pointer',
            transition: 'box-shadow 0.15s ease',
          }}
          onMouseOver={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)'}
          onMouseOut={e => e.currentTarget.style.boxShadow = 'none'}
        >
          {/* Google "G" icon */}
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </a>

        {/* Footer */}
        <div style={{ marginTop: 32, fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Miro Partners Ltd · t/a AskMiro Cleaning Services
          <br />
          Access restricted to authorised team members
        </div>
      </div>
    </div>
  )
}
