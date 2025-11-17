import React, { useState, useRef, useEffect, useCallback } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, PieChart, Pie, Cell, ReferenceLine } from 'recharts';
import { Job, JobStatus, Expense, ExpenseCategory, ChatMessage, Screen, UserProfile, Notification, Conversation, AIAction, ActionExecutionResult } from './types';
import { JOB_STATUS_COLORS, BriefcaseIcon, CreditCardIcon, ChartBarIcon, DocumentIcon, ChatBubbleIcon, CogIcon, PaperclipIcon, MicrophoneIcon, SendIcon, PlusIcon, ArrowLeftIcon, XMarkIcon, TrendingUpIcon, CurrencyDollarIcon, ScaleIcon, Logo, MagnifyingGlassIcon, SparklesIcon, CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, TrashIcon, PencilIcon, BellIcon, EllipsisHorizontalIcon, UserIcon, ShieldCheckIcon, PaintBrushIcon, GlobeAltIcon, KeyIcon, CreditCardIconAlt, InformationCircleIcon, ChevronRightIconAlt } from './constants';
import { aiService } from './services/aiService';
import { actionService } from './services/actionService';
import { speechService } from './services/speechService';
import { createMessageId } from './services/chatUtils';
import { ReceiptScanner } from './components/ReceiptScanner';
import { fileToBase64 } from './services/ocrService';
import { supabase } from './services/supabaseClient';
import { authService } from './services/authService';

// Parse a YYYY-MM-DD date string as a LOCAL date (not UTC) to avoid timezone issues
function parseLocalDate(dateStr: string): Date {
    // If it's already in YYYY-MM-DD format, parse it as local date to avoid UTC conversion
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day); // Local date, not UTC
    }
    // For other formats, use standard Date parsing
    return new Date(dateStr);
}

// Format a date string (YYYY-MM-DD) to a localized date string without timezone issues
function formatLocalDate(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
    const date = parseLocalDate(dateStr);
    return date.toLocaleDateString('fr-CA', options || { year: 'numeric', month: 'long', day: 'numeric' });
}

// Normalize various date strings into YYYY-MM-DD; fallback to today
function normalizeDateToISO(input?: string): string {
    if (!input) return new Date().toISOString().split('T')[0];
    // Try patterns: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, YYYY/MM/DD, "Nov 16 2025", etc.
    const trimmed = input.trim();
    // If already ISO-like
    const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (isoMatch) {
        const [_, y, m, d] = isoMatch;
        const dt = new Date(Number(y), Number(m) - 1, Number(d));
        if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
    }
    // DD/MM/YYYY or MM/DD/YYYY – detect by values > 12 as day
    const slash = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (slash) {
        let d = Number(slash[1]);
        let m = Number(slash[2]);
        let y = Number(slash[3]);
        if (y < 100) y += 2000;
        // If first is >12, assume DD/MM
        if (d > 12) {
            // d as day, m as month
        } else if (m > 12) {
            // swap
            const t = d; d = m; m = t;
        }
        const dt = new Date(y, m - 1, d);
        if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
    }
    // Month name formats
    const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const monthRegex = new RegExp(`(${monthNames.join('|')})[a-z]*[\\s,.\\-]+(\\d{1,2})[\\s,.\\-]+(\\d{2,4})`, 'i');
    const named = trimmed.match(monthRegex);
    if (named) {
        const mIdx = monthNames.findIndex(m => named[1].toLowerCase().startsWith(m)) + 1;
        const d = Number(named[2]);
        let y = Number(named[3]);
        if (y < 100) y += 2000;
        const dt = new Date(y, mIdx - 1, d);
        if (!isNaN(dt.getTime())) return dt.toISOString().split('T')[0];
    }
    // Fallback
    return new Date().toISOString().split('T')[0];
}

interface IconProps {
    className?: string;
}

// Reusable UI Components

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className = '', onClick }) => (
  <div
    onClick={onClick}
    className={`bg-white rounded-lg shadow-card p-6 border border-fiscalia-primary-dark/5 ${className} ${onClick ? 'cursor-pointer hover:shadow-card-hover transition-shadow' : ''}`}
  >
    {children}
  </div>
);

interface ButtonProps {
  children: React.ReactNode;
  onClick?: (e?: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  type?: 'button' | 'submit' | 'reset';
  active?: boolean;
  disabled?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ children, onClick, className = '', variant = 'primary', type = 'button', active = false, disabled = false }) => {
  const baseClasses = 'px-6 py-3 rounded-lg font-medium transition-all duration-200 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed';
  const variantClasses = {
    primary: 'bg-fiscalia-accent-gold text-white shadow-button hover:brightness-105 focus:ring-fiscalia-accent-gold',
    secondary: 'bg-transparent border border-fiscalia-accent-gold text-fiscalia-accent-gold hover:bg-fiscalia-accent-gold hover:text-white focus:ring-fiscalia-accent-gold',
    ghost: `text-fiscalia-primary-dark/70 hover:bg-fiscalia-primary-dark/5 hover:text-fiscalia-primary-dark ${active ? 'bg-fiscalia-primary-dark/5 text-fiscalia-primary-dark' : ''}`
  };
  return (
    <button type={type} onClick={onClick} className={`${baseClasses} ${variantClasses[variant]} ${className}`} disabled={disabled}>
      {children}
    </button>
  );
};


interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    size?: 'md' | 'lg' | '2xl';
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
    if (!isOpen) return null;
    
    const sizeClasses = {
        md: 'max-w-md',
        lg: 'max-w-xl',
        '2xl': 'max-w-4xl'
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 transition-opacity duration-300" onClick={onClose}>
            <div className={`bg-white rounded-lg shadow-xl w-full ${sizeClasses[size]}`} onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-6 border-b border-fiscalia-primary-dark/10">
                    <h2 className="text-3xl font-display font-medium tracking-tight text-fiscalia-primary-dark">{title}</h2>
                    <button type="button" onClick={onClose} className="text-fiscalia-primary-dark/50 hover:text-fiscalia-primary-dark">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>
                <div className="p-6">
                    {children}
                </div>
            </div>
        </div>
    );
};

interface ToastProps {
    message: string;
    isVisible: boolean;
}

export const Toast: React.FC<ToastProps> = ({ message, isVisible }) => (
    <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 bg-fiscalia-primary-dark text-white px-6 py-3 rounded-lg shadow-lg transition-all duration-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {message}
    </div>
);

interface AuthScreenProps {
    mode: 'signin' | 'signup';
    onModeChange: (mode: 'signin' | 'signup') => void;
    onSignIn: (payload: { email: string; password: string }) => Promise<void>;
    onSignUp: (payload: { email: string; password: string; name?: string }) => Promise<void>;
    onForgotPassword?: (email: string) => Promise<void>;
    isLoading: boolean;
    error?: string | null;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ mode, onModeChange, onSignIn, onSignUp, onForgotPassword, isLoading, error }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [showForgotPassword, setShowForgotPassword] = useState(false);
    const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
    const [isRequestingReset, setIsRequestingReset] = useState(false);
    const [resetSuccess, setResetSuccess] = useState(false);
    const [resetError, setResetError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (mode === 'signin') {
            await onSignIn({ email, password });
        } else {
            await onSignUp({ email, password, name });
        }
    };

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!forgotPasswordEmail) {
            setResetError('Veuillez entrer votre adresse email');
            return;
        }
        setIsRequestingReset(true);
        setResetError(null);
        try {
            if (onForgotPassword) {
                await onForgotPassword(forgotPasswordEmail);
                setResetSuccess(true);
            }
        } catch (error) {
            setResetError(error instanceof Error ? error.message : 'Erreur lors de l\'envoi de l\'email de réinitialisation');
        } finally {
            setIsRequestingReset(false);
        }
    };

    if (showForgotPassword) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-fiscalia-primary-dark text-white p-4">
                <div className="w-full max-w-md bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-8 shadow-2xl space-y-6">
                    <div className="flex items-center justify-center gap-3">
                        <Logo className="w-10 h-10 text-fiscalia-accent-gold" />
                        <h1 className="text-3xl font-display font-semibold tracking-tight">Fiscalia</h1>
                    </div>
                    <div className="text-center space-y-1">
                        <h2 className="text-xl font-medium">Mot de passe oublié</h2>
                        <p className="text-sm text-white/70">
                            Entrez votre adresse email et nous vous enverrons un lien pour réinitialiser votre mot de passe.
                        </p>
                    </div>
                    {resetSuccess ? (
                        <div className="space-y-4 text-center">
                            <div className="bg-green-500/20 border border-green-500/40 text-green-400 text-sm px-3 py-2 rounded-lg">
                                Un email de réinitialisation a été envoyé à {forgotPasswordEmail}. Vérifiez votre boîte de réception.
                            </div>
                            <button
                                type="button"
                                className="text-sm text-white/70 hover:text-white hover:underline"
                                onClick={() => {
                                    setShowForgotPassword(false);
                                    setResetSuccess(false);
                                    setResetError(null);
                                    setForgotPasswordEmail('');
                                }}
                            >
                                Retour à la connexion
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleForgotPassword} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-white/70 mb-1">Adresse courriel</label>
                                <input
                                    type="email"
                                    value={forgotPasswordEmail}
                                    onChange={e => setForgotPasswordEmail(e.target.value)}
                                    className="w-full bg-white/10 text-white placeholder:text-white/50 p-3 rounded-lg border border-white/10 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/60"
                                    placeholder="vous@exemple.com"
                                    disabled={isRequestingReset}
                                    required
                                />
                            </div>
                            {resetError && (
                                <div className="bg-fiscalia-error/20 border border-fiscalia-error/40 text-fiscalia-error text-sm px-3 py-2 rounded-lg">
                                    {resetError}
                                </div>
                            )}
                            <Button type="submit" className="w-full" disabled={isRequestingReset}>
                                {isRequestingReset ? 'Envoi en cours...' : 'Envoyer le lien de réinitialisation'}
                            </Button>
                            <div className="text-center">
                                <button
                                    type="button"
                                    className="text-sm text-white/70 hover:text-white hover:underline"
                                    onClick={() => {
                                        setShowForgotPassword(false);
                                        setResetError(null);
                                        setForgotPasswordEmail('');
                                    }}
                                    disabled={isRequestingReset}
                                >
                                    Retour à la connexion
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-fiscalia-primary-dark text-white p-4">
            <div className="w-full max-w-md bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-8 shadow-2xl space-y-6">
                <div className="flex items-center justify-center gap-3">
                    <Logo className="w-10 h-10 text-fiscalia-accent-gold" />
                    <h1 className="text-3xl font-display font-semibold tracking-tight">Fiscalia</h1>
                </div>
                <div className="text-center space-y-1">
                    <h2 className="text-xl font-medium">
                        {mode === 'signin' ? 'Connexion sécurisée' : 'Créer un compte'}
                    </h2>
                    <p className="text-sm text-white/70">
                        Utilisez votre adresse courriel et un mot de passe robuste.
                    </p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {mode === 'signup' && (
                        <div>
                            <label className="block text-sm font-medium text-white/70 mb-1">Nom complet</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full bg-white/10 text-white placeholder:text-white/50 p-3 rounded-lg border border-white/10 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/60"
                                placeholder="Jean Dupont"
                                disabled={isLoading}
                            />
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-white/70 mb-1">Adresse courriel</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className="w-full bg-white/10 text-white placeholder:text-white/50 p-3 rounded-lg border border-white/10 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/60"
                            placeholder="vous@exemple.com"
                            disabled={isLoading}
                            required
                        />
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="block text-sm font-medium text-white/70">Mot de passe</label>
                            {mode === 'signin' && onForgotPassword && (
                                <button
                                    type="button"
                                    className="text-xs text-fiscalia-accent-gold hover:underline"
                                    onClick={() => setShowForgotPassword(true)}
                                    disabled={isLoading}
                                >
                                    Mot de passe oublié?
                                </button>
                            )}
                        </div>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full bg-white/10 text-white placeholder:text-white/50 p-3 rounded-lg border border-white/10 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/60"
                            placeholder="********"
                            disabled={isLoading}
                            required
                        />
                    </div>
                    {error && (
                        <div className="bg-fiscalia-error/20 border border-fiscalia-error/40 text-fiscalia-error text-sm px-3 py-2 rounded-lg">
                            {error}
                        </div>
                    )}
                    <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading
                            ? 'Connexion en cours...'
                            : mode === 'signin'
                                ? 'Se connecter'
                                : 'Créer le compte'}
                    </Button>
                </form>
                <div className="text-center text-sm text-white/70">
                    {mode === 'signin' ? (
                        <>
                            Pas encore de compte?{' '}
                            <button
                                type="button"
                                className="text-fiscalia-accent-gold hover:underline"
                                onClick={() => onModeChange('signup')}
                                disabled={isLoading}
                            >
                                S'inscrire
                            </button>
                        </>
                    ) : (
                        <>
                            Déjà inscrit?{' '}
                            <button
                                type="button"
                                className="text-fiscalia-accent-gold hover:underline"
                                onClick={() => onModeChange('signin')}
                                disabled={isLoading}
                            >
                                Se connecter
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

interface ResetPasswordScreenProps {
    onPasswordReset?: () => void;
    onCancel?: () => void;
}

export const ResetPasswordScreen: React.FC<ResetPasswordScreenProps> = ({ onPasswordReset, onCancel }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [hasSession, setHasSession] = useState(false);

    // Check for recovery session when component mounts
    useEffect(() => {
        const checkSession = async () => {
            try {
                const session = await authService.getSession();
                setHasSession(!!session);
                if (!session) {
                    setError('Session de récupération invalide ou expirée. Veuillez demander un nouveau lien de réinitialisation.');
                }
            } catch (error) {
                console.error('Failed to check session', error);
                setHasSession(false);
                setError('Impossible de vérifier la session. Veuillez réessayer.');
            }
        };
        checkSession();

        // Also listen for auth state changes
        const unsubscribe = authService.onAuthStateChange((session) => {
            setHasSession(!!session);
            if (session) {
                setError(null);
            }
        });

        return () => {
            unsubscribe();
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!password || !confirmPassword) {
            setError('Veuillez remplir tous les champs');
            return;
        }

        if (password !== confirmPassword) {
            setError('Les mots de passe ne correspondent pas');
            return;
        }

        if (password.length < 8) {
            setError('Le mot de passe doit contenir au moins 8 caractères');
            return;
        }

        // Verify we have a session before attempting to update password
        if (!hasSession) {
            setError('Session de récupération invalide ou expirée. Veuillez demander un nouveau lien de réinitialisation.');
            return;
        }

        setIsLoading(true);
        try {
            await authService.updatePassword(password);
            setSuccess(true);
            if (onPasswordReset) {
                setTimeout(() => {
                    onPasswordReset();
                }, 2000);
            }
        } catch (error) {
            console.error('Failed to reset password', error);
            setError(error instanceof Error ? error.message : 'Erreur lors de la réinitialisation du mot de passe. Le lien peut être expiré ou invalide.');
        } finally {
            setIsLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-fiscalia-primary-dark text-white p-4">
                <div className="w-full max-w-md bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-8 shadow-2xl space-y-6 text-center">
                    <div className="flex items-center justify-center gap-3">
                        <Logo className="w-10 h-10 text-fiscalia-accent-gold" />
                        <h1 className="text-3xl font-display font-semibold tracking-tight">Fiscalia</h1>
                    </div>
                    <div className="space-y-4">
                        <div className="text-6xl">✓</div>
                        <h2 className="text-2xl font-medium">Mot de passe réinitialisé</h2>
                        <p className="text-white/70">
                            Votre mot de passe a été réinitialisé avec succès. Vous allez être redirigé vers la page de connexion.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-fiscalia-primary-dark text-white p-4">
            <div className="w-full max-w-md bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-8 shadow-2xl space-y-6">
                <div className="flex items-center justify-center gap-3">
                    <Logo className="w-10 h-10 text-fiscalia-accent-gold" />
                    <h1 className="text-3xl font-display font-semibold tracking-tight">Fiscalia</h1>
                </div>
                <div className="text-center space-y-1">
                    <h2 className="text-xl font-medium">Réinitialiser le mot de passe</h2>
                    <p className="text-sm text-white/70">
                        Entrez votre nouveau mot de passe ci-dessous.
                    </p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-white/70 mb-1">Nouveau mot de passe</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full bg-white/10 text-white placeholder:text-white/50 p-3 rounded-lg border border-white/10 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/60"
                            placeholder="Minimum 8 caractères"
                            disabled={isLoading}
                            required
                            minLength={8}
                        />
                        <p className="text-xs text-white/60 mt-1">Le mot de passe doit contenir au moins 8 caractères</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-white/70 mb-1">Confirmer le mot de passe</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            className="w-full bg-white/10 text-white placeholder:text-white/50 p-3 rounded-lg border border-white/10 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/60"
                            placeholder="Confirmez votre mot de passe"
                            disabled={isLoading}
                            required
                            minLength={8}
                        />
                    </div>
                    {error && (
                        <div className="bg-fiscalia-error/20 border border-fiscalia-error/40 text-fiscalia-error text-sm px-3 py-2 rounded-lg">
                            {error}
                        </div>
                    )}
                    <Button type="submit" className="w-full" disabled={isLoading || !hasSession}>
                        {isLoading ? 'Réinitialisation en cours...' : hasSession ? 'Réinitialiser le mot de passe' : 'En attente de la session...'}
                    </Button>
                </form>
                {onCancel && (
                    <div className="text-center">
                        <button
                            type="button"
                            className="text-sm text-white/70 hover:text-white hover:underline"
                            onClick={onCancel}
                            disabled={isLoading}
                        >
                            Annuler
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({ 
    isOpen, 
    onClose, 
    onConfirm, 
    title, 
    message, 
    confirmText = 'Supprimer',
    cancelText = 'Annuler'
}) => {
    if (!isOpen) return null;

    const handleConfirm = () => {
        onConfirm();
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 transition-opacity duration-300" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-6 border-b border-fiscalia-primary-dark/10">
                    <h2 className="text-2xl font-display font-medium tracking-tight text-fiscalia-primary-dark">{title}</h2>
                    <button type="button" onClick={onClose} className="text-fiscalia-primary-dark/50 hover:text-fiscalia-primary-dark">
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>
                <div className="p-6">
                    <p className="text-fiscalia-primary-dark/80 mb-6">{message}</p>
                    <div className="flex justify-end gap-3">
                        <Button variant="ghost" onClick={onClose}>
                            {cancelText}
                        </Button>
                        <Button variant="primary" onClick={handleConfirm} className="bg-fiscalia-error hover:bg-fiscalia-error/90">
                            {confirmText}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};


// Dashboard Components

interface StatCardProps {
    title: string;
    value: string;
    change?: number;
    centered?: boolean;
    compact?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, change, centered = false, compact = false }) => {
    const trimmedValue = value.trim();
    const lengthForSizing = trimmedValue.replace(/\s+/g, '').length;

    // For compact cards, use a fixed font size that matches typical currency values
    // This ensures single numbers and currency values have the same size
    let fontSizeVars: React.CSSProperties;
    if (compact) {
        fontSizeVars = {
            '--stat-font-size': '20px', // Fixed size for mobile compact cards
            '--stat-font-size-lg': '24px', // Fixed size for desktop compact cards
        } as React.CSSProperties;
    } else {
        // Base sizes favor large readable numbers while still leaving consistent card padding.
        const mobileBasePx = 28; // approx Tailwind text-2xl
        const desktopBasePx = 32; // approx Tailwind text-3xl
        const minMobilePx = 16;
        const minDesktopPx = 18;
        const reductionPerCharMobile = 1.8;
        const reductionPerCharDesktop = 2.0;
        const overflowCount = Math.max(0, lengthForSizing - 4);
        const computedMobilePx = Math.max(minMobilePx, mobileBasePx - overflowCount * reductionPerCharMobile);
        const computedDesktopPx = Math.max(minDesktopPx, desktopBasePx - overflowCount * reductionPerCharDesktop);
        fontSizeVars = {
            '--stat-font-size': `${computedMobilePx}px`,
            '--stat-font-size-lg': `${computedDesktopPx}px`,
        } as React.CSSProperties;
    }

    const trailingSymbol = trimmedValue.slice(-1);
    const isCurrencySymbol = /[\p{Sc}]/u.test(trailingSymbol);
    const numericPortion = isCurrencySymbol ? trimmedValue.slice(0, -1).trim() : trimmedValue;

    return (
        <Card className={`flex flex-col h-full ${compact ? 'min-h-[100px]' : 'min-h-[140px]'}`}>
            <div className={`flex-shrink-0 ${centered ? 'text-center' : ''}`}>
                <p className="text-fiscalia-primary-dark/70 text-[10px] sm:text-xs font-medium tracking-wide whitespace-nowrap">{title}</p>
                {/* Responsive font size with improved currency handling */}
                <div
                    className={`font-bold text-fiscalia-primary-dark mt-2 leading-tight text-[length:var(--stat-font-size)] sm:text-[length:var(--stat-font-size-lg)] ${centered ? 'flex justify-center' : ''}`}
                    style={fontSizeVars}
                >
                    {isCurrencySymbol ? (
                        <span className="inline-flex items-baseline gap-1 whitespace-nowrap tracking-tight">
                            <span className="leading-none">{numericPortion}</span>
                            <span className="leading-none">{trailingSymbol}</span>
                        </span>
                    ) : (
                        <span className="inline-flex whitespace-nowrap tracking-tight leading-none">{numericPortion}</span>
                    )}
                </div>
            </div>
            {!compact && <div className="flex-grow" />}
            <div className={`${compact ? 'mt-2' : 'mt-3'} flex-shrink-0 ${centered ? 'text-center' : ''}`}>
                {change !== undefined && (
                    <p className={`text-xs sm:text-sm leading-tight ${change >= 0 ? 'text-fiscalia-success' : 'text-fiscalia-error'}`}>
                        <span className="inline-block">{change >= 0 ? '▲' : '▼'}</span> {Math.abs(change)}% vs la période précédente
                    </p>
                )}
            </div>
        </Card>
    );
};

const ProfitTrendChart: React.FC<{ jobs: Job[] }> = ({ jobs }) => {
    // Calculate monthly profit from jobs
    const calculateMonthlyProfit = (): { name: string; profit: number }[] => {
        // Group jobs by month based on endDate (or startDate if no endDate)
        const monthlyProfit: { [key: string]: number } = {};
        
        jobs.forEach(job => {
            // Use endDate if available, otherwise use startDate
            const dateStr = job.endDate || job.startDate;
            if (!dateStr) return;
            
            const date = new Date(dateStr);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            
            if (!monthlyProfit[monthKey]) {
                monthlyProfit[monthKey] = 0;
            }
            
            monthlyProfit[monthKey] += job.profit;
        });
        
        // Convert to array and sort by date
        const sortedMonths = Object.keys(monthlyProfit)
            .sort()
            .map(monthKey => {
                const [year, month] = monthKey.split('-');
                const date = new Date(parseInt(year), parseInt(month) - 1, 1);
                const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
                return {
                    name: `${monthNames[date.getMonth()]} ${year.slice(-2)}`,
                    profit: monthlyProfit[monthKey]
                };
            });
        
        // Show last 12 months or all available months if less than 12
        if (sortedMonths.length === 0) {
            // If no jobs, show empty chart
            return [];
        }
        
        // Return last 12 months
        return sortedMonths.slice(-12);
    };
    
    const profitChartData = calculateMonthlyProfit();
    
    // Handle empty state
    if (profitChartData.length === 0) {
        return (
            <Card className="h-96 flex flex-col items-center justify-center text-center">
                <ChartBarIcon className="w-12 h-12 mx-auto text-fiscalia-primary-dark/20" />
                <p className="mt-4 text-fiscalia-primary-dark/70">Aucune donnée de profit</p>
                <p className="text-sm text-fiscalia-primary-dark/50">Les profits apparaîtront ici une fois que vous aurez des contrats.</p>
            </Card>
        );
    }
    
    return (
        <Card className="h-96 flex flex-col min-w-0">
            <h3 className="text-xl font-normal font-display tracking-tight text-fiscalia-primary-dark mb-4 flex-shrink-0">Évolution du Profit</h3>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={profitChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1B1F2A" strokeOpacity="0.05" />
                        <XAxis dataKey="name" tick={{ fill: '#1B1F2A', opacity: 0.7, fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#1B1F2A', opacity: 0.7, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => `${Number(value) / 1000}k`} width={50} />
                        <Tooltip 
                          cursor={{stroke: 'rgba(27, 31, 42, 0.1)', strokeWidth: 1, strokeDasharray: '3 3'}}
                          contentStyle={{
                            backgroundColor: '#fff',
                            border: '1px solid rgba(27, 31, 42, 0.1)',
                            borderRadius: '8px',
                            boxShadow: '0px 4px 12px rgba(27, 31, 42, 0.08)',
                            fontSize: '12px'
                          }}
                          formatter={(value: number) => [value.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' }), "Profit"]}
                        />
                        <ReferenceLine y={0} stroke="#C75D5D" strokeDasharray="3 3" />
                        <Line type="monotone" dataKey="profit" stroke="#5D9C7A" strokeWidth={2} dot={{ r: 3, fill: '#5D9C7A' }} activeDot={{ r: 5 }} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </Card>
    );
};

const ExpenseByCategoryChart: React.FC<{data: {name: string, value: number}[]}> = ({ data }) => {
    const COLORS = ['#C9A86A', '#1B1F2A', '#5D9C7A', '#C75D5D', '#9ca3af', '#a78bfa', '#fb923c'];
    if(data.length === 0) {
        return (
            <Card className="h-96 flex flex-col items-center justify-center text-center">
                 <CreditCardIcon className="w-12 h-12 mx-auto text-fiscalia-primary-dark/20" />
                 <p className="mt-4 text-fiscalia-primary-dark/70">Aucune dépense</p>
                 <p className="text-sm text-fiscalia-primary-dark/50">Les dépenses apparaîtront ici.</p>
            </Card>
        )
    }
    return (
        <Card className="h-96 flex flex-col min-w-0">
            <h3 className="text-lg sm:text-xl font-normal font-display tracking-tight text-fiscalia-primary-dark mb-3 sm:mb-4 flex-shrink-0">Dépenses par Catégorie</h3>
            <div className="flex-1 min-h-0 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 12, bottom: 12 }}>
                        <Pie 
                            data={data} 
                            innerRadius="42%" 
                            outerRadius="82%" 
                            fill="#8884d8" 
                            paddingAngle={2} 
                            dataKey="value" 
                            nameKey="name" 
                            labelLine={false} 
                            label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                                const RADIAN = Math.PI / 180;
                                const radius = Number(innerRadius) + (Number(outerRadius) - Number(innerRadius)) * 0.5;
                                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                const y = cy + radius * Math.sin(-midAngle * RADIAN);
                                return percent > 0.05 ? (<text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" className="text-xs sm:text-sm font-bold">
                                    {`${(percent * 100).toFixed(0)}%`}
                                </text>) : null;
                            }}
                        >
                            {data.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <Tooltip 
                            formatter={(value: number) => `${value.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}`}
                            contentStyle={{
                                fontSize: '12px',
                                padding: '8px 12px',
                            }}
                        />
                    </PieChart>
                </ResponsiveContainer>
            </div>
            {/* Custom responsive legend */}
            <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-fiscalia-primary-dark/10 flex-shrink-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                    {data.map((entry, index) => (
                        <div key={index} className="flex items-center gap-2 min-w-0">
                            <div 
                                className="w-3 h-3 rounded-full flex-shrink-0" 
                                style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            <span className="text-fiscalia-primary-dark/80 font-medium truncate text-xs sm:text-sm flex-1 min-w-0">{entry.name}</span>
                            <span className="text-fiscalia-primary-dark/60 text-xs flex-shrink-0 whitespace-nowrap">{entry.value.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                        </div>
                    ))}
                </div>
            </div>
        </Card>
    );
};

const RecentJobs: React.FC<{ jobs: Job[] }> = ({ jobs }) => {
    const recentJobs = [...jobs].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()).slice(0, 5);
    return (
        <Card>
             <h3 className="text-xl font-normal font-display tracking-tight text-fiscalia-primary-dark mb-4">Contrats Récents</h3>
             <div className="space-y-3">
                {recentJobs.length > 0 ? recentJobs.map(job => (
                    <div key={job.id} className="flex items-center justify-between p-2 rounded-md hover:bg-fiscalia-light-neutral">
                        <div>
                            <p className="font-semibold text-fiscalia-primary-dark">{job.name}</p>
                            <p className="text-sm text-fiscalia-primary-dark/70">Démarré le {job.startDate}</p>
                        </div>
                        <div className="text-right">
                           <p className={`font-bold ${job.profit >= 0 ? 'text-fiscalia-success' : 'text-fiscalia-error'}`}>{job.profit.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</p>
                           <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${JOB_STATUS_COLORS[job.status]}`}>{job.status}</span>
                        </div>
                    </div>
                )) : (
                    <p className="text-center text-fiscalia-primary-dark/60 py-4">Aucun contrat dans la période sélectionnée.</p>
                )}
             </div>
        </Card>
    );
};

// Job Components
interface JobCardProps {
    job: Job;
    onClick: () => void;
    onDelete?: (jobId: string, jobName: string) => void;
    onUpdateJob?: (job: Partial<Job> & { id: string }) => void;
}
const JobCard: React.FC<JobCardProps> = ({ job, onClick, onDelete, onUpdateJob }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState(job.name);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleSave = () => {
        const trimmedName = editedName.trim();
        if (trimmedName && trimmedName !== job.name && onUpdateJob) {
            onUpdateJob({ id: job.id, name: trimmedName });
        } else if (!trimmedName) {
            setEditedName(job.name);
        }
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditedName(job.name);
        setIsEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            handleCancel();
        }
    };

    return (
        <Card>
            <div className="flex justify-between items-start">
                <div className="flex-1 cursor-pointer" onClick={!isEditing ? onClick : undefined}>
                    {isEditing ? (
                        <input
                            ref={inputRef}
                            type="text"
                            value={editedName}
                            onChange={(e) => setEditedName(e.target.value)}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                            onClick={(e) => e.stopPropagation()}
                            className="font-normal font-display text-xl tracking-tight text-fiscalia-primary-dark bg-transparent border-b-2 border-fiscalia-accent-gold focus:outline-none w-full"
                        />
                    ) : (
                        <h3 className="font-normal font-display text-xl tracking-tight text-fiscalia-primary-dark">{job.name}</h3>
                    )}
                    <p className="text-sm text-fiscalia-primary-dark/60 mt-1">
                        Démarré le {new Date(job.startDate).toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {onUpdateJob && !isEditing ? (
                        <select
                            value={job.status}
                            onChange={(e) => {
                                e.stopPropagation();
                                const newStatus = e.target.value as JobStatus;
                                onUpdateJob({ id: job.id, status: newStatus });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className={`text-xs font-medium px-2.5 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50 appearance-none ${JOB_STATUS_COLORS[job.status]}`}
                            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.4rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1em 1em', paddingRight: '1.5rem' }}
                            title="Changer le statut"
                        >
                            {Object.values(JobStatus).map(status => (
                                <option key={status} value={status} className="bg-white text-fiscalia-primary-dark">
                                    {status}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${JOB_STATUS_COLORS[job.status]}`}>{job.status}</span>
                    )}
                    {onUpdateJob && !isEditing && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsEditing(true);
                            }}
                            className="p-1.5 text-fiscalia-primary-dark/50 hover:text-fiscalia-accent-gold hover:bg-fiscalia-accent-gold/10 rounded-lg transition-colors"
                            title="Renommer le contrat"
                        >
                            <PencilIcon className="w-5 h-5" />
                        </button>
                    )}
                    {onDelete && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(job.id, job.name);
                            }}
                            className="p-1.5 text-fiscalia-primary-dark/50 hover:text-fiscalia-error hover:bg-fiscalia-error/10 rounded-lg transition-colors"
                            title="Supprimer le contrat"
                        >
                            <TrashIcon className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-4 text-center border-t border-fiscalia-primary-dark/5 pt-4 cursor-pointer" onClick={!isEditing ? onClick : undefined}>
                <div>
                    <p className="text-sm font-medium text-fiscalia-primary-dark/70 tracking-wide">Revenu</p>
                    <p className="font-semibold text-fiscalia-primary-dark mt-1">{job.revenue.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</p>
                </div>
                <div>
                    <p className="text-sm font-medium text-fiscalia-primary-dark/70 tracking-wide">Dépenses</p>
                    <p className="font-semibold text-fiscalia-primary-dark mt-1">{job.expenses.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</p>
                </div>
                <div>
                    <p className="text-sm font-medium text-fiscalia-primary-dark/70 tracking-wide">Profit</p>
                    <p className={`font-bold mt-1 ${job.profit >= 0 ? 'text-fiscalia-success' : 'text-fiscalia-error'}`}>{job.profit.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</p>
                </div>
            </div>
        </Card>
    );
};

// Chat Components
const AIMessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => (
  <div className="flex justify-start mb-4">
    <div className="bg-white rounded-lg p-4 max-w-lg shadow-card border border-fiscalia-primary-dark/10">
      <p className="text-fiscalia-primary-dark">{message.text}</p>
      {message.jobSummary && (
        <div className="mt-3 border-t border-fiscalia-primary-dark/10 pt-3">
          <h4 className="font-display font-medium text-base text-fiscalia-primary-dark">{message.jobSummary.name}</h4>
          <div className="flex justify-between text-xs mt-2 font-medium text-fiscalia-primary-dark/70 tracking-wide">
            <span>Revenu: <span className="font-medium text-fiscalia-primary-dark">{message.jobSummary.revenue.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</span></span>
            <span>Dépenses: <span className="font-medium text-fiscalia-primary-dark">{message.jobSummary.expenses.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</span></span>
            <span>Profit: <span className={`font-bold ${message.jobSummary.profit >= 0 ? 'text-fiscalia-success' : 'text-fiscalia-error'}`}>{message.jobSummary.profit.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</span></span>
          </div>
        </div>
      )}
    </div>
  </div>
);

const UserMessageBubble: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [isLoadingReceipt, setIsLoadingReceipt] = useState(false);

  // Generate signed URL from receiptPath when component mounts or receiptPath changes
  useEffect(() => {
    // Priority 1: If message already has a receiptImage (blob URL, data URL, or HTTP URL), use it immediately
    if (message.receiptImage && (message.receiptImage.startsWith('data:') || message.receiptImage.startsWith('http') || message.receiptImage.startsWith('blob:'))) {
      setReceiptUrl(message.receiptImage);
      setIsLoadingReceipt(false);
      return;
    }

    // Priority 2: If we have a receiptPath but no receiptImage, generate a signed URL
    // This happens when loading messages from database (after refresh/return)
    if (message.receiptPath && !message.receiptImage) {
      setIsLoadingReceipt(true);
      (async () => {
        try {
          const { supabase } = await import('./services/supabaseClient');
          // Generate signed URL valid for 1 hour
          const { data, error } = await supabase.storage
            .from('receipts')
            .createSignedUrl(message.receiptPath, 3600);

          if (error) {
            console.error('Failed to generate signed URL for receipt:', error);
            // Try public URL as fallback (in case bucket is actually public)
            const publicUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/receipts/${message.receiptPath}`;
            setReceiptUrl(publicUrl);
          } else {
            setReceiptUrl(data.signedUrl);
          }
        } catch (err) {
          console.error('Error generating signed URL:', err);
          // Fallback to public URL
          const publicUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/receipts/${message.receiptPath}`;
          setReceiptUrl(publicUrl);
        } finally {
          setIsLoadingReceipt(false);
        }
      })();
    } else if (!message.receiptPath && !message.receiptImage) {
      // No receipt at all
      setReceiptUrl(null);
      setIsLoadingReceipt(false);
    }
  }, [message.receiptPath, message.receiptImage]);

  // Remove any URLs from text if receipt is attached separately
  const textWithoutUrl = receiptUrl 
    ? message.text.replace(/https?:\/\/[^\s]+/g, '').trim()
    : message.text;
  
  return (
  <div className="flex justify-end mb-4">
    <div className="bg-fiscalia-accent-gold text-white rounded-lg p-4 max-w-lg">
        {textWithoutUrl && <p className={receiptUrl ? "mb-2" : ""}>{textWithoutUrl}</p>}
        {isLoadingReceipt && (
          <div className={textWithoutUrl ? "mt-2 border-t border-white/20 pt-2" : ""}>
            <div className="flex items-center gap-2">
              <div className="w-16 h-16 bg-white/10 rounded border border-white/20 flex items-center justify-center">
                <span className="text-xs text-white/70">Chargement...</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/90 font-medium">📷 Reçu</p>
              </div>
            </div>
          </div>
        )}
        {receiptUrl && !isLoadingReceipt && (
          <div className={textWithoutUrl ? "mt-2 border-t border-white/20 pt-2" : ""}>
            <div className="flex items-center gap-2">
              <img
                src={receiptUrl}
                alt="Reçu"
                className="w-16 h-16 object-cover rounded border border-white/20"
                onError={async (e) => {
                  // If image fails to load and we have a receiptPath, try regenerating the signed URL
                  if (message.receiptPath && receiptUrl && !receiptUrl.startsWith('data:')) {
                    try {
                      const { supabase } = await import('./services/supabaseClient');
                      const { data, error } = await supabase.storage
                        .from('receipts')
                        .createSignedUrl(message.receiptPath, 3600);
                      
                      if (!error && data) {
                        // Update the image source with the new signed URL
                        (e.target as HTMLImageElement).src = data.signedUrl;
                        setReceiptUrl(data.signedUrl);
                      } else {
                        // Hide image if regeneration also fails
                        (e.target as HTMLImageElement).style.display = 'none';
                      }
                    } catch (err) {
                      console.error('Error regenerating signed URL:', err);
                      (e.target as HTMLImageElement).style.display = 'none';
                    }
                  } else {
                    // Hide image if it fails to load and we can't regenerate
                    (e.target as HTMLImageElement).style.display = 'none';
                  }
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/90 font-medium">📷 Reçu</p>
                {message.receiptOcrData?.vendor && (
                  <p className="text-xs text-white/70 truncate">{message.receiptOcrData.vendor}</p>
                )}
                {message.receiptOcrData?.total && (
                  <p className="text-xs text-white/70">{message.receiptOcrData.total.toFixed(2)} $</p>
                )}
              </div>
            </div>
          </div>
        )}
    </div>
  </div>
);
};

// Screens

export const OnboardingScreen: React.FC<{ onComplete: (profile: Partial<UserProfile>) => Promise<void> | void; isSubmitting?: boolean }> = ({ onComplete, isSubmitting = false }) => {
    const [step, setStep] = useState(1);
    const [fullName, setFullName] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [taxRate, setTaxRate] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleFinish = async () => {
        if (isSaving || isSubmitting) return;
        setIsSaving(true);
        try {
            await onComplete({
                name: fullName.trim() || undefined,
                companyName: companyName.trim() || undefined,
                taxRate: taxRate ? Number(taxRate) : undefined,
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-fiscalia-primary-dark text-white p-4">
            <div className="text-center max-w-md w-full">
                {step === 1 && (
                    <>
                        <div className="flex items-center justify-center gap-4">
                            <Logo className="w-14 h-14 text-fiscalia-accent-gold" />
                            <h1 className="text-5xl font-semibold tracking-tight font-display text-white">Fiscalia</h1>
                        </div>
                        <p className="text-xl mt-4 opacity-80">Votre comptabilité, simplifiée et assistée par l'IA.</p>
                        <Button onClick={() => setStep(2)} className="mt-12 w-full md:w-auto">Commencer</Button>
                    </>
                )}
                {step === 2 && (
                    <>
                        <h2 className="text-3xl font-display font-medium tracking-tight">Configurez votre profil</h2>
                        <p className="mt-2 opacity-80">Quelques détails pour commencer.</p>
                        <div className="mt-8 text-left space-y-4">
                            <input
                                type="text"
                                placeholder="Votre nom complet"
                                value={fullName}
                                onChange={e => setFullName(e.target.value)}
                                className="w-full bg-white/10 p-4 rounded-lg placeholder-white/50 border border-white/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50"
                            />
                            <input
                                type="text"
                                placeholder="Nom de l'entreprise"
                                value={companyName}
                                onChange={e => setCompanyName(e.target.value)}
                                className="w-full bg-white/10 p-4 rounded-lg placeholder-white/50 border border-white/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50"
                            />
                            <input
                                type="number"
                                placeholder="Taux d'imposition (%)"
                                value={taxRate}
                                onChange={e => setTaxRate(e.target.value)}
                                className="w-full bg-white/10 p-4 rounded-lg placeholder-white/50 border border-white/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50"
                            />
                        </div>
                        <Button
                            onClick={handleFinish}
                            className="mt-8 w-full md:w-auto"
                            disabled={isSaving || isSubmitting}
                        >
                            {isSaving || isSubmitting ? 'Enregistrement...' : "Aller à l'assistant"}
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
};

export const DashboardScreen: React.FC<{ jobs: Job[], expenses: Expense[], categories: ExpenseCategory[] }> = ({ jobs, expenses, categories }) => {
    type TimeFilter = string | { start: string; end: string };
    const [timeFilter, setTimeFilter] = useState<TimeFilter>('month');
    const [isDateRangeModalOpen, setIsDateRangeModalOpen] = useState(false);

    const handleApplyDateRange = (start: string, end: string) => {
        setTimeFilter({ start, end });
        setIsDateRangeModalOpen(false);
    };

    const { filteredJobs, filteredExpenses } = React.useMemo(() => {
        const now = new Date();
        const filterByDate = (dateStr: string) => {
            if (timeFilter === 'all') return true;

            const itemDate = new Date(dateStr);
            if (typeof timeFilter === 'object') {
                const endDate = new Date(timeFilter.end);
                endDate.setHours(23, 59, 59, 999);
                return itemDate >= new Date(timeFilter.start) && itemDate <= endDate;
            }
            if (timeFilter === 'year') {
                return itemDate.getFullYear() === now.getFullYear();
            }
            if (timeFilter === 'month') {
                return itemDate.getFullYear() === now.getFullYear() && itemDate.getMonth() === now.getMonth();
            }
            if (timeFilter === 'quarter') {
                const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
                return itemDate >= threeMonthsAgo;
            }
            return true;
        };

        const filteredJobs = jobs.filter(job => filterByDate(job.startDate));
        const filteredExpenses = expenses.filter(expense => filterByDate(expense.date));
        
        return { filteredJobs, filteredExpenses };

    }, [jobs, expenses, timeFilter]);

    // Calculate previous period stats for comparison
    const { previousPeriodStats } = React.useMemo(() => {
        const now = new Date();
        let previousPeriodStart: Date | null = null;
        let previousPeriodEnd: Date | null = null;

        if (timeFilter === 'all') {
            // For "all", compare with all time (no previous period)
            return { previousPeriodStats: null };
        }

        if (typeof timeFilter === 'object') {
            // For custom date range, calculate previous period of same length
            const currentStart = new Date(timeFilter.start);
            const currentEnd = new Date(timeFilter.end);
            const periodLength = currentEnd.getTime() - currentStart.getTime();
            previousPeriodEnd = new Date(currentStart);
            previousPeriodEnd.setDate(previousPeriodEnd.getDate() - 1);
            previousPeriodEnd.setHours(23, 59, 59, 999);
            previousPeriodStart = new Date(previousPeriodEnd.getTime() - periodLength);
        } else if (timeFilter === 'month') {
            // Previous month
            previousPeriodEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
            previousPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        } else if (timeFilter === 'quarter') {
            // Previous 3 months (the 3 months before the current 3-month period)
            // Current period: from (now.getMonth() - 3, now.getDate()) to now
            // Previous period: from (now.getMonth() - 6, now.getDate()) to (now.getMonth() - 3, now.getDate() - 1)
            const currentDay = now.getDate();
            previousPeriodEnd = new Date(now.getFullYear(), now.getMonth() - 3, currentDay);
            previousPeriodEnd.setDate(previousPeriodEnd.getDate() - 1);
            previousPeriodEnd.setHours(23, 59, 59, 999);
            previousPeriodStart = new Date(now.getFullYear(), now.getMonth() - 6, currentDay);
        } else if (timeFilter === 'year') {
            // Previous year
            previousPeriodEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
            previousPeriodStart = new Date(now.getFullYear() - 1, 0, 1);
        }

        if (!previousPeriodStart || !previousPeriodEnd) {
            return { previousPeriodStats: null };
        }

        // Filter jobs and expenses for previous period
        const previousJobs = jobs.filter(job => {
            const jobDate = new Date(job.startDate);
            return jobDate >= previousPeriodStart! && jobDate <= previousPeriodEnd!;
        });
        const previousExpenses = expenses.filter(expense => {
            const expenseDate = parseLocalDate(expense.date);
            return expenseDate >= previousPeriodStart! && expenseDate <= previousPeriodEnd!;
        });

        // Calculate previous period stats using hybrid approach
        const prevRevenue = previousJobs.reduce((sum, job) => sum + job.revenue, 0);
        
        let prevExpenses = 0;
        let prevProfit = 0;
        previousJobs.forEach(job => {
            if (job.expenses !== 0 || job.profit !== job.revenue) {
                prevExpenses += job.expenses;
                prevProfit += job.profit;
            } else {
                const jobExpenses = previousExpenses
                    .filter(exp => exp.jobId === job.id)
                    .reduce((sum, exp) => sum + exp.amount, 0);
                prevExpenses += jobExpenses;
                prevProfit += (job.revenue - jobExpenses);
            }
        });
        
        // Add unattached expenses
        const prevUnattachedExpenses = previousExpenses
            .filter(exp => !exp.jobId)
            .reduce((sum, exp) => sum + exp.amount, 0);
        prevExpenses += prevUnattachedExpenses;
        prevProfit -= prevUnattachedExpenses;
        
        const prevProfitMargin = prevRevenue > 0 ? (prevProfit / prevRevenue) * 100 : 0;

        return {
            previousPeriodStats: {
                revenue: prevRevenue,
                expenses: prevExpenses,
                profit: prevProfit,
                profitMargin: prevProfitMargin
            }
        };
    }, [jobs, expenses, timeFilter]);
    
    // Calculate totals: use stored job values if set, otherwise calculate from expenses
    const totalRevenue = filteredJobs.reduce((sum, job) => sum + job.revenue, 0);
    
    // For expenses and profit, use a hybrid approach:
    // - If job has manually set expenses/profit (from AI updates), use those
    // - Otherwise, calculate from individual expense records linked to the job
    const { totalExpenses, totalProfit } = React.useMemo(() => {
        let expenses = 0;
        let profit = 0;
        
        filteredJobs.forEach(job => {
            // If job has manually set expenses/profit (non-zero or explicitly set), use them
            if (job.expenses !== 0 || job.profit !== job.revenue) {
                expenses += job.expenses;
                profit += job.profit;
            } else {
                // Otherwise, calculate from individual expense records for this job
                const jobExpenses = filteredExpenses
                    .filter(exp => exp.jobId === job.id)
                    .reduce((sum, exp) => sum + exp.amount, 0);
                expenses += jobExpenses;
                profit += (job.revenue - jobExpenses);
            }
        });
        
        // Also add unattached expenses (not linked to any job)
        const unattachedExpenses = filteredExpenses
            .filter(exp => !exp.jobId)
            .reduce((sum, exp) => sum + exp.amount, 0);
        expenses += unattachedExpenses;
        profit -= unattachedExpenses;
        
        return { totalExpenses: expenses, totalProfit: profit };
    }, [filteredJobs, filteredExpenses]);
    
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    // Calculate percentage changes
    const calculatePercentageChange = (current: number, previous: number | null): number | undefined => {
        // If no previous period stats (e.g., timeFilter is 'all'), don't show change
        if (previous === null) return undefined;
        
        // If previous is 0 and current is also 0, no change to show
        if (previous === 0 && current === 0) return undefined;
        
        // If previous is 0 but current > 0, this is new data (could show 100% or similar)
        // For now, we'll show it as a large positive change
        if (previous === 0 && current > 0) return 100; // Show as 100% increase
        
        // Normal calculation
        const change = ((current - previous) / previous) * 100;
        return Math.round(change * 10) / 10; // Round to 1 decimal place
    };

    const revenueChange = calculatePercentageChange(totalRevenue, previousPeriodStats?.revenue ?? null);
    // For expenses, invert the sign so that decreases (good) show green and increases (bad) show red
    const expensesChangeRaw = calculatePercentageChange(totalExpenses, previousPeriodStats?.expenses ?? null);
    const expensesChange = expensesChangeRaw !== undefined ? -expensesChangeRaw : undefined;
    const profitChange = calculatePercentageChange(totalProfit, previousPeriodStats?.profit ?? null);
    const profitMarginChange = calculatePercentageChange(profitMargin, previousPeriodStats?.profitMargin ?? null);
    
    const expenseData = categories.map(category => ({
        name: category,
        value: filteredExpenses.filter(e => e.category === category).reduce((sum, e) => sum + e.amount, 0)
    })).filter(item => item.value > 0);

    const isCustomDate = typeof timeFilter === 'object';

    return (
        <div className="space-y-4 sm:space-y-6">
            <DateRangeModal isOpen={isDateRangeModalOpen} onClose={() => setIsDateRangeModalOpen(false)} onApply={handleApplyDateRange} />
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-2xl sm:text-3xl font-medium text-fiscalia-primary-dark font-display tracking-tight">Tableau de bord</h1>
                <div className="flex items-center gap-1.5 sm:gap-2 bg-fiscalia-primary-dark/5 p-1 rounded-lg flex-wrap w-full sm:w-auto">
                    <Button variant="ghost" className="px-2 sm:px-3 py-1 text-xs sm:text-sm" active={timeFilter === 'month'} onClick={() => setTimeFilter('month')}>Ce mois-ci</Button>
                    <Button variant="ghost" className="px-2 sm:px-3 py-1 text-xs sm:text-sm" active={timeFilter === 'quarter'} onClick={() => setTimeFilter('quarter')}>3 derniers mois</Button>
                    <Button variant="ghost" className="px-2 sm:px-3 py-1 text-xs sm:text-sm" active={timeFilter === 'year'} onClick={() => setTimeFilter('year')}>Cette année</Button>
                    <Button variant="ghost" className="px-2 sm:px-3 py-1 text-xs sm:text-sm" active={timeFilter === 'all'} onClick={() => setTimeFilter('all')}>Tout</Button>
                    <Button variant="ghost" className={`px-2 sm:px-3 py-1 text-xs sm:text-sm flex items-center gap-1.5 ${isCustomDate ? 'bg-fiscalia-primary-dark/10 text-fiscalia-primary-dark' : ''}`} onClick={() => setIsDateRangeModalOpen(true)}>
                        <CalendarDaysIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">Calendrier</span>
                    </Button>
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
                <StatCard title="Revenu total" value={totalRevenue.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })} change={revenueChange} />
                <StatCard title="Dépenses totales" value={totalExpenses.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })} change={expensesChange} />
                <StatCard title="Profit net" value={totalProfit.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })} change={profitChange} />
                <StatCard title="Marge de profit" value={`${profitMargin.toFixed(1)}%`} change={profitMarginChange} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                <div className="lg:col-span-2 min-w-0">
                    <ProfitTrendChart jobs={filteredJobs} />
                </div>
                <div className="min-w-0">
                    <ExpenseByCategoryChart data={expenseData} />
                </div>
            </div>
            <RecentJobs jobs={filteredJobs} />
        </div>
    );
};

export const JobsScreen: React.FC<{ jobs: Job[], onSelectJob: (job: Job) => void, onAddJob: () => void, onDeleteJob?: (jobId: string, jobName: string) => Promise<void> | void, onUpdateJob?: (job: Partial<Job> & { id: string }) => Promise<void> | void }> = ({ jobs, onSelectJob, onAddJob, onDeleteJob, onUpdateJob }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<JobStatus | 'Tous'>('Tous');
    const [sortBy, setSortBy] = useState('date-desc');
    type TimeFilter = string | { start: string; end: string };
    const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
    const [isDateRangeModalOpen, setIsDateRangeModalOpen] = useState(false);

    const handleApplyDateRange = (start: string, end: string) => {
        setTimeFilter({ start, end });
        setIsDateRangeModalOpen(false);
    };

    const filteredAndSortedJobs = React.useMemo(() => {
        const now = new Date();
        const filteredByDate = jobs.filter(job => {
            if (timeFilter === 'all') return true;

            const jobDate = new Date(job.startDate);
            if (typeof timeFilter === 'object') {
                const endDate = new Date(timeFilter.end);
                endDate.setHours(23, 59, 59, 999);
                return jobDate >= new Date(timeFilter.start) && jobDate <= endDate;
            }
            if (timeFilter === 'year') {
                return jobDate.getFullYear() === now.getFullYear();
            }
            if (timeFilter === 'month') {
                return jobDate.getFullYear() === now.getFullYear() && jobDate.getMonth() === now.getMonth();
            }
            if (timeFilter === 'quarter') {
                const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
                return jobDate >= threeMonthsAgo;
            }
            return true;
        });

        let filtered = filteredByDate;

        if (statusFilter !== 'Tous') {
            filtered = filtered.filter(job => job.status === statusFilter);
        }

        if (searchTerm.trim() !== '') {
            filtered = filtered.filter(job => job.name.toLowerCase().includes(searchTerm.toLowerCase()));
        }

        switch (sortBy) {
            case 'date-asc':
                return [...filtered].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
            case 'profit-desc':
                return [...filtered].sort((a, b) => b.profit - a.profit);
            case 'profit-asc':
                return [...filtered].sort((a, b) => a.profit - b.profit);
            case 'name-asc':
                 return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
            case 'date-desc':
            default:
                return [...filtered].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
        }
    }, [jobs, searchTerm, statusFilter, sortBy, timeFilter]);

    const totalRevenue = filteredAndSortedJobs.reduce((sum, job) => sum + job.revenue, 0);
    const totalProfit = filteredAndSortedJobs.reduce((sum, job) => sum + job.profit, 0);
    const jobsInProgress = filteredAndSortedJobs.filter(j => j.status === JobStatus.InProgress).length;
    
    const STATUS_FILTERS: (JobStatus | 'Tous')[] = ['Tous', JobStatus.InProgress, JobStatus.Completed, JobStatus.Paid];
    const isCustomDate = typeof timeFilter === 'object';

    return (
        <div className="space-y-6">
            <DateRangeModal isOpen={isDateRangeModalOpen} onClose={() => setIsDateRangeModalOpen(false)} onApply={handleApplyDateRange} />
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <h1 className="text-3xl font-medium text-fiscalia-primary-dark font-display tracking-tight">Contrats</h1>
                <Button onClick={onAddJob} className="flex items-center gap-2 self-start md:self-auto"><PlusIcon className="w-5 h-5" /> Nouveau contrat</Button>
            </div>
            
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                 <StatCard title={`Contrats (sélection)`} value={filteredAndSortedJobs.length.toString()} centered compact />
                 <StatCard title="En cours (sélection)" value={jobsInProgress.toString()} centered compact />
                 <StatCard title="Revenu (sélection)" value={totalRevenue.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })} compact />
                 <StatCard title="Profit (sélection)" value={totalProfit.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })} compact />
            </div>

            <Card>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <h2 className="text-xl font-display text-fiscalia-primary-dark">Filtres</h2>
                    <div className="flex items-center gap-2 bg-fiscalia-primary-dark/5 p-1 rounded-lg flex-wrap">
                        <Button variant="ghost" className="px-3 py-1 text-sm" active={timeFilter === 'month'} onClick={() => setTimeFilter('month')}>Ce mois-ci</Button>
                        <Button variant="ghost" className="px-3 py-1 text-sm" active={timeFilter === 'quarter'} onClick={() => setTimeFilter('quarter')}>3 derniers mois</Button>
                        <Button variant="ghost" className="px-3 py-1 text-sm" active={timeFilter === 'year'} onClick={() => setTimeFilter('year')}>Cette année</Button>
                        <Button variant="ghost" className="px-3 py-1 text-sm" active={timeFilter === 'all'} onClick={() => setTimeFilter('all')}>Tout</Button>
                        <Button variant="ghost" className={`px-3 py-1 text-sm flex items-center gap-1.5 ${isCustomDate ? 'bg-fiscalia-primary-dark/10 text-fiscalia-primary-dark' : ''}`} onClick={() => setIsDateRangeModalOpen(true)}>
                            <CalendarDaysIcon className="w-4 h-4" />
                            Calendrier
                        </Button>
                    </div>
                </div>
                <div className="flex flex-col md:flex-row gap-4 items-center">
                    <div className="relative flex-grow w-full md:w-auto">
                        <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-fiscalia-primary-dark/40" />
                        <input 
                            type="text" 
                            placeholder="Rechercher par nom..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                            className="w-full bg-fiscalia-light-neutral text-fiscalia-primary-dark placeholder:text-fiscalia-primary-dark/60 rounded-lg p-3 pl-11 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50 border border-fiscalia-primary-dark/20"
                        />
                    </div>
                    <div className="flex-shrink-0 w-full md:w-auto">
                        <select 
                            value={sortBy} 
                            onChange={e => setSortBy(e.target.value)} 
                            className="w-full bg-white text-fiscalia-primary-dark p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50 appearance-none"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
                        >
                            <option value="date-desc">Trier par: Plus récent</option>
                            <option value="date-asc">Trier par: Plus ancien</option>
                            <option value="profit-desc">Trier par: Profit (élevé)</option>
                            <option value="profit-asc">Trier par: Profit (faible)</option>
                            <option value="name-asc">Trier par: Nom (A-Z)</option>
                        </select>
                    </div>
                </div>
                 <div className="flex items-center gap-2 bg-fiscalia-primary-dark/5 p-1 rounded-lg mt-4 flex-wrap">
                    {STATUS_FILTERS.map(status => (
                        <Button 
                            key={status}
                            variant="ghost" 
                            className="px-3 py-1 text-sm flex-grow" 
                            active={statusFilter === status} 
                            onClick={() => setStatusFilter(status)}
                        >
                            {status}
                        </Button>
                    ))}
                </div>
            </Card>

            <div className="space-y-4">
                {jobs.length === 0 ? (
                    <Card className="text-center py-12">
                        <BriefcaseIcon className="w-12 h-12 mx-auto text-fiscalia-primary-dark/20" />
                        <p className="mt-4 text-fiscalia-primary-dark/70">Aucun contrat pour le moment.</p>
                        <p className="text-sm text-fiscalia-primary-dark/50">Utilisez l'assistant pour en créer un.</p>
                    </Card>
                ) : filteredAndSortedJobs.length > 0 ? filteredAndSortedJobs.map(job => (
                    <JobCard key={job.id} job={job} onClick={() => onSelectJob(job)} onDelete={onDeleteJob} onUpdateJob={onUpdateJob} />
                )) : (
                     <Card className="text-center py-12">
                        <MagnifyingGlassIcon className="w-12 h-12 mx-auto text-fiscalia-primary-dark/20" />
                        <p className="mt-4 text-fiscalia-primary-dark/70">Aucun contrat ne correspond à vos critères.</p>
                        <p className="text-sm text-fiscalia-primary-dark/50">Essayez d'ajuster votre recherche ou vos filtres.</p>
                    </Card>
                )}
            </div>
        </div>
    );
};

export const JobDetailScreen: React.FC<{ job: Job; expenses: Expense[]; onBack: () => void; onAddExpense: () => void; onEditExpense?: (expense: Expense) => void; onDeleteJob?: (jobId: string, jobName: string) => Promise<void> | void; onDeleteExpense?: (expenseId: string, expenseName: string) => Promise<void> | void; onUpdateJob?: (job: Partial<Job> & { id: string }) => Promise<void> | void }> = ({ job, expenses, onBack, onAddExpense, onEditExpense, onDeleteJob, onDeleteExpense, onUpdateJob }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState(job.name);
    const inputRef = useRef<HTMLInputElement>(null);
    const [expandedExpenses, setExpandedExpenses] = useState<Record<string, boolean>>({});
    const jobExpenses = React.useMemo(() => expenses.filter(expense => expense.jobId === job.id), [expenses, job.id]);

    useEffect(() => {
        setEditedName(job.name);
    }, [job.name]);

    useEffect(() => {
        setExpandedExpenses({});
    }, [job.id]);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleSave = () => {
        const trimmedName = editedName.trim();
        if (trimmedName && trimmedName !== job.name && onUpdateJob) {
            onUpdateJob({ id: job.id, name: trimmedName });
        } else if (!trimmedName) {
            setEditedName(job.name);
        }
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditedName(job.name);
        setIsEditing(false);
    };
    const toggleExpenseDetails = (expenseId: string) => {
        setExpandedExpenses(prev => ({
            ...prev,
            [expenseId]: !prev[expenseId],
        }));
    };


    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            handleCancel();
        }
    };

    return (
        <div className="space-y-6">
            <button type="button" onClick={onBack} className="flex items-center gap-2 text-fiscalia-primary-dark/70 hover:text-fiscalia-primary-dark font-semibold">
                <ArrowLeftIcon className="w-5 h-5" />
                Retour aux contrats
            </button>
            <Card>
                <div className="flex justify-between items-start">
                    <div className="flex-1">
                        {isEditing ? (
                            <input
                                ref={inputRef}
                                type="text"
                                value={editedName}
                                onChange={(e) => setEditedName(e.target.value)}
                                onBlur={handleSave}
                                onKeyDown={handleKeyDown}
                                className="text-3xl font-medium text-fiscalia-primary-dark font-display tracking-tight bg-transparent border-b-2 border-fiscalia-accent-gold focus:outline-none w-full"
                            />
                        ) : (
                            <h1 className="text-3xl font-medium text-fiscalia-primary-dark font-display tracking-tight">{job.name}</h1>
                        )}
                        {job.clientName && <p className="text-lg text-fiscalia-primary-dark/70">{job.clientName}</p>}
                        {job.address && <p className="text-sm text-fiscalia-primary-dark/60 mt-1">{job.address}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                        {onUpdateJob && !isEditing ? (
                            <select
                                value={job.status}
                                onChange={(e) => {
                                    const newStatus = e.target.value as JobStatus;
                                    onUpdateJob({ id: job.id, status: newStatus });
                                }}
                                className={`text-sm font-medium px-3 py-1.5 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50 appearance-none ${JOB_STATUS_COLORS[job.status]}`}
                                style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.1em 1.1em', paddingRight: '1.75rem' }}
                                title="Changer le statut"
                            >
                                {Object.values(JobStatus).map(status => (
                                    <option key={status} value={status} className="bg-white text-fiscalia-primary-dark">
                                        {status}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <span className={`text-sm font-medium px-3 py-1.5 rounded-full ${JOB_STATUS_COLORS[job.status]}`}>{job.status}</span>
                        )}
                        {onUpdateJob && !isEditing && (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="p-1.5 text-fiscalia-primary-dark/50 hover:text-fiscalia-accent-gold hover:bg-fiscalia-accent-gold/10 rounded-lg transition-colors"
                                title="Renommer le contrat"
                            >
                                <PencilIcon className="w-5 h-5" />
                            </button>
                        )}
                        {onDeleteJob && (
                            <button
                                type="button"
                                onClick={() => onDeleteJob(job.id, job.name)}
                                className="p-1.5 text-fiscalia-primary-dark/50 hover:text-fiscalia-error hover:bg-fiscalia-error/10 rounded-lg transition-colors"
                                title="Supprimer le contrat"
                            >
                                <TrashIcon className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>
                {job.description && <p className="mt-4 text-fiscalia-primary-dark/80 border-t border-fiscalia-primary-dark/10 pt-4">{job.description}</p>}
            </Card>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
            <Card><p className="text-sm font-medium text-fiscalia-primary-dark/70 tracking-wide">Revenu</p><p className="font-semibold text-fiscalia-primary-dark text-2xl mt-1">{job.revenue.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</p></Card>
            <Card><p className="text-sm font-medium text-fiscalia-primary-dark/70 tracking-wide">Dépenses</p><p className="font-semibold text-fiscalia-primary-dark text-2xl mt-1">{job.expenses.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</p></Card>
            <Card><p className="text-sm font-medium text-fiscalia-primary-dark/70 tracking-wide">Profit</p><p className={`font-bold text-2xl mt-1 ${job.profit >= 0 ? 'text-fiscalia-success' : 'text-fiscalia-error'}`}>{job.profit.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</p></Card>
        </div>
        <Card>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-normal font-display tracking-tight text-fiscalia-primary-dark">Dépenses associées</h2>
                <Button onClick={onAddExpense} variant="secondary" className="py-2 px-4 text-sm flex items-center gap-2"><PlusIcon className="w-4 h-4"/> Ajouter</Button>
            </div>
            <div className="space-y-3">
                {jobExpenses.length > 0 ? jobExpenses.map(expense => {
                    const isExpanded = Boolean(expandedExpenses[expense.id]);
                    return (
                        <div key={expense.id} className="border border-fiscalia-primary-dark/10 rounded-lg p-3 bg-white shadow-sm">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3">
                                    <button
                                        type="button"
                                        onClick={() => toggleExpenseDetails(expense.id)}
                                        className="p-1 rounded-full text-fiscalia-primary-dark/60 hover:text-fiscalia-primary-dark hover:bg-fiscalia-primary-dark/10 transition-colors"
                                        aria-label={isExpanded ? 'Masquer les détails' : 'Afficher les détails'}
                                    >
                                        <ChevronRightIcon className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                    </button>
                                    {expense.receiptImage && <PaperclipIcon className="w-5 h-5 text-fiscalia-accent-gold mt-1" />}
                                    <div>
                                        <p className="font-semibold text-fiscalia-primary-dark">{expense.name}</p>
                                        <p className="text-sm text-fiscalia-primary-dark/70">{formatLocalDate(expense.date)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <p className="font-semibold text-fiscalia-primary-dark">-{expense.amount.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</p>
                                    {onEditExpense && (
                                        <button
                                            type="button"
                                            onClick={() => onEditExpense(expense)}
                                            className="p-1.5 text-fiscalia-primary-dark/50 hover:text-fiscalia-accent-gold hover:bg-fiscalia-accent-gold/10 rounded-lg transition-colors"
                                            title="Modifier la dépense"
                                        >
                                            <PencilIcon className="w-5 h-5" />
                                        </button>
                                    )}
                                    {onDeleteExpense && (
                                        <button
                                            type="button"
                                            onClick={() => onDeleteExpense(String(expense.id), expense.name)}
                                            className="p-1.5 text-fiscalia-primary-dark/50 hover:text-fiscalia-error hover:bg-fiscalia-error/10 rounded-lg transition-colors"
                                            title="Supprimer la dépense"
                                        >
                                            <TrashIcon className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            {isExpanded && (
                                <div className="mt-3 pl-8 text-sm text-fiscalia-primary-dark/80 space-y-1">
                                    <p><span className="font-medium text-fiscalia-primary-dark">Catégorie:</span> {expense.category}</p>
                                    {expense.vendor && <p><span className="font-medium text-fiscalia-primary-dark">Fournisseur:</span> {expense.vendor}</p>}
                                    {expense.notes && (
                                        <p className="whitespace-pre-wrap">
                                            <span className="font-medium text-fiscalia-primary-dark">Notes:</span> {expense.notes}
                                        </p>
                                    )}
                                    {!expense.vendor && !expense.notes && (
                                        <p className="italic text-fiscalia-primary-dark/60">Aucune information supplémentaire.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                }) : (
                    <p className="text-center text-fiscalia-primary-dark/60 py-4">Aucune dépense pour ce contrat.</p>
                )}
            </div>
        </Card>
    </div>
    );
};


export const ExpensesScreen: React.FC<{ expenses: Expense[], jobs: Job[], categories: ExpenseCategory[], onAddExpense: () => void, onManageCategories: () => void, onEditExpense?: (expense: Expense) => void, onDeleteExpense?: (expenseId: string, expenseName: string) => Promise<void> | void, onDeleteReceipt?: (expense: Expense) => Promise<void> | void }> = ({ expenses, jobs, categories, onAddExpense, onManageCategories, onEditExpense, onDeleteExpense, onDeleteReceipt }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | 'Toutes'>('Toutes');
    const [jobFilter, setJobFilter] = useState<string | 'Tous'>('Tous'); // 'Tous' or jobId
    const [sortBy, setSortBy] = useState('date-desc');
    type TimeFilter = string | { start: string; end: string };
    const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
    const [isDateRangeModalOpen, setIsDateRangeModalOpen] = useState(false);
    const [expandedExpenses, setExpandedExpenses] = useState<Record<string, boolean>>({});
    const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    const handleApplyDateRange = (start: string, end: string) => {
        setTimeFilter({ start, end });
        setIsDateRangeModalOpen(false);
    };

    const toggleExpenseDetails = (expenseId: string) => {
        setExpandedExpenses(prev => ({
            ...prev,
            [expenseId]: !prev[expenseId],
        }));
    };

    const filteredAndSortedExpenses = React.useMemo(() => {
        const now = new Date();
        const filteredByDate = expenses.filter(expense => {
            if (timeFilter === 'all') return true;

            const expenseDate = parseLocalDate(expense.date);
            if (typeof timeFilter === 'object') {
                const startDate = parseLocalDate(timeFilter.start);
                const endDate = parseLocalDate(timeFilter.end);
                endDate.setHours(23, 59, 59, 999);
                return expenseDate >= startDate && expenseDate <= endDate;
            }
            if (timeFilter === 'year') {
                return expenseDate.getFullYear() === now.getFullYear();
            }
            if (timeFilter === 'month') {
                return expenseDate.getFullYear() === now.getFullYear() && expenseDate.getMonth() === now.getMonth();
            }
            if (timeFilter === 'quarter') {
                const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
                return expenseDate >= threeMonthsAgo;
            }
            return true;
        });

        let filtered = filteredByDate;

        if (searchTerm.trim() !== '') {
            filtered = filtered.filter(expense => expense.name.toLowerCase().includes(searchTerm.toLowerCase()));
        }
        if (categoryFilter !== 'Toutes') {
            filtered = filtered.filter(expense => expense.category === categoryFilter);
        }
        if (jobFilter !== 'Tous') {
            filtered = filtered.filter(expense => expense.jobId === jobFilter);
        }

        switch (sortBy) {
            case 'date-asc':
                return [...filtered].sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
            case 'amount-desc':
                return [...filtered].sort((a, b) => b.amount - a.amount);
            case 'amount-asc':
                return [...filtered].sort((a, b) => a.amount - b.amount);
            case 'date-desc':
            default:
                return [...filtered].sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime());
        }
    }, [expenses, searchTerm, categoryFilter, jobFilter, sortBy, timeFilter]);
    
    const totalFilteredAmount = filteredAndSortedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const averageExpense = filteredAndSortedExpenses.length > 0 ? totalFilteredAmount / filteredAndSortedExpenses.length : 0;
    const impactedJobsCount = new Set(filteredAndSortedExpenses.map(e => e.jobId).filter(Boolean)).size;
    const isCustomDate = typeof timeFilter === 'object';

    return (
     <div className="space-y-6">
        <DateRangeModal isOpen={isDateRangeModalOpen} onClose={() => setIsDateRangeModalOpen(false)} onApply={handleApplyDateRange} />
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
            <h1 className="text-3xl font-medium text-fiscalia-primary-dark font-display tracking-tight">Dépenses</h1>
            <Button onClick={onAddExpense} className="flex items-center gap-2 self-start md:self-auto"><PlusIcon className="w-5 h-5" /> Nouvelle dépense</Button>
        </div>
        
         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
             <StatCard title="Nombre de dépenses" value={filteredAndSortedExpenses.length.toString()} centered compact />
             <StatCard title="Contrats impactés" value={impactedJobsCount.toString()} centered compact />
             <StatCard title={`Dépenses (sélection)`} value={totalFilteredAmount.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })} compact />
             <StatCard title="Dépense moyenne" value={averageExpense.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })} compact />
        </div>
        
        <Card>
             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                <h2 className="text-xl font-display text-fiscalia-primary-dark">Filtres</h2>
                <div className="flex items-center gap-2 bg-fiscalia-primary-dark/5 p-1 rounded-lg flex-wrap">
                    <Button variant="ghost" className="px-3 py-1 text-sm" active={timeFilter === 'month'} onClick={() => setTimeFilter('month')}>Mois</Button>
                    <Button variant="ghost" className="px-3 py-1 text-sm" active={timeFilter === 'quarter'} onClick={() => setTimeFilter('quarter')}>3 Mois</Button>
                    <Button variant="ghost" className="px-3 py-1 text-sm" active={timeFilter === 'year'} onClick={() => setTimeFilter('year')}>Année</Button>
                    <Button variant="ghost" className="px-3 py-1 text-sm" active={timeFilter === 'all'} onClick={() => setTimeFilter('all')}>Tout</Button>
                    <Button variant="ghost" className={`px-3 py-1 text-sm flex items-center gap-1.5 ${isCustomDate ? 'bg-fiscalia-primary-dark/10 text-fiscalia-primary-dark' : ''}`} onClick={() => setIsDateRangeModalOpen(true)}>
                        <CalendarDaysIcon className="w-4 h-4" />
                        Calendrier
                    </Button>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-center">
                <div className="relative md:col-span-2 lg:col-span-1">
                    <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-fiscalia-primary-dark/40" />
                    <input type="text" placeholder="Rechercher par description..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-fiscalia-light-neutral text-fiscalia-primary-dark placeholder:text-fiscalia-primary-dark/60 rounded-lg p-3 pl-11 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50 border border-fiscalia-primary-dark/20"/>
                </div>
                 <select value={jobFilter} onChange={e => setJobFilter(e.target.value)} className="w-full bg-white text-fiscalia-primary-dark p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50 appearance-none" style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}>
                    <option value="Tous">Tous les contrats</option>
                    {jobs.map(job => <option key={job.id} value={job.id}>{job.name}</option>)}
                </select>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="w-full bg-white text-fiscalia-primary-dark p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50 appearance-none" style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}>
                    <option value="date-desc">Trier par: Plus récent</option>
                    <option value="date-asc">Trier par: Plus ancien</option>
                    <option value="amount-desc">Trier par: Montant (élevé)</option>
                    <option value="amount-asc">Trier par: Montant (faible)</option>
                </select>
            </div>
             <div className="mt-4 flex flex-col sm:flex-row gap-4">
                 <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as ExpenseCategory | 'Toutes')} className="w-full sm:flex-1 bg-white text-fiscalia-primary-dark p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50 appearance-none" style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}>
                    <option value="Toutes">Toutes les catégories</option>
                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                <Button onClick={onManageCategories} variant="secondary" className="py-3 px-4 text-sm w-full sm:w-auto">Gérer les catégories</Button>
            </div>
        </Card>

        <Card>
            <div className="space-y-2">
                {expenses.length === 0 ? (
                     <div className="text-center py-12">
                         <CreditCardIcon className="w-12 h-12 mx-auto text-fiscalia-primary-dark/20" />
                         <p className="mt-4 text-fiscalia-primary-dark/70">Aucune dépense enregistrée.</p>
                         <p className="text-sm text-fiscalia-primary-dark/50">Cliquez sur "Nouvelle dépense" pour commencer.</p>
                    </div>
                ) : filteredAndSortedExpenses.length > 0 ? filteredAndSortedExpenses.map(expense => {
                    const isExpanded = Boolean(expandedExpenses[expense.id]);
                    return (
                        <div key={expense.id} className="border border-fiscalia-primary-dark/10 rounded-lg p-3 bg-white shadow-sm mb-3 last:mb-0 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3 flex-1 cursor-pointer" onClick={() => {
                                    setSelectedExpense(expense);
                                    setIsDetailModalOpen(true);
                                }}>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleExpenseDetails(expense.id);
                                        }}
                                        className="p-1 rounded-full text-fiscalia-primary-dark/60 hover:text-fiscalia-primary-dark hover:bg-fiscalia-primary-dark/10 transition-colors"
                                        aria-label={isExpanded ? 'Masquer les détails' : 'Afficher les détails'}
                                    >
                                        <ChevronRightIcon className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                    </button>
                                    {expense.receiptImage && <PaperclipIcon className="w-5 h-5 text-fiscalia-accent-gold mt-1" />}
                                    <div className="flex-1">
                                        <p className="font-semibold text-fiscalia-primary-dark">{expense.name}</p>
                                        <p className="text-sm text-fiscalia-primary-dark/70">{formatLocalDate(expense.date)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <p className="font-semibold text-fiscalia-primary-dark">-{expense.amount.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}</p>
                                    {onEditExpense && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEditExpense(expense);
                                            }}
                                            className="p-1.5 text-fiscalia-primary-dark/50 hover:text-fiscalia-accent-gold hover:bg-fiscalia-accent-gold/10 rounded-lg transition-colors"
                                            title="Modifier la dépense"
                                        >
                                            <PencilIcon className="w-5 h-5" />
                                        </button>
                                    )}
                                    {onDeleteExpense && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDeleteExpense(String(expense.id), expense.name);
                                            }}
                                            className="p-1.5 text-fiscalia-primary-dark/50 hover:text-fiscalia-error hover:bg-fiscalia-error/10 rounded-lg transition-colors"
                                            title="Supprimer la dépense"
                                        >
                                            <TrashIcon className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            {isExpanded && (
                                <div className="mt-3 pl-8 text-sm text-fiscalia-primary-dark/80 space-y-1">
                                    <p><span className="font-medium text-fiscalia-primary-dark">Catégorie:</span> {expense.category}</p>
                                    {expense.jobId && (
                                        <p><span className="font-medium text-fiscalia-primary-dark">Contrat:</span> {jobs.find(j => j.id === expense.jobId)?.name || 'Contrat non trouvé'}</p>
                                    )}
                                    {expense.vendor && <p><span className="font-medium text-fiscalia-primary-dark">Fournisseur:</span> {expense.vendor}</p>}
                                    {expense.notes && (
                                        <p className="whitespace-pre-wrap">
                                            <span className="font-medium text-fiscalia-primary-dark">Notes:</span> {expense.notes}
                                        </p>
                                    )}
                                    {expense.receiptImage && (
                                        <div className="mt-2">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedExpense(expense);
                                                    setIsDetailModalOpen(true);
                                                }}
                                                className="text-fiscalia-accent-gold hover:text-fiscalia-accent-gold/80 text-sm font-medium flex items-center gap-1"
                                            >
                                                <PaperclipIcon className="w-4 h-4" />
                                                Voir le reçu
                                            </button>
                                        </div>
                                    )}
                                    {!expense.jobId && !expense.vendor && !expense.notes && !expense.receiptImage && (
                                        <p className="italic text-fiscalia-primary-dark/60">Aucune information supplémentaire.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                }) : (
                     <div className="text-center py-12">
                        <MagnifyingGlassIcon className="w-12 h-12 mx-auto text-fiscalia-primary-dark/20" />
                        <p className="mt-4 text-fiscalia-primary-dark/70">Aucune dépense ne correspond à vos critères.</p>
                        <p className="text-sm text-fiscalia-primary-dark/50">Essayez d'ajuster votre recherche ou vos filtres.</p>
                    </div>
                )}
            </div>
        </Card>
        {selectedExpense && (
            <ExpenseDetailModal
                expense={selectedExpense}
                job={jobs.find(j => j.id === selectedExpense.jobId) || null}
                isOpen={isDetailModalOpen}
                onClose={() => {
                    setIsDetailModalOpen(false);
                    setSelectedExpense(null);
                }}
                onEdit={onEditExpense ? () => {
                    setIsDetailModalOpen(false);
                    onEditExpense(selectedExpense);
                } : undefined}
                onDelete={onDeleteExpense ? () => {
                    setIsDetailModalOpen(false);
                    onDeleteExpense(String(selectedExpense.id), selectedExpense.name);
                    setSelectedExpense(null);
                } : undefined}
                onDeleteReceipt={onDeleteReceipt ? async () => {
                    await onDeleteReceipt(selectedExpense);
                    setSelectedExpense(null);
                } : undefined}
            />
        )}
    </div>
    );
};

interface ExpenseDetailModalProps {
    expense: Expense;
    job: Job | null;
    isOpen: boolean;
    onClose: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    onDeleteReceipt?: (expense: Expense) => Promise<void> | void;
}

const ExpenseDetailModal: React.FC<ExpenseDetailModalProps> = ({ expense, job, isOpen, onClose, onEdit, onDelete, onDeleteReceipt }) => {
    const [isDeletingReceipt, setIsDeletingReceipt] = useState(false);
    const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
    const [isLoadingReceipt, setIsLoadingReceipt] = useState(false);

    // Generate signed URL for receipt when modal opens and expense has a receipt
    useEffect(() => {
        if (!isOpen || !expense.receiptImage) {
            setReceiptUrl(null);
            return;
        }

        // If receiptImage is already a full URL (data URL or public URL), use it directly
        if (expense.receiptImage.startsWith('data:') || expense.receiptImage.startsWith('http')) {
            setReceiptUrl(expense.receiptImage);
            return;
        }

        // If receiptImage is a storage path, generate a signed URL
        // Extract path from URL if it's a full URL, otherwise use as-is
        const extractPath = (urlOrPath: string): string => {
            // If it's a full URL (public or signed), extract the path part
            const match = urlOrPath.match(/\/storage\/v1\/object\/[^/]+\/receipts\/(.+)$/);
            if (match) {
                return match[1];
            }
            // If it's just a path (userId/filename.jpg), use it directly
            // Also handle cases where it might be a data URL (shouldn't happen but be safe)
            if (urlOrPath.includes('/') && !urlOrPath.startsWith('http') && !urlOrPath.startsWith('data:')) {
                return urlOrPath;
            }
            // Fallback: return as-is (might be a path already)
            return urlOrPath;
        };

        const receiptPath = extractPath(expense.receiptImage);
        
        setIsLoadingReceipt(true);
        (async () => {
            try {
                const { supabase } = await import('./services/supabaseClient');
                // Generate signed URL valid for 1 hour
                const { data, error } = await supabase.storage
                    .from('receipts')
                    .createSignedUrl(receiptPath, 3600); // 1 hour expiry

                if (error) {
                    console.error('Failed to generate signed URL for receipt:', error);
                    // Fallback: try to use the path as-is (might work if bucket is actually public)
                    setReceiptUrl(expense.receiptImage);
                } else {
                    setReceiptUrl(data.signedUrl);
                }
            } catch (err) {
                console.error('Error generating signed URL:', err);
                setReceiptUrl(expense.receiptImage); // Fallback
            } finally {
                setIsLoadingReceipt(false);
            }
        })();
    }, [isOpen, expense.receiptImage]);

    const handleDeleteReceipt = async () => {
        if (!expense.receiptImage || !window.confirm('Êtes-vous sûr de vouloir supprimer ce reçu ?')) {
            return;
        }

        setIsDeletingReceipt(true);
        try {
            const { receiptService } = await import('./services/receiptService');
            // Extract path from URL if needed
            const extractPath = (urlOrPath: string): string => {
                const match = urlOrPath.match(/\/storage\/v1\/object\/[^/]+\/receipts\/(.+)$/);
                return match ? match[1] : urlOrPath;
            };
            const receiptPath = extractPath(expense.receiptImage);
            
            // Delete from storage using the path
            const { supabase } = await import('./services/supabaseClient');
            const { error } = await supabase.storage
                .from('receipts')
                .remove([receiptPath]);

            if (error) {
                console.error('Failed to delete receipt from storage:', error);
            }

            // Update expense to remove receipt image
            if (onDeleteReceipt) {
                await onDeleteReceipt(expense);
            }
        } catch (error) {
            console.error('Failed to delete receipt:', error);
            alert('Impossible de supprimer le reçu. Veuillez réessayer.');
        } finally {
            setIsDeletingReceipt(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Détails de la dépense" size="lg">
            <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-sm text-fiscalia-primary-dark/60 mb-1">Description</p>
                        <p className="font-semibold text-fiscalia-primary-dark">{expense.name}</p>
                    </div>
                    <div>
                        <p className="text-sm text-fiscalia-primary-dark/60 mb-1">Montant</p>
                        <p className="font-semibold text-fiscalia-primary-dark text-lg">
                            {expense.amount.toLocaleString('fr-CA', { style: 'currency', currency: 'CAD' })}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-fiscalia-primary-dark/60 mb-1">Date</p>
                        <p className="font-medium text-fiscalia-primary-dark">
                            {formatLocalDate(expense.date)}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm text-fiscalia-primary-dark/60 mb-1">Catégorie</p>
                        <p className="font-medium text-fiscalia-primary-dark">{expense.category}</p>
                    </div>
                    {expense.vendor && (
                        <div>
                            <p className="text-sm text-fiscalia-primary-dark/60 mb-1">Fournisseur</p>
                            <p className="font-medium text-fiscalia-primary-dark">{expense.vendor}</p>
                        </div>
                    )}
                    {job && (
                        <div>
                            <p className="text-sm text-fiscalia-primary-dark/60 mb-1">Contrat</p>
                            <p className="font-medium text-fiscalia-primary-dark">{job.name}</p>
                        </div>
                    )}
                </div>

                {expense.notes && (
                    <div>
                        <p className="text-sm text-fiscalia-primary-dark/60 mb-1">Notes</p>
                        <p className="text-fiscalia-primary-dark whitespace-pre-wrap bg-fiscalia-light-neutral p-3 rounded-lg">
                            {expense.notes}
                        </p>
                    </div>
                )}

                {expense.receiptImage && (
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-sm text-fiscalia-primary-dark/60">Reçu</p>
                            <button
                                type="button"
                                onClick={handleDeleteReceipt}
                                disabled={isDeletingReceipt}
                                className="text-sm text-fiscalia-error hover:text-fiscalia-error/80 disabled:opacity-50 flex items-center gap-1"
                            >
                                <TrashIcon className="w-4 h-4" />
                                {isDeletingReceipt ? 'Suppression...' : 'Supprimer le reçu'}
                            </button>
                        </div>
                        <div className="border border-fiscalia-primary-dark/20 rounded-lg overflow-hidden bg-fiscalia-light-neutral">
                            {isLoadingReceipt ? (
                                <div className="flex items-center justify-center p-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-fiscalia-accent-gold"></div>
                                    <span className="ml-3 text-fiscalia-primary-dark/70">Chargement du reçu...</span>
                                </div>
                            ) : receiptUrl ? (
                                <img
                                    src={receiptUrl}
                                    alt="Reçu"
                                    className="w-full h-auto max-h-96 object-contain"
                                    onError={(e) => {
                                        console.error('Failed to load receipt image');
                                        (e.target as HTMLImageElement).style.display = 'none';
                                        const parent = (e.target as HTMLImageElement).parentElement;
                                        if (parent) {
                                            parent.innerHTML = '<div class="p-8 text-center text-fiscalia-primary-dark/60">Impossible de charger le reçu</div>';
                                        }
                                    }}
                                />
                            ) : (
                                <div className="p-8 text-center text-fiscalia-primary-dark/60">
                                    Erreur lors du chargement du reçu
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-fiscalia-primary-dark/10">
                    {onDelete && (
                        <Button
                            variant="secondary"
                            onClick={onDelete}
                            className="text-fiscalia-error hover:bg-fiscalia-error/10"
                        >
                            <TrashIcon className="w-4 h-4 mr-2" />
                            Supprimer la dépense
                        </Button>
                    )}
                    {onEdit && (
                        <Button onClick={onEdit}>
                            <PencilIcon className="w-4 h-4 mr-2" />
                            Modifier
                        </Button>
                    )}
                    <Button variant="secondary" onClick={onClose}>
                        Fermer
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

type StartNewConversationOptions = {
    focusAssistant?: boolean;
};

export const ChatScreen: React.FC<{
    conversation: Conversation | null;
    messages: ChatMessage[];
    onMessagesChange: (conversationId: string, updater: React.SetStateAction<ChatMessage[]>) => Promise<void> | void;
    onStartNewConversation: (options?: StartNewConversationOptions) => Promise<string | null>;
    onFirstUserMessage: (conversationId: string, messageText: string) => Promise<void> | void;
    jobs: Job[];
    expenses: Expense[];
    categories: ExpenseCategory[];
    addJob: (job: Job) => Promise<void> | void;
    addExpense: (expense: Omit<Expense, 'id'>) => Promise<void> | void;
    updateExpense: (expense: Expense) => Promise<void> | void;
    updateJob: (job: Partial<Job> & { id: string }) => Promise<void> | void;
    deleteJob?: (jobId: string, jobName?: string) => Promise<void> | void;
    deleteExpense?: (expenseId: string, expenseName?: string) => Promise<void> | void;
    createCategory?: (categoryName: string) => Promise<void> | void;
    renameCategory?: (categoryName: string, nextName: string) => Promise<void> | void;
    deleteCategory?: (categoryName: string) => Promise<void> | void;
    createNotification?: (payload: { message: string; type?: Notification['type']; jobId?: string }) => Promise<void> | void;
    markNotificationRead?: (payload: { notificationId?: string; notificationMessage?: string }) => Promise<void> | void;
    deleteNotification?: (payload: { notificationId?: string; notificationMessage?: string }) => Promise<void> | void;
    registerPendingOperation?: (operation: Promise<unknown>) => void;
    focusAssistantOnNewConversation?: boolean;
    onRequireRefresh?: () => Promise<void> | void;
}> = ({
    conversation,
    messages,
    onMessagesChange,
    onStartNewConversation,
    onFirstUserMessage,
    jobs,
    expenses,
    categories,
    addJob,
    addExpense,
    updateExpense,
    updateJob,
    deleteJob,
    deleteExpense,
    createCategory,
    renameCategory,
    deleteCategory,
    createNotification,
    markNotificationRead,
    deleteNotification,
    registerPendingOperation,
    focusAssistantOnNewConversation = true,
    onRequireRefresh,
}) => {
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [interimTranscript, setInterimTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [attachedReceipt, setAttachedReceipt] = useState<{ file: File; preview: string; ocrResult?: any } | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pendingConversationCreationRef = useRef<Promise<string | null> | null>(null);

    const conversationId = conversation?.id ?? null;

    const ensureConversationReady = useCallback(async (): Promise<string | null> => {
        if (conversationId) {
            return conversationId;
        }
        if (pendingConversationCreationRef.current) {
            return pendingConversationCreationRef.current;
        }
        const creationPromise = onStartNewConversation({ focusAssistant: focusAssistantOnNewConversation })
            .then((newId) => {
                pendingConversationCreationRef.current = null;
                return newId;
            })
            .catch((creationError) => {
                console.error('Failed to auto-start conversation', creationError);
                pendingConversationCreationRef.current = null;
                return null;
            });
        pendingConversationCreationRef.current = creationPromise;
        return creationPromise;
    }, [conversationId, focusAssistantOnNewConversation, onStartNewConversation]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const parseDate = (dateStr: string): string => {
        if (!dateStr) {
            return new Date().toISOString().split('T')[0];
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            return dateStr;
        }
        const parsed = new Date(dateStr);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toISOString().split('T')[0];
        }
        return new Date().toISOString().split('T')[0];
    };

    const parseAmount = (amount: unknown): number => {
        if (typeof amount === 'number') return amount;
        if (typeof amount === 'string') {
            const cleaned = amount.replace(/[$,\s]/g, '').trim();
            const parsed = Number.parseFloat(cleaned);
            return Number.isNaN(parsed) ? 0 : parsed;
        }
        return 0;
    };

    const getFirstNonEmptyValue = (...values: unknown[]): string | undefined => {
        for (const value of values) {
            if (value === undefined || value === null) {
                continue;
            }
            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (!trimmed) {
                    continue;
                }
                return trimmed;
            }
            return String(value);
        }
        return undefined;
    };

    const toStringOrUndefined = (value: unknown): string | undefined => {
        if (value === undefined || value === null) {
            return undefined;
        }
        const stringValue = String(value).trim();
        return stringValue.length > 0 ? stringValue : undefined;
    };

    const appendMessage = useCallback(
        async (targetConversationId: string, message: ChatMessage): Promise<ChatMessage[]> => {
            let nextMessages: ChatMessage[] = [];
            await Promise.resolve(
                onMessagesChange(targetConversationId, (previous) => {
                    nextMessages = [...previous, message];
                    return nextMessages;
                })
            );
            return nextMessages;
        },
        [onMessagesChange]
    );

    const removeMessagesByPrefix = useCallback(
        async (targetConversationId: string, prefix: string) => {
            await Promise.resolve(
                onMessagesChange(targetConversationId, (previous) =>
                    previous.filter((msg) => !msg.id.startsWith(prefix))
                )
            );
        },
        [onMessagesChange]
    );

    const executeAIActions = useCallback(
        async (actions: AIAction[] = [], retryCount = 0): Promise<ActionExecutionResult> => {
            const MAX_RETRIES = 2;
            const RETRY_DELAY_MS = 1000;
            
            if (!Array.isArray(actions) || actions.length === 0) {
                return { mutated: false, log: [] };
            }
            
            try {
                console.log(`Executing ${actions.length} AI action(s)`, { 
                    actions: actions.map(a => a.action),
                    attempt: retryCount + 1 
                });
                
                const result = await actionService.execute(actions);
                
                console.log('AI actions executed successfully', { 
                    mutated: result.mutated,
                    logCount: result.log.length 
                });
                
                if (result.mutated) {
                    // Add small delay to ensure database writes are committed
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Refresh data to reflect changes
                    await Promise.resolve(onRequireRefresh?.());
                    
                    console.log('Data refreshed after AI action mutations');
                }
                
                return result;
            } catch (error) {
                console.error('AI action execution failed', { 
                    error: error instanceof Error ? error.message : String(error),
                    attempt: retryCount + 1,
                    actions: actions.map(a => a.action)
                });
                
                // Retry logic for network/temporary errors
                if (retryCount < MAX_RETRIES) {
                    const isRetryableError = error instanceof Error && (
                        error.message.includes('network') ||
                        error.message.includes('timeout') ||
                        error.message.includes('fetch') ||
                        error.message.includes('502') ||
                        error.message.includes('503') ||
                        error.message.includes('504')
                    );
                    
                    if (isRetryableError) {
                        console.log(`Retrying AI actions (${retryCount + 1}/${MAX_RETRIES})...`);
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (retryCount + 1)));
                        return executeAIActions(actions, retryCount + 1);
                    }
                }
                
                // Provide user-friendly error messages
                const errorMessage = error instanceof Error ? error.message : "Une action IA a échoué.";
                const userFriendlyMessage = errorMessage
                    .replace(/Database error:/gi, 'Erreur de base de données:')
                    .replace(/Network error:/gi, 'Erreur réseau:')
                    .replace(/timeout/gi, 'délai d\'attente dépassé');
                
                throw new Error(userFriendlyMessage);
            }
        },
        [onRequireRefresh]
    );

    const processAIMessage = useCallback(
        async (
            targetConversationId: string,
            messageText: string,
            baseMessages: ChatMessage[],
            retryAttempt: number = 0
        ): Promise<void> => {
            if (!targetConversationId) {
                setIsLoading(false);
                return;
            }
            try {
                // Build conversation history, including receipt context from previous messages
                const conversationHistory = baseMessages
                    .filter((msg) => msg.sender === 'user' || msg.sender === 'ai')
                    .slice(-10)
                    .map((msg) => {
                        let content = msg.text;
                        
                        // If this is a user message with receipt data, include receipt context
                        // This allows the AI to answer follow-up questions about the receipt
                        if (msg.sender === 'user' && (msg.receiptPath || msg.receiptOcrData)) {
                            const receiptContextParts: string[] = [];
                            
                            if (msg.receiptPath) {
                                receiptContextParts.push(`chemin_reçu=${msg.receiptPath}`);
                            }
                            
                            if (msg.receiptOcrData) {
                                // Basic info
                                const vendorPart = msg.receiptOcrData.vendor ? `fournisseur=${msg.receiptOcrData.vendor}` : '';
                                const totalPart =
                                    typeof msg.receiptOcrData.total === 'number' ? `total=${msg.receiptOcrData.total.toFixed(2)}` : '';
                                const datePart = msg.receiptOcrData.date ? `date=${msg.receiptOcrData.date}` : '';
                                const subtotalPart =
                                    typeof msg.receiptOcrData.subtotal === 'number' ? `sous_total=${msg.receiptOcrData.subtotal.toFixed(2)}` : '';
                                
                                // Tax breakdown
                                const taxParts: string[] = [];
                                if (msg.receiptOcrData.tax) {
                                    if (typeof msg.receiptOcrData.tax.gst === 'number') {
                                        taxParts.push(`TPS=${msg.receiptOcrData.tax.gst.toFixed(2)}`);
                                    }
                                    if (typeof msg.receiptOcrData.tax.pst === 'number') {
                                        taxParts.push(`TVP=${msg.receiptOcrData.tax.pst.toFixed(2)}`);
                                    }
                                    if (typeof msg.receiptOcrData.tax.qst === 'number') {
                                        taxParts.push(`TVQ=${msg.receiptOcrData.tax.qst.toFixed(2)}`);
                                    }
                                    if (typeof msg.receiptOcrData.tax.hst === 'number') {
                                        taxParts.push(`TVH=${msg.receiptOcrData.tax.hst.toFixed(2)}`);
                                    }
                                    if (typeof msg.receiptOcrData.tax.total === 'number' && !msg.receiptOcrData.tax.gst && !msg.receiptOcrData.tax.pst && !msg.receiptOcrData.tax.qst && !msg.receiptOcrData.tax.hst) {
                                        taxParts.push(`taxe_totale=${msg.receiptOcrData.tax.total.toFixed(2)}`);
                                    }
                                }
                                
                                // Individual items - include ALL items (no limit)
                                // Include items even if price is 0 (AI can infer from subtotal)
                                const itemsPart = msg.receiptOcrData.items && msg.receiptOcrData.items.length > 0
                                    ? `articles=[${msg.receiptOcrData.items.map(item => {
                                        // Format price, show 0.00 if no price (AI will infer)
                                        const priceStr = item.price > 0 ? item.price.toFixed(2) : '0.00';
                                        return `${item.name}:${priceStr}`;
                                    }).join('; ')}]`
                                    : '';
                                
                                // Combine all parts
                                const meta = [
                                    vendorPart,
                                    subtotalPart,
                                    ...taxParts,
                                    totalPart,
                                    datePart,
                                    itemsPart
                                ].filter(Boolean).join(', ');
                                
                                if (meta) {
                                    receiptContextParts.push(meta);
                                }
                                
                                // Debug: Log items in conversation history
                                if (msg.receiptOcrData?.items && msg.receiptOcrData.items.length > 0) {
                                    console.log(`📝 Conversation history - Message ${msg.id} has ${msg.receiptOcrData.items.length} items:`, msg.receiptOcrData.items);
                                }
                            }
                            
                            // Append receipt context if we have any
                            if (receiptContextParts.length > 0) {
                                content = `${content}\n\n[reçu: ${receiptContextParts.join(' ; ')}]`;
                                // Debug: Log the full content being sent
                                if (receiptContextParts.some(part => part.includes('articles='))) {
                                    console.log('✅ Conversation history includes items in receipt context');
                                }
                            }
                        }
                        
                        return {
                            role: msg.sender === 'user' ? ('user' as const) : ('assistant' as const),
                            content,
                        };
                    });

                const activeJobIds = new Set(jobs.map((job) => job.id));
                const activeExpenses = expenses.filter((expense) => !expense.jobId || activeJobIds.has(expense.jobId));

                const activeConversationMemory =
                    conversation && conversation.id === targetConversationId ? conversation.memorySummary ?? null : conversation?.memorySummary ?? null;
                
                // Extract receipt data from recent messages (last 10 messages)
                // CRITICAL: Include the CURRENT message's receipt data if it exists
                // Check the LAST message first (most recent) as it's likely the current receipt
                const recentReceipts = baseMessages
                    .slice(-10)
                    .filter(msg => {
                        // Include user messages with receipt data
                        if (msg.sender === 'user' && msg.receiptOcrData) {
                            return true;
                        }
                        // Also include if message has receiptPath (receipt was uploaded)
                        if (msg.sender === 'user' && msg.receiptPath) {
                            return true;
                        }
                        return false;
                    })
                    .map(msg => {
                        // Map receiptOcrData to match ReceiptData interface structure
                        // If receiptOcrData exists, use it; otherwise create minimal structure from receiptPath
                        if (msg.receiptOcrData) {
                            const data = msg.receiptOcrData;
                            return {
                                vendor: data.vendor,
                                date: data.date,
                                total: data.total,
                                subtotal: data.subtotal,
                                tax: data.tax,
                                items: data.items?.map(item => ({
                                    name: item.name,
                                    price: item.price,
                                    // Include quantity and unitPrice if available (from enhanced OCR)
                                    quantity: 'quantity' in item ? item.quantity : undefined,
                                    unitPrice: 'unitPrice' in item ? item.unitPrice : undefined,
                                })),
                                currency: 'currency' in data ? data.currency : undefined,
                                receiptPath: msg.receiptPath,
                            };
                        } else if (msg.receiptPath) {
                            // If we have receiptPath but no OCR data yet, include minimal structure
                            // This helps AI know a receipt exists even if OCR is still processing
                            return {
                                receiptPath: msg.receiptPath,
                            };
                        }
                        return null;
                    })
                    .filter((data): data is NonNullable<typeof data> => {
                        // Only include receipts with meaningful data OR receiptPath
                        return !!(data && (data.vendor || data.total || data.items?.length || data.receiptPath));
                    });
                
                // Debug: Log receipt data being sent to AI
                if (recentReceipts.length > 0) {
                    console.log(`📋 Sending ${recentReceipts.length} receipt(s) to AI context:`, recentReceipts.map(r => ({
                        vendor: r.vendor,
                        total: r.total,
                        itemsCount: r.items?.length || 0,
                        hasTax: !!r.tax,
                        taxComponents: r.tax ? Object.keys(r.tax) : [],
                        hasReceiptPath: !!r.receiptPath,
                    })));
                    // Log full receipt data for debugging
                    recentReceipts.forEach((r, idx) => {
                        console.log(`📋 Receipt ${idx + 1} full data:`, JSON.stringify(r, null, 2));
                    });
                } else {
                    console.warn('⚠️ No receipt data found in recent messages for AI context');
                    console.warn('⚠️ Available messages:', baseMessages.slice(-5).map(m => ({
                        id: m.id,
                        sender: m.sender,
                        hasReceiptPath: !!m.receiptPath,
                        hasReceiptOcrData: !!m.receiptOcrData,
                        receiptOcrDataKeys: m.receiptOcrData ? Object.keys(m.receiptOcrData) : [],
                    })));
                }
                
                const context = {
                    jobs,
                    expenses: activeExpenses,
                    categories,
                    currentDate: new Date().toISOString().split('T')[0],
                    conversationId: targetConversationId,
                    conversationMemory: activeConversationMemory,
                    receipts: recentReceipts.length > 0 ? recentReceipts : undefined,
                };

                if (retryAttempt > 0) {
                    await appendMessage(targetConversationId, {
                        id: `retry-${Date.now()}`,
                        conversationId: targetConversationId,
                        sender: 'ai',
                        text: `Réessai ${retryAttempt}/3... Patientez quelques secondes.`,
                        timestamp: new Date().toISOString(),
                    });
                }

                const aiResponse = await aiService.sendMessage(messageText, conversationHistory, context);

                if (retryAttempt > 0) {
                    await removeMessagesByPrefix(targetConversationId, 'retry-');
                }

                let hasMutated = false;
                if (aiResponse.actions && aiResponse.actions.length > 0) {
                    try {
                        const { mutated } = await executeAIActions(aiResponse.actions);
                        hasMutated = mutated;
                        const confirmation = aiResponse.actions[0]?.confirmationMessage;
                        if (confirmation && !aiResponse.text) {
                            aiResponse.text = confirmation;
                        }
                    } catch (actionError) {
                        throw actionError instanceof Error
                            ? actionError
                            : new Error("Une erreur inconnue est survenue pendant l'exécution des actions.");
                    }
                }

                if (hasMutated) {
                    try {
                        // Add small delay to ensure database writes are committed
                        // CRITICAL: This ensures the AI always has the latest state after mutations
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        await Promise.resolve(onRequireRefresh?.());
                        
                        console.log('Analytics and dashboard data refreshed successfully - AI context will be updated on next message');
                    } catch (refreshError) {
                        console.error('Failed to refresh data after actions', refreshError);
                        throw refreshError instanceof Error
                            ? new Error(
                                  `Les actions ont été effectuées, mais la synchronisation a échoué : ${refreshError.message}`
                              )
                            : new Error('Les actions ont été effectuées, mais la synchronisation a échoué.');
                    }
                }

                const displayText = aiResponse.text || 'Actions exécutées avec succès!';

                await appendMessage(targetConversationId, {
                    id: createMessageId('ai'),
                    conversationId: targetConversationId,
                    sender: 'ai',
                    text: displayText,
                    timestamp: new Date().toISOString(),
                });
                
                // Update conversation memory periodically (every 5 messages)
                // This maintains context for long conversations
                const totalMessages = baseMessages.length + 1; // +1 for the AI response we just added
                if (totalMessages % 5 === 0 || hasMutated) {
                    // Trigger memory update asynchronously (don't block UI)
                    aiService.updateConversationMemory(targetConversationId, false)
                        .then((result) => {
                            if (result.success) {
                                console.log('Conversation memory updated successfully');
                            }
                        })
                        .catch((error) => {
                            console.warn('Failed to update conversation memory:', error);
                        });
                }
                
                setError(null);
            } catch (processingError) {
                console.error('AI Error:', processingError);
                if (retryAttempt > 0) {
                    await removeMessagesByPrefix(targetConversationId, 'retry-');
                }
                await appendMessage(targetConversationId, {
                    id: createMessageId('ai'),
                    conversationId: targetConversationId,
                    sender: 'ai',
                    text:
                        processingError instanceof Error
                            ? processingError.message
                            : 'Une erreur est survenue. Veuillez réessayer.',
                    timestamp: new Date().toISOString(),
                });
                setError(processingError instanceof Error ? processingError.message : 'Erreur inconnue');
            } finally {
                setIsLoading(false);
            }
        },
        [appendMessage, categories, executeAIActions, expenses, jobs, onRequireRefresh, removeMessagesByPrefix]
    );

    const performSendMessage = useCallback(
        async (rawText: string): Promise<void> => {
            const messageText = rawText.trim();
            if (!messageText || isLoading) {
                return;
            }

            const targetConversationId = await ensureConversationReady();
            if (!targetConversationId) {
                setError("Impossible de démarrer la conversation. Veuillez réessayer.");
                return;
            }

            const userMessage: ChatMessage = {
                id: createMessageId('user'),
                conversationId: targetConversationId,
                sender: 'user',
                text: messageText,
                timestamp: new Date().toISOString(),
            };

            setInput('');
            setInterimTranscript('');
            setError(null);
            setIsLoading(true);

            const updatedMessages = await appendMessage(targetConversationId, userMessage);
            await onFirstUserMessage(targetConversationId, userMessage.text);
            await processAIMessage(targetConversationId, messageText, updatedMessages);
        },
        [appendMessage, ensureConversationReady, isLoading, onFirstUserMessage, processAIMessage]
    );

    const sendMessage = useCallback(
        async (rawText: string): Promise<void> => {
            const operation = performSendMessage(rawText);
            if (registerPendingOperation) {
                registerPendingOperation(operation);
            }
            await operation;
        },
        [performSendMessage, registerPendingOperation]
    );

    const handleSend = async () => {
        if (attachedReceipt) {
            await handleSendWithReceipt();
            return;
        }
        const messageToSend = input.trim();
        if (!messageToSend) {
            return;
        }
        setInput('');
        setInterimTranscript('');
        await sendMessage(messageToSend);
    };

    const handleMicrophoneClick = async () => {
        if (isListening) {
            speechService.stopListening();
            const finalText = interimTranscript.trim();
            setIsListening(false);
            if (finalText) {
                void sendMessage(finalText);
            } else {
                setInterimTranscript('');
            }
            return;
        }

        const targetConversationId = await ensureConversationReady();
        if (!targetConversationId) {
            setError("Impossible de démarrer la conversation. Veuillez réessayer.");
            return;
        }

        if (!speechService.isSupported()) {
            setError("La reconnaissance vocale n'est pas supportée dans ce navigateur. Utilisez Chrome ou Edge.");
            return;
        }

        setIsListening(true);
        setError(null);
        setInterimTranscript('');

        const recognition = speechService.startListening(
            (transcript: string, isFinal: boolean) => {
                setInterimTranscript(transcript);
            },
            (errorMessage: string) => {
                setError(errorMessage);
                setIsListening(false);
                setInterimTranscript('');
            }
        );

        if (!recognition) {
            setIsListening(false);
            setError("Impossible de démarrer la reconnaissance vocale");
        }
    };

    const handleAttachmentClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files || !event.target.files[0]) return;
        
        const file = event.target.files[0];

        // Attempt to normalize image (resize/compress); allow large inputs
        let preparedFile = file;
        try {
            const { prepareImageForOCR } = await import('./services/ocrService');
            preparedFile = await prepareImageForOCR(file);
        } catch (e) {
            // If preparation fails (e.g., HEIC decode), show a clear message
            if (/heic|heif/i.test(file.name) || /heic|heif/i.test(file.type)) {
                setError("Le format HEIC/HEIF n'est pas supporté par ce navigateur. Veuillez convertir en JPEG/PNG/WebP (iPhone: Réglages > Appareil photo > Formats > 'Le plus compatible').");
                return;
            }
            // Otherwise continue with the original file
        }
        
        setError(null);
        
        // Create preview URL and attach receipt WITHOUT processing OCR yet
        const preview = URL.createObjectURL(preparedFile);
        
        // Attach receipt to chat - OCR will be done when message is sent
        setAttachedReceipt({
            file: preparedFile,
            preview,
            ocrResult: undefined, // Will be processed when sending
        });
        
        // Clear file input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };
    
    const handleRemoveAttachedReceipt = () => {
        if (attachedReceipt?.preview) {
            URL.revokeObjectURL(attachedReceipt.preview);
        }
        setAttachedReceipt(null);
    };
    
    const handleSendWithReceipt = async () => {
        if (!attachedReceipt) {
            await handleSend();
            return;
        }
        
        const messageText = input.trim() || 'Analysez ce reçu';
        if (isLoading) return;
        
            const targetConversationId = await ensureConversationReady();
            if (!targetConversationId) {
            setError("Impossible de démarrer la conversation. Veuillez réessayer.");
            return;
        }
        
        setIsLoading(true);
        setError(null);
        
        try {
            // Get current user
            const user = await authService.getUser();
            if (!user) {
                throw new Error("Utilisateur non authentifié");
            }

            // Capture current attached receipt so we can clear UI immediately
            const currentReceipt = attachedReceipt;

            // 1) Immediately add the user message with blob URL for instant display
            const userMessage: ChatMessage = {
                id: createMessageId('user'),
                conversationId: targetConversationId,
                sender: 'user',
                text: messageText,
                timestamp: new Date().toISOString(),
                // Use local preview URL for instant display - image appears immediately
                receiptImage: currentReceipt?.preview,
            };

            setInput('');
            setInterimTranscript('');
            // Clear attachment UI without revoking the preview URL (keeps thumbnail alive)
            setAttachedReceipt(null);

            const updatedMessages = await appendMessage(targetConversationId, userMessage);
            await onFirstUserMessage(targetConversationId, userMessage.text);

            // 2) Upload receipt to storage (but enhanced OCR will handle this, so this is fallback)
            // Image already displays via blob URL, so this doesn't block UI
            let receiptPath: string | undefined;
            let receiptUrl: string | undefined;
            let receiptUploaded = false; // Track if upload was done by enhanced OCR
            
            // Note: Enhanced OCR will upload the receipt automatically
            // We only upload here as a fallback if not using enhanced OCR

            // 3) Start OCR processing - we'll wait for it before sending to AI
            // Enhanced OCR includes AI-powered parsing, so we want to wait for complete data
            let receiptOcrData:
                | {
                      vendor?: string;
                      total?: number;
                      date?: string;
                      rawText?: string;
                      items?: Array<{ name: string; price: number }>;
                      subtotal?: number;
                      tax?: {
                          gst?: number;
                          pst?: number;
                          qst?: number;
                          hst?: number;
                          total?: number;
                      };
                  }
                | undefined;

            // Start OCR with enhanced server-side processing (when user is authenticated)
            // Use enhanced OCR for better reliability and AI-powered parsing
            const ocrPromise = (async () => {
                try {
                    if (currentReceipt?.file) {
                        console.log('[OCR] Starting OCR processing for receipt file...');
                        
                        // Use server-side OCR only (requires authenticated user)
                        let ocrResult: Awaited<ReturnType<typeof processReceiptEnhanced>> | null = null;
                        
                        const { data: { session } } = await supabase.auth.getSession();
                        if (!session?.user) {
                            console.error('[OCR] User not authenticated - cannot process receipt');
                            return; // Skip this receipt if user is not authenticated
                        }
                        
                        try {
                            // Use enhanced server-side OCR with AI-powered parsing
                            const { processReceiptEnhanced } = await import('./services/ocrService');
                            console.log('[OCR] Using enhanced server-side OCR...');
                            ocrResult = await processReceiptEnhanced(currentReceipt.file, session.user.id);
                            
                            // Enhanced OCR already uploaded the receipt
                            if (ocrResult && 'receiptPath' in ocrResult && ocrResult.receiptPath) {
                                receiptPath = ocrResult.receiptPath;
                                receiptUploaded = true;
                                // Get public URL
                                const { data: urlData } = supabase.storage
                                    .from('receipts')
                                    .getPublicUrl(ocrResult.receiptPath);
                                receiptUrl = urlData.publicUrl;
                                console.log('[OCR] Receipt uploaded by enhanced OCR:', receiptPath);
                            }
                        } catch (enhancedError) {
                            console.error('[OCR] Enhanced OCR failed:', enhancedError);
                            // No fallback - server-side OCR is required
                            return; // Skip this receipt if OCR fails
                        }
                        
                        // Upload receipt if not already uploaded by enhanced OCR
                        if (!receiptUploaded && currentReceipt?.file && !receiptPath) {
                            try {
                                const filename = `${user.id}/${crypto.randomUUID()}.${(currentReceipt.file.name.split('.').pop() || 'jpg')}`;
                                const { data, error: uploadError } = await supabase.storage
                                    .from('receipts')
                                    .upload(filename, currentReceipt.file, {
                                        contentType: currentReceipt.file.type,
                                        upsert: false,
                                    });

                                if (uploadError) {
                                    console.error('Failed to upload receipt:', uploadError);
                                } else {
                                    receiptPath = data?.path;
                                    // Get public URL for the receipt
                                    const { data: urlData } = supabase.storage
                                        .from('receipts')
                                        .getPublicUrl(filename);
                                    receiptUrl = urlData.publicUrl;
                                }
                            } catch (uploadErr) {
                                console.error('Upload error:', uploadErr);
                            }
                        }
                        
                        // Always return data if we have OCR result, even if parsing partially failed
                        if (ocrResult) {
                            console.log('[OCR] OCR result received:', {
                                success: ocrResult.ocrResult?.success,
                                hasText: !!ocrResult.rawText,
                                hasVendor: !!ocrResult.vendor,
                                hasTotal: !!ocrResult.total,
                                hasItems: !!ocrResult.items,
                                itemsCount: ocrResult.items?.length || 0
                            });
                            
                            // Only process if OCR extraction was successful (even if parsing found no items)
                            if (ocrResult.ocrResult?.success && ocrResult.rawText) {
                                // Normalize date to ISO format (YYYY-MM-DD) if possible
                                let normalizedDate: string | undefined = ocrResult.date;
                                if (ocrResult.date) {
                                    try {
                                        // Try to parse the date and convert to ISO format
                                        // Use parseLocalDate to avoid timezone issues
                                        const parsedDate = parseLocalDate(ocrResult.date);
                                        if (!isNaN(parsedDate.getTime())) {
                                            // Convert local date back to YYYY-MM-DD string
                                            const year = parsedDate.getFullYear();
                                            const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
                                            const day = String(parsedDate.getDate()).padStart(2, '0');
                                            normalizedDate = `${year}-${month}-${day}`;
                                        } else {
                                            // If parsing fails, try common date formats
                                            const dateStr = ocrResult.date.trim();
                                            // Try DD/MM/YYYY or MM/DD/YYYY
                                            const ddmmyyyy = dateStr.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
                                            if (ddmmyyyy) {
                                                const [, day, month, year] = ddmmyyyy;
                                                normalizedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                                            } else {
                                                // Keep original if we can't parse it - AI will handle it
                                                normalizedDate = ocrResult.date;
                                            }
                                        }
                                    } catch (dateErr) {
                                        // If date parsing fails, keep original - AI will handle conversion
                                        normalizedDate = ocrResult.date;
                                    }
                                }
                                
                                return {
                                    vendor: ocrResult.vendor,
                                    total: ocrResult.total,
                                    date: normalizedDate,
                                    rawText: ocrResult.rawText?.substring(0, 1000),
                                    items: ocrResult.items || [], // Ensure items is always an array
                                    subtotal: ocrResult.subtotal,
                                    tax: ocrResult.tax,
                                };
                            } else {
                                console.warn('[OCR] OCR extraction failed:', {
                                    success: ocrResult.ocrResult?.success,
                                    error: ocrResult.ocrResult?.error,
                                    hasText: !!ocrResult.rawText
                                });
                                // Even if OCR failed, return partial data if we have anything
                                if (ocrResult.vendor || ocrResult.total || ocrResult.items?.length) {
                                    return {
                                        vendor: ocrResult.vendor,
                                        total: ocrResult.total,
                                        date: ocrResult.date,
                                        rawText: ocrResult.rawText?.substring(0, 1000),
                                        items: ocrResult.items || [],
                                        subtotal: ocrResult.subtotal,
                                        tax: ocrResult.tax,
                                    };
                                }
                            }
                        } else {
                            console.warn('[OCR] processReceiptEnhanced returned null/undefined');
                        }
                    } else {
                        console.warn('[OCR] No receipt file available');
                    }
                } catch (ocrErr) {
                    console.error('[OCR] OCR processing error:', ocrErr);
                    // Re-throw to be caught by outer handler
                    throw ocrErr;
                }
                // Return undefined if OCR failed or is still processing
                return undefined;
            })();

            // Wait for OCR to complete, but don't block too long
            // Increased timeout to 12 seconds for enhanced OCR (may take longer for AI parsing)
            // This ensures items are extracted even from complex receipt formats
            try {
                receiptOcrData = await Promise.race([
                    ocrPromise,
                    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 12000)), // 12 second timeout for enhanced OCR
                ]);
                
                // Log what we got (or didn't get)
                if (receiptOcrData) {
                    console.log('[OCR] ✅ OCR data received:', {
                        hasVendor: !!receiptOcrData.vendor,
                        hasTotal: !!receiptOcrData.total,
                        hasItems: !!receiptOcrData.items,
                        itemsCount: receiptOcrData.items?.length || 0,
                        hasSubtotal: !!receiptOcrData.subtotal,
                        hasTax: !!receiptOcrData.tax,
                        taxComponents: receiptOcrData.tax ? Object.keys(receiptOcrData.tax) : [],
                    });
                    console.log('[OCR] Full receipt data:', JSON.stringify(receiptOcrData, null, 2));
                } else {
                    console.warn('[OCR] ⚠️ OCR promise returned undefined - this could mean OCR is still processing or failed');
                    console.warn('[OCR] This will cause AI to not have receipt data. Check OCR function logs.');
                }
            } catch (err) {
                console.error('[OCR] ❌ OCR timeout or error:', err);
                // Continue without OCR data - AI can still process with receiptPath
            }

            // 4) Update message with receipt path, URL, and OCR data (if available)
            // Update the messages array directly for AI processing
            // CRITICAL: Ensure receiptOcrData is included even if partial
            let messagesWithReceipt: ChatMessage[] = updatedMessages.map((msg) =>
                msg.id === userMessage.id
                    ? {
                          ...msg,
                          receiptPath: receiptPath ?? msg.receiptPath,
                          // Store public URL for persistence - replaces blob URL
                          // This ensures image works on refresh/return
                          receiptImage: receiptUrl ?? msg.receiptImage,
                          receiptOcrData: receiptOcrData ?? msg.receiptOcrData,
                      }
                    : msg
            );
            
            // Debug: Verify receipt data is in the message
            const messageWithReceiptData = messagesWithReceipt.find(m => m.id === userMessage.id);
            if (messageWithReceiptData) {
                console.log('[OCR] Message receipt data status:', {
                    hasReceiptPath: !!messageWithReceiptData.receiptPath,
                    hasReceiptOcrData: !!messageWithReceiptData.receiptOcrData,
                    receiptOcrDataKeys: messageWithReceiptData.receiptOcrData ? Object.keys(messageWithReceiptData.receiptOcrData) : [],
                    itemsCount: messageWithReceiptData.receiptOcrData?.items?.length || 0,
                });
            }

            // Persist the update to database (async, don't block)
            if (receiptPath || receiptUrl || receiptOcrData) {
                await Promise.resolve(
                    onMessagesChange(
                        targetConversationId,
                        (previous): ChatMessage[] => {
                            return previous.map((msg) =>
                                msg.id === userMessage.id
                                    ? {
                                          ...msg,
                                          receiptPath: receiptPath ?? msg.receiptPath,
                                          receiptImage: receiptUrl ?? msg.receiptImage,
                                          receiptOcrData: receiptOcrData ?? msg.receiptOcrData,
                                      }
                                    : msg
                            );
                        }
                    )
                );
            }

            // 5) Build receipt context for AI with all extracted details
            // This includes: vendor, total, date, subtotal, tax breakdown, and individual items
            const receiptContextParts: string[] = [];
            if (receiptPath) {
                receiptContextParts.push(`chemin_reçu=${receiptPath}`);
            }
            if (receiptOcrData) {
                // Basic info
                const vendorPart = receiptOcrData.vendor ? `fournisseur=${receiptOcrData.vendor}` : '';
                const totalPart =
                    typeof receiptOcrData.total === 'number' ? `total=${receiptOcrData.total.toFixed(2)}` : '';
                const datePart = receiptOcrData.date ? `date=${receiptOcrData.date}` : '';
                const subtotalPart =
                    typeof receiptOcrData.subtotal === 'number' ? `sous_total=${receiptOcrData.subtotal.toFixed(2)}` : '';
                
                // Tax breakdown
                const taxParts: string[] = [];
                if (receiptOcrData.tax) {
                    if (typeof receiptOcrData.tax.gst === 'number') {
                        taxParts.push(`TPS=${receiptOcrData.tax.gst.toFixed(2)}`);
                    }
                    if (typeof receiptOcrData.tax.pst === 'number') {
                        taxParts.push(`TVP=${receiptOcrData.tax.pst.toFixed(2)}`);
                    }
                    if (typeof receiptOcrData.tax.qst === 'number') {
                        taxParts.push(`TVQ=${receiptOcrData.tax.qst.toFixed(2)}`);
                    }
                    if (typeof receiptOcrData.tax.hst === 'number') {
                        taxParts.push(`TVH=${receiptOcrData.tax.hst.toFixed(2)}`);
                    }
                    if (typeof receiptOcrData.tax.total === 'number' && !receiptOcrData.tax.gst && !receiptOcrData.tax.pst && !receiptOcrData.tax.qst && !receiptOcrData.tax.hst) {
                        taxParts.push(`taxe_totale=${receiptOcrData.tax.total.toFixed(2)}`);
                    }
                }
                
                // Individual items - include ALL items (no limit)
                // Include items even if price is 0 (AI can infer from subtotal)
                const itemsPart = receiptOcrData.items && receiptOcrData.items.length > 0
                    ? `articles=[${receiptOcrData.items.map(item => {
                        // Format price, show 0.00 if no price (AI will infer)
                        const priceStr = item.price > 0 ? item.price.toFixed(2) : '0.00';
                        return `${item.name}:${priceStr}`;
                    }).join('; ')}]`
                    : '';
                
                // Combine all parts
                const meta = [
                    vendorPart,
                    subtotalPart,
                    ...taxParts,
                    totalPart,
                    datePart,
                    itemsPart
                ].filter(Boolean).join(', ');
                
                if (meta) {
                    receiptContextParts.push(meta);
                }
            }

            const receiptContext =
                receiptContextParts.length > 0
                    ? `\n\n[reçu: ${receiptContextParts.join(' ; ')}]`
                    : '';

            const messageWithReceiptContext = `${messageText}${receiptContext}`;
            
            // Debug: Log receipt context to help troubleshoot
            if (receiptContext) {
                console.log('📋 Receipt context sent to AI:', receiptContext);
                console.log('📦 Receipt OCR Data:', receiptOcrData);
                if (receiptOcrData?.items) {
                    console.log(`✅ Items found: ${receiptOcrData.items.length} items`, receiptOcrData.items);
                } else {
                    console.warn('⚠️ No items in receiptOcrData!', receiptOcrData);
                }
            } else {
                console.warn('⚠️ No receipt context generated!', { receiptPath, receiptOcrData });
            }

            // 6) Continue OCR in background and update message when complete
            // If OCR completes after AI call, update message with full details for future questions
            // Also re-send AI message if items were missing initially
            ocrPromise.then((finalOcrData) => {
                if (finalOcrData) {
                    // Check if we got more complete data (e.g., items or tax that weren't available initially)
                    const hasMoreData = (finalOcrData.items?.length || 0) > (receiptOcrData?.items?.length || 0) ||
                        (finalOcrData.tax && !receiptOcrData?.tax) ||
                        (finalOcrData.subtotal && !receiptOcrData?.subtotal);
                    
                    // If we initially had no items but now we do, this is critical - update and notify
                    const hasItemsNow = (finalOcrData.items?.length || 0) > 0;
                    const hadNoItemsBefore = !receiptOcrData || !receiptOcrData.items || receiptOcrData.items.length === 0;
                    
                    if (hasMoreData) {
                        // OCR completed with more details - update message for future reference
                        onMessagesChange(
                            targetConversationId,
                            (previous): ChatMessage[] => {
                                return previous.map((msg) =>
                                    msg.id === userMessage.id
                                        ? {
                                              ...msg,
                                              receiptOcrData: finalOcrData,
                                          }
                                        : msg
                                );
                            }
                        );
                        
                        // If items were missing initially but are now available, log for debugging
                        if (hasItemsNow && hadNoItemsBefore) {
                            console.log(`✅ OCR completed with ${finalOcrData.items.length} items (was missing initially). Future messages will have items.`);
                        }
                    }
                }
            }).catch((err) => {
                console.error('Background OCR update error:', err);
            });

            // 7) Call AI with receipt context (receiptPath is required, OCR is optional)
            await processAIMessage(targetConversationId, messageWithReceiptContext, messagesWithReceipt);
        } catch (err) {
            console.error('Failed to send message with receipt:', err);
            setError(err instanceof Error ? err.message : 'Erreur lors de l\'envoi du message');
        } finally {
            setIsLoading(false);
        }
    };

    const handleNewConversation = () => {
        setError(null);
        setInput('');
        setInterimTranscript('');
        if (isListening) {
            speechService.stopListening();
            setIsListening(false);
        }
        void onStartNewConversation({ focusAssistant: focusAssistantOnNewConversation });
    };

    const displayInput = interimTranscript || input;
    const isSpeechSupported = speechService.isSupported();
    const isConversationReady = Boolean(conversationId);
    const conversationTitle = conversation?.title ?? 'Nouvelle conversation';

    return (
        <div className="flex flex-col h-full bg-white rounded-lg shadow-card border border-fiscalia-primary-dark/10">
            <div className="p-4 border-b border-fiscalia-primary-dark/10">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-normal font-display tracking-tight text-fiscalia-primary-dark">
                            {conversationTitle}
                        </h2>
                        <p className="text-sm text-fiscalia-primary-dark/70">Assistant Fiscalia</p>
                    </div>
                    <button
                        type="button"
                        onClick={handleNewConversation}
                        className="p-2 text-fiscalia-primary-dark/50 hover:text-fiscalia-primary-dark hover:bg-fiscalia-light-neutral rounded-lg transition-colors"
                        title="Nouvelle conversation"
                        disabled={isLoading || isListening}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="sr-only">Nouvelle conversation</span>
                    </button>
                </div>
            </div>
            <div className="flex-1 p-6 overflow-y-auto bg-fiscalia-light-neutral">
                {messages.map((msg) =>
                    msg.sender === 'ai' ? (
                        <AIMessageBubble key={msg.id} message={msg} />
                    ) : (
                        <UserMessageBubble key={msg.id} message={msg} />
                    )
                )}
                {isLoading && (
                    <div className="flex justify-start mb-4">
                        <div className="bg-white rounded-lg p-4 max-w-lg shadow-card border border-fiscalia-primary-dark/10">
                            <div className="flex items-center space-x-2">
                                <span className="h-2 w-2 bg-fiscalia-accent-gold rounded-full animate-bounce [animation-delay:-0.3s]" />
                                <span className="h-2 w-2 bg-fiscalia-accent-gold rounded-full animate-bounce [animation-delay:-0.15s]" />
                                <span className="h-2 w-2 bg-fiscalia-accent-gold rounded-full animate-bounce" />
                            </div>
                        </div>
                    </div>
                )}
                {error && (
                    <div className="flex justify-start mb-4">
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-lg">
                            <p className="text-red-800 text-sm">{error}</p>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t border-fiscalia-primary-dark/10 bg-white rounded-b-lg">
                <div className="relative">
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                    <input
                        type="text"
                        value={displayInput}
                        onChange={(event) => {
                            setInput(event.target.value);
                            setInterimTranscript('');
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey && !isListening) {
                                event.preventDefault();
                                void handleSend();
                            }
                        }}
                        placeholder={
                            isListening
                                ? 'Écoute en cours...'
                                : 'Posez votre question à Fiscalia...'
                        }
                        className={`w-full bg-fiscalia-light-neutral text-fiscalia-primary-dark placeholder:text-fiscalia-primary-dark/60 rounded-lg p-4 pr-32 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50 border border-fiscalia-primary-dark/20 ${
                            interimTranscript ? 'italic text-fiscalia-primary-dark/70' : ''
                        }`}
                        disabled={isLoading || isListening}
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                        <button
                            type="button"
                            onClick={handleAttachmentClick}
                            className="p-2 text-fiscalia-primary-dark/50 hover:text-fiscalia-accent-gold transition-colors"
                            disabled={isLoading || isListening || !isConversationReady}
                        >
                            <PaperclipIcon className="w-6 h-6" />
                        </button>
                        {isSpeechSupported && (
                            <button
                                type="button"
                                onClick={handleMicrophoneClick}
                                className={`p-2 transition-colors ${
                                    isListening
                                        ? 'text-red-500 animate-pulse'
                                        : 'text-fiscalia-primary-dark/50 hover:text-fiscalia-accent-gold'
                                }`}
                                disabled={isLoading || !isConversationReady}
                                title={isListening ? "Arrêter l'enregistrement" : 'Démarrer la saisie vocale'}
                            >
                                <MicrophoneIcon className="w-6 h-6" />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleSend}
                            className="p-2 rounded-md bg-fiscalia-accent-gold text-white hover:brightness-105 transition-all disabled:bg-fiscalia-primary-dark/20 disabled:cursor-not-allowed"
                            disabled={isLoading || (!displayInput.trim() && !attachedReceipt) || isListening}
                        >
                            <SendIcon className="w-6 h-6" />
                        </button>
                    </div>
                </div>
                {attachedReceipt && (
                    <div className="mt-2 p-3 bg-fiscalia-light-neutral rounded-lg border border-fiscalia-primary-dark/20 flex items-start gap-3">
                        <div className="flex-shrink-0 w-20 h-20 border border-fiscalia-primary-dark/20 rounded overflow-hidden bg-white">
                            <img
                                src={attachedReceipt.preview}
                                alt="Reçu attaché"
                                className="w-full h-full object-contain"
                            />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-fiscalia-primary-dark mb-1">
                                📷 Reçu attaché
                            </p>
                            <p className="text-xs text-fiscalia-primary-dark/70">
                                {attachedReceipt.file.name}
                            </p>
                            <p className="text-xs text-fiscalia-primary-dark/50 italic">
                                L'analyse sera effectuée lors de l'envoi
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleRemoveAttachedReceipt}
                            className="flex-shrink-0 p-1 text-fiscalia-primary-dark/50 hover:text-fiscalia-error transition-colors"
                            title="Retirer le reçu"
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

type SettingsSection = 'personal' | 'notifications' | 'appearance' | 'privacy' | 'security' | 'billing' | 'language' | 'data';

interface SettingsOption {
    id: SettingsSection;
    title: string;
    icon: React.FC<IconProps>;
    description: string;
}

export const SettingsScreen: React.FC<{ userProfile: UserProfile; onUpdateProfile: (profile: UserProfile) => Promise<void> | void; onSave: () => Promise<void> | void }> = ({ userProfile, onUpdateProfile, onSave }) => {
    const [localProfile, setLocalProfile] = useState<UserProfile>(userProfile);
    const [selectedSection, setSelectedSection] = useState<SettingsSection | null>(null);
    const [email, setEmail] = useState(userProfile.email || '');
    const [passwordChange, setPasswordChange] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [showPasswordFields, setShowPasswordFields] = useState(false);
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [isRequestingReset, setIsRequestingReset] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
    const [notifications, setNotifications] = useState({
        email: true,
        push: true,
        jobUpdates: true,
        expenseAlerts: true,
        monthlyReports: false,
        aiSuggestions: true
    });
    const [appearance, setAppearance] = useState({
        theme: 'light',
        fontSize: 'medium',
        compactMode: false
    });
    const [privacy, setPrivacy] = useState({
        shareAnalytics: false,
        shareUsageData: false,
        allowTracking: false
    });
    const [language, setLanguage] = useState('fr-CA');
    const [security, setSecurity] = useState({
        twoFactor: false,
        autoLock: false,
        sessionTimeout: 30
    });

    useEffect(() => {
        setLocalProfile(userProfile);
        setEmail(userProfile.email || '');
    }, [userProfile]);

    const handleSave = async () => {
        await onUpdateProfile({ ...localProfile, email: email || undefined });
        await onSave();
    };

    const settingsOptions: SettingsOption[] = [
        { id: 'personal', title: 'Informations personnelles', icon: UserIcon, description: 'Gérez votre profil et vos informations' },
        { id: 'notifications', title: 'Notifications', icon: BellIcon, description: 'Configurez vos préférences de notifications' },
        { id: 'appearance', title: 'Apparence', icon: PaintBrushIcon, description: 'Personnalisez l\'apparence de l\'application' },
        { id: 'privacy', title: 'Confidentialité', icon: ShieldCheckIcon, description: 'Paramètres de confidentialité et données' },
        { id: 'security', title: 'Sécurité', icon: KeyIcon, description: 'Sécurité du compte et authentification' },
        { id: 'billing', title: 'Facturation', icon: CreditCardIconAlt, description: 'Gestion de l\'abonnement et paiements' },
        { id: 'language', title: 'Langue et région', icon: GlobeAltIcon, description: 'Langue et format de date' },
        { id: 'data', title: 'Données', icon: InformationCircleIcon, description: 'Export et gestion des données' }
    ];

    const renderSettingsContent = () => {
        switch (selectedSection) {
            case 'personal':
                const handlePasswordChange = async () => {
                    setPasswordError(null);
                    setPasswordSuccess(null);

                    if (!passwordChange.currentPassword) {
                        setPasswordError('Veuillez entrer votre mot de passe actuel');
                        return;
                    }

                    if (passwordChange.newPassword !== passwordChange.confirmPassword) {
                        setPasswordError('Les mots de passe ne correspondent pas');
                        return;
                    }

                    if (passwordChange.newPassword.length < 8) {
                        setPasswordError('Le mot de passe doit contenir au moins 8 caractères');
                        return;
                    }

                    setIsChangingPassword(true);
                    try {
                        await authService.changePassword(passwordChange.currentPassword, passwordChange.newPassword);
                        setPasswordSuccess('Mot de passe modifié avec succès');
                        setPasswordChange({
                            currentPassword: '',
                            newPassword: '',
                            confirmPassword: ''
                        });
                        setShowPasswordFields(false);
                    } catch (error) {
                        console.error('Failed to change password', error);
                        setPasswordError(error instanceof Error ? error.message : 'Erreur lors du changement de mot de passe');
                    } finally {
                        setIsChangingPassword(false);
                    }
                };

                const handlePasswordReset = async () => {
                    setPasswordError(null);
                    setPasswordSuccess(null);

                    if (!email) {
                        setPasswordError('Veuillez d\'abord entrer votre adresse email');
                        return;
                    }

                    setIsRequestingReset(true);
                    try {
                        await authService.requestPasswordReset(email);
                        setPasswordSuccess(`Un email de réinitialisation a été envoyé à ${email}. Vérifiez votre boîte de réception.`);
                    } catch (error) {
                        console.error('Failed to request password reset', error);
                        setPasswordError(error instanceof Error ? error.message : 'Erreur lors de l\'envoi de l\'email de réinitialisation');
                    } finally {
                        setIsRequestingReset(false);
                    }
                };

                return (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-xl font-medium text-fiscalia-primary-dark font-display mb-1">Nom</h3>
                            <p className="text-sm text-fiscalia-primary-dark/60 mb-4">Votre nom complet</p>
                            <input 
                                type="text" 
                                value={localProfile.name} 
                                onChange={(e) => setLocalProfile({ ...localProfile, name: e.target.value })}
                                className="w-full bg-white text-fiscalia-primary-dark p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50" 
                                placeholder="Votre nom"
                            />
                        </div>
                        <div>
                            <h3 className="text-xl font-medium text-fiscalia-primary-dark font-display mb-1">Adresse email</h3>
                            <p className="text-sm text-fiscalia-primary-dark/60 mb-4">Votre adresse email pour les notifications et la réinitialisation de mot de passe</p>
                            <input 
                                type="email" 
                                value={email} 
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-white text-fiscalia-primary-dark p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50" 
                                placeholder="votre@email.com"
                            />
                        </div>
                        <div>
                            <h3 className="text-xl font-medium text-fiscalia-primary-dark font-display mb-1">Nom de l'entreprise</h3>
                            <p className="text-sm text-fiscalia-primary-dark/60 mb-4">Nom de votre entreprise (optionnel)</p>
                            <input 
                                type="text" 
                                value={localProfile.companyName || ''} 
                                onChange={(e) => setLocalProfile({ ...localProfile, companyName: e.target.value })}
                                className="w-full bg-white text-fiscalia-primary-dark p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50" 
                                placeholder="Nom de l'entreprise"
                            />
                        </div>
                        <div>
                            <h3 className="text-xl font-medium text-fiscalia-primary-dark font-display mb-1">Taux d'imposition</h3>
                            <p className="text-sm text-fiscalia-primary-dark/60 mb-4">Taux d'imposition par défaut (%)</p>
                            <input 
                                type="number" 
                                value={localProfile.taxRate || ''} 
                                onChange={(e) => setLocalProfile({ ...localProfile, taxRate: e.target.value ? Number(e.target.value) : undefined })}
                                className="w-full bg-white text-fiscalia-primary-dark p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50" 
                                placeholder="75"
                                min="0"
                                max="100"
                            />
                        </div>
                        
                        <div className="pt-4 border-t border-fiscalia-primary-dark/10">
                            <h3 className="text-xl font-medium text-fiscalia-primary-dark font-display mb-4">Mot de passe</h3>
                            
                            {passwordError && (
                                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                    <p className="text-red-800 text-sm">{passwordError}</p>
                                </div>
                            )}
                            
                            {passwordSuccess && (
                                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                                    <p className="text-green-800 text-sm">{passwordSuccess}</p>
                                </div>
                            )}
                            
                            {!showPasswordFields ? (
                                <div className="space-y-3">
                                    <Button variant="secondary" onClick={() => {
                                        setShowPasswordFields(true);
                                        setPasswordError(null);
                                        setPasswordSuccess(null);
                                    }}>
                                        Modifier le mot de passe
                                    </Button>
                                    <Button 
                                        variant="secondary" 
                                        onClick={handlePasswordReset}
                                        disabled={isRequestingReset}
                                    >
                                        {isRequestingReset ? 'Envoi en cours...' : 'Réinitialiser le mot de passe par email'}
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-fiscalia-primary-dark/70 mb-1">Mot de passe actuel</label>
                                        <input 
                                            type="password" 
                                            value={passwordChange.currentPassword} 
                                            onChange={(e) => setPasswordChange({ ...passwordChange, currentPassword: e.target.value })}
                                            className="w-full bg-white text-fiscalia-primary-dark p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50" 
                                            placeholder="Entrez votre mot de passe actuel"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-fiscalia-primary-dark/70 mb-1">Nouveau mot de passe</label>
                                        <input 
                                            type="password" 
                                            value={passwordChange.newPassword} 
                                            onChange={(e) => setPasswordChange({ ...passwordChange, newPassword: e.target.value })}
                                            className="w-full bg-white text-fiscalia-primary-dark p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50" 
                                            placeholder="Minimum 8 caractères"
                                        />
                                        <p className="text-xs text-fiscalia-primary-dark/60 mt-1">Le mot de passe doit contenir au moins 8 caractères</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-fiscalia-primary-dark/70 mb-1">Confirmer le nouveau mot de passe</label>
                                        <input 
                                            type="password" 
                                            value={passwordChange.confirmPassword} 
                                            onChange={(e) => setPasswordChange({ ...passwordChange, confirmPassword: e.target.value })}
                                            className="w-full bg-white text-fiscalia-primary-dark p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50" 
                                            placeholder="Confirmez votre nouveau mot de passe"
                                        />
                                    </div>
                                    <div className="flex gap-3">
                                        <Button 
                                            onClick={handlePasswordChange}
                                            disabled={isChangingPassword}
                                        >
                                            {isChangingPassword ? 'Modification en cours...' : 'Enregistrer le nouveau mot de passe'}
                                        </Button>
                                        <Button 
                                            variant="secondary" 
                                            onClick={() => {
                                                setShowPasswordFields(false);
                                                setPasswordError(null);
                                                setPasswordSuccess(null);
                                                setPasswordChange({
                                                    currentPassword: '',
                                                    newPassword: '',
                                                    confirmPassword: ''
                                                });
                                            }}
                                            disabled={isChangingPassword}
                                        >
                                            Annuler
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="pt-4 border-t border-fiscalia-primary-dark/10">
                            <Button onClick={() => handleSave()}>Enregistrer les modifications</Button>
                        </div>
                    </div>
                );
            
            case 'notifications':
                return (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-xl font-medium text-fiscalia-primary-dark font-display mb-4">Préférences de notifications</h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between py-3 border-b border-fiscalia-primary-dark/10">
                                    <div>
                                        <h4 className="font-medium text-fiscalia-primary-dark">Notifications par email</h4>
                                        <p className="text-sm text-fiscalia-primary-dark/60">Recevoir des notifications par email</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={notifications.email} onChange={(e) => setNotifications({ ...notifications, email: e.target.checked })} className="sr-only peer" />
                                        <div className="w-11 h-6 bg-fiscalia-primary-dark/20 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-fiscalia-accent-gold/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-fiscalia-accent-gold"></div>
                                    </label>
                                </div>
                                <div className="flex items-center justify-between py-3 border-b border-fiscalia-primary-dark/10">
                                    <div>
                                        <h4 className="font-medium text-fiscalia-primary-dark">Notifications push</h4>
                                        <p className="text-sm text-fiscalia-primary-dark/60">Notifications dans l'application</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={notifications.push} onChange={(e) => setNotifications({ ...notifications, push: e.target.checked })} className="sr-only peer" />
                                        <div className="w-11 h-6 bg-fiscalia-primary-dark/20 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-fiscalia-accent-gold/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-fiscalia-accent-gold"></div>
                                    </label>
                                </div>
                                <div className="flex items-center justify-between py-3 border-b border-fiscalia-primary-dark/10">
                                    <div>
                                        <h4 className="font-medium text-fiscalia-primary-dark">Mises à jour de contrats</h4>
                                        <p className="text-sm text-fiscalia-primary-dark/60">Notifications lors de changements de statut</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={notifications.jobUpdates} onChange={(e) => setNotifications({ ...notifications, jobUpdates: e.target.checked })} className="sr-only peer" />
                                        <div className="w-11 h-6 bg-fiscalia-primary-dark/20 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-fiscalia-accent-gold/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-fiscalia-accent-gold"></div>
                                    </label>
                                </div>
                                <div className="flex items-center justify-between py-3 border-b border-fiscalia-primary-dark/10">
                                    <div>
                                        <h4 className="font-medium text-fiscalia-primary-dark">Alertes de dépenses</h4>
                                        <p className="text-sm text-fiscalia-primary-dark/60">Notifications lors d'ajout de dépenses</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={notifications.expenseAlerts} onChange={(e) => setNotifications({ ...notifications, expenseAlerts: e.target.checked })} className="sr-only peer" />
                                        <div className="w-11 h-6 bg-fiscalia-primary-dark/20 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-fiscalia-accent-gold/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-fiscalia-accent-gold"></div>
                                    </label>
                                </div>
                                <div className="flex items-center justify-between py-3 border-b border-fiscalia-primary-dark/10">
                                    <div>
                                        <h4 className="font-medium text-fiscalia-primary-dark">Rapports mensuels</h4>
                                        <p className="text-sm text-fiscalia-primary-dark/60">Recevoir un rapport mensuel par email</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={notifications.monthlyReports} onChange={(e) => setNotifications({ ...notifications, monthlyReports: e.target.checked })} className="sr-only peer" />
                                        <div className="w-11 h-6 bg-fiscalia-primary-dark/20 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-fiscalia-accent-gold/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-fiscalia-accent-gold"></div>
                                    </label>
                                </div>
                                <div className="flex items-center justify-between py-3">
                                    <div>
                                        <h4 className="font-medium text-fiscalia-primary-dark">Suggestions IA</h4>
                                        <p className="text-sm text-fiscalia-primary-dark/60">Notifications pour suggestions de l'assistant IA</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={notifications.aiSuggestions} onChange={(e) => setNotifications({ ...notifications, aiSuggestions: e.target.checked })} className="sr-only peer" />
                                        <div className="w-11 h-6 bg-fiscalia-primary-dark/20 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-fiscalia-accent-gold/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-fiscalia-accent-gold"></div>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case 'appearance':
                return (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-xl font-medium text-fiscalia-primary-dark font-display mb-4">Thème</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => setAppearance({ ...appearance, theme: 'light' })}
                                    className={`p-4 rounded-lg border-2 transition-all ${
                                        appearance.theme === 'light'
                                            ? 'border-fiscalia-accent-gold bg-fiscalia-accent-gold/10'
                                            : 'border-fiscalia-primary-dark/20 hover:border-fiscalia-primary-dark/40'
                                    }`}
                                >
                                    <div className="font-medium text-fiscalia-primary-dark mb-1">Clair</div>
                                    <div className="text-sm text-fiscalia-primary-dark/60">Thème clair par défaut</div>
                                </button>
                                <button
                                    onClick={() => setAppearance({ ...appearance, theme: 'dark' })}
                                    className={`p-4 rounded-lg border-2 transition-all ${
                                        appearance.theme === 'dark'
                                            ? 'border-fiscalia-accent-gold bg-fiscalia-accent-gold/10'
                                            : 'border-fiscalia-primary-dark/20 hover:border-fiscalia-primary-dark/40'
                                    }`}
                                >
                                    <div className="font-medium text-fiscalia-primary-dark mb-1">Sombre</div>
                                    <div className="text-sm text-fiscalia-primary-dark/60">Thème sombre (bientôt disponible)</div>
                                </button>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-xl font-medium text-fiscalia-primary-dark font-display mb-4">Taille de police</h3>
                            <div className="space-y-2">
                                {['small', 'medium', 'large'].map((size) => (
                                    <label key={size} className="flex items-center p-3 rounded-lg border border-fiscalia-primary-dark/20 hover:border-fiscalia-primary-dark/40 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="fontSize"
                                            value={size}
                                            checked={appearance.fontSize === size}
                                            onChange={(e) => setAppearance({ ...appearance, fontSize: e.target.value as 'small' | 'medium' | 'large' })}
                                            className="mr-3"
                                        />
                                        <span className="text-fiscalia-primary-dark capitalize">{size === 'small' ? 'Petite' : size === 'medium' ? 'Moyenne' : 'Grande'}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center justify-between py-3 border-t border-fiscalia-primary-dark/10">
                            <div>
                                <h4 className="font-medium text-fiscalia-primary-dark">Mode compact</h4>
                                <p className="text-sm text-fiscalia-primary-dark/60">Afficher plus d'éléments par page</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={appearance.compactMode} onChange={(e) => setAppearance({ ...appearance, compactMode: e.target.checked })} className="sr-only peer" />
                                <div className="w-11 h-6 bg-fiscalia-primary-dark/20 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-fiscalia-accent-gold/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-fiscalia-accent-gold"></div>
                            </label>
                        </div>
                    </div>
                );

            case 'privacy':
                return (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-xl font-medium text-fiscalia-primary-dark font-display mb-4">Confidentialité des données</h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between py-3 border-b border-fiscalia-primary-dark/10">
                                    <div>
                                        <h4 className="font-medium text-fiscalia-primary-dark">Partager les analyses</h4>
                                        <p className="text-sm text-fiscalia-primary-dark/60">Aider à améliorer l'application</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={privacy.shareAnalytics} onChange={(e) => setPrivacy({ ...privacy, shareAnalytics: e.target.checked })} className="sr-only peer" />
                                        <div className="w-11 h-6 bg-fiscalia-primary-dark/20 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-fiscalia-accent-gold/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-fiscalia-accent-gold"></div>
                                    </label>
                                </div>
                                <div className="flex items-center justify-between py-3 border-b border-fiscalia-primary-dark/10">
                                    <div>
                                        <h4 className="font-medium text-fiscalia-primary-dark">Partager les données d'utilisation</h4>
                                        <p className="text-sm text-fiscalia-primary-dark/60">Données anonymisées d'utilisation</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={privacy.shareUsageData} onChange={(e) => setPrivacy({ ...privacy, shareUsageData: e.target.checked })} className="sr-only peer" />
                                        <div className="w-11 h-6 bg-fiscalia-primary-dark/20 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-fiscalia-accent-gold/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-fiscalia-accent-gold"></div>
                                    </label>
                                </div>
                                <div className="flex items-center justify-between py-3">
                                    <div>
                                        <h4 className="font-medium text-fiscalia-primary-dark">Autoriser le suivi</h4>
                                        <p className="text-sm text-fiscalia-primary-dark/60">Suivi entre sites web</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={privacy.allowTracking} onChange={(e) => setPrivacy({ ...privacy, allowTracking: e.target.checked })} className="sr-only peer" />
                                        <div className="w-11 h-6 bg-fiscalia-primary-dark/20 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-fiscalia-accent-gold/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-fiscalia-accent-gold"></div>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case 'security':
                return (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-xl font-medium text-fiscalia-primary-dark font-display mb-4">Sécurité du compte</h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between py-3 border-b border-fiscalia-primary-dark/10">
                                    <div>
                                        <h4 className="font-medium text-fiscalia-primary-dark">Authentification à deux facteurs</h4>
                                        <p className="text-sm text-fiscalia-primary-dark/60">Sécurité supplémentaire pour votre compte</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={security.twoFactor} onChange={(e) => setSecurity({ ...security, twoFactor: e.target.checked })} className="sr-only peer" />
                                        <div className="w-11 h-6 bg-fiscalia-primary-dark/20 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-fiscalia-accent-gold/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-fiscalia-accent-gold"></div>
                                    </label>
                                </div>
                                <div className="flex items-center justify-between py-3 border-b border-fiscalia-primary-dark/10">
                                    <div>
                                        <h4 className="font-medium text-fiscalia-primary-dark">Verrouillage automatique</h4>
                                        <p className="text-sm text-fiscalia-primary-dark/60">Verrouiller après inactivité</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={security.autoLock} onChange={(e) => setSecurity({ ...security, autoLock: e.target.checked })} className="sr-only peer" />
                                        <div className="w-11 h-6 bg-fiscalia-primary-dark/20 rounded-full peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-fiscalia-accent-gold/50 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-fiscalia-accent-gold"></div>
                                    </label>
                                </div>
                                <div className="py-3">
                                    <h4 className="font-medium text-fiscalia-primary-dark mb-2">Délai d'expiration de session (minutes)</h4>
                                    <input
                                        type="number"
                                        value={security.sessionTimeout}
                                        onChange={(e) => setSecurity({ ...security, sessionTimeout: Number(e.target.value) })}
                                        className="w-full bg-white text-fiscalia-primary-dark p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50"
                                        min="5"
                                        max="120"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                );

            case 'billing':
                return (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-xl font-medium text-fiscalia-primary-dark font-display mb-4">Abonnement</h3>
                            <div className="bg-fiscalia-primary-dark/5 p-6 rounded-lg border border-fiscalia-primary-dark/10">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h4 className="font-medium text-fiscalia-primary-dark text-lg">Plan actuel</h4>
                                        <p className="text-sm text-fiscalia-primary-dark/60">Plan gratuit</p>
                                    </div>
                                    <Button variant="secondary">Mettre à niveau</Button>
                                </div>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-xl font-medium text-fiscalia-primary-dark font-display mb-4">Méthode de paiement</h3>
                            <div className="bg-white p-4 rounded-lg border border-fiscalia-primary-dark/20">
                                <p className="text-sm text-fiscalia-primary-dark/60 mb-2">Aucune méthode de paiement enregistrée</p>
                                <Button variant="secondary">Ajouter une carte</Button>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-xl font-medium text-fiscalia-primary-dark font-display mb-4">Historique de facturation</h3>
                            <div className="bg-white p-4 rounded-lg border border-fiscalia-primary-dark/20">
                                <p className="text-sm text-fiscalia-primary-dark/60">Aucun historique disponible</p>
                            </div>
                        </div>
                    </div>
                );

            case 'language':
                return (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-xl font-medium text-fiscalia-primary-dark font-display mb-4">Langue</h3>
                            <select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                className="w-full bg-white text-fiscalia-primary-dark p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50"
                            >
                                <option value="fr-CA">Français (Canada)</option>
                                <option value="en-CA">English (Canada)</option>
                                <option value="fr-FR">Français (France)</option>
                            </select>
                        </div>
                        <div>
                            <h3 className="text-xl font-medium text-fiscalia-primary-dark font-display mb-4">Format de date</h3>
                            <div className="space-y-2">
                                {['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'].map((format) => (
                                    <label key={format} className="flex items-center p-3 rounded-lg border border-fiscalia-primary-dark/20 hover:border-fiscalia-primary-dark/40 cursor-pointer">
                                        <input type="radio" name="dateFormat" value={format} className="mr-3" />
                                        <span className="text-fiscalia-primary-dark">{format}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div>
                            <h3 className="text-xl font-medium text-fiscalia-primary-dark font-display mb-4">Format de devise</h3>
                            <select className="w-full bg-white text-fiscalia-primary-dark p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50">
                                <option value="CAD">CAD ($)</option>
                                <option value="USD">USD ($)</option>
                                <option value="EUR">EUR (€)</option>
                            </select>
                        </div>
                    </div>
                );

            case 'data':
                return (
                    <div className="space-y-6">
                        <div>
                            <h3 className="text-xl font-medium text-fiscalia-primary-dark font-display mb-4">Export de données</h3>
                            <p className="text-sm text-fiscalia-primary-dark/60 mb-4">Téléchargez toutes vos données au format JSON</p>
                            <Button variant="secondary" onClick={() => alert('Exportation des données en cours...')}>Exporter toutes les données</Button>
                        </div>
                        <div>
                            <h3 className="text-xl font-medium text-fiscalia-primary-dark font-display mb-4">Import de données</h3>
                            <p className="text-sm text-fiscalia-primary-dark/60 mb-4">Importez des données depuis un fichier JSON</p>
                            <Button variant="secondary" onClick={() => alert('Fonctionnalité d\'import à venir...')}>Importer des données</Button>
                        </div>
                        <div className="pt-4 border-t border-fiscalia-primary-dark/10">
                            <h3 className="text-xl font-medium text-fiscalia-primary-dark font-display mb-4 text-red-600">Zone de danger</h3>
                            <div className="space-y-4">
                                <div>
                                    <h4 className="font-medium text-fiscalia-primary-dark mb-2">Supprimer toutes les données</h4>
                                    <p className="text-sm text-fiscalia-primary-dark/60 mb-4">Cette action est irréversible. Toutes vos données seront définitivement supprimées.</p>
                                    <Button variant="secondary" onClick={() => {
                                        if (confirm('Êtes-vous sûr de vouloir supprimer toutes vos données ? Cette action est irréversible.')) {
                                            alert('Suppression des données...');
                                        }
                                    }} className="bg-red-600 hover:bg-red-700 text-white border-red-600">Supprimer toutes les données</Button>
                                </div>
                            </div>
                        </div>
                    </div>
                );

            default:
                return (
                    <div className="flex items-center justify-center h-full text-fiscalia-primary-dark/60">
                        <p>Sélectionnez une catégorie dans le panneau de gauche</p>
                    </div>
                );
        }
    };

    return (
        <div className="flex h-full overflow-hidden">
            {/* Main Settings Panel */}
            <div className={`flex-shrink-0 transition-all duration-300 ease-in-out ${selectedSection ? 'w-80' : 'w-full'} h-full overflow-hidden flex flex-col`}>
                <div className="flex-1 overflow-y-auto min-h-0">
                    <div className="p-6 space-y-6">
                        <h1 className="text-3xl font-medium text-fiscalia-primary-dark font-display tracking-tight">Paramètres</h1>
                        <div className="space-y-2">
                            {settingsOptions.map((option) => {
                                const Icon = option.icon;
                                return (
                                    <button
                                        key={option.id}
                                        onClick={() => setSelectedSection(option.id)}
                                        className={`w-full flex items-center gap-4 p-4 rounded-lg border transition-all text-left ${
                                            selectedSection === option.id
                                                ? 'border-fiscalia-accent-gold bg-fiscalia-accent-gold/10'
                                                : 'border-fiscalia-primary-dark/10 hover:border-fiscalia-primary-dark/30 hover:bg-fiscalia-primary-dark/5'
                                        }`}
                                    >
                                        <Icon className={`w-6 h-6 flex-shrink-0 ${selectedSection === option.id ? 'text-fiscalia-accent-gold' : 'text-fiscalia-primary-dark/60'}`} />
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-medium text-fiscalia-primary-dark">{option.title}</h3>
                                            <p className="text-sm text-fiscalia-primary-dark/60 truncate">{option.description}</p>
                                        </div>
                                        <ChevronRightIconAlt className={`w-5 h-5 flex-shrink-0 transition-transform ${selectedSection === option.id ? 'text-fiscalia-accent-gold rotate-90' : 'text-fiscalia-primary-dark/40'}`} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Side Panel */}
            {selectedSection && (
                <div className="flex-1 border-l border-fiscalia-primary-dark/10 bg-fiscalia-light-neutral h-full overflow-hidden flex flex-col">
                    <div className="flex-1 overflow-y-auto min-h-0">
                        <div className="p-6">
                            <div className="mb-6">
                                <button
                                    onClick={() => setSelectedSection(null)}
                                    className="flex items-center gap-2 text-fiscalia-primary-dark/70 hover:text-fiscalia-primary-dark mb-4 transition-colors"
                                >
                                    <ArrowLeftIcon className="w-5 h-5" />
                                    <span className="text-sm font-medium">Retour</span>
                                </button>
                                <h2 className="text-2xl font-medium text-fiscalia-primary-dark font-display">
                                    {settingsOptions.find(opt => opt.id === selectedSection)?.title}
                                </h2>
                            </div>
                            <Card className="bg-white">
                                {renderSettingsContent()}
                            </Card>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export const ReportsScreen: React.FC = () => (
    <div className="space-y-6">
        <h1 className="text-3xl font-medium text-fiscalia-primary-dark font-display tracking-tight">Rapports</h1>
         <Card>
            <h2 className="text-2xl font-normal font-display tracking-tight text-fiscalia-primary-dark">Générer un rapport</h2>
            <p className="text-fiscalia-primary-dark/70 mt-1">Téléchargez un résumé de vos finances.</p>
            <div className="mt-6 flex flex-col md:flex-row gap-4 items-center">
                 <select className="w-full md:w-auto bg-white text-fiscalia-primary-dark p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50">
                    <option>Mensuel</option>
                    <option>Trimestriel</option>
                    <option>Annuel</option>
                </select>
                <Button onClick={() => alert('Votre rapport PDF est en cours de téléchargement.')} className="w-full md:w-auto">Télécharger PDF</Button>
            </div>
        </Card>
    </div>
);

interface AddJobModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddJob: (job: Job) => Promise<void> | void;
}

export const AddJobModal: React.FC<AddJobModalProps> = ({ isOpen, onClose, onAddJob }) => {
    // Form state
    const [name, setName] = useState('');
    const [clientName, setClientName] = useState('');
    const [address, setAddress] = useState('');
    const [description, setDescription] = useState('');
    const [revenue, setRevenue] = useState(0);
    const [expenses, setExpenses] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // AI Chat state
    const [aiChatMessages, setAiChatMessages] = useState<{ sender: 'user' | 'ai'; text: string }[]>([
        { sender: 'ai', text: 'Bonjour! Posez-moi une question de calcul.' }
    ]);
    const [aiPrompt, setAiPrompt] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const aiChatEndRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
        aiChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [aiChatMessages]);

    useEffect(() => {
        if (!isOpen) {
            setIsSubmitting(false);
        }
    }, [isOpen]);


    const handleSendAiMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!aiPrompt.trim() || isAiLoading) return;

        const userMessage = { sender: 'user' as const, text: aiPrompt };
        setAiChatMessages(prev => [...prev, userMessage]);
        
        const currentPrompt = aiPrompt;
        setAiPrompt('');
        setIsAiLoading(true);

        // AI functionality has been removed
        const aiMessage = { sender: 'ai' as const, text: "Désolé, la fonctionnalité de calculatrice IA n'est plus disponible." };
        setAiChatMessages(prev => [...prev, aiMessage]);
        setIsAiLoading(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || isSubmitting) return;
        setIsSubmitting(true);
        // Generate unique ID with timestamp + random component to prevent duplicates
        const uniqueId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const newJob: Job = {
            id: uniqueId,
            name,
            clientName: clientName || undefined,
            address: address || undefined,
            description: description || undefined,
            status: JobStatus.InProgress,
            revenue,
            expenses,
            profit: revenue - expenses,
            startDate: new Date().toISOString().split('T')[0],
            endDate: '',
        };
        try {
            await onAddJob(newJob);
            onClose();
            // Reset form
            setName('');
            setClientName('');
            setAddress('');
            setDescription('');
            setRevenue(0);
            setExpenses(0);
            setAiChatMessages([{ sender: 'ai', text: 'Bonjour! Posez-moi une question de calcul.' }]);
            setAiPrompt('');
        } catch (error) {
            console.error('Failed to create job', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Nouveau Contrat" size="2xl">
            <div className="flex gap-8">
                {/* Left side: Form */}
                <div className="flex-1">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <input type="text" placeholder="Nom du contrat (ex: Rénovation Cuisine)" value={name} onChange={e => setName(e.target.value)} required className="w-full bg-white text-fiscalia-primary-dark placeholder:text-fiscalia-primary-dark/60 p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50" />
                        <input type="text" placeholder="Nom du client" value={clientName} onChange={e => setClientName(e.target.value)} className="w-full bg-white text-fiscalia-primary-dark placeholder:text-fiscalia-primary-dark/60 p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50" />
                        <input type="text" placeholder="Adresse du chantier" value={address} onChange={e => setAddress(e.target.value)} className="w-full bg-white text-fiscalia-primary-dark placeholder:text-fiscalia-primary-dark/60 p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50" />
                        <textarea placeholder="Description des travaux..." value={description} onChange={e => setDescription(e.target.value)} className="w-full h-24 bg-white text-fiscalia-primary-dark placeholder:text-fiscalia-primary-dark/60 p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50" />
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <input type="number" placeholder="Revenu estimé" value={revenue || ''} onChange={e => setRevenue(parseFloat(e.target.value) || 0)} className="w-full bg-white text-fiscalia-primary-dark placeholder:text-fiscalia-primary-dark/60 p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50" />
                           <input type="number" placeholder="Dépenses estimées" value={expenses || ''} onChange={e => setExpenses(parseFloat(e.target.value) || 0)} className="w-full bg-white text-fiscalia-primary-dark placeholder:text-fiscalia-primary-dark/60 p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50" />
                        </div>
                        
                        <div className="flex justify-end gap-3 pt-4 border-t border-fiscalia-primary-dark/10 mt-6">
                            <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>Annuler</Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Création...' : 'Créer le contrat'}
                            </Button>
                        </div>
                    </form>
                </div>
                
                {/* Right side: AI Assistant Chat */}
                <div className="w-2/5 border-l border-fiscalia-primary-dark/10 pl-8 flex flex-col">
                    <div className="flex flex-col h-full bg-white rounded-lg shadow-card border border-fiscalia-primary-dark/10">
                        <div className="p-3 border-b border-fiscalia-primary-dark/10">
                            <div className="flex items-center gap-2">
                                <SparklesIcon className="w-5 h-5 text-fiscalia-accent-gold" />
                                <h3 className="text-base font-display font-medium text-fiscalia-primary-dark">Calculatrice IA</h3>
                            </div>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto bg-fiscalia-light-neutral space-y-4">
                            {aiChatMessages.map((msg, index) => (
                                <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`rounded-lg py-2 px-3 max-w-xs text-sm shadow-sm ${msg.sender === 'user' ? 'bg-fiscalia-accent-gold text-white' : 'bg-white text-fiscalia-primary-dark'}`}>
                                        {msg.text}
                                    </div>
                                </div>
                            ))}
                             {isAiLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-white rounded-lg p-3 max-w-lg shadow-card border border-fiscalia-primary-dark/10">
                                        <div className="flex items-center space-x-2">
                                            <span className="h-2 w-2 bg-fiscalia-accent-gold rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                            <span className="h-2 w-2 bg-fiscalia-accent-gold rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                            <span className="h-2 w-2 bg-fiscalia-accent-gold rounded-full animate-bounce"></span>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={aiChatEndRef} />
                        </div>
                        <div className="p-2 border-t border-fiscalia-primary-dark/10 bg-white rounded-b-lg">
                            <form onSubmit={handleSendAiMessage} className="relative">
                                <input
                                    type="text"
                                    value={aiPrompt}
                                    onChange={e => setAiPrompt(e.target.value)}
                                    placeholder="Calcul rapide..."
                                    className="w-full bg-fiscalia-light-neutral text-fiscalia-primary-dark placeholder:text-fiscalia-primary-dark/60 rounded-lg py-2 px-3 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50 border border-fiscalia-primary-dark/20"
                                    disabled={isAiLoading}
                                />
                                <div className="absolute inset-y-0 right-0 flex items-center pr-1">
                                    <button type="button" onClick={() => alert('La saisie vocale sera bientôt disponible!')} className="p-2 text-fiscalia-primary-dark/50 hover:text-fiscalia-accent-gold transition-colors">
                                        <MicrophoneIcon className="w-5 h-5" />
                                    </button>
                                    <button type="submit" className="p-1.5 rounded-md bg-fiscalia-accent-gold text-white hover:brightness-105 transition-all disabled:bg-fiscalia-primary-dark/20 disabled:cursor-not-allowed" disabled={isAiLoading || !aiPrompt.trim()}>
                                        <SendIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

interface AddExpenseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddExpense: (expense: Omit<Expense, 'id'>) => Promise<void> | void;
    onUpdateExpense?: (expense: Expense) => Promise<void> | void;
    jobs: Job[];
    categories: ExpenseCategory[];
    initialJobId?: string | null;
    mode?: 'create' | 'edit';
    initialExpense?: Expense | null;
}

export const AddExpenseModal: React.FC<AddExpenseModalProps> = ({ isOpen, onClose, onAddExpense, onUpdateExpense, jobs, categories, initialJobId, mode = 'create', initialExpense }) => {
    const [name, setName] = useState('');
    const [amount, setAmount] = useState<number | ''>('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [category, setCategory] = useState<ExpenseCategory>(categories[0] || '');
    const [jobId, setJobId] = useState(initialJobId || '');
    const [receiptImage, setReceiptImage] = useState<string | null>(null);
    const [vendor, setVendor] = useState('');
    const [notes, setNotes] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showReceiptScanner, setShowReceiptScanner] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isEditMode = mode === 'edit' && Boolean(initialExpense);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const defaultCategory = categories.includes('Autre') ? 'Autre' : categories[0] || '';
        const today = new Date().toISOString().split('T')[0];

        if (isEditMode && initialExpense) {
            let normalizedDate: string;
            if (/^\d{4}-\d{2}-\d{2}$/.test(initialExpense.date)) {
                normalizedDate = initialExpense.date;
            } else {
                // Parse as local date to avoid timezone issues
                const parsed = parseLocalDate(initialExpense.date);
                const year = parsed.getFullYear();
                const month = String(parsed.getMonth() + 1).padStart(2, '0');
                const day = String(parsed.getDate()).padStart(2, '0');
                normalizedDate = `${year}-${month}-${day}`;
            }

            setName(initialExpense.name);
            setAmount(initialExpense.amount);
            setDate(normalizedDate || today);
            setCategory(initialExpense.category || defaultCategory);
            setJobId(initialExpense.jobId || '');
            setReceiptImage(initialExpense.receiptImage ?? null);
            setVendor(initialExpense.vendor ?? '');
            setNotes(initialExpense.notes ?? '');
        } else {
            setName('');
            setAmount('');
            setDate(today);
            setCategory(defaultCategory);
            setJobId(initialJobId || '');
            setReceiptImage(null);
            setVendor('');
            setNotes('');
        }

        setIsProcessing(false);
        setIsSubmitting(false);
    }, [isOpen, initialJobId, categories, isEditMode, initialExpense]);
    
    const blobToBase64 = (blob: Blob): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            const file = event.target.files[0];
            const base64 = await blobToBase64(file);
            setReceiptImage(base64);
        }
    };
    
    const handleReceiptProcessed = async (result: any) => {
        setShowReceiptScanner(false);
        
        // Parse date once
        let normalizedDate = date; // Default to current form date
        if (result.date) {
            try {
                const parsedDate = parseLocalDate(result.date);
                if (!isNaN(parsedDate.getTime())) {
                    const year = parsedDate.getFullYear();
                    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
                    const day = String(parsedDate.getDate()).padStart(2, '0');
                    normalizedDate = `${year}-${month}-${day}`;
                }
            } catch (e) {
                console.error('Failed to parse date:', e);
            }
        }
        
        // If we have multiple items, create an expense for each item
        if (result.items && Array.isArray(result.items) && result.items.length > 1) {
            setIsSubmitting(true);
            try {
                const defaultCategory = categories.includes(result.category || 'Autre') 
                    ? (result.category || 'Autre') 
                    : (categories.includes('Autre') ? 'Autre' : categories[0] || 'Autre');
                
                // Build tax breakdown note
                let taxNotes = '';
                if (result.tax) {
                    const taxParts: string[] = [];
                    if (result.tax.gst) taxParts.push(`TPS: $${result.tax.gst.toFixed(2)}`);
                    if (result.tax.qst) taxParts.push(`TVQ: $${result.tax.qst.toFixed(2)}`);
                    if (result.tax.pst) taxParts.push(`PST: $${result.tax.pst.toFixed(2)}`);
                    if (result.tax.hst) taxParts.push(`HST: $${result.tax.hst.toFixed(2)}`);
                    if (result.tax.total) taxParts.push(`Total taxes: $${result.tax.total.toFixed(2)}`);
                    if (taxParts.length > 0) {
                        taxNotes = `\n\nTaxes: ${taxParts.join(', ')}`;
                    }
                }
                
                // Create an expense for each item
                const expensePromises = result.items.map(async (item: { name: string; price: number }) => {
                    const expenseId = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    const expenseNotes = `Article: ${item.name}${taxNotes}${result.total ? `\nTotal reçu: $${result.total.toFixed(2)}` : ''}${result.rawText ? `\n\nOCR: ${result.rawText.substring(0, 500)}` : ''}`;
                    
                    return onAddExpense({
                        name: item.name,
                        amount: item.price,
                        date: normalizedDate,
                        category: defaultCategory,
                        jobId: jobId && jobId !== '' ? jobId : undefined,
                        vendor: result.vendor,
                        notes: expenseNotes.trim(),
                        receiptImage: result.receiptPath ? undefined : undefined, // Receipt path stored separately
                    });
                });
                
                await Promise.all(expensePromises);
                
                // Show success and close modal
                onClose();
            } catch (error) {
                console.error('Failed to create expenses from receipt items:', error);
                // Fall back to form population on error
                populateFormFromResult(result, normalizedDate);
            } finally {
                setIsSubmitting(false);
            }
        } else {
            // Single item or no items - populate form as before
            populateFormFromResult(result, normalizedDate);
        }
    };
    
    const populateFormFromResult = (result: any, normalizedDate: string) => {
        // Populate form with extracted data
        if (result.vendor) {
            setName(result.vendor);
            setVendor(result.vendor);
        }
        
        // Use first item name if available, otherwise use vendor
        if (result.items && result.items.length > 0) {
            setName(result.items[0].name);
            setAmount(result.items[0].price);
        } else if (result.total) {
            setAmount(result.total);
        }
        
        if (normalizedDate) {
            setDate(normalizedDate);
        }
        
        if (result.category && categories.includes(result.category)) {
            setCategory(result.category);
        }
        
        // Build comprehensive notes with tax breakdown
        let notesParts: string[] = [];
        if (result.items && result.items.length > 0) {
            notesParts.push(`Articles: ${result.items.map((i: any) => `${i.name} ($${i.price.toFixed(2)})`).join(', ')}`);
        }
        if (result.subtotal) {
            notesParts.push(`Sous-total: $${result.subtotal.toFixed(2)}`);
        }
        if (result.tax) {
            const taxParts: string[] = [];
            if (result.tax.gst) taxParts.push(`TPS: $${result.tax.gst.toFixed(2)}`);
            if (result.tax.qst) taxParts.push(`TVQ: $${result.tax.qst.toFixed(2)}`);
            if (result.tax.pst) taxParts.push(`PST: $${result.tax.pst.toFixed(2)}`);
            if (result.tax.hst) taxParts.push(`HST: $${result.tax.hst.toFixed(2)}`);
            if (result.tax.total) taxParts.push(`Total taxes: $${result.tax.total.toFixed(2)}`);
            if (taxParts.length > 0) {
                notesParts.push(`Taxes: ${taxParts.join(', ')}`);
            }
        }
        if (result.total) {
            notesParts.push(`Total: $${result.total.toFixed(2)}`);
        }
        if (result.rawText) {
            notesParts.push(`\nOCR brut:\n${result.rawText.substring(0, 500)}`);
        }
        
        if (notesParts.length > 0) {
            setNotes(notesParts.join('\n'));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !amount || isSubmitting) return;
        
        // Validate category - reject if it looks like an ID
        const validatedCategory = category.match(/^(exp|job|notif|conv)-[a-f0-9-]{30,}$/i) || category.length > 50
            ? (categories.includes('Autre') ? 'Autre' : categories[0] || 'Autre')
            : category;
        
        if (validatedCategory !== category) {
            console.warn(`[AddExpenseModal] Invalid category "${category}" replaced with "${validatedCategory}"`);
        }
        
        setIsSubmitting(true);
        
        try {
            const numericAmount = typeof amount === 'number' ? amount : Number(amount);
            const formattedDate = date; // Already in YYYY-MM-DD format from input
            const normalizedJobId = jobId && jobId !== '' ? jobId : null;
            const baseExpense = {
                name,
                amount: numericAmount,
                date: formattedDate,
                category: validatedCategory,
                jobId: normalizedJobId,
                receiptImage: receiptImage || undefined,
                vendor: vendor.trim() || undefined,
                notes: notes.trim() || undefined,
            };

            if (isEditMode && initialExpense && onUpdateExpense) {
                await onUpdateExpense({
                    ...initialExpense,
                    ...baseExpense,
                });
            } else {
                await onAddExpense(baseExpense);
            }
            onClose();
        } catch (error) {
            console.error('Failed to add expense', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditMode ? "Modifier la dépense" : "Nouvelle Dépense"} size="lg">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex items-start gap-4">
                    <div className="flex-1 space-y-4">
                        <input type="text" placeholder="Description (ex: Essence, Matériaux...)" value={name} onChange={e => setName(e.target.value)} required className="w-full bg-white text-fiscalia-primary-dark placeholder:text-fiscalia-primary-dark/60 p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50" />
                        <input type="number" placeholder="Montant" value={amount} onChange={e => setAmount(parseFloat(e.target.value) || '')} required className="w-full bg-white text-fiscalia-primary-dark placeholder:text-fiscalia-primary-dark/60 p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50" />
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} required className="w-full bg-white text-fiscalia-primary-dark p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50" />
                        <select value={category} onChange={e => setCategory(e.target.value as ExpenseCategory)} className="w-full bg-white text-fiscalia-primary-dark p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50">
                            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                        <input
                            type="text"
                            placeholder="Fournisseur (optionnel)"
                            value={vendor}
                            onChange={e => setVendor(e.target.value)}
                            className="w-full bg-white text-fiscalia-primary-dark placeholder:text-fiscalia-primary-dark/60 p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50"
                        />
                         <select value={jobId} onChange={e => setJobId(e.target.value)} className="w-full bg-white text-fiscalia-primary-dark p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50">
                            <option value="">Ne pas lier à un contrat</option>
                            {jobs.map(job => <option key={job.id} value={job.id}>{job.name}</option>)}
                        </select>
                        <textarea
                            placeholder="Notes (optionnel)"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={3}
                            className="w-full bg-white text-fiscalia-primary-dark placeholder:text-fiscalia-primary-dark/60 p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50"
                        />
                    </div>
                    <div className="w-2/5 flex flex-col items-center gap-2">
                        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                        {receiptImage ? (
                            <div className="w-full relative">
                                <img src={receiptImage} alt="Aperçu du reçu" className="w-full h-32 object-contain rounded-md border border-fiscalia-primary-dark/20 bg-fiscalia-light-neutral" />
                                <button
                                    type="button"
                                    onClick={() => setReceiptImage(null)}
                                    className="absolute top-1 right-1 p-1 bg-white rounded-full shadow-md text-fiscalia-error hover:bg-fiscalia-error/10 transition-colors"
                                    title="Supprimer le reçu"
                                >
                                    <XMarkIcon className="w-4 h-4" />
                        </button>
                            </div>
                        ) : (
                            <div className="w-full space-y-2">
                                <button 
                            type="button" 
                            onClick={() => setShowReceiptScanner(true)} 
                                    className="w-full h-32 bg-fiscalia-light-neutral border-2 border-dashed border-fiscalia-primary-dark/20 rounded-lg flex flex-col items-center justify-center text-fiscalia-primary-dark/60 hover:border-fiscalia-accent-gold hover:text-fiscalia-accent-gold transition-colors gap-2"
                                >
                                    <SparklesIcon className="w-8 h-8" />
                                    <span className="text-sm font-medium">Scanner un reçu</span>
                                    <span className="text-xs text-fiscalia-primary-dark/50">(Analyse automatique)</span>
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => fileInputRef.current?.click()} 
                                    className="w-full py-2 px-3 text-sm bg-white border border-fiscalia-primary-dark/20 rounded-lg text-fiscalia-primary-dark/70 hover:border-fiscalia-primary-dark/40 hover:text-fiscalia-primary-dark transition-colors flex items-center justify-center gap-2"
                                >
                                    <PaperclipIcon className="w-4 h-4" />
                                    <span>Ou télécharger une image</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-fiscalia-primary-dark/10 mt-4">
                    <Button variant="secondary" type="button" onClick={onClose} disabled={isSubmitting}>Annuler</Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? (isEditMode ? 'Mise à jour...' : 'Ajout...') : (isEditMode ? 'Mettre à jour la dépense' : 'Ajouter la dépense')}
                    </Button>
                </div>
            </form>
            {showReceiptScanner && (
                <ReceiptScanner
                    onReceiptProcessed={handleReceiptProcessed}
                    onClose={() => setShowReceiptScanner(false)}
                    autoCreateExpense={false}
                />
            )}
        </Modal>
    );
};

interface ManageCategoriesModalProps {
    isOpen: boolean;
    onClose: () => void;
    categories: ExpenseCategory[];
    onAddCategory: (category: string) => void;
    onDeleteCategory: (category: string) => void;
}

export const ManageCategoriesModal: React.FC<ManageCategoriesModalProps> = ({ isOpen, onClose, categories, onAddCategory, onDeleteCategory }) => {
    const [newCategory, setNewCategory] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (newCategory.trim()) {
            onAddCategory(newCategory.trim());
            setNewCategory('');
        }
    };
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Gérer les Catégories">
            <div className="space-y-4">
                <div>
                    <h3 className="font-medium text-fiscalia-primary-dark mb-2">Catégories existantes</h3>
                    <div className="max-h-48 overflow-y-auto space-y-2 rounded-lg bg-fiscalia-light-neutral p-3 border border-fiscalia-primary-dark/10">
                        {categories.map(cat => (
                            <div key={cat} className="flex items-center justify-between text-fiscalia-primary-dark/80 bg-white px-3 py-2 rounded-md shadow-sm">
                                <span>{cat}</span>
                                {cat !== 'Autre' && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (window.confirm(`Supprimer la catégorie "${cat}" ?`)) {
                                                onDeleteCategory(cat);
                                            }
                                        }}
                                        className="p-1 text-fiscalia-primary-dark/50 hover:text-fiscalia-error hover:bg-fiscalia-error/10 rounded-md transition-colors"
                                        title={`Supprimer ${cat}`}
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
                 <form onSubmit={handleSubmit} className="space-y-2 pt-4 border-t border-fiscalia-primary-dark/10">
                     <h3 className="font-medium text-fiscalia-primary-dark">Ajouter une catégorie</h3>
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            value={newCategory}
                            onChange={e => setNewCategory(e.target.value)}
                            placeholder="ex: Transport"
                            className="flex-grow bg-white text-fiscalia-primary-dark placeholder:text-fiscalia-primary-dark/60 p-3 rounded-lg border border-fiscalia-primary-dark/20 focus:outline-none focus:ring-2 focus:ring-fiscalia-accent-gold/50"
                        />
                        <Button type="submit" className="px-4 py-2"><PlusIcon className="w-5 h-5"/></Button>
                    </div>
                </form>
            </div>
        </Modal>
    );
}

interface DateRangeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (start: string, end: string) => void;
}

interface CalendarViewProps {
    viewDate: Date;
    setViewDate: (date: Date) => void;
    startDate: Date | null;
    endDate: Date | null;
    hoverDate: Date | null;
    onDateClick: (date: Date) => void;
    onDateHover: (date: Date | null) => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({ viewDate, setViewDate, startDate, endDate, hoverDate, onDateClick, onDateHover }) => {
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    const dayNames = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];

    const firstDayOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    const startingDayOfWeek = firstDayOfMonth.getDay();

    const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
    const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const renderDays = () => {
        const days = [];
        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push(<div key={`prev-${i}`} className="w-10 h-10"></div>);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
            currentDate.setHours(0,0,0,0);

            const isSelectedStart = startDate && currentDate.getTime() === startDate.getTime();
            const isSelectedEnd = endDate && currentDate.getTime() === endDate.getTime();
            
            const rangeEnd = endDate || (hoverDate && startDate && hoverDate >= startDate ? hoverDate : null);
            const isInRange = startDate && rangeEnd && currentDate > startDate && currentDate < rangeEnd;
            const isRangeEnd = rangeEnd && currentDate.getTime() === rangeEnd.getTime();
            
            const isToday = currentDate.getTime() === today.getTime();
            
            let cellClasses = 'flex items-center justify-center';
            if (isInRange) {
                cellClasses += ' bg-fiscalia-accent-gold/10';
            }
            if (isSelectedStart && rangeEnd) {
                cellClasses += ' bg-fiscalia-accent-gold/10 rounded-l-full';
            }
            if (isRangeEnd && !isSelectedStart) {
                cellClasses += ' bg-fiscalia-accent-gold/10 rounded-r-full';
            }

            let dayClasses = 'w-10 h-10 flex items-center justify-center rounded-full transition-colors duration-150 cursor-pointer';
            if (isSelectedStart || isSelectedEnd) {
                dayClasses += ' bg-fiscalia-accent-gold text-white';
            } else if (isToday) {
                dayClasses += ' border border-fiscalia-primary-dark/40';
            }
            
            if (!isSelectedStart && !isSelectedEnd) {
                 if (isRangeEnd) {
                     dayClasses += ' bg-fiscalia-accent-gold/20'
                 } else {
                     dayClasses += ' hover:bg-fiscalia-accent-gold/20';
                 }
            }
            
            if (isSelectedStart && isSelectedEnd && startDate.getTime() === endDate.getTime()) {
                cellClasses = 'flex items-center justify-center';
            }

            days.push(
                <div
                    key={day} 
                    className={cellClasses}
                    onClick={() => onDateClick(currentDate)}
                    onMouseEnter={() => startDate && !endDate && onDateHover(currentDate)}
                >
                    <div className={dayClasses}>
                        {day}
                    </div>
                </div>
            );
        }
        
        const totalDays = startingDayOfWeek + daysInMonth;
        const nextMonthDays = (7 - (totalDays % 7)) % 7;
        for (let i = 0; i < nextMonthDays; i++) {
            days.push(<div key={`next-${i}`} className="w-10 h-10"></div>);
        }
        
        return days;
    };
    
    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <button type="button" onClick={prevMonth} className="p-2 rounded-full hover:bg-gray-100">
                    <ChevronLeftIcon className="w-5 h-5 text-fiscalia-primary-dark" />
                </button>
                <div className="font-semibold text-fiscalia-primary-dark">{monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}</div>
                <button type="button" onClick={nextMonth} className="p-2 rounded-full hover:bg-gray-100">
                    <ChevronRightIcon className="w-5 h-5 text-fiscalia-primary-dark" />
                </button>
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-sm justify-items-center" onMouseLeave={() => onDateHover(null)}>
                {dayNames.map(day => <div key={day} className="p-2 text-center font-medium text-fiscalia-primary-dark/60 w-10 h-10 flex items-center justify-center">{day}</div>)}
                {renderDays()}
            </div>
        </div>
    );
};

export const DateRangeModal: React.FC<DateRangeModalProps> = ({ isOpen, onClose, onApply }) => {
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [endDate, setEndDate] = useState<Date | null>(null);
    const [hoverDate, setHoverDate] = useState<Date | null>(null);
    const [viewDate, setViewDate] = useState(new Date());

    const handleDateClick = (date: Date) => {
        if (!startDate || (startDate && endDate)) {
            setStartDate(date);
            setEndDate(null);
        } else if (startDate && !endDate) {
            if (date < startDate) {
                setStartDate(date);
            } else {
                setEndDate(date);
            }
        }
    };

    const handleApply = () => {
        if (startDate && endDate) {
            onApply(startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]);
        } else if (startDate) {
            onApply(startDate.toISOString().split('T')[0], startDate.toISOString().split('T')[0]);
        }
    };

    useEffect(() => {
        if (isOpen) {
            setStartDate(null);
            setEndDate(null);
            setHoverDate(null);
            setViewDate(new Date());
        }
    }, [isOpen]);
    
    const formatDate = (date: Date | null) => {
        if (!date) return '____-__-__';
        return date.toLocaleDateString('fr-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Sélectionner une période">
            <div className="space-y-4">
                <CalendarView 
                    viewDate={viewDate}
                    setViewDate={setViewDate}
                    startDate={startDate}
                    endDate={endDate}
                    hoverDate={hoverDate}
                    onDateClick={handleDateClick}
                    onDateHover={setHoverDate}
                />
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-fiscalia-primary-dark/10">
                    <div>
                        <label className="block text-sm font-medium text-fiscalia-primary-dark/80 mb-1">Date de début</label>
                        <div className="w-full bg-fiscalia-light-neutral text-fiscalia-primary-dark p-3 rounded-lg border border-fiscalia-primary-dark/20">
                            {formatDate(startDate)}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-fiscalia-primary-dark/80 mb-1">Date de fin</label>
                        <div className="w-full bg-fiscalia-light-neutral text-fiscalia-primary-dark p-3 rounded-lg border border-fiscalia-primary-dark/20">
                           {formatDate(endDate)}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-fiscalia-primary-dark/10 mt-2">
                    <Button variant="secondary" type="button" onClick={onClose}>Annuler</Button>
                    <Button type="button" onClick={handleApply} disabled={!startDate}>Appliquer</Button>
                </div>
            </div>
        </Modal>
    );
};

// Sidebar Components
interface SidebarConversationHistoryProps {
    conversations: Conversation[];
    onConversationSelect?: (conversationId: string) => void;
    onConversationDelete?: (conversationId: string) => void;
    onConversationRename?: (conversationId: string, newTitle: string) => void;
    activeConversationId?: string;
}

export const SidebarConversationHistory: React.FC<SidebarConversationHistoryProps> = ({ 
    conversations,
    onConversationSelect,
    onConversationDelete,
    onConversationRename,
    activeConversationId
}) => {
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const menuRefs = React.useRef<{ [key: string]: HTMLDivElement | null }>({});

    const visibleConversations = conversations;

    const getConversationSubtitle = (conversation: Conversation) => {
        if (conversation.hasUserMessage && conversation.lastMessagePreview) {
            if (conversation.lastMessagePreview.length <= 60) {
                return conversation.lastMessagePreview;
            }
            return `${conversation.lastMessagePreview.slice(0, 57)}...`;
        }
        return 'En attente de votre question';
    };

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (openMenuId) {
                const menuElement = menuRefs.current[openMenuId];
                if (menuElement && !menuElement.contains(event.target as Node)) {
                    // Check if click is on the three dots button (it's inside the conversation item)
                    const target = event.target as HTMLElement;
                    if (!target.closest(`[data-conversation-id="${openMenuId}"]`)) {
                        setOpenMenuId(null);
                    }
                }
            }
        };

        if (openMenuId) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [openMenuId]);

    const handleDelete = (conversationId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onConversationDelete?.(conversationId);
        setOpenMenuId(null);
    };

    const handleRenameClick = (conversation: Conversation, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingId(conversation.id);
        setEditTitle(conversation.title);
        setOpenMenuId(null);
    };

    const handleRenameSubmit = (conversationId: string, e: React.FormEvent) => {
        e.stopPropagation();
        if (editTitle.trim()) {
            onConversationRename?.(conversationId, editTitle.trim());
        }
        setEditingId(null);
        setEditTitle('');
    };

    const handleRenameCancel = () => {
        setEditingId(null);
        setEditTitle('');
    };

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="px-3 pt-3 pb-2 flex-shrink-0">
                <h3 className="text-[11px] font-medium text-white/50 uppercase tracking-wide">Conversations</h3>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 px-1.5">
                {visibleConversations.length > 0 ? (
                    <div className="space-y-0.5">
                        {visibleConversations.map((conversation) => {
                            const isActive = activeConversationId === conversation.id;
                            const isEditing = editingId === conversation.id;
                            const subtitle = getConversationSubtitle(conversation);
                            
                            return (
                                <div
                                    key={conversation.id}
                                    data-conversation-id={conversation.id}
                                    className={`relative group flex items-center rounded-md transition-colors w-full ${
                                        isActive 
                                            ? 'bg-white/10' 
                                            : 'hover:bg-white/5'
                                    }`}
                                >
                                    {isEditing ? (
                                        <form 
                                            onSubmit={(e) => handleRenameSubmit(conversation.id, e)}
                                            className="flex-1 px-3 py-2.5"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <input
                                                type="text"
                                                value={editTitle}
                                                onChange={(e) => setEditTitle(e.target.value)}
                                                onBlur={handleRenameCancel}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Escape') {
                                                        handleRenameCancel();
                                                    } else if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleRenameSubmit(conversation.id, e);
                                                    }
                                                }}
                                                className="w-full bg-white/10 text-white text-sm px-2 py-1 rounded border border-white/20 focus:outline-none focus:border-fiscalia-accent-gold"
                                                autoFocus
                                            />
                                        </form>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => onConversationSelect?.(conversation.id)}
                                                className={`flex-1 w-full text-left px-3 py-2.5 rounded-md transition-colors overflow-hidden ${
                                                    isActive 
                                                        ? 'text-white' 
                                                        : 'text-white/70 hover:text-white'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <div className="relative w-4 h-4 flex-shrink-0">
                                                        <ChatBubbleIcon className="absolute inset-0 w-4 h-4 opacity-60 group-hover:opacity-0 group-hover:scale-0 transition-all duration-200" />
                                                        {(onConversationDelete || onConversationRename) && (
                                                            <div
                                                                role="button"
                                                                tabIndex={0}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setOpenMenuId(openMenuId === conversation.id ? null : conversation.id);
                                                                }}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        setOpenMenuId(openMenuId === conversation.id ? null : conversation.id);
                                                                    }
                                                                }}
                                                                className="absolute inset-0 w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:scale-100 scale-0 flex items-center justify-center transition-all duration-200 cursor-pointer"
                                                                aria-label="Menu options"
                                                            >
                                                                <EllipsisHorizontalIcon className="w-4 h-4 text-white" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col flex-1 min-w-0">
                                                        <span className="text-sm truncate">
                                                            {conversation.title}
                                                        </span>
                                                        <span className="text-[11px] text-white/40 truncate">
                                                            {subtitle}
                                                        </span>
                                                    </div>
                                                </div>
                                            </button>
                                            {openMenuId === conversation.id && (onConversationDelete || onConversationRename) && (
                                                <div 
                                                    className="absolute left-3 top-full mt-1 z-50 bg-fiscalia-primary-dark border border-white/20 rounded-md shadow-lg py-1 min-w-[120px]"
                                                    ref={(el) => { menuRefs.current[conversation.id] = el; }}
                                                >
                                                    {onConversationRename && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleRenameClick(conversation, e)}
                                                            className="w-full text-left px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2"
                                                        >
                                                            <PencilIcon className="w-3.5 h-3.5" />
                                                            Renommer
                                                        </button>
                                                    )}
                                                    {onConversationDelete && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleDelete(conversation.id, e)}
                                                            className="w-full text-left px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2"
                                                        >
                                                            <TrashIcon className="w-3.5 h-3.5" />
                                                            Supprimer
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="px-3 py-2">
                        <p className="text-sm text-white/40">Aucune conversation</p>
                    </div>
                )}
            </div>
        </div>
    );
};

interface SidebarNotificationsProps {
    notifications: Notification[];
    onNotificationClick?: (notification: Notification) => void;
    onMarkAsRead?: (notificationId: string) => void;
    onDeleteNotification?: (notificationId: string) => void;
    onRenameNotification?: (notificationId: string, newTitle: string) => void;
}

export const SidebarNotifications: React.FC<SidebarNotificationsProps> = ({ 
    notifications, 
    onNotificationClick,
    onMarkAsRead,
    onDeleteNotification,
    onRenameNotification
}) => {
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const menuRefs = React.useRef<{ [key: string]: HTMLDivElement | null }>({});
    
    const unreadCount = notifications.filter(n => !n.read).length;
    const recentNotifications = notifications.slice(0, 5);

    // Extract a short title from the notification
    const getNotificationTitle = (message: string) => {
        const words = message.split(' ');
        if (words.length <= 8) return message;
        return words.slice(0, 8).join(' ') + '...';
    };

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (openMenuId) {
                const menuElement = menuRefs.current[openMenuId];
                if (menuElement && !menuElement.contains(event.target as Node)) {
                    const target = event.target as HTMLElement;
                    if (!target.closest(`[data-notification-id="${openMenuId}"]`)) {
                        setOpenMenuId(null);
                    }
                }
            }
        };

        if (openMenuId) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [openMenuId]);

    const handleDelete = (notificationId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        onDeleteNotification?.(notificationId);
        setOpenMenuId(null);
    };

    const handleRenameClick = (notificationId: string, currentTitle: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingId(notificationId);
        setEditTitle(currentTitle);
        setOpenMenuId(null);
    };

    const handleRenameSubmit = (notificationId: string, e: React.FormEvent) => {
        e.stopPropagation();
        if (editTitle.trim()) {
            onRenameNotification?.(notificationId, editTitle.trim());
        }
        setEditingId(null);
        setEditTitle('');
    };

    const handleRenameCancel = () => {
        setEditingId(null);
        setEditTitle('');
    };

    return (
        <div className="border-t border-white/10 h-full flex flex-col overflow-hidden">
            <div className="px-3 pt-3 pb-2 flex items-center justify-between flex-shrink-0">
                <h3 className="text-[11px] font-medium text-white/50 uppercase tracking-wide">Notifications</h3>
                {unreadCount > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-fiscalia-accent-gold flex-shrink-0" />
                )}
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 px-1.5">
                {recentNotifications.length > 0 ? (
                    <div className="space-y-0.5">
                        {recentNotifications.map((notification) => {
                            const isEditing = editingId === notification.id;
                            const notificationTitle = getNotificationTitle(notification.message);
                            
                            return (
                                <div
                                    key={notification.id}
                                    data-notification-id={notification.id}
                                    className="relative group flex items-center rounded-md transition-colors w-full hover:bg-white/5"
                                >
                                    {isEditing ? (
                                        <form 
                                            onSubmit={(e) => handleRenameSubmit(notification.id, e)}
                                            className="flex-1 px-3 py-2.5"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <input
                                                type="text"
                                                value={editTitle}
                                                onChange={(e) => setEditTitle(e.target.value)}
                                                onBlur={handleRenameCancel}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Escape') {
                                                        handleRenameCancel();
                                                    } else if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleRenameSubmit(notification.id, e);
                                                    }
                                                }}
                                                className="w-full bg-white/10 text-white text-sm px-2 py-1 rounded border border-white/20 focus:outline-none focus:border-fiscalia-accent-gold"
                                                autoFocus
                                            />
                                        </form>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => {
                                                    onNotificationClick?.(notification);
                                                    if (!notification.read) {
                                                        onMarkAsRead?.(notification.id);
                                                    }
                                                }}
                                                className="flex-1 text-left px-3 py-2.5 rounded-md transition-colors text-white/70 hover:text-white"
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <div className="relative w-4 h-4 flex-shrink-0">
                                                        <BellIcon className="absolute inset-0 w-4 h-4 opacity-60 group-hover:opacity-0 group-hover:scale-0 transition-all duration-200" />
                                                        {(onDeleteNotification || onRenameNotification) && (
                                                            <div
                                                                role="button"
                                                                tabIndex={0}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setOpenMenuId(openMenuId === notification.id ? null : notification.id);
                                                                }}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        setOpenMenuId(openMenuId === notification.id ? null : notification.id);
                                                                    }
                                                                }}
                                                                className="absolute inset-0 w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:scale-100 scale-0 flex items-center justify-center transition-all duration-200 cursor-pointer"
                                                                aria-label="Menu options"
                                                            >
                                                                <EllipsisHorizontalIcon className="w-4 h-4 text-white" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="text-sm truncate flex-1">
                                                        {notificationTitle}
                                                    </span>
                                                </div>
                                            </button>
                                            {openMenuId === notification.id && (onDeleteNotification || onRenameNotification) && (
                                                <div 
                                                    className="absolute left-3 top-full mt-1 z-50 bg-fiscalia-primary-dark border border-white/20 rounded-md shadow-lg py-1 min-w-[120px]"
                                                    ref={(el) => { menuRefs.current[notification.id] = el; }}
                                                >
                                                    {onRenameNotification && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleRenameClick(notification.id, notificationTitle, e)}
                                                            className="w-full text-left px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2"
                                                        >
                                                            <PencilIcon className="w-3.5 h-3.5" />
                                                            Renommer
                                                        </button>
                                                    )}
                                                    {onDeleteNotification && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleDelete(notification.id, e)}
                                                            className="w-full text-left px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2"
                                                        >
                                                            <TrashIcon className="w-3.5 h-3.5" />
                                                            Supprimer
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="px-3 py-2">
                        <p className="text-sm text-white/40">Aucune notification</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// Export error boundaries
export { ErrorBoundary, FinancialErrorBoundary, ChatErrorBoundary } from './components/ErrorBoundary';
