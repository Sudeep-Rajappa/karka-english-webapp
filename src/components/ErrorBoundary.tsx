import * as React from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    (this as any).state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    const state = (this as any).state;
    if (state.hasError) {
      let errorMessage = "Something went wrong. Please try again later.";
      
      try {
        // Try to parse Firestore JSON error
        if (state.error?.message) {
          const parsed = JSON.parse(state.error.message);
          if (parsed.error) {
            errorMessage = `Firebase Error: ${parsed.error} (${parsed.operationType} at ${parsed.path})`;
          }
        }
      } catch (e) {
        // Not a JSON error, use default or original message
        errorMessage = state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-indigo-950 p-6">
          <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-[2.5rem] p-10 text-center space-y-6 backdrop-blur-xl">
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-10 h-10 text-red-400" />
            </div>
            <h2 className="text-3xl font-black text-white">Oops!</h2>
            <p className="text-purple-200 text-lg leading-relaxed">
              {errorMessage}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl font-bold text-xl transition-all flex items-center justify-center gap-3 shadow-xl shadow-blue-600/20"
            >
              <RefreshCcw className="w-6 h-6" />
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
