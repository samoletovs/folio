import React, { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { StandaloneApp } from './app.tsx';
import '../styles.css';
import './standalone.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <main className="folio"><h1>folio could not display this page</h1><p>Your saved encrypted portfolio has not been replaced. Reload to lock and reopen it.</p><button onClick={() => window.location.reload()}>Reload folio</button></main> : this.props.children;
  }
}
const element = document.getElementById('root');
if (!element) throw new Error('The folio page root is missing.');
createRoot(element).render(<React.StrictMode><ErrorBoundary><StandaloneApp /></ErrorBoundary></React.StrictMode>);
