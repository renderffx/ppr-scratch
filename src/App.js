import React, { Suspense } from 'react';
import { suspendIfPrerendering } from './dynamic-apis.js';
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
    React.createElement('p', null, '© 2026 PPR Demo. Static shell prerendered at build time.')
  );
}

function CookieBasedGreeting() {
  suspendIfPrerendering();

  return React.createElement('div', { className: 'dynamic-hole', 'data-ppr': 'cookie-greeting' },
    React.createElement('h2', null, 'Personalized Greeting'),
    React.createElement('p', null, 'Hello, User! (cookie-based)')
  );
}

function HeaderBasedContent() {
  suspendIfPrerendering();

  return React.createElement('div', { className: 'dynamic-hole', 'data-ppr': 'header-content' },
    React.createElement('h2', null, 'Request-Time Content'),
    React.createElement('p', null, 'This content was rendered at request time (header-based).')
  );
}

function AsyncDataWidget() {
  suspendIfPrerendering();

  return React.createElement('div', { className: 'dynamic-hole', 'data-ppr': 'async-data' },
    React.createElement('h2', null, 'Live Data'),
    React.createElement('p', null, 'Live data fetched at request time.')
  );
}

function AuthBasedSection() {
  suspendIfPrerendering();

  return React.createElement('div', { className: 'dynamic-hole', 'data-ppr': 'auth-section' },
    React.createElement('h2', null, 'User Profile'),
    React.createElement('p', null, 'User profile based on session.')
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
