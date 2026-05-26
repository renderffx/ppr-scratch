import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary] ${this.props.name || 'Boundary'} failed:`, error?.message || error);
  }

  render() {
    if (this.state.error) {
      const fallback = this.props.fallback;
      if (fallback) return fallback;
      return React.createElement('div', { className: 'ppr-error-boundary', 'data-boundary': this.props.name || 'unknown' },
        React.createElement('p', { style: { color: 'red' } },
          `Failed to render: ${this.state.error?.message || 'Unknown error'}`
        )
      );
    }
    return this.props.children;
  }
}
