import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  declare props: Readonly<Props>;
  declare state: Readonly<State>;
  declare setState: React.Component<Props, State>['setState'];

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#f4f1ea] flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md bg-white border border-[#ebdcca] rounded-3xl p-8 shadow-xl">
            <div className="w-16 h-16 bg-amber-100 text-amber-800 rounded-2xl flex items-center justify-center mx-auto mb-4 font-bold text-2xl">
              🐢
            </div>
            <h1 className="font-display font-black text-xl text-[#3a342a] mb-2">Something went wrong</h1>
            <p className="text-sm text-neutral-600 mb-6 font-sans">
              An unexpected display issue occurred. Don&apos;t worry, your network data is safe.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="w-full py-3 px-6 bg-[#3a342a] hover:bg-black text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95"
            >
              Refresh Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
