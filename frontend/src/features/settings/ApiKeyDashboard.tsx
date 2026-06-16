import React, { useEffect, useState } from 'react';
import { apiKeysApi, APIKey } from '../../api/apikeys';
import { NavBar } from '../../components/NavBar';

export const ApiKeyDashboard: React.FC = () => {
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  const fetchKeys = async () => {
    try {
      const data = await apiKeysApi.list();
      setKeys(data ?? []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch API keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setError(null);
    try {
      const key = await apiKeysApi.create({ name: newKeyName });
      if (key.fullKey) {
        setCreatedKey(key.fullKey);
      }
      setNewKeyName('');
      fetchKeys();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create API key');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiKeysApi.delete(id);
      fetchKeys();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete API key');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <NavBar breadcrumbs={[{ label: 'API Keys' }]} />
      <div className="flex-1 max-w-4xl w-full mx-auto p-8 text-slate-200">
        <h1 className="text-3xl font-bold mb-6 text-slate-100">API Keys</h1>
        <p className="text-slate-400 mb-8">Manage your API keys to authenticate ingestion requests.</p>
        
        {error && <div className="mb-6 rounded bg-red-950 border border-red-800 p-4 text-red-400">{error}</div>}

        {createdKey && (
          <div className="mb-6 rounded bg-emerald-950/50 p-6 border border-emerald-800">
            <h3 className="text-lg font-semibold text-emerald-400 mb-2">New API Key Created!</h3>
            <p className="text-emerald-200/80 mb-4">Please copy this key now. You will not be able to see it again.</p>
            <code className="bg-canvas border border-edge p-3 rounded block select-all break-all text-emerald-400 font-mono">{createdKey}</code>
            <button 
              onClick={() => setCreatedKey(null)}
              className="mt-4 px-4 py-2 bg-emerald-900 border border-emerald-700 text-emerald-300 rounded hover:bg-emerald-800 transition"
            >
              I've copied it
            </button>
          </div>
        )}

        <div className="bg-surface rounded-xl border border-edge p-6 mb-8 shadow-sm">
          <h2 className="text-xl font-semibold mb-4 text-slate-200">Create New Key</h2>
          <form onSubmit={handleCreate} className="flex gap-4">
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. Production Backend"
              className="flex-1 rounded border border-edge bg-canvas p-2 text-slate-200 focus:border-accent focus:outline-none"
              required
            />
            <button
              type="submit"
              className="rounded bg-accent px-6 py-2 font-medium text-white hover:bg-blue-600 transition"
            >
              Generate
            </button>
          </form>
        </div>

        <div className="bg-surface rounded-xl border border-edge overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-surface-2 text-xs uppercase text-slate-400 border-b border-edge">
              <tr>
                <th className="px-6 py-4 font-medium tracking-wider">Name</th>
                <th className="px-6 py-4 font-medium tracking-wider">Created At</th>
                <th className="px-6 py-4 font-medium tracking-wider">Rate Limit</th>
                <th className="px-6 py-4 font-medium tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">Loading keys...</td>
                </tr>
              ) : keys.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500">No API keys found. Create one above.</td>
                </tr>
              ) : (
                keys.map(key => (
                  <tr key={key.id} className="hover:bg-surface-2 transition">
                    <td className="px-6 py-4 font-medium text-slate-200">{key.name}</td>
                    <td className="px-6 py-4">{new Date(key.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4 tabular-nums">{key.rateLimitPerMinute} / min</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(key.id)}
                        className="text-red-400 hover:text-red-300 font-medium"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
