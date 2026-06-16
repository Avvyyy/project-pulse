import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';

export const SignupPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { setUser } = useAuthStore();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const { user } = await authApi.signup({ email, password });
      setUser(user);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to sign up');
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-950">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
        <h2 className="mb-6 text-2xl font-bold text-white text-center">Sign Up for Pulse</h2>
        {error && <div className="mb-4 rounded bg-red-900/50 p-3 text-red-200">{error}</div>}
        <form onSubmit={handleSignup} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-400">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-zinc-800 bg-zinc-950 p-2 text-white focus:border-blue-500 focus:outline-none"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-400">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-zinc-800 bg-zinc-950 p-2 text-white focus:border-blue-500 focus:outline-none"
              required
              minLength={8}
            />
          </div>
          <button
            type="submit"
            className="mt-4 w-full rounded bg-blue-600 p-2 font-medium text-white hover:bg-blue-700 transition"
          >
            Create Account
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-zinc-500">
          Already have an account? <Link to="/login" className="text-blue-500 hover:text-blue-400">Log in</Link>
        </p>
      </div>
    </div>
  );
};
