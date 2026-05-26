import React, { Suspense } from 'react';
import { suspendIfPrerendering, cookies, headers } from './dynamic-apis.js';
import ErrorBoundary from './ErrorBoundary.js';

function StaticHeader() {
  return React.createElement('header', { className: 'static-shell' },
    React.createElement('h1', null, 'PPR Demo App'),
    React.createElement('nav', null,
      React.createElement('a', { href: '/' }, 'Home'),
      React.createElement('span', null, ' | '),
      React.createElement('a', { href: '/about' }, 'About'),
      React.createElement('span', null, ' | '),
      React.createElement('a', { href: '/dashboard' }, 'Dashboard')
    )
  );
}

function StaticFooter() {
  return React.createElement('footer', { className: 'static-shell' },
    React.createElement('hr', null),
    React.createElement('p', null, '\u00A9 2026 PPR Demo. Static shell prerendered at build time.')
  );
}

function CookieBasedGreeting() {
  suspendIfPrerendering();

  const c = cookies();
  const userName = c.user || c.username || 'Guest';
  const greeting = c.greeting || 'Hello';

  return React.createElement('div', { className: 'dynamic-hole', 'data-ppr': 'cookie-greeting' },
    React.createElement('h2', null, 'Personalized Greeting'),
    React.createElement('p', null, `${greeting}, ${userName}! (based on cookie)`),
    React.createElement('p', { className: 'meta' }, `user=${userName} greeting=${greeting}`)
  );
}

function HeaderBasedContent() {
  suspendIfPrerendering();

  const h = headers();
  const ua = h['user-agent'] || 'unknown';
  const lang = h['accept-language'] || 'en-US';

  return React.createElement('div', { className: 'dynamic-hole', 'data-ppr': 'header-content' },
    React.createElement('h2', null, 'Request-Time Content'),
    React.createElement('p', null, 'Rendered from real request headers.'),
    React.createElement('ul', null,
      React.createElement('li', null, `User-Agent: ${ua}`),
      React.createElement('li', null, `Language: ${lang}`)
    )
  );
}

function AsyncDataWidget() {
  suspendIfPrerendering();

  const c = cookies();
  const ts = new Date().toISOString();
  const via = c.source || 'direct';

  return React.createElement('div', { className: 'dynamic-hole', 'data-ppr': 'async-data' },
    React.createElement('h2', null, 'Live Data'),
    React.createElement('p', null, 'Rendered at request time:'),
    React.createElement('ul', null,
      React.createElement('li', null, `Timestamp: ${ts}`),
      React.createElement('li', null, `Source: ${via}`)
    )
  );
}

function AuthBasedSection() {
  suspendIfPrerendering();

  const c = cookies();
  const h = headers();
  const token = c.token || h.authorization || 'none';
  const role = c.role || 'viewer';
  const authed = token !== 'none';

  return React.createElement('div', { className: 'dynamic-hole', 'data-ppr': 'auth-section' },
    React.createElement('h2', null, 'User Profile'),
    React.createElement('p', null, authed ? 'Authenticated session.' : 'Anonymous session.'),
    React.createElement('p', { className: 'meta' }, `role=${role} authed=${authed}`)
  );
}

export default function App() {
  return React.createElement('html', { lang: 'en' },
    React.createElement('head', null,
      React.createElement('meta', { charSet: 'utf-8' }),
      React.createElement('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
      React.createElement('title', null, 'PPR Demo - Partial Prerendering'),
      React.createElement('meta', { name: 'description', content: 'Next.js-style Partial Prerendering engine demo' })
    ),
    React.createElement('body', null,
      React.createElement(StaticHeader, null),
      React.createElement('main', null,
        React.createElement('section', { className: 'static-content' },
          React.createElement('h2', null, 'Static Content'),
          React.createElement('p', null, 'This content is prerendered at build time and served instantly from the static shell.'),
          React.createElement('p', null, 'It does not depend on any request-time data (cookies, headers, searchParams, etc.).')
        ),
        React.createElement('hr', null),
        React.createElement('section', { className: 'dynamic-zone' },
          React.createElement('h2', null, 'Dynamic Holes (PPR Boundaries)'),
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
