import { Component, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

/** Catches a render crash so the reader sees a way out instead of a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error(error);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="crash" role="alert">
        <h1 className="crash-title">Something broke on this page.</h1>
        <p className="lede">Your topics and ideas are safe. Reloading usually fixes it.</p>
        <button type="button" className="btn btn-solid" onClick={() => location.reload()}>
          Reload
        </button>
      </main>
    );
  }
}
