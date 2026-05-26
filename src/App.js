import React, { Suspense } from 'react';
import { suspendIfPrerendering, cookies, headers } from './dynamic-apis.js';
import ErrorBoundary from './ErrorBoundary.js';

function StaticHeader() {
  return React.createElement('header', { className: 'ppr-header' },
    React.createElement('div', { className: 'ppr-header-inner' },
      React.createElement('a', { href: '/', className: 'ppr-logo' }, 'PPR Demo'),
      React.createElement('nav', { className: 'ppr-nav' },
        React.createElement('a', { href: '/' }, 'Shell'),
        React.createElement('a', { href: '/live' }, 'Live'),
        React.createElement('a', { href: '/debug' }, 'Debug'),
        React.createElement('a', { href: 'https://github.com/renderffx/ppr-scratch' }, 'GitHub')
      )
    )
  );
}

function StaticFooter() {
  return React.createElement('footer', { className: 'ppr-footer' },
    React.createElement('p', null, '\u00A9 2026 PPR Demo — Static shell prerendered at build time. Dynamic holes resume at request time.')
  );
}

function CookieBasedGreeting() {
  suspendIfPrerendering();

  const c = cookies();
  const userName = c.user || c.username || 'Guest';
  const greeting = c.greeting || 'Hello';

  return React.createElement('div', { className: 'ppr-boundary', 'data-ppr': 'cookie-greeting' },
    React.createElement('div', { className: 'ppr-badge', 'data-type': 'cookie' }, 'Cookie-based'),
    React.createElement('h3', null, 'Personalized Greeting'),
    React.createElement('p', { className: 'ppr-output' }, `${greeting}, ${userName}!`),
    React.createElement('p', { className: 'ppr-meta' }, `cookies: user=${userName} greeting=${greeting}`)
  );
}

function HeaderBasedContent() {
  suspendIfPrerendering();

  const h = headers();
  const ua = (h['user-agent'] || 'unknown').length > 60
    ? (h['user-agent'] || 'unknown').slice(0, 60) + '...'
    : h['user-agent'] || 'unknown';
  const lang = h['accept-language'] || 'en-US';

  return React.createElement('div', { className: 'ppr-boundary', 'data-ppr': 'header-content' },
    React.createElement('div', { className: 'ppr-badge', 'data-type': 'header' }, 'Header-based'),
    React.createElement('h3', null, 'Request-Time Content'),
    React.createElement('p', null, 'Rendered from your actual request headers:'),
    React.createElement('ul', { className: 'ppr-list' },
      React.createElement('li', null, React.createElement('strong', null, 'User-Agent: '), ua),
      React.createElement('li', null, React.createElement('strong', null, 'Language: '), lang)
    )
  );
}

function AsyncDataWidget() {
  suspendIfPrerendering();

  const c = cookies();
  const ts = new Date().toISOString();
  const via = c.source || 'live';

  return React.createElement('div', { className: 'ppr-boundary', 'data-ppr': 'async-data' },
    React.createElement('div', { className: 'ppr-badge', 'data-type': 'time' }, 'Time-based'),
    React.createElement('h3', null, 'Live Timestamp'),
    React.createElement('p', null, 'Rendered at request time:'),
    React.createElement('ul', { className: 'ppr-list' },
      React.createElement('li', null, React.createElement('strong', null, 'Timestamp: '), ts),
      React.createElement('li', null, React.createElement('strong', null, 'Source: '), via)
    )
  );
}

function AuthBasedSection() {
  suspendIfPrerendering();

  const c = cookies();
  const h = headers();
  const token = c.token || h.authorization || '';
  const role = c.role || 'viewer';
  const authed = !!token;

  return React.createElement('div', { className: 'ppr-boundary', 'data-ppr': 'auth-section' },
    React.createElement('div', { className: 'ppr-badge', 'data-type': authed ? 'auth-ok' : 'auth-none' }, authed ? 'Authenticated' : 'Anonymous'),
    React.createElement('h3', null, 'User Profile'),
    React.createElement('p', null, authed ? 'Authenticated session.' : 'Anonymous session. No token provided.'),
    React.createElement('ul', { className: 'ppr-list' },
      React.createElement('li', null, React.createElement('strong', null, 'Role: '), role),
      React.createElement('li', null, React.createElement('strong', null, 'Auth: '), authed ? 'yes' : 'no')
    )
  );
}

function PPRStyles() {
  return React.createElement('style', { dangerouslySetInnerHTML: {
    __html: `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0d1117;color:#e6edf3;line-height:1.6}
.ppr-header{background:#161b22;border-bottom:1px solid #30363d;padding:0 2rem}
.ppr-header-inner{max-width:960px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;height:56px}
.ppr-logo{font-weight:700;font-size:1.1rem;color:#f0e6d0;text-decoration:none}
.ppr-nav{display:flex;gap:1.25rem}
.ppr-nav a{color:#8b949e;text-decoration:none;font-size:.9rem}
.ppr-nav a:hover{color:#58a6ff}
.ppr-content{max-width:960px;margin:0 auto;padding:2rem}
.ppr-section{margin-bottom:2.5rem}
.ppr-section h2{font-size:1.3rem;margin-bottom:1rem;color:#f0e6d0;border-bottom:1px solid #21262d;padding-bottom:.5rem}
.ppr-section p{color:#8b949e;margin-bottom:.75rem;font-size:.95rem}
.ppr-boundary{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1.25rem;margin-bottom:1rem}
.ppr-boundary:hover{border-color:#58a6ff}
.ppr-badge{display:inline-block;font-size:.7rem;padding:2px 10px;border-radius:999px;margin-bottom:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
.ppr-badge[data-type=cookie]{background:#1f6feb;color:#fff}
.ppr-badge[data-type=header]{background:#8957e5;color:#fff}
.ppr-badge[data-type=time]{background:#238636;color:#fff}
.ppr-badge[data-type=auth-ok]{background:#da3633;color:#fff}
.ppr-badge[data-type=auth-none]{background:#484f58;color:#fff}
.ppr-boundary h3{margin-bottom:.5rem;font-size:1rem}
.ppr-boundary p{color:#8b949e;font-size:.9rem;margin-bottom:.5rem}
.ppr-boundary .ppr-output{color:#f0e6d0;font-size:1.2rem;font-weight:600;margin:.5rem 0}
.ppr-meta{color:#484f58;font-size:.8rem;font-family:monospace;margin-top:.5rem}
.ppr-list{list-style:none;padding:0}
.ppr-list li{padding:.25rem 0;color:#8b949e;font-size:.9rem}
.ppr-list li strong{color:#e6edf3}
.ppr-footer{text-align:center;padding:2rem;color:#484f58;font-size:.85rem;border-top:1px solid #21262d;margin-top:2rem}
.suspense-placeholder{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1.25rem;margin-bottom:1rem;color:#8b949e;font-size:.9rem;opacity:.7}
.suspense-placeholder::before{content:"\\23F3  ";font-size:1rem}
hr{border:none;border-top:1px solid #21262d;margin:2rem 0}
a{color:#58a6ff}
`
  }});
}

export default function App() {
  return React.createElement('html', { lang: 'en' },
    React.createElement('head', null,
      React.createElement('meta', { charSet: 'utf-8' }),
      React.createElement('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
      React.createElement('title', null, 'PPR Demo - Partial Prerendering'),
      React.createElement('meta', { name: 'description', content: 'Next.js-style Partial Prerendering engine demo' }),
      React.createElement(PPRStyles, null)
    ),
    React.createElement('body', null,
      React.createElement(StaticHeader, null),
      React.createElement('div', { className: 'ppr-content' },
        React.createElement('section', { className: 'ppr-section' },
          React.createElement('h2', null, 'Static Content (Prerendered)'),
          React.createElement('p', null, 'This section was rendered at build time and served instantly from the static shell. No request-time data needed.'),
          React.createElement('p', null, 'The HTML below contains Suspense boundary markers (' + '<!--$?-->' + ') where dynamic content will be injected at request time.')
        ),
        React.createElement('hr', null),
        React.createElement('section', { className: 'ppr-section' },
          React.createElement('h2', null, 'Dynamic Boundaries (PPR Holes)'),
          React.createElement('p', null, 'Each boundary below suspended during prerender. At request time, ' + 'resumeToPipeableStream' + ' replays them with your actual request data.'),
          React.createElement(ErrorBoundary, { name: 'CookieBasedGreeting' },
            React.createElement(Suspense, { fallback: React.createElement('div', { className: 'suspense-placeholder' }, 'Loading personalized greeting...') },
              React.createElement(CookieBasedGreeting, null)
            )
          ),
          React.createElement(ErrorBoundary, { name: 'HeaderBasedContent' },
            React.createElement(Suspense, { fallback: React.createElement('div', { className: 'suspense-placeholder' }, 'Loading request-time content...') },
              React.createElement(HeaderBasedContent, null)
            )
          ),
          React.createElement(ErrorBoundary, { name: 'AsyncDataWidget' },
            React.createElement(Suspense, { fallback: React.createElement('div', { className: 'suspense-placeholder' }, 'Loading live data...') },
              React.createElement(AsyncDataWidget, null)
            )
          ),
          React.createElement(ErrorBoundary, { name: 'AuthBasedSection' },
            React.createElement(Suspense, { fallback: React.createElement('div', { className: 'suspense-placeholder' }, 'Loading user profile...') },
              React.createElement(AuthBasedSection, null)
            )
          )
        )
      ),
      React.createElement(StaticFooter, null)
    )
  );
}
