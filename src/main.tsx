import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Toaster } from 'sonner';
import App from './App';
import { useTheme } from './lib/theme';
import './styles.css';

const GOOGLE_CLIENT_ID = '759044214340-f7qd13jhegegclud1t024rve2dpeqffd.apps.googleusercontent.com';

const ThemedToaster = () => {
    const { theme } = useTheme();
    return <Toaster theme={theme} position="top-center" offset={80} richColors closeButton toastOptions={{ className: '!rounded-2xl !border-2 !font-sans !font-semibold' }} />;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <App />
            <ThemedToaster />
        </GoogleOAuthProvider>
    </React.StrictMode>,
);
