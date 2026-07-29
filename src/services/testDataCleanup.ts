import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { writeGlobalLog } from './logService';
import { Plan } from '../types';

// Firestore batch operation limit
const BATCH_CHUNK_SIZE = 500;

/** Test data patterns to match and delete */
const TEST_PATTERNS = {
  // LOC IDs
  locIds: ['LOC-TEST', 'LOC-test2', 'loc-test', 'LOC-test'],
  // Street addresses
  streetPatterns: ['1234 abc', '1234 ABC'],
  // Contact names
  contactPatterns: ['Test Contact', 'Test'],
  // Email addresses
  emailPatterns: ['r.bulatewicz@gmail.com'],
};

/** Check if a plan matches any test data pattern */
function isTestData(plan: Plan): boolean {
  const locId = (plan.id || plan.loc || '').toLowerCase();
  const street1 = (plan.street1 || '').toLowerCase();
  const street2 = (plan.street2 || '').toLowerCase();
  const requestedBy = (plan.requestedBy || '').toLowerCase();

  // Check LOC ID
  if (TEST_PATTERNS.locIds.some(id => locId.includes(id.toLowerCase()))) {
    return true;
  }

  // Check street address
  if (TEST_PATTERNS.streetPatterns.some(p =>
    street1.includes(p.toLowerCase()) || street2.includes(p.toLowerCase())
  )) {
    return true;
  }

  // Check requestedBy (user email that may have created test records)
  if (TEST_PATTERNS.emailPatterns.some(p =>
    requestedBy.includes(p.toLowerCase())
  )) {
    return true;
  }

  return false;
}

/**
 * Find all test data records in the plans collection.
 * Returns array of plans that match test data patterns.
 */
export async function findTestDataPlans(): Promise<Plan[]> {
  try {
    const plansRef = collection(db, 'plans');
    const snapshot = await getDocs(plansRef);

    const testPlans: Plan[] = [];
    snapshot.docs.forEach(docSnap => {
      const plan = docSnap.data() as Plan;
      if (isTestData(plan)) {
        testPlans.push({ ...plan, id: docSnap.id });
      }
    });

    return testPlans;
  } catch (error) {
    console.error('Error finding test data:', error);
    throw error;
  }
}

/**
 * Delete all test data records from Firestore.
 * Returns count of deleted records.
 */
export async function deleteTestData(): Promise<{ count: number; deletedRecords: Array<{ id: string; loc: string; street: string }> }> {
  try {
    const testPlans = await findTestDataPlans();

    if (testPlans.length === 0) {
      console.log('No test data records found.');
      return { count: 0, deletedRecords: [] };
    }

    const deletedRecords: Array<{ id: string; loc: string; street: string }> = [];

    // Process in chunks to handle Firestore batch limits
    for (let i = 0; i < testPlans.length; i += BATCH_CHUNK_SIZE) {
      const chunk = testPlans.slice(i, i + BATCH_CHUNK_SIZE);
      const batch = writeBatch(db);

      for (const plan of chunk) {
        const street = [plan.street1, plan.street2].filter(Boolean).join(' / ');
        const loc = plan.loc || plan.id || 'UNKNOWN';

        // Record deletion in global log before deleting
        try {
          await writeGlobalLog(
            `Test Data Deleted: ${loc}`,
            'plan',
            loc,
            plan.id || 'UNKNOWN',
            'plan',
            loc,
            {
              deletedPlanStage: plan.stage,
              deletedPlanStreet: street,
              deletedPlanRequestedBy: plan.requestedBy || '',
              deletionReason: 'Automated test data cleanup',
            },
          );
        } catch (logError) {
          console.warn(`Failed to log deletion for ${plan.id}:`, logError);
        }

        // Queue deletion in batch
        batch.delete(doc(db, 'plans', plan.id || 'UNKNOWN'));
        deletedRecords.push({ id: plan.id || 'UNKNOWN', loc, street });
      }

      // Commit batch
      await batch.commit();
      console.log(`Committed batch of ${chunk.length} test data deletions.`);
    }

    console.log(`Test data cleanup complete. Deleted ${testPlans.length} records.`);
    return { count: testPlans.length, deletedRecords };
  } catch (error) {
    console.error('Error deleting test data:', error);
    throw error;
  }
}

/**
 * Validate test data cleanup by checking for any remaining test records.
 */
export async function validateTestDataCleanup(): Promise<boolean> {
  try {
    const remainingTestPlans = await findTestDataPlans();
    if (remainingTestPlans.length > 0) {
      console.warn(`Validation failed: ${remainingTestPlans.length} test records still exist.`);
      return false;
    }
    console.log('Validation passed: No test data records found.');
    return true;
  } catch (error) {
    console.error('Validation failed:', error);
    throw error;
  }
}
