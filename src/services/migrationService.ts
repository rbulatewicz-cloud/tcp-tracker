import { collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

export const migrateDocuments = async () => {
  const plansSnapshot = await getDocs(collection(db, 'plans'));
  const plans = plansSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  for (const plan of plans as any[]) {
    let needsUpdate = false;
    const updateData: any = { ...plan };

    // Migrate TCPs
    if (plan.approvedTCPs && plan.approvedTCPs.length > 0 && typeof plan.approvedTCPs[0] === 'object' && !plan.approvedTCPs[0].id) {
      updateData.approvedTCPs = plan.approvedTCPs.map((tcp: any, index: number) => ({
        id: `${Date.now()}_${index}`,
        name: tcp.name,
        url: tcp.url,
        version: tcp.rev || index + 1,
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'Migrated'
      }));
      needsUpdate = true;
    }

    // Migrate Log and StatusHistory
    if (plan.log && plan.log.length > 0 && !plan.log[0].uniqueId) {
      const newLog = plan.log.map((entry: any) => ({
        ...entry,
        uniqueId: entry.uniqueId || Date.now().toString() + Math.random()
      }));
      updateData.log = newLog;
      needsUpdate = true;

      if (plan.statusHistory) {
        const newStatusHistory = plan.statusHistory.map((historyEntry: any) => {
          // Try to find matching log entry
          const matchingLog = newLog.find((logEntry: any) => 
            logEntry.action === historyEntry.action &&
            logEntry.date === historyEntry.date &&
            logEntry.user === historyEntry.user
          );
          return {
            ...historyEntry,
            uniqueId: matchingLog ? matchingLog.uniqueId : Date.now().toString() + Math.random()
          };
        });
        updateData.statusHistory = newStatusHistory;
      }
    }

    if (needsUpdate) {
      await updateDoc(doc(db, 'plans', plan.id), updateData);
      console.log(`Migrated plan ${plan.id}`);
    }
  }
  console.log('Migration complete');
};
