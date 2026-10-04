import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Toaster } from 'sonner';
import App from './App';
import { useTheme } from './lib/theme';
import './index.css';

const GOOGLE_CLIENT_ID = '759044214340-f7qd13jhegegclud1t024rve2dpeqffd.apps.googleusercontent.com';

const ThemedToaster = () => {
    const { theme } = useTheme();
    return (
        <Toaster
            theme={theme}
            position="bottom-right"
            richColors
            closeButton
            toastOptions={{ className: '!rounded-xl !font-sans' }}
        />
    );
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <App />
            <ThemedToaster />
        </GoogleOAuthProvider>
    </React.StrictMode>,
);
