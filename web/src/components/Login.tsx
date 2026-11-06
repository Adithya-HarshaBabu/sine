import { useEffect, useState } from 'react'
import { SineIcon } from '../icons'

interface Props {
  providerName: string
  /** True while checking for an existing session, before we know whether to ask for a login. */
  restoring: boolean
  error: string | null
  onLogin(): Promise<void>
  onError(message: string | null): void
}

export function Login({ providerName, restoring, error, onLogin, onError }: Props) {
  const [redirecting, setRedirecting] = useState(false)

  // Coming back from the provider with the browser's Back button restores this page as it was left.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => e.persisted && setRedirecting(false)
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  const login = () => {
    onError(null)
    setRedirecting(true)
    onLogin().catch((e) => {
      setRedirecting(false)
      onError(e instanceof Error ? e.message : String(e))
    })
  }

  return (
    <main className="login">
      <svg className="login-wave" viewBox="0 0 1200 240" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 120c100-150 200-150 300 0s200 150 300 0 200-150 300 0 200 150 300 0" />
      </svg>
      <div className="login-card fade-in">
        <div className="brand">
          <SineIcon /> Sine
        </div>
        {restoring ? (
          <p className="muted" role="status">
            Checking your session…
          </p>
        ) : (
          <>
            <div>
              <h1>Log in to Sine</h1>
              <p className="muted">Play your library, playlists and liked songs with your {providerName} account.</p>
            </div>
            {error && (
              <div className="error" role="alert">
                {error}
                <button onClick={() => onError(null)} aria-label="Dismiss">
                  ×
                </button>
              </div>
            )}
            <button className="primary" disabled={redirecting} onClick={login}>
              {redirecting ? `Opening ${providerName}…` : `Continue with ${providerName}`}
            </button>
            <p className="muted small">
              You'll sign in on {providerName}'s own page, and can choose a different account there. Sine never sees your
              password. Playing music here needs {providerName} Premium.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
