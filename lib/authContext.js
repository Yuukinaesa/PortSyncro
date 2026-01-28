// lib/authContext.js
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'next/router';
import { secureLogger } from './security';

// Session constants
const SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 3 months in milliseconds
const SESSION_KEY = 'portsyncro_session';

// Helper function to clean undefined values from objects
const cleanUndefinedValues = (obj) => {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefinedValues(item)).filter(item => item !== null);
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = cleanUndefinedValues(value);
    }
  }
  return cleaned;
};

// Generate a unique session ID
const generateSessionId = () => {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
};

// Buat context
const AuthContext = createContext();

// Provider component
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const router = useRouter();

  // Check session validity
  const checkSessionValidity = useCallback(async (currentUser) => {
    if (!currentUser) return false;

    try {
      // Check local session first
      const localSession = localStorage.getItem(SESSION_KEY);
      if (localSession) {
        const session = JSON.parse(localSession);
        const sessionAge = Date.now() - session.loginTime;

        // Check if session is expired (3 months)
        if (sessionAge > SESSION_MAX_AGE_MS) {
          secureLogger.log('Session expired after 3 months, logging out');
          setSessionExpired(true);
          return false;
        }

        // Check Firestore for session invalidation
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          const invalidatedBefore = userData.sessionsInvalidatedAt;

          // If sessions were invalidated after this session was created, logout
          if (invalidatedBefore && session.loginTime < new Date(invalidatedBefore).getTime()) {
            secureLogger.log('Session invalidated by logoutAllSessions');
            setSessionExpired(true);
            return false;
          }
        }
      } else {
        // No local session - create one (new login)
        const newSession = {
          sessionId: generateSessionId(),
          loginTime: Date.now(),
          userId: currentUser.uid
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));

        // Update Firestore with last login time
        const userDocRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userDocRef, {
          lastLoginAt: new Date().toISOString(),
          lastSessionId: newSession.sessionId
        }).catch(() => {
          // If doc doesn't exist, setDoc
          setDoc(userDocRef, {
            email: currentUser.email,
            lastLoginAt: new Date().toISOString(),
            lastSessionId: newSession.sessionId,
            createdAt: new Date().toISOString()
          }, { merge: true });
        });
      }

      return true;
    } catch (error) {
      secureLogger.error('Error checking session validity:', error);
      return true; // Allow access on error to not block users
    }
  }, []);

  // Effect untuk memantau status autentikasi
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const isValid = await checkSessionValidity(currentUser);
        if (!isValid) {
          // Session invalid, sign out
          await signOut(auth);
          localStorage.removeItem(SESSION_KEY);
          setUser(null);
          setLoading(false);
          return;
        }
      }
      setUser(currentUser);
      setLoading(false);
    });

    // Timeout untuk mencegah loading yang terlalu lama
    const timeoutId = setTimeout(() => {
      setLoading(currentLoading => {
        if (currentLoading) {
          secureLogger.log("Auth loading timed out - forcing loading completion");
          return false;
        }
        return currentLoading;
      });
    }, process.env.NODE_ENV === 'production' ? 5000 : 3000);

    // Bersihkan listener saat komponen unmount
    return () => {
      unsubscribe();
      clearTimeout(timeoutId);
    };
  }, [checkSessionValidity]);

  // Fungsi untuk logout
  const logout = useCallback(async () => {
    try {
      localStorage.removeItem(SESSION_KEY);
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      secureLogger.error("Error signing out:", error);
    }
  }, [router]);

  // Fungsi untuk logout all sessions
  const logoutAllSessions = useCallback(async () => {
    if (!user) return false;

    try {
      // Update Firestore to invalidate all sessions
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        sessionsInvalidatedAt: new Date().toISOString()
      });

      // Clear local session
      localStorage.removeItem(SESSION_KEY);

      // Sign out current session
      await signOut(auth);
      router.push('/login');

      secureLogger.log('All sessions logged out successfully');
      return true;
    } catch (error) {
      secureLogger.error("Error logging out all sessions:", error);
      return false;
    }
  }, [user, router]);

  // Fungsi untuk mengambil data portfolio user
  const getUserPortfolio = useCallback(async () => {
    if (!user) return { stocks: [], crypto: [] };

    try {
      // Referensi ke dokumen user
      const docRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        // Dokumen ditemukan, ambil data assets
        const userData = docSnap.data();
        return userData.assets || { stocks: [], crypto: [] };
      } else {
        // Dokumen tidak ditemukan, buat baru
        await setDoc(docRef, {
          email: user.email,
          createdAt: new Date().toISOString(),
          assets: { stocks: [], crypto: [] }
        });
        return { stocks: [], crypto: [] };
      }
    } catch (error) {
      secureLogger.error("Error getting portfolio:", error);
      return { stocks: [], crypto: [] };
    }
  }, [user]);



  // Fungsi untuk menyimpan data portfolio
  const saveUserPortfolio = useCallback(async (assets) => {
    if (!user) return false;

    // Define docRef outside try block so it's accessible in catch
    const docRef = doc(db, "users", user.uid);

    try {
      // Clean undefined values before saving
      const cleanedAssets = cleanUndefinedValues(assets);

      await updateDoc(docRef, {
        assets: cleanedAssets,
        updatedAt: new Date().toISOString()
      });
      return true;
    } catch (error) {
      secureLogger.error("Error saving portfolio:", error);

      // Jika error karena dokumen belum ada, coba buat baru
      // Check both possible error codes for 'document not found'
      if (error.code === 'not-found' || error.code === 'permission-denied') {
        try {
          const cleanedAssets = cleanUndefinedValues(assets);
          await setDoc(docRef, {
            email: user.email,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            assets: cleanedAssets
          });
          return true;
        } catch (setDocError) {
          secureLogger.error("Error creating new document:", setDocError);
          return false;
        }
      }
      return false;
    }
  }, [user]);

  // Nilai context yang akan disediakan
  const value = {
    user,
    loading,
    logout,
    logoutAllSessions,
    sessionExpired,
    getUserPortfolio,
    saveUserPortfolio
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook untuk menggunakan context
export function useAuth() {
  return useContext(AuthContext);
}