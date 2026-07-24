import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function readStoredName() {
  return localStorage.getItem('blueprintUserName') || 'Account';
}

export default function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [name, setName] = useState(readStoredName);
  const [email, setEmail] = useState('Manage your BluPrint profile');
  const [nameDraft, setNameDraft] = useState(readStoredName);
  const [birthdayDraft, setBirthdayDraft] = useState(
    () => localStorage.getItem('blueprintUserBirthday') || '',
  );
  const [saveStatus, setSaveStatus] = useState('');
  const [popupPos, setPopupPos] = useState({ top: 64, right: 12 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  useEffect(() => {
    if (!open) return;

    const placePopup = () => {
      const anchor = btnRef.current ?? wrapRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setPopupPos({
        top: Math.round(rect.bottom + 12),
        right: Math.max(12, Math.round(window.innerWidth - rect.right)),
      });
    };

    placePopup();
    window.addEventListener('resize', placePopup);
    window.addEventListener('scroll', placePopup, true);
    return () => {
      window.removeEventListener('resize', placePopup);
      window.removeEventListener('scroll', placePopup, true);
    };
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const { auth, isFirebaseConfigured } = await import('../../firebase.mjs');
        const { onAuthStateChanged } = await import('firebase/auth');
        if (!isFirebaseConfigured?.() || !auth) return;
        unsub = onAuthStateChanged(auth, (user) => {
          if (cancelled || !user) return;
          const nextName = user.displayName || localStorage.getItem('blueprintUserName') || user.email?.split('@')[0] || 'Account';
          localStorage.setItem('blueprintUserName', nextName);
          setName(nextName);
          setEmail(user.email || 'Manage your BluPrint profile');
          setNameDraft(nextName);
        });
      } catch {
        /* firebase optional on this page */
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const openSettings = () => {
    setNameDraft(localStorage.getItem('blueprintUserName') || name || '');
    setBirthdayDraft(localStorage.getItem('blueprintUserBirthday') || '');
    setSaveStatus('');
    setOpen(false);
    setSettingsOpen(true);
  };

  const saveSettings = async () => {
    const next = nameDraft.trim();
    try {
      if (next) {
        localStorage.setItem('blueprintUserName', next);
        setName(next);
        try {
          const { auth } = await import('../../firebase.mjs');
          const { updateProfile } = await import('firebase/auth');
          if (auth?.currentUser) await updateProfile(auth.currentUser, { displayName: next });
        } catch { /* ignore */ }
      }
      if (birthdayDraft) localStorage.setItem('blueprintUserBirthday', birthdayDraft);
      setSaveStatus('Saved!');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (err) {
      setSaveStatus(err instanceof Error ? `Error: ${err.message}` : 'Error saving');
    }
  };

  const signOutUser = async () => {
    try {
      const { auth } = await import('../../firebase.mjs');
      const { signOut } = await import('firebase/auth');
      if (auth) await signOut(auth);
    } catch { /* ignore */ }
    window.location.href = '/login.html';
  };

  const popup = (
    <div
      ref={popupRef}
      className={`profile-popup profile-popup-fixed${open ? '' : ' hidden'}`}
      role="menu"
      style={{
        top: popupPos.top,
        right: popupPos.right,
        ['--profile-popup-top' as string]: `${popupPos.top}px`,
        ['--profile-popup-right' as string]: `${popupPos.right}px`,
      }}
    >
      <div className="profile-popup-header">
        <div className="profile-popup-avatar" aria-hidden="true">
          <iconify-icon icon="ph:user" />
        </div>
        <div className="profile-popup-identity">
          <p className="profile-popup-name">{name}</p>
          <p className="profile-popup-email">{email}</p>
        </div>
      </div>
      <div className="profile-popup-section">
        <p className="profile-popup-label">Account</p>
        <button type="button" className="profile-popup-item" role="menuitem" onClick={openSettings}>
          <span className="profile-popup-item-icon"><iconify-icon icon="ph:gear-duotone" /></span>
          <span className="profile-popup-item-copy">
            <strong>Settings</strong>
            <small>Name, birthday &amp; preferences</small>
          </span>
        </button>
      </div>
      <div className="profile-popup-footer">
        <button type="button" className="profile-popup-item profile-popup-item-danger" role="menuitem" onClick={signOutUser}>
          <span className="profile-popup-item-icon"><iconify-icon icon="ph:sign-out-duotone" /></span>
          <span className="profile-popup-item-copy">
            <strong>Sign out</strong>
            <small>Come back anytime</small>
          </span>
        </button>
      </div>
    </div>
  );

  const settings = (
    <div
      className={`settings-overlay${settingsOpen ? '' : ' hidden'}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) setSettingsOpen(false);
      }}
    >
      <div className="settings-modal">
        <button
          type="button"
          className="settings-modal-close"
          aria-label="Close settings"
          onClick={() => setSettingsOpen(false)}
        >
          <iconify-icon icon="ph:x-bold" />
        </button>
        <h2>Settings</h2>
        <p style={{ color: 'var(--bp-muted)', fontSize: 14, margin: '0 0 24px' }}>
          Update your profile details.
        </p>
        <div className="settings-field">
          <label htmlFor="result-settings-name">Display name</label>
          <input
            id="result-settings-name"
            type="text"
            placeholder="Your name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
          />
        </div>
        <div className="settings-field">
          <label htmlFor="result-settings-birthday">Birthday</label>
          <input
            id="result-settings-birthday"
            type="date"
            value={birthdayDraft}
            onChange={(e) => setBirthdayDraft(e.target.value)}
          />
        </div>
        <button type="button" className="settings-save-btn" onClick={saveSettings}>
          Save changes
        </button>
        <span className="settings-save-status">{saveStatus}</span>
        <hr className="settings-divider" />
        <div className="settings-contact">
          <h3>Need help?</h3>
          <ul>
            <li><strong>Aditi Amarnath</strong> — <a href="mailto:aamarnath@wisc.edu">aamarnath@wisc.edu</a></li>
            <li><strong>Nidhi Gandhi</strong> — <a href="mailto:nvgandhi@wisc.edu">nvgandhi@wisc.edu</a></li>
            <li><strong>Prisha Agarwalla</strong> — <a href="mailto:prishaagarwalla50@gmail.com">prishaagarwalla50@gmail.com</a></li>
            <li><strong>Saanvi Gandhari</strong> — <a href="mailto:saanvi.gandhari@gmail.com">saanvi.gandhari@gmail.com</a></li>
          </ul>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="profile-menu-wrap" ref={wrapRef}>
        <button
          ref={btnRef}
          type="button"
          className="profile-btn"
          aria-label="Account menu"
          aria-haspopup="true"
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          <iconify-icon icon="ph:user" />
        </button>
      </div>
      {typeof document !== 'undefined' && createPortal(popup, document.body)}
      {typeof document !== 'undefined' && createPortal(settings, document.body)}
    </>
  );
}
