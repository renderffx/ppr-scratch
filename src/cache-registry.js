import React, { Suspense } from 'react';

export const cachedComponents = {
  CookieBasedGreeting: {
    createElement: () =>
      React.createElement('div', { className: 'dynamic-hole', 'data-ppr': 'cookie-greeting' },
        React.createElement('h2', null, 'Personalized Greeting'),
        React.createElement('p', null, 'Hello, User! (cookie-based)')
      ),
  },
  HeaderBasedContent: {
    createElement: () =>
      React.createElement('div', { className: 'dynamic-hole', 'data-ppr': 'header-content' },
        React.createElement('h2', null, 'Request-Time Content'),
        React.createElement('p', null, 'This content was rendered at request time (header-based).')
      ),
  },
  AsyncDataWidget: {
    createElement: () =>
      React.createElement('div', { className: 'dynamic-hole', 'data-ppr': 'async-data' },
        React.createElement('h2', null, 'Live Data'),
        React.createElement('p', null, 'Live data fetched at request time.')
      ),
  },
  AuthBasedSection: {
    createElement: () =>
      React.createElement('div', { className: 'dynamic-hole', 'data-ppr': 'auth-section' },
        React.createElement('h2', null, 'User Profile'),
        React.createElement('p', null, 'User profile based on session.')
      ),
  },
};
