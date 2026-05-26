import React, { Suspense } from 'react';

export const cachedComponents = {
  CookieBasedGreeting: {
    createElement: () =>
      React.createElement('div', { className: 'dynamic-hole', 'data-ppr': 'cookie-greeting' },
        React.createElement('h2', null, 'Personalized Greeting'),
        React.createElement('p', null, 'Hello, Guest! (based on cookie)'),
        React.createElement('p', { className: 'meta' }, 'user=Guest greeting=Hello')
      ),
  },
  HeaderBasedContent: {
    createElement: () =>
      React.createElement('div', { className: 'dynamic-hole', 'data-ppr': 'header-content' },
        React.createElement('h2', null, 'Request-Time Content'),
        React.createElement('p', null, 'Rendered from real request headers.'),
        React.createElement('ul', null,
          React.createElement('li', null, 'User-Agent: pending...'),
          React.createElement('li', null, 'Language: en-US')
        )
      ),
  },
  AsyncDataWidget: {
    createElement: () =>
      React.createElement('div', { className: 'dynamic-hole', 'data-ppr': 'async-data' },
        React.createElement('h2', null, 'Live Data'),
        React.createElement('p', null, 'Rendered at request time:'),
        React.createElement('ul', null,
          React.createElement('li', null, 'Timestamp: prerendered'),
          React.createElement('li', null, 'Source: cached')
        )
      ),
  },
  AuthBasedSection: {
    createElement: () =>
      React.createElement('div', { className: 'dynamic-hole', 'data-ppr': 'auth-section' },
        React.createElement('h2', null, 'User Profile'),
        React.createElement('p', null, 'Anonymous session.'),
        React.createElement('p', { className: 'meta' }, 'role=viewer authed=false')
      ),
  },
};
