/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, Component } from 'react';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc,
  Timestamp,
  getDocFromServer
} from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { useCollection } from 'react-firebase-hooks/firestore';
import { format, subDays, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Camera, 
  Trophy, 
  Printer, 
  Plus, 
  Trash2, 
  Check, 
  X, 
  ChevronRight, 
  ChevronLeft,
  Heart,
  Image as ImageIcon,
  LogOut,
  Bell,
  History,
  Clock,
  Archive,
  RefreshCw
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Capacitor } from '@capacitor/core';
import { Camera as CapCamera } from '@capacitor/camera';

import { auth, db } from './firebase';
import { Photo, View, Tournament, UserProfile } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Error Handling ---

// --- Error Handling & UI Feedback ---

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-rose-50">
          <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-rose-100 text-center space-y-4">
            <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto">
              <X className="w-8 h-8 text-rose-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">문제가 발생했습니다</h2>
            <p className="text-gray-500 text-sm break-all">
              {this.state.error?.message || "알 수 없는 오류가 발생했습니다."}
            </p>
            <Button onClick={() => window.location.reload()} className="w-full">
              새로고침
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const Toast = ({ message, type = 'error', onClose }: { message: string; type?: 'success' | 'error'; onClose: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      className={cn(
        "fixed bottom-24 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-2xl z-50 flex items-center gap-3 border",
        type === 'success' ? "bg-emerald-500 text-white border-emerald-400" : "bg-rose-500 text-white border-rose-400"
      )}
    >
      {type === 'success' ? <Check className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="ml-2 hover:opacity-70">
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo, null, 2));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

const Button = ({ 
  children, 
  className, 
  variant = 'primary', 
  size = 'md',
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}) => {
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm',
    secondary: 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm',
    outline: 'border border-gray-200 text-gray-700 hover:bg-gray-50',
    ghost: 'text-gray-500 hover:bg-gray-100',
    danger: 'bg-rose-500 text-white hover:bg-rose-600 shadow-sm',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  return (
    <button 
      className={cn(
        'rounded-xl font-medium transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div 
    className={cn('bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden', className)}
    {...props}
  >
    {children}
  </div>
);

// --- Main App ---

interface LocalPhoto {
  id: string;
  url: string;
  file: File;
  createdAt: string;
}

export default function App() {
  const [user, loading, error] = useAuthState(auth);
  const [currentView, setCurrentView] = useState<View>('home');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isKingOfKings, setIsKingOfKings] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  
  // Local Gallery State
  const [localPhotos, setLocalPhotos] = useState<LocalPhoto[]>([]);
  const [localSelectedIds, setLocalSelectedIds] = useState<Set<string>>(new Set());

  const showToast = (message: string, type: 'success' | 'error' = 'error') => {
    setToast({ message, type });
  };

  // Firestore Data
  const photosQuery = useMemo(() => {
    if (!user) return null;
    return query(
      collection(db, 'photos'),
      where('userId', '==', user.uid)
    );
  }, [user]);

  const [snapshot, photosLoading, photosError] = useCollection(photosQuery);
  const photos = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Photo)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [snapshot]);

  const tournamentsQuery = useMemo(() => {
    if (!user) return null;
    return query(
      collection(db, 'tournaments'),
      where('userId', '==', user.uid),
      orderBy('completedAt', 'desc')
    );
  }, [user]);

  const [tSnapshot] = useCollection(tournamentsQuery);
  const tournaments = useMemo(() => {
    if (!tSnapshot) return [];
    return tSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Tournament));
  }, [tSnapshot]);

  // User Profile
  useEffect(() => {
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      const updateProfile = async () => {
        try {
          await updateDoc(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
          });
        } catch (e) {
          // If update fails, try create
          try {
            await addDoc(collection(db, 'users'), {
              uid: user.uid,
              email: user.email,
              displayName: user.displayName,
              photoURL: user.photoURL,
              lastNotificationDate: new Date().toISOString()
            });
          } catch (err) {}
        }
      };
      // updateProfile(); // Disabled for now to avoid unnecessary writes
    }
  }, [user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Connection Test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    if (isAuthReady) testConnection();
  }, [isAuthReady]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error('Login failed', err);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading || !isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 font-medium">Bébé Best Shot 로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <Card className="max-w-md w-full p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-indigo-100 rounded-3xl flex items-center justify-center mx-auto">
            <Camera className="w-10 h-10 text-indigo-600" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">베베 베스트 샷</h1>
            <p className="text-gray-500">육아의 소중한 순간들을 기록하고<br />최고의 사진을 골라보세요.</p>
          </div>
          <Button onClick={handleLogin} className="w-full py-4 text-lg">
            Google로 시작하기
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50 pb-24">
        {/* Header */}
        <header className="bg-white border-b border-gray-100 sticky top-0 z-10 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentView('home')}>
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Camera className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-gray-900">Bébé Best</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-gray-900">{user.displayName}</p>
              <p className="text-xs text-gray-500">{user.email}</p>
            </div>
            <Button variant="ghost" onClick={handleLogout} className="p-2">
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </header>

        <main className="max-w-2xl mx-auto p-6 space-y-8">
          {photosLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-400 font-medium">데이터 불러오는 중...</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {currentView === 'home' && (
                <HomeView 
                  photos={photos} 
                  localPhotos={localPhotos}
                  setLocalPhotos={setLocalPhotos}
                  localSelectedIds={localSelectedIds}
                  setLocalSelectedIds={setLocalSelectedIds}
                  setView={setCurrentView} 
                />
              )}
              {currentView === 'upload' && <UploadView user={user} setView={setCurrentView} showToast={showToast} />}
              {currentView === 'selection' && (
                <SelectionView 
                  localPhotos={localPhotos}
                  localSelectedIds={localSelectedIds}
                  setLocalSelectedIds={setLocalSelectedIds}
                  setView={setCurrentView} 
                  showToast={showToast} 
                />
              )}
              {currentView === 'tournament' && (
                <TournamentView 
                  photos={photos} 
                  localPhotos={localPhotos}
                  localSelectedIds={localSelectedIds}
                  setView={setCurrentView} 
                  user={user} 
                />
              )}
              {currentView === 'history' && <HistoryView tournaments={tournaments} setView={setCurrentView} />}
              {currentView === 'print' && <PrintView photos={photos} setView={setCurrentView} showToast={showToast} />}
            </AnimatePresence>
          )}
        </main>

        {/* Bottom Navigation */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-3 flex justify-around items-center z-10 sm:max-w-2xl sm:mx-auto sm:rounded-t-3xl sm:shadow-lg">
          <NavButton active={currentView === 'home'} onClick={() => setCurrentView('home')} icon={<ImageIcon />} label="갤러리" />
          <NavButton active={currentView === 'tournament'} onClick={() => setCurrentView('tournament')} icon={<Trophy />} label="월드컵" />
          <NavButton active={currentView === 'history'} onClick={() => setCurrentView('history')} icon={<History />} label="기록" />
          <NavButton active={currentView === 'print'} onClick={() => setCurrentView('print')} icon={<Printer />} label="인화" />
        </nav>

        <AnimatePresence>
          {toast && (
            <Toast 
              message={toast.message} 
              type={toast.type} 
              onClose={() => setToast(null)} 
            />
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}

const NavButton = ({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) => (
  <button 
    onClick={onClick}
    className={cn(
      'flex flex-col items-center gap-1 transition-colors',
      active ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
    )}
  >
    <div className={cn('p-1 rounded-lg', active && 'bg-indigo-50')}>
      {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-6 h-6' })}
    </div>
    <span className="text-[10px] font-bold uppercase tracking-widest">{label}</span>
  </button>
);

// --- Local Storage (IndexedDB) for Native Feel ---

const DB_NAME = 'BebeBestDB';
const STORE_NAME = 'localPhotos';

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const savePhotoToDB = async (photo: LocalPhoto) => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(photo);
  return tx.oncomplete;
};

const loadPhotosFromDB = async (): Promise<LocalPhoto[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const clearPhotosFromDB = async () => {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).clear();
};

// --- View: Home (Native Gallery Style) ---

const HomeView = ({ 
  localPhotos, 
  setLocalPhotos, 
  localSelectedIds, 
  setLocalSelectedIds, 
  setView 
}: { 
  photos: Photo[]; 
  localPhotos: LocalPhoto[]; 
  setLocalPhotos: (p: LocalPhoto[]) => void; 
  localSelectedIds: Set<string>; 
  setLocalSelectedIds: (s: Set<string>) => void; 
  setView: (v: View) => void; 
}) => {
  // Load persisted photos on mount
  useEffect(() => {
    if (localPhotos.length === 0) {
      loadPhotosFromDB().then(saved => {
        if (saved && saved.length > 0) {
          setLocalPhotos(saved.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        }
      });
    }
  }, []);

  // Native Gallery Access (Capacitor Logic)
  const handleNativeGalleryAccess = async () => {
    if (!Capacitor.isNativePlatform()) {
      console.log("Not a native platform. Using web fallback.");
      return;
    }

    try {
      const images = await CapCamera.pickImages({
        quality: 90,
        limit: 0, // 0 means no limit
      });

      if (images.photos.length === 0) return;

      const newPhotos: LocalPhoto[] = await Promise.all(images.photos.map(async (photo, index) => {
        // In native, we might not have the actual File object easily, 
        // but we have the webPath which we can use for display.
        const id = Math.random().toString(36).substr(2, 9);
        const localPhoto = {
          id,
          url: photo.webPath,
          // We mock the File object for compatibility with existing logic if needed,
          // though for display url is enough.
          file: new File([], `native_${index}.jpg`), 
          createdAt: new Date().toISOString() // Native pickImages doesn't provide original date easily
        };
        await savePhotoToDB(localPhoto);
        return localPhoto;
      }));

      setLocalPhotos([...newPhotos, ...localPhotos].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch (err) {
      console.error("Native gallery access failed", err);
    }
  };

  const handlePhotoAccess = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newPhotos: LocalPhoto[] = await Promise.all(Array.from(files).map(async file => {
      const photo = {
        id: Math.random().toString(36).substr(2, 9),
        url: URL.createObjectURL(file),
        file,
        createdAt: new Date(file.lastModified).toISOString()
      };
      await savePhotoToDB(photo);
      return photo;
    }));

    setLocalPhotos([...newPhotos, ...localPhotos].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  };

  const toggleSelect = (id: string) => {
    const next = new Set(localSelectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setLocalSelectedIds(next);
  };

  const handleClear = async () => {
    if (window.confirm('갤러리를 초기화하시겠습니까?')) {
      await clearPhotosFromDB();
      setLocalPhotos([]);
      setLocalSelectedIds(new Set());
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col min-h-[80vh]"
    >
      {/* Native-style Header */}
      <div className="sticky top-0 bg-white/80 backdrop-blur-xl z-20 px-6 py-4 flex items-center justify-between border-b border-gray-100">
        <div>
          <h2 className="text-2xl font-black text-gray-900">모든 사진</h2>
          <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-tighter">
            {localPhotos.length > 0 ? `${localPhotos.length}장의 사진` : '탭하여 사진 불러오기'}
          </p>
        </div>
        {localPhotos.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="relative">
              {Capacitor.isNativePlatform() ? (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="p-2"
                  onClick={handleNativeGalleryAccess}
                >
                  <Plus className="w-5 h-5" />
                </Button>
              ) : (
                <>
                  <input 
                    type="file" 
                    accept="image/*" 
                    multiple 
                    onChange={handlePhotoAccess}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <Button variant="ghost" size="sm" className="p-2">
                    <Plus className="w-5 h-5" />
                  </Button>
                </>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={handleClear} className="p-2 text-rose-500">
              <Trash2 className="w-5 h-5" />
            </Button>
          </div>
        )}
      </div>

      {/* Gallery Grid */}
      {localPhotos.length === 0 ? (
        <div className="flex-1 relative">
          {Capacitor.isNativePlatform() ? (
            <div 
              onClick={handleNativeGalleryAccess}
              className="absolute inset-0 cursor-pointer z-10"
            />
          ) : (
            <input 
              type="file" 
              accept="image/*" 
              multiple 
              onChange={handlePhotoAccess}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center space-y-6">
            <div className="w-32 h-32 bg-indigo-50 rounded-full flex items-center justify-center">
              <ImageIcon className="w-16 h-16 text-indigo-200" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-gray-900">갤러리가 비어있습니다</h3>
              <p className="text-gray-500 text-sm">화면을 아무데나 탭하여<br />내 폰의 사진을 바로 불러오세요.</p>
              {Capacitor.isNativePlatform() && (
                <p className="text-[10px] text-indigo-600 font-bold mt-4 animate-pulse">
                  네이티브 갤러리 권한을 요청합니다.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-0.5 pt-0.5 pb-32">
          {localPhotos.map(photo => {
            const isSelected = localSelectedIds.has(photo.id);
            return (
              <motion.div 
                key={photo.id}
                whileTap={{ scale: 0.9 }}
                onClick={() => toggleSelect(photo.id)}
                className="relative aspect-square cursor-pointer overflow-hidden"
              >
                <img 
                  src={photo.url} 
                  alt="Gallery" 
                  className={cn(
                    "w-full h-full object-cover transition-all duration-500",
                    isSelected ? "scale-75 rounded-3xl brightness-75 shadow-2xl" : "brightness-100"
                  )} 
                  referrerPolicy="no-referrer" 
                />
                <div className={cn(
                  "absolute top-2 right-2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                  isSelected ? "bg-indigo-600 border-indigo-600 scale-110" : "bg-black/20 border-white/50"
                )}>
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Floating Action Bar */}
      <AnimatePresence>
        {localSelectedIds.size >= 2 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-28 left-6 right-6 z-30"
          >
            <button 
              onClick={() => setView('tournament')}
              className="w-full bg-gray-900 text-white py-5 rounded-3xl font-black text-lg shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-transform"
            >
              <Trophy className="w-6 h-6 text-amber-400" />
              <span>{localSelectedIds.size}명의 아이 월드컵 시작</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// --- View: Upload ---

const UploadView = ({ user, setView, showToast }: { user: any; setView: (v: View) => void; showToast: (m: string, t?: 'success' | 'error') => void }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 1000;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Compress to JPEG with 0.7 quality to stay under 1MB
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          resolve(dataUrl);
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);
    const total = files.length;
    let count = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const base64 = await compressImage(file);
        
        await addDoc(collection(db, 'photos'), {
          userId: user.uid,
          url: base64,
          createdAt: new Date().toISOString(),
          status: 'candidate',
          printStatus: 'none'
        });
        
        count++;
        setUploadProgress(Math.round((count / total) * 100));
      }
      
      showToast(`${total}장의 사진이 갤러리에서 추가되었습니다!`, 'success');
      setView('selection');
    } catch (err: any) {
      console.error('Upload failed:', err);
      showToast('사진 업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">갤러리 연결</h2>
        <p className="text-gray-500 text-sm">기기 갤러리에서 소중한 아이 사진을 선택해 가져오세요.</p>
      </div>

      <Card className="p-8 border-2 border-dashed border-indigo-200 bg-indigo-50/30 text-center space-y-6">
        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm">
          <ImageIcon className="w-10 h-10 text-indigo-600" />
        </div>
        
        <div className="space-y-2">
          <p className="font-bold text-gray-900 text-lg">사진 선택하기</p>
          <p className="text-gray-500 text-sm">여러 장의 사진을 한꺼번에 선택할 수 있습니다.</p>
        </div>

        <div className="relative">
          <input 
            type="file" 
            accept="image/*" 
            multiple 
            onChange={handleFileChange}
            disabled={isUploading}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <Button className="w-full py-4 text-lg" disabled={isUploading}>
            {isUploading ? `업로드 중 (${uploadProgress}%)` : '갤러리 열기'}
          </Button>
        </div>

        {isUploading && (
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <motion.div 
              className="bg-indigo-600 h-full"
              initial={{ width: 0 }}
              animate={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
      </Card>

      <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 flex gap-3">
        <Bell className="w-5 h-5 text-amber-600 shrink-0" />
        <p className="text-xs text-amber-700 leading-relaxed">
          <strong>팁:</strong> 최근 찍은 사진부터 순서대로 보여집니다. <br />
          한 번에 너무 많은 사진(20장 이상)을 올리면 시간이 걸릴 수 있습니다.
        </p>
      </div>
    </motion.div>
  );
};

// --- View: Selection (Daily Picker) ---

const SelectionView = ({ 
  localPhotos, 
  localSelectedIds, 
  setLocalSelectedIds, 
  setView, 
  showToast 
}: { 
  localPhotos: LocalPhoto[]; 
  localSelectedIds: Set<string>; 
  setLocalSelectedIds: (ids: Set<string>) => void; 
  setView: (v: View) => void; 
  showToast: (m: string, t?: 'success' | 'error') => void; 
}) => {
  const candidates = useMemo(() => localPhotos.filter(p => !localSelectedIds.has(p.id)), [localPhotos, localSelectedIds]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Clamp index if list shrinks
  useEffect(() => {
    if (currentIndex >= candidates.length && candidates.length > 0) {
      setCurrentIndex(Math.max(0, candidates.length - 1));
    }
  }, [candidates.length, currentIndex]);

  const currentPhoto = candidates[currentIndex];

  const handleDecision = async (status: 'selected' | 'rejected') => {
    if (!currentPhoto || isProcessing) return;
    
    setIsProcessing(true);
    const photoId = currentPhoto.id;
    if (!photoId) {
      console.error('Invalid photo ID:', photoId);
      showToast('사진 정보를 불러올 수 없습니다.');
      setIsProcessing(false);
      return;
    }
    const path = `photos/${photoId}`;
    try {
      await updateDoc(doc(db, 'photos', photoId), {
        status,
        selectionDate: new Date().toISOString()
      });
      showToast(`사진이 ${status === 'selected' ? '선택' : '제외'}되었습니다!`, 'success');
    } catch (err: any) {
      console.error('Decision update failed:', err);
      try {
        handleFirestoreError(err, OperationType.UPDATE, path);
      } catch (formattedErr: any) {
        showToast(formattedErr.message);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (candidates.length === 0) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-20 space-y-6"
      >
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <Check className="w-10 h-10 text-emerald-600" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-gray-900">모두 확인했습니다!</h2>
          <p className="text-gray-500">새로운 사진을 추가하거나<br />월드컵을 시작해보세요.</p>
        </div>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => setView('home')}>홈으로</Button>
          <Button onClick={() => setView('tournament')}>월드컵 시작</Button>
        </div>
      </motion.div>
    );
  }

  if (!currentPhoto) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">베스트 샷 고르기</h2>
        <span className="text-sm font-bold text-gray-400">{currentIndex + 1} / {candidates.length}</span>
      </div>

      <div className="relative aspect-[3/4] rounded-3xl overflow-hidden shadow-2xl bg-gray-200">
        <AnimatePresence mode="wait">
          <motion.img 
            key={currentPhoto.id}
            src={currentPhoto.url} 
            alt="Candidate" 
            className="w-full h-full object-cover"
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3 }}
            referrerPolicy="no-referrer"
          />
        </AnimatePresence>
        
        <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/60 to-transparent flex justify-center gap-6">
          <button 
            onClick={() => handleDecision('rejected')}
            disabled={isProcessing}
            className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-rose-500 transition-colors border border-white/30 disabled:opacity-50"
          >
            <X className="w-8 h-8" />
          </button>
          <button 
            onClick={() => handleDecision('selected')}
            disabled={isProcessing}
            className="w-20 h-20 bg-white rounded-full flex items-center justify-center text-indigo-600 hover:bg-indigo-50 transition-colors shadow-xl disabled:opacity-50"
          >
            {isProcessing ? (
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Heart className="w-10 h-10 fill-current" />
            )}
          </button>
        </div>
      </div>

      <p className="text-center text-gray-400 text-sm font-medium italic">
        "이 사진을 인화 후보로 올릴까요?"
      </p>
    </motion.div>
  );
};

// --- View: Tournament (Ideal Type World Cup) ---

// --- View: Tournament (Ideal Type World Cup) ---

const TournamentView = ({ 
  photos, 
  localPhotos, 
  localSelectedIds, 
  setView, 
  user 
}: { 
  photos: Photo[]; 
  localPhotos: LocalPhoto[]; 
  localSelectedIds: Set<string>; 
  setView: (v: View) => void; 
  user: any 
}) => {
  const [isKingOfKings, setIsKingOfKings] = useState(false);
  const [round, setRound] = useState<any[]>([]);
  const [nextRound, setNextRound] = useState<any[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [winner, setWinner] = useState<any | null>(null);
  const [started, setStarted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const startTournament = (kingMode: boolean = false) => {
    let pool: any[] = [];
    if (kingMode) {
      pool = photos.filter(p => p.isTournamentWinner);
    } else {
      // Use local selected photos if available, otherwise fallback to firestore selected
      if (localSelectedIds.size > 0) {
        pool = localPhotos.filter(p => localSelectedIds.has(p.id));
      } else {
        pool = photos.filter(p => p.status === 'selected');
      }
    }

    if (pool.length < 2) return;
    
    setIsKingOfKings(kingMode);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setRound(shuffled);
    setNextRound([]);
    setMatchIndex(0);
    setWinner(null);
    setStarted(true);
  };

  const handlePick = async (picked: any) => {
    const newNextRound = [...nextRound, picked];
    
    if (matchIndex + 2 >= round.length) {
      if (newNextRound.length === 1) {
        setWinner(newNextRound[0]);
        setIsSaving(true);
        try {
          // Only save to firestore if it's a "real" photo or if we want to persist winners
          await addDoc(collection(db, 'tournaments'), {
            userId: user.uid,
            winnerPhotoId: newNextRound[0].id,
            winnerPhotoUrl: newNextRound[0].url,
            completedAt: new Date().toISOString(),
            type: isKingOfKings ? 'king_of_kings' : 'normal'
          });
          
          // If it's a firestore photo, mark it as winner
          if (newNextRound[0].userId) {
            await updateDoc(doc(db, 'photos', newNextRound[0].id), {
              isTournamentWinner: true
            });
          }
        } catch (err) {
          console.error('Failed to save tournament winner:', err);
        } finally {
          setIsSaving(false);
        }
      } else {
        if (round.length % 2 !== 0) {
          newNextRound.push(round[round.length - 1]);
        }
        setRound(newNextRound);
        setNextRound([]);
        setMatchIndex(0);
      }
    } else {
      setNextRound(newNextRound);
      setMatchIndex(matchIndex + 2);
    }
  };

  if (!started) {
    const normalPool = localSelectedIds.size > 0 
      ? localPhotos.filter(p => localSelectedIds.has(p.id))
      : photos.filter(p => p.status === 'selected');
    const kingPool = photos.filter(p => p.isTournamentWinner);

    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-12 space-y-8"
      >
        <div className="w-24 h-24 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
          <Trophy className="w-12 h-12 text-amber-600" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-gray-900">이상형 월드컵</h2>
          <p className="text-gray-500">최고의 사진을 뽑아보세요!</p>
        </div>
        
        <div className="grid gap-4">
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-left">
                <h3 className="font-bold text-gray-900">일반 월드컵</h3>
                <p className="text-xs text-gray-500">선택된 사진 {normalPool.length}장 대상</p>
              </div>
              <Trophy className="w-5 h-5 text-amber-500" />
            </div>
            <Button 
              disabled={normalPool.length < 2}
              onClick={() => startTournament(false)} 
              className="w-full bg-amber-500 hover:bg-amber-600"
            >
              시작하기
            </Button>
          </Card>

          <Card className="p-6 space-y-4 border-indigo-100 bg-indigo-50/30">
            <div className="flex items-center justify-between">
              <div className="text-left">
                <h3 className="font-bold text-indigo-900">왕중왕전</h3>
                <p className="text-xs text-indigo-500">역대 우승작 {kingPool.length}장 대상</p>
              </div>
              <History className="w-5 h-5 text-indigo-500" />
            </div>
            <Button 
              disabled={kingPool.length < 2}
              onClick={() => startTournament(true)} 
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              왕중왕전 시작
            </Button>
          </Card>
        </div>

        <Button variant="ghost" onClick={() => setView('history')} className="w-full">
          역대 우승 기록 보기
        </Button>
      </motion.div>
    );
  }

  if (winner) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center space-y-8"
      >
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-gray-900">{isKingOfKings ? '왕중왕 탄생! 👑' : '우승작 탄생! 🎉'}</h2>
          <p className="text-gray-500">오늘의 최종 베스트 샷입니다.</p>
        </div>
        
        <div className="relative aspect-[3/4] rounded-3xl overflow-hidden shadow-2xl ring-8 ring-amber-400">
          <img src={winner.url} alt="Winner" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          <div className="absolute top-4 left-4 bg-amber-400 text-white px-4 py-1 rounded-full font-bold shadow-lg">
            {isKingOfKings ? 'KING OF KINGS' : 'WINNER'}
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => setStarted(false)}>다시 하기</Button>
          <Button className="flex-1" onClick={() => setView('print')}>인화 목록 확인</Button>
        </div>
      </motion.div>
    );
  }

  const p1 = round[matchIndex];
  const p2 = round[matchIndex + 1];

  if (!p2) {
    handlePick(p1);
    return null;
  }

  const roundName = round.length === 2 ? '결승전' : round.length === 4 ? '4강' : `${round.length}강`;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="text-center space-y-1">
        <h2 className="text-2xl font-bold text-indigo-600">{roundName}</h2>
        <p className="text-gray-400 text-sm font-bold uppercase tracking-widest">어떤 사진이 더 마음에 드나요?</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {[p1, p2].map((p, i) => (
          <motion.div 
            key={p.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handlePick(p)}
            className="relative aspect-[4/3] rounded-2xl overflow-hidden shadow-lg cursor-pointer group"
          >
            <img src={p.url} alt="VS" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <div className="opacity-0 group-hover:opacity-100 bg-white text-indigo-600 px-6 py-2 rounded-full font-bold shadow-xl transition-opacity">
                선택하기
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-4 py-4">
        <div className="h-px bg-gray-200 flex-1"></div>
        <span className="text-gray-300 font-black italic text-2xl">VS</span>
        <div className="h-px bg-gray-200 flex-1"></div>
      </div>
    </motion.div>
  );
};

const HistoryView = ({ tournaments, setView }: { tournaments: Tournament[]; setView: (v: View) => void }) => {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">역대 우승 기록</h2>
        <Button variant="ghost" onClick={() => setView('tournament')}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      {tournaments.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
          <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-400">아직 우승 기록이 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {tournaments.map((t) => (
            <Card key={t.id} className="relative aspect-[3/4] group">
              <img src={t.winnerPhotoUrl} alt="Winner" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-100 group-hover:opacity-90 transition-opacity" />
              <div className="absolute bottom-3 left-3 right-3 text-white">
                <div className="flex items-center gap-1 mb-1">
                  {t.type === 'king_of_kings' ? (
                    <span className="text-[10px] bg-indigo-600 px-1.5 py-0.5 rounded-full font-bold">KING</span>
                  ) : (
                    <Trophy className="w-3 h-3 text-amber-400" />
                  )}
                  <span className="text-[10px] opacity-70">{format(new Date(t.completedAt), 'yy.MM.dd')}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

// --- View: Print ---

const PrintView = ({ photos, setView, showToast }: { photos: Photo[]; setView: (v: View) => void; showToast: (m: string, t?: 'success' | 'error') => void }) => {
  const pendingPhotos = photos.filter(p => p.status === 'selected' && p.printStatus !== 'ordered');
  const orderedPhotos = photos.filter(p => p.printStatus === 'ordered');
  const [showHistory, setShowHistory] = useState(false);

  const handleRemove = async (id: string) => {
    if (!id) return;
    try {
      await updateDoc(doc(db, 'photos', id), { status: 'rejected' });
      showToast('목록에서 제거되었습니다.', 'success');
    } catch (err: any) {
      console.error('Remove failed:', err);
      showToast('제거에 실패했습니다.');
    }
  };

  const handleCompleteOrder = async () => {
    if (pendingPhotos.length === 0) return;
    try {
      const promises = pendingPhotos.map(p => 
        updateDoc(doc(db, 'photos', p.id), { printStatus: 'ordered' })
      );
      await Promise.all(promises);
      showToast('인화 요청이 완료되었습니다! 과거 이력으로 이동합니다.', 'success');
    } catch (err) {
      console.error('Order completion failed:', err);
      showToast('요청 처리 중 오류가 발생했습니다.');
    }
  };

  const displayPhotos = showHistory ? orderedPhotos : pendingPhotos;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">{showHistory ? '인화 완료 이력' : '인화 대기 목록'}</h2>
        <Button variant="ghost" onClick={() => setShowHistory(!showHistory)}>
          {showHistory ? <Plus className="w-5 h-5" /> : <Archive className="w-5 h-5" />}
        </Button>
      </div>

      {displayPhotos.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
          <Printer className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-400">{showHistory ? '인화 이력이 없습니다.' : '인화할 사진이 없습니다.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {displayPhotos.map((photo) => (
            <Card key={photo.id} className="relative aspect-[3/4] group">
              <img src={photo.url} alt="Print" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              {!showHistory && (
                <button 
                  onClick={() => handleRemove(photo.id)}
                  className="absolute top-2 right-2 w-8 h-8 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </Card>
          ))}
        </div>
      )}

      {!showHistory && pendingPhotos.length > 0 && (
        <Button onClick={handleCompleteOrder} className="w-full py-4 bg-emerald-500 hover:bg-emerald-600">
          인화 요청 완료하기
        </Button>
      )}
    </div>
  );
};
