import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { AppNotification } from '../types';
import { markNotificationRead, markAllNotificationsRead } from '../services/notificationService';

const MAX_NOTIFICATIONS = 50;

export interface UseNotificationsResult {
  notifications: AppNotification[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

export function useNotifications(userEmail: string | null | undefined): UseNotificationsResult {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!userEmail) {
      setNotifications([]);
      return;
    }

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userEmail),
      orderBy('createdAt', 'desc'),
      limit(MAX_NOTIFICATIONS),
    );

    const unsub = onSnapshot(q, snap => {
      const items: AppNotification[] = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
      } as AppNotification));
      setNotifications(items);
    }, () => {
      // Silently fail — notifications are non-critical
    });

    return unsub;
  }, [userEmail]);

  const markRead = useCallback((id: string) => {
    // Optimistic update
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    markNotificationRead(id);
  }, []);

  const markAllRead = useCallback(() => {
    if (!userEmail) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    markAllNotificationsRead(userEmail);
  }, [userEmail]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, unreadCount, markRead, markAllRead };
}
