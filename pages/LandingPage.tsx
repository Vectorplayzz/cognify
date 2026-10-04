import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGoogleLogin, googleLogout } from '@react-oauth/google';
import { signInWithGoogle, hasSession, clearSession } from '../services/apiService';

const LandingPage: React.FC = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState<any>(null);
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const [loginError, setLoginError] = useState<string | null>(null);

    useEffect(() => {
        // A stored profile only counts as signed in while the Cognify session
        // it came with is still valid.
        const storedUser = localStorage.getItem('user');
        if (storedUser && hasSession()) {
            try {
                setUser(JSON.parse(storedUser));
            } catch {
                clearSession();
            }
        } else if (storedUser) {
            clearSession();
        }
    }, []);

    const login = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            setIsLoggingIn(true);
            setLoginError(null);
            try {
                // The server verifies the Google token and issues a Cognify
                // session; the browser never asserts its own identity.
                const { user: account } = await signInWithGoogle(tokenResponse.access_token);
                const profile = {
                    sub: account.google_id,
                    name: account.name,
                    email: account.email,
                    picture: account.picture,
                };
                localStorage.setItem('user', JSON.stringify(profile));
                localStorage.setItem('user_picture', account.picture || '');
                setUser(profile);
                navigate('/roadmap');
            } catch (error: any) {
                console.error('Login failed:', error);
                setLoginError(error?.message || 'Sign-in failed. Please try again.');
            } finally {
                setIsLoggingIn(false);
            }
        },
        onError: () => {
            setLoginError('Google sign-in was cancelled or failed.');
            setIsLoggingIn(false);
        },
    });

    const handleLogout = useCallback(() => {
        googleLogout();
        clearSession();
        setUser(null);
    }, []);

    const GoogleIcon = () => (
        <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
    );

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
            {/* Navbar */}
            <header className="fixed w-full z-50 bg-slate-900/70 backdrop-blur-xl border-b border-white/5">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                                <i className="fas fa-brain text-white text-sm"></i>
                            </div>
                            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">Cognify</span>
                        </div>
                        {user ? (
                            <div className="flex items-center gap-3">
                                <Link
                                    to="/roadmap"
                                    className="group relative px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all duration-300 hover:-translate-y-0.5 overflow-hidden"
                                >
                                    <span className="relative z-10 flex items-center gap-2">
                                        <i className="fas fa-th-large text-xs"></i>
                                        Dashboard
                                    </span>
                                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                </Link>
                                <button
                                    onClick={handleLogout}
                                    className="px-4 py-2.5 text-slate-400 hover:text-white rounded-xl text-sm font-medium transition-all duration-300 hover:bg-white/5 border border-transparent hover:border-white/10"
                                >
                                    <i className="fas fa-sign-out-alt"></i>
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => login()}
                                disabled={isLoggingIn}
                                className="group flex items-center gap-2.5 px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-800 rounded-xl text-sm font-semibold shadow-lg shadow-black/10 hover:shadow-black/20 transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                            >
                                <GoogleIcon />
                                <span>{isLoggingIn ? 'Signing in...' : 'Sign in'}</span>
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <main className="flex-grow">
                <div className="relative isolate px-6 lg:px-8 min-h-screen flex items-center justify-center pt-16">
                    {/* Background Blurs */}
                    <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80" aria-hidden="true">
                        <div className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#ff80b5] to-[#9089fc] opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]" style={{ clipPath: "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)" }}></div>
                    </div>

                    <div className="mx-auto max-w-2xl text-center">
                        <div className="hidden sm:mb-8 sm:flex sm:justify-center">
                            <div className="relative rounded-full px-4 py-1.5 text-sm leading-6 text-slate-400 ring-1 ring-white/10 hover:ring-white/20 transition-all duration-300 backdrop-blur-sm bg-white/[0.03]">
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                    Announcing our new AI features.
                                </span>
                                {' '}
                                <a href="#" className="font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"><span className="absolute inset-0" aria-hidden="true"></span>Read more <span aria-hidden="true">&rarr;</span></a>
                            </div>
                        </div>
                        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl leading-[1.1]">
                            <span className="bg-gradient-to-b from-white to-slate-300 bg-clip-text text-transparent">AI Brain for</span>{' '}
                            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">Your Brain</span>
                        </h1>
                        <p className="mt-6 text-lg leading-8 text-slate-400 max-w-xl mx-auto">
                            Supercharge your learning with AI-powered roadmaps, interactive environments, and personalized guidance. Master complex topics faster than ever.
                        </p>
                        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                            {user ? (
                                <div className="flex items-center gap-4 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl px-6 py-4">
                                    {user.picture && (
                                        <img src={user.picture} alt="avatar" className="w-12 h-12 rounded-full border-2 border-indigo-500/50 shadow-lg shadow-indigo-500/20" />
                                    )}
                                    <div className="text-left">
                                        <p className="text-white font-semibold text-base">{user.name || user.email}</p>
                                        <p className="text-slate-400 text-sm flex items-center gap-1">
                                            <i className="fas fa-check-circle text-emerald-500 text-xs"></i>
                                            Verified
                                        </p>
                                    </div>
                                    <Link
                                        to="/roadmap"
                                        className="group relative ml-4 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all duration-300 hover:-translate-y-0.5 overflow-hidden"
                                    >
                                        <span className="relative z-10 flex items-center gap-2">
                                            Go to Dashboard
                                            <i className="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform duration-300"></i>
                                        </span>
                                        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                                    </Link>
                                </div>
                            ) : (
                                <>
                                    <button
                                        onClick={() => login()}
                                        disabled={isLoggingIn}
                                        className="group relative flex items-center gap-3 px-8 py-4 bg-white hover:bg-slate-50 text-slate-800 rounded-2xl text-base font-semibold shadow-2xl shadow-black/20 hover:shadow-black/30 transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:scale-100"
                                    >
                                        <GoogleIcon />
                                        <span>{isLoggingIn ? 'Signing in...' : 'Sign in with Google'}</span>
                                        <i className="fas fa-arrow-right text-xs text-slate-400 group-hover:translate-x-1 group-hover:text-slate-600 transition-all duration-300"></i>
                                    </button>
                                    <a
                                        href="#features"
                                        className="group flex items-center gap-2 px-6 py-4 text-sm font-semibold text-slate-300 hover:text-white transition-all duration-300 rounded-2xl hover:bg-white/5 border border-transparent hover:border-white/10"
                                    >
                                        Learn more
                                        <span className="group-hover:translate-x-1 transition-transform duration-300" aria-hidden="true">→</span>
                                    </a>
                                    {loginError && (
                                        <p role="alert" className="w-full text-sm text-red-300">{loginError}</p>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    <div className="absolute inset-x-0 top-[calc(100%-13rem)] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[calc(100%-30rem)]" aria-hidden="true">
                        <div className="relative left-[calc(50%+3rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 bg-gradient-to-tr from-[#ff80b5] to-[#9089fc] opacity-20 sm:left-[calc(50%+36rem)] sm:w-[72.1875rem]" style={{ clipPath: "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)" }}></div>
                    </div>
                </div>

                {/* Features Grid */}
                <div id="features" className="bg-slate-900 py-24 sm:py-32 border-t border-white/5">
                    <div className="mx-auto max-w-7xl px-6 lg:px-8">
                        <div className="mx-auto max-w-2xl lg:text-center">
                            <h2 className="text-base font-semibold leading-7 text-indigo-400 tracking-wider uppercase">Learn Faster</h2>
                            <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl bg-gradient-to-b from-white to-slate-300 bg-clip-text text-transparent">Everything you need to master any subject</p>
                            <p className="mt-6 text-lg leading-8 text-slate-400">
                                COgnify combines structured learning paths with interactive tools to help you retain knowledge better.
                            </p>
                        </div>
                        <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-4xl">
                            <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-10 lg:max-w-none lg:grid-cols-2 lg:gap-y-16">
                                {[
                                    { name: 'Interactive Roadmaps', description: 'Visualize your learning journey with dynamic roadmaps that track your progress and guide you step-by-step.', icon: 'fa-map-signs', gradient: 'from-blue-500 to-cyan-500' },
                                    { name: 'AI Playground', description: 'Experiment in a safe, sandboxed environment powered by advanced AI models to test your knowledge in real-time.', icon: 'fa-flask', gradient: 'from-purple-500 to-pink-500' },
                                    { name: 'Smart Chatbot', description: 'Get instant answers to your questions from a context-aware AI tutor that understands your learning path.', icon: 'fa-robot', gradient: 'from-emerald-500 to-teal-500' },
                                    { name: 'Competitive Leaderboards', description: 'Stay motivated by competing with peers and tracking your rank as you master new skills.', icon: 'fa-trophy', gradient: 'from-amber-500 to-orange-500' },
                                ].map((feature) => (
                                    <div key={feature.name} className="group relative pl-16 p-4 rounded-2xl hover:bg-white/[0.02] transition-all duration-300 border border-transparent hover:border-white/5">
                                        <dt className="text-base font-semibold leading-7 text-white">
                                            <div className={`absolute left-4 top-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${feature.gradient} shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                                                <i className={`fas ${feature.icon} text-white`}></i>
                                            </div>
                                            {feature.name}
                                        </dt>
                                        <dd className="mt-2 text-base leading-7 text-slate-400">{feature.description}</dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="bg-slate-900 border-t border-white/5 py-12">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex justify-center text-slate-500">
                    <p>&copy; 2026 Cognify Inc. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
