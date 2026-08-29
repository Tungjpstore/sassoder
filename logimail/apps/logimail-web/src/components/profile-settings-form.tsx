'use client';

import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

async function authToken() {
  const { data, error } = await getSupabaseBrowserClient().auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Phiên đăng nhập đã hết hạn.');
  return data.session.access_token;
}

async function patchProfile(body: { fullName: string; avatarUrl: string }) {
  const token = await authToken();
  const response = await fetch('/api/logimail/me', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as ApiEnvelope<{ profile: { full_name: string | null; avatar_url: string | null } }>;
  if (!response.ok || !payload.ok) throw new Error(payload.ok ? 'Không lưu được profile.' : payload.error.message);
  return payload.data.profile;
}

export function ProfileSettingsForm({
  email,
  fullName,
  avatarUrl,
}: Readonly<{
  email: string;
  fullName: string;
  avatarUrl: string;
}>) {
  const [name, setName] = useState(fullName);
  const [avatar, setAvatar] = useState(avatarUrl);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const profile = await patchProfile({ fullName: name, avatarUrl: avatar });
      setName(profile.full_name ?? '');
      setAvatar(profile.avatar_url ?? '');
      setMessage('Đã lưu hồ sơ người gửi.');
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : 'Không lưu được hồ sơ.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="profile-settings-form stack-form" onSubmit={submit}>
      {message ? <p className="form-alert success">{message}</p> : null}
      {error ? <p className="form-alert danger">{error}</p> : null}
      <div className="profile-preview-row">
        <div className="profile-avatar-preview">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- User-provided hosts cannot be safely allowlisted for image optimization.
            <img src={avatar} alt="Avatar" />
          ) : <span>{(name || email || 'L').slice(0, 1).toUpperCase()}</span>}
        </div>
        <div>
          <strong>{name || email}</strong>
          <span>{email}</span>
        </div>
      </div>
      <label className="form-field">
        <span>Tên hiển thị</span>
        <input value={name} onChange={(event) => setName(event.target.value)} type="text" maxLength={120} />
      </label>
      <label className="form-field">
        <span>Avatar URL</span>
        <input value={avatar} onChange={(event) => setAvatar(event.target.value)} type="url" placeholder="https://..." maxLength={2048} />
        <small>Dùng ảnh HTTPS vuông, rõ mặt hoặc logo nội bộ; một số inbox chỉ hiển thị khi domain đủ uy tín/BIMI.</small>
      </label>
      <button className="button-link button-reset primary" type="submit" disabled={loading}>
        {loading ? <Loader2 size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
        <span>{loading ? 'Đang lưu' : 'Lưu hồ sơ'}</span>
      </button>
    </form>
  );
}
