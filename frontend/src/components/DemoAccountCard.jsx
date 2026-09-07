import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Sparkles, Copy, Check, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/store';

export function DemoAccountCard() {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const demoEmail = 'sheikhmuhammadali3@gmail.com';
  const demoPass = 'ali123456';

  const handle1ClickLogin = async () => {
    setLoading(true);
    try {
      const data = await api.post('/api/auth/login', {
        email: demoEmail,
        password: demoPass,
      });
      setAuth(data.token, data.merchantId);
      toast.success('Signed in as Demo Merchant!');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(err.message || 'Demo login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`Email: ${demoEmail}\nPassword: ${demoPass}`);
    setCopied(true);
    toast.success('Demo credentials copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mb-5 p-4 rounded-xl border border-primary/30 bg-primary/5 dark:bg-primary/10 transition-all">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="text-xs font-semibold text-primary uppercase tracking-wider">
            Evaluation Demo Account
          </span>
        </div>
        <span className="text-[11px] font-medium text-ink-secondary bg-surface px-2 py-0.5 rounded-full border border-hairline">
          Pre-loaded history
        </span>
      </div>

      <p className="text-xs text-ink-secondary mb-3 leading-relaxed">
        Evaluating or exploring? Skip signing up and explore a live store with real sales history, stock analytics, and workflows.
      </p>

      <div className="p-2.5 rounded-lg bg-surface/80 border border-hairline mb-3 flex items-center justify-between text-xs font-mono">
        <div className="space-y-0.5 text-left truncate mr-2">
          <div className="truncate">
            <span className="text-ink-mute select-none">Email: </span>
            <span className="text-ink-primary font-semibold select-all">{demoEmail}</span>
          </div>
          <div className="truncate">
            <span className="text-ink-mute select-none">Password: </span>
            <span className="text-ink-primary font-semibold select-all">{demoPass}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          title="Copy demo credentials"
          className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700/50 text-ink-secondary hover:text-ink-primary transition-colors flex-shrink-0"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={handle1ClickLogin}
        className="w-full py-2 px-3 text-xs font-medium rounded-lg bg-primary hover:bg-primary-hover text-black transition-all flex items-center justify-center gap-2 shadow-sm font-sans font-semibold disabled:opacity-60 cursor-pointer"
      >
        <Sparkles className="w-3.5 h-3.5" />
        {loading ? 'Logging into demo store...' : '1-Click Demo Sign In'}
        <ArrowRight className="w-3.5 h-3.5 ml-auto" />
      </button>
    </div>
  );
}
