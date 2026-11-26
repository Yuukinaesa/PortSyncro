// components/TelegramLink.js
// Component for linking/unlinking Telegram account in Settings
// Shows link status, generates verification codes, and handles unlinking

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/authContext';
import { useLanguage } from '../lib/languageContext';
import { secureLogger } from '../lib/security';
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
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const copyTimerRef = useRef(null);
  const isCheckingRef = useRef(false);
  const hasSnapshotSyncRef = useRef(false);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const t = useCallback((id) => {
    const texts = {
      telegramIntegration: language === 'en' ? 'Telegram Bot' : 'Bot Telegram',
      linkTelegram: language === 'en' ? 'Link Telegram' : 'Hubungkan Telegram',
      unlinkTelegram: language === 'en' ? 'Unlink Telegram' : 'Putuskan Telegram',
      linked: language === 'en' ? 'Connected' : 'Terhubung',
      notLinked: language === 'en' ? 'Not connected' : 'Belum terhubung',
      checkingStatus: language === 'en' ? 'Checking status...' : 'Memeriksa status...',
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

  const applyLinkedData = useCallback((data) => {
    if (data?.telegramChatId || data?.telegramGroupChatId || data?.linked) {
      setLinkStatus({
        linked: true,
        username: data.telegramUsername ?? data.username ?? null,
        linkedAt: data.telegramLinkedAt ?? data.linkedAt ?? null,
      });
      setLinkCode(null);
      setCountdown(0);
      setConfirmUnlink(false);
      setError(null);
    } else {
      setLinkStatus({ linked: false });
    }
  }, []);

  const checkStatus = useCallback(async ({ silent = false } = {}) => {
    if (!user || isCheckingRef.current) return;
    isCheckingRef.current = true;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/telegram-link', {
        headers: { 'Authorization': `Bearer ${token}` },
        cache: 'no-store'
      });

      // Handle non-OK responses but try to read JSON error details
      if (!res.ok) {
        let errorDetail = `Server error (${res.status})`;
        try {
          const errData = await res.json();
          errorDetail = errData.detail || errData.error || errorDetail;
        } catch (parseErr) {
          secureLogger.warn('Failed to parse Telegram status error response:', parseErr?.message || parseErr);
        }
        secureLogger.warn('Telegram status check failed:', res.status, errorDetail);
        if (!silent && !hasSnapshotSyncRef.current) {
          setLinkStatus({ error: true, message: errorDetail });
        }
        return;
      }

      const data = await res.json();
      if (data.error) {
        if (!silent && !hasSnapshotSyncRef.current) {
          setLinkStatus({ error: true, message: data.error });
        }
      } else {
        applyLinkedData(data);
      }
    } catch (err) {
      secureLogger.error('Error checking Telegram status:', err);
      if (!silent && !hasSnapshotSyncRef.current) {
        setLinkStatus({ error: true, message: 'Network error. Coba lagi.' });
      }
    } finally {
      isCheckingRef.current = false;
    }
  }, [user, applyLinkedData]);

  // Initial sync + real-time Firestore listener on user document
  useEffect(() => {
    hasSnapshotSyncRef.current = false;
    if (!user?.uid) return undefined;

    checkStatus();

    if (!db) return undefined;

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(
      userDocRef,
      (snapshot) => {
        hasSnapshotSyncRef.current = true;
        const data = snapshot.exists() ? (snapshot.data() || {}) : {};
        applyLinkedData(data);
      },
      (snapshotErr) => {
        secureLogger.warn('Telegram real-time snapshot listener fallback:', snapshotErr?.code || snapshotErr?.message);
      }
    );

    return () => unsubscribe();
  }, [user?.uid, checkStatus, applyLinkedData]);

  // Instant re-check on window focus / tab return + 3s poll fallback while waiting for /link verification
  useEffect(() => {
    if (!user || linkStatus?.linked) return undefined;

    const handleResume = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        checkStatus({ silent: true });
      }
    };

    window.addEventListener('focus', handleResume);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleResume);
    }

    const pollInterval = linkCode
      ? setInterval(() => {
          checkStatus({ silent: true });
        }, 3000)
      : null;

    return () => {
      window.removeEventListener('focus', handleResume);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleResume);
      }
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [user, linkCode, linkStatus?.linked, checkStatus]);

  // Countdown timer synced to expiresAt wall clock so backgrounded tabs remain accurate
  useEffect(() => {
    if (!linkCode) return undefined;

    const expiresMs = linkCode.expiresAt ? new Date(linkCode.expiresAt).getTime() : NaN;
    if (!Number.isFinite(expiresMs)) return undefined;

    const updateRemaining = () => {
      const remainingSecs = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
      setCountdown(remainingSecs);
      if (remainingSecs <= 0) {
        setLinkCode(null);
      }
      return remainingSecs;
    };

    updateRemaining();
    const timer = setInterval(() => {
      updateRemaining();
    }, 1000);

    return () => clearInterval(timer);
  }, [linkCode]);

  const generateCode = async () => {
    if (!user) return;
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
    if (!linkCode?.code) return;
    const cleanCode = String(linkCode.code).replace(/[^a-zA-Z0-9_-]/g, '');
    const copyText = `/link ${cleanCode}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyText);
        setCopied(true);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      secureLogger.error('Failed to copy to clipboard', err);
    }
  };

  const handleUnlink = async () => {
    if (!user) return;
    setError(null);
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
        setConfirmUnlink(false);
      } else {
        setError(language === 'en' ? `Failed to unlink (${res.status}). Try again.` : `Gagal memutuskan (${res.status}). Coba lagi.`);
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
          {linkStatus === null ? (
            <>
              <FiRefreshCw size={14} className="spin" />
              {t('checkingStatus')}
            </>
          ) : linkStatus?.error ? (
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
      {linkStatus === null ? null : linkStatus?.error ? (
        <button
          type="button"
          onClick={() => checkStatus()}
          disabled={loading}
          className="telegram-btn telegram-btn-secondary"
        >
          <FiRefreshCw size={16} className={loading ? 'spin' : ''} />
          {language === 'en' ? 'Retry' : 'Coba Lagi'}
        </button>
      ) : linkStatus?.linked ? (
        confirmUnlink ? (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 space-y-2.5">
            <p className="text-xs font-medium text-red-600 dark:text-red-400 text-center">
              {t('unlinkConfirm')}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmUnlink(false)}
                disabled={loading}
                className="telegram-btn telegram-btn-secondary flex-1"
              >
                {language === 'en' ? 'Cancel' : 'Batal'}
              </button>
              <button
                type="button"
                onClick={handleUnlink}
                disabled={loading}
                className="telegram-btn telegram-btn-danger flex-1"
              >
                {loading ? <FiRefreshCw size={14} className="spin" /> : <FaUnlink size={14} />}
                {language === 'en' ? 'Yes, Unlink' : 'Ya, Putuskan'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmUnlink(true)}
            disabled={loading}
            className="telegram-btn telegram-btn-danger"
          >
            <FaUnlink size={16} />
            {t('unlinkTelegram')}
          </button>
        )
      ) : (
        <div className="telegram-link-actions">
          {!linkCode ? (
            <button
              type="button"
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
                <button type="button" className="telegram-copy-btn" title="Copy" aria-label="Copy link command">
                  {copied ? <FiCheck size={16} color="#22c55e" /> : <FiCopy size={16} />}
                </button>
              </div>

              {copied && <p className="telegram-copied-text">✅ {t('copied')}</p>}

              <p className="telegram-code-timer">
                ⏱️ {t('codeExpires')}: <b>{formatCountdown(countdown)}</b>
              </p>

              <button
                type="button"
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
