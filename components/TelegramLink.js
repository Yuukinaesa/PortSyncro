// components/TelegramLink.js
// Component for linking/unlinking Telegram account in Settings
// Shows link status, generates verification codes, and handles unlinking

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/authContext';
import { useLanguage } from '../lib/languageContext';
import { FiLink, FiCopy, FiCheck, FiRefreshCw } from 'react-icons/fi';
import { FaUnlink } from 'react-icons/fa';

export default function TelegramLink() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [linkStatus, setLinkStatus] = useState(null); // null = loading, { linked, username, linkedAt }
  const [linkCode, setLinkCode] = useState(null); // { code, expiresAt, countdown }
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [countdown, setCountdown] = useState(0);

  const t = useCallback((id) => {
    const texts = {
      telegramIntegration: language === 'en' ? 'Telegram Bot' : 'Bot Telegram',
      linkTelegram: language === 'en' ? 'Link Telegram' : 'Hubungkan Telegram',
      unlinkTelegram: language === 'en' ? 'Unlink Telegram' : 'Putuskan Telegram',
      linked: language === 'en' ? 'Connected' : 'Terhubung',
      notLinked: language === 'en' ? 'Not connected' : 'Belum terhubung',
      generateCode: language === 'en' ? 'Generate Link Code' : 'Buat Kode Link',
      codeInstructions: language === 'en'
        ? 'Send this command to the PortSyncro Telegram Bot:'
        : 'Kirim perintah ini ke Bot Telegram PortSyncro:',
      codeExpires: language === 'en' ? 'Code expires in' : 'Kode kedaluwarsa dalam',
      minutes: language === 'en' ? 'minutes' : 'menit',
      seconds: language === 'en' ? 'seconds' : 'detik',
      copied: language === 'en' ? 'Copied!' : 'Disalin!',
      unlinkConfirm: language === 'en'
        ? 'Are you sure you want to unlink your Telegram account?'
        : 'Yakin ingin memutuskan koneksi Telegram?',
      description: language === 'en'
        ? 'Manage your portfolio via Telegram chat. Add, sell assets, and check prices directly from Telegram.'
        : 'Kelola portfolio via chat Telegram. Tambah, jual aset, dan cek harga langsung dari Telegram.',
    };
    return texts[id] || id;
  }, [language]);

  // Check link status on mount
  useEffect(() => {
    if (!user) return;
    checkStatus();
  }, [user]);

  // Countdown timer for link code
  useEffect(() => {
    if (!linkCode || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          setLinkCode(null);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [linkCode, countdown]);

  const checkStatus = async () => {
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/telegram-link', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // Handle non-OK responses but try to read JSON error details
      if (!res.ok) {
        let errorDetail = `Server error (${res.status})`;
        try {
          const errData = await res.json();
          errorDetail = errData.detail || errData.error || errorDetail;
        } catch { /* response wasn't JSON */ }
        console.warn('Telegram status check failed:', res.status, errorDetail);
        setLinkStatus({ error: true, message: errorDetail });
        return;
      }

      const data = await res.json();
      if (data.error) {
        setLinkStatus({ error: true, message: data.error });
      } else {
        setLinkStatus(data);
      }
    } catch (err) {
      console.error('Error checking Telegram status:', err);
      setLinkStatus({ error: true, message: 'Network error. Coba lagi.' });
    }
  };

  const generateCode = async () => {
    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/telegram-link', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        const errorMsg = res.status === 504 
          ? 'Server timeout. Coba lagi dalam beberapa detik.'
          : `Server error (${res.status}). Coba lagi.`;
        setError(errorMsg);
        return;
      }

      const data = await res.json();
      setLinkCode(data);
      setCountdown(600); // 10 minutes in seconds
    } catch (err) {
      setError(language === 'en' ? 'Failed to generate code. Try again.' : 'Gagal membuat kode. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!linkCode) return;
    try {
      await navigator.clipboard.writeText(`/link ${linkCode.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = `/link ${linkCode.code}`;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleUnlink = async () => {
    if (!confirm(t('unlinkConfirm'))) return;

    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/telegram-link', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        setLinkStatus({ linked: false });
        setLinkCode(null);
      }
    } catch (err) {
      setError(language === 'en' ? 'Failed to unlink. Try again.' : 'Gagal memutuskan. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const formatCountdown = (secs) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="telegram-link-section">
      <div className="telegram-link-header">
        <div className="telegram-link-icon">🤖</div>
        <div>
          <h3 className="telegram-link-title">{t('telegramIntegration')}</h3>
          <p className="telegram-link-desc">{t('description')}</p>
        </div>
      </div>

      {/* Status Badge */}
      <div className="telegram-link-status">
        <span className={`status-badge ${linkStatus?.linked ? 'status-linked' : 'status-unlinked'}`}>
          {linkStatus?.error ? (
            <>
              <FiRefreshCw size={14} />
              {language === 'en' ? 'Connection Error' : 'Gagal Memuat Status'}
            </>
          ) : linkStatus?.linked ? (
            <>
              <FiCheck size={14} />
              {t('linked')}
              {linkStatus.username && <span className="status-username">@{linkStatus.username}</span>}
            </>
          ) : (
            <>
              <FiLink size={14} />
              {t('notLinked')}
            </>
          )}
        </span>
      </div>

      {/* Actions */}
      {linkStatus?.error ? (
        <button
          onClick={checkStatus}
          disabled={loading}
          className="telegram-btn telegram-btn-secondary"
        >
          <FiRefreshCw size={16} className={loading ? 'spin' : ''} />
          {language === 'en' ? 'Retry' : 'Coba Lagi'}
        </button>
      ) : linkStatus?.linked ? (
        <button
          onClick={handleUnlink}
          disabled={loading}
          className="telegram-btn telegram-btn-danger"
        >
          <FaUnlink size={16} />
          {t('unlinkTelegram')}
        </button>
      ) : (
        <div className="telegram-link-actions">
          {!linkCode ? (
            <button
              onClick={generateCode}
              disabled={loading}
              className="telegram-btn telegram-btn-primary"
            >
              {loading ? <FiRefreshCw size={16} className="spin" /> : <FiLink size={16} />}
              {t('generateCode')}
            </button>
          ) : (
            <div className="telegram-code-container">
              <p className="telegram-code-instructions">{t('codeInstructions')}</p>
              
              <div className="telegram-code-box" onClick={handleCopy}>
                <code className="telegram-code-text">/link {linkCode.code}</code>
                <button className="telegram-copy-btn" title="Copy">
                  {copied ? <FiCheck size={16} color="#22c55e" /> : <FiCopy size={16} />}
                </button>
              </div>

              {copied && <p className="telegram-copied-text">✅ {t('copied')}</p>}

              <p className="telegram-code-timer">
                ⏱️ {t('codeExpires')}: <b>{formatCountdown(countdown)}</b>
              </p>

              <button
                onClick={generateCode}
                disabled={loading}
                className="telegram-btn telegram-btn-secondary"
              >
                <FiRefreshCw size={14} />
                {language === 'en' ? 'Generate New Code' : 'Buat Kode Baru'}
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="telegram-error">{error}</p>}

      <style jsx>{`
        .telegram-link-section {
          background: rgba(0, 136, 204, 0.05);
          border: 1px solid rgba(0, 136, 204, 0.15);
          border-radius: 12px;
          padding: 16px;
          margin-top: 12px;
        }

        .telegram-link-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 12px;
        }

        .telegram-link-icon {
          font-size: 28px;
          line-height: 1;
        }

        .telegram-link-title {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary, #e2e8f0);
          margin: 0 0 4px;
        }

        .telegram-link-desc {
          font-size: 12px;
          color: var(--text-secondary, #94a3b8);
          margin: 0;
          line-height: 1.4;
        }

        .telegram-link-status {
          margin-bottom: 12px;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
        }

        .status-linked {
          background: rgba(34, 197, 94, 0.15);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .status-unlinked {
          background: rgba(148, 163, 184, 0.15);
          color: #94a3b8;
          border: 1px solid rgba(148, 163, 184, 0.2);
        }

        .status-username {
          font-style: italic;
          opacity: 0.8;
        }

        .telegram-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 8px;
          border: none;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          width: 100%;
          justify-content: center;
        }

        .telegram-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .telegram-btn-primary {
          background: linear-gradient(135deg, #0088cc, #0099e6);
          color: white;
        }

        .telegram-btn-primary:hover:not(:disabled) {
          background: linear-gradient(135deg, #006da3, #0088cc);
          transform: translateY(-1px);
        }

        .telegram-btn-secondary {
          background: rgba(148, 163, 184, 0.15);
          color: var(--text-secondary, #94a3b8);
          border: 1px solid rgba(148, 163, 184, 0.2);
          font-size: 12px;
          padding: 6px 12px;
          margin-top: 8px;
        }

        .telegram-btn-secondary:hover:not(:disabled) {
          background: rgba(148, 163, 184, 0.25);
        }

        .telegram-btn-danger {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .telegram-btn-danger:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.25);
        }

        .telegram-code-container {
          text-align: center;
        }

        .telegram-code-instructions {
          font-size: 12px;
          color: var(--text-secondary, #94a3b8);
          margin: 0 0 8px;
        }

        .telegram-code-box {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px dashed rgba(0, 136, 204, 0.4);
          border-radius: 8px;
          padding: 12px 16px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .telegram-code-box:hover {
          background: rgba(0, 0, 0, 0.4);
          border-color: rgba(0, 136, 204, 0.6);
        }

        .telegram-code-text {
          font-size: 18px;
          font-weight: 700;
          color: #0088cc;
          letter-spacing: 2px;
          font-family: 'Courier New', monospace;
        }

        .telegram-copy-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          color: var(--text-secondary, #94a3b8);
          transition: color 0.2s;
        }

        .telegram-copy-btn:hover {
          color: #0088cc;
        }

        .telegram-copied-text {
          font-size: 12px;
          color: #22c55e;
          margin: 6px 0 0;
        }

        .telegram-code-timer {
          font-size: 11px;
          color: var(--text-secondary, #94a3b8);
          margin: 8px 0 0;
        }

        .telegram-error {
          color: #ef4444;
          font-size: 12px;
          margin-top: 8px;
          text-align: center;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
