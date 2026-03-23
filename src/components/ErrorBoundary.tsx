import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      let detailedInfo = null;

      try {
        if (this.state.error?.message) {
          const parsedError = JSON.parse(this.state.error.message);
          if (parsedError.error) {
            errorMessage = `Firestore Error: ${parsedError.error}`;
            detailedInfo = (
              <div style={{ marginTop: '10px', fontSize: '12px', textAlign: 'left', background: '#fef2f2', padding: '10px', borderRadius: '4px', border: '1px solid #fee2e2' }}>
                <p><strong>Operation:</strong> {parsedError.operationType}</p>
                <p><strong>Path:</strong> {parsedError.path}</p>
                <p><strong>User ID:</strong> {parsedError.authInfo.userId}</p>
                <p><strong>Email:</strong> {parsedError.authInfo.email} ({parsedError.authInfo.emailVerified ? 'Verified' : 'Not Verified'})</p>
              </div>
            );
          }
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'sans-serif' }}>
          <h2 style={{ color: '#ef4444' }}>{errorMessage}</h2>
          {detailedInfo}
          <button 
            onClick={() => window.location.reload()} 
            style={{ marginTop: '20px', padding: '10px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
