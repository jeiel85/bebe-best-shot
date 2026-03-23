export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  lastNotificationDate?: string;
}

export interface Photo {
  id: string;
  userId: string;
  url: string;
  createdAt: string; // ISO string
  status: 'candidate' | 'selected' | 'rejected';
  selectionDate?: string; // ISO string
  isTournamentWinner?: boolean;
  printStatus?: 'none' | 'pending' | 'ordered';
}

export interface Tournament {
  id: string;
  userId: string;
  winnerPhotoId: string;
  winnerPhotoUrl: string;
  completedAt: string;
  type: 'normal' | 'king_of_kings';
}

export type View = 'home' | 'upload' | 'selection' | 'tournament' | 'print' | 'history';
