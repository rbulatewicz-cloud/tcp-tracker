# TCP Tracker Bug Fix Test Plan
**Version:** 1.0  
**Date:** 2026-05-09  
**Scope:** BUG-7, BUG-9, BUG-11, BUG-12  
**Environment:** Development Server  

---

## Test Objectives

Verify that the following bug fixes work as intended:
- BUG-7: Plan Duration field clarity improvements
- BUG-9: Elimination of duplicate "Submitted to DOT" stage in Reports
- BUG-11: Search bar performance optimization (memoization)
- BUG-12: Context-aware "My Plans" empty state messaging

---

## Prerequisites

1. Dev server is running at `http://localhost:5173` (or configured dev URL)
2. User is logged in with appropriate role (ADMIN or MOT recommended for full feature access)
3. App has loaded without errors (check browser console)
4. No active filters that would hide content

---

## Test Cases

### TEST 1: BUG-7 - Plan Duration Field Clarity
**Priority:** Medium  
**Expected Duration:** 5 minutes

#### Setup
1. Navigate to the Plans view
2. Click on any existing plan to open the plan card (or create a test plan if none exist)

#### Test Steps
1. Scroll to the "Schedule" section in the plan card
2. Locate the "Plan Duration" field
3. **Verify:** Field label shows "(optional)" badge next to "Plan Duration"
4. **Verify:** Below the input field, there is help text explaining: "Length of work window. Helps calculate estimated end date and compliance deadlines."
5. In read-only view (non-edit mode):
   - **Verify:** Empty field displays "Not specified" instead of "—"
   - **Verify:** Help text also appears in read-only view
6. Test editing the field:
   - Click into the Plan Duration input
   - Enter a number (e.g., "30")
   - **Verify:** Field accepts numeric input
   - **Verify:** "Estimated / Confirmed End Date" section appears/updates below

#### Expected Results
- ✅ "(optional)" label is visible
- ✅ Help text is clearly displayed in both edit and read-only modes
- ✅ Empty state shows "Not specified" not "—"
- ✅ Field functions normally for input
- ✅ End date calculation updates when duration changes

#### Screenshots Required
- Plan card with Plan Duration field visible
- Both edit mode and read-only mode

---

### TEST 2: BUG-9 - Duplicate "Submitted to DOT" Stage
**Priority:** Medium  
**Expected Duration:** 5 minutes

#### Setup
1. Ensure you have plans in various stages (especially "submitted_to_dot" stage)
2. Navigate to Reports view

#### Test Steps
1. Click on "Status Report" (the "📊" card with description "Full pipeline snapshot")
2. Scroll to the "Pipeline Summary" section
3. Locate the "By Stage" breakdown (shows stage pills with counts)
4. **Count occurrences:** How many times does "Submitted to DOT" appear?
5. **Verify:** Only ONE "Submitted to DOT" pill is displayed (NOT two)
6. **Verify:** The count on that pill matches the number of plans actually in submitted/submitted_to_dot stages

#### Expected Results
- ✅ "Submitted to DOT" appears exactly ONCE in the stage breakdown
- ✅ No duplicate stage labels
- ✅ Stage count is accurate
- ✅ All other stages display normally without duplication

#### Screenshots Required
- Status Report Pipeline Summary section showing stage breakdown
- Close-up of the stage pills

---

### TEST 3: BUG-11 - Search Bar Performance (No Excessive Re-renders)
**Priority:** Low  
**Expected Duration:** 5 minutes

#### Setup
1. Open the Plans view or any view with the search bar
2. Open browser DevTools (F12 or right-click → Inspect)
3. Switch to the Performance tab (optional, for advanced testing)

#### Test Steps
1. Locate the search input field at the top (placeholder: "Search plans by LOC, street, lead, or status...")
2. Click in the search field to focus it
3. Type slowly, one character at a time: "L-O-C-1-2-3"
4. **Observe:** As you type, watch the main dashboard content
5. **Verify:** The dashboard/table content does NOT flash, blink, or appear to re-render on every keystroke
6. Continue typing and clearing text
7. **Verify:** The app remains responsive and smooth
8. Open browser console (F12 → Console tab)
9. **Check:** No "Failed to reload" errors related to SearchInput
10. **Verify:** No excessive console warnings

#### Expected Results
- ✅ Typing in search bar does not cause visible dashboard re-renders
- ✅ UI remains smooth and responsive
- ✅ No console errors about SearchInput module
- ✅ App performance is noticeably better than before

#### Console Check
```
// Should NOT see these errors:
// ❌ "The requested module '/src/features/search/SearchInput.tsx' does not provide an export named 'SearchInput'"
// ❌ "Failed to reload /src/components/Header.tsx"
```

#### Screenshots Required
- Search bar with text entered
- Browser console showing no critical errors

---

### TEST 4: BUG-12 - "My Plans" Empty State Messaging
**Priority:** Low  
**Expected Duration:** 5 minutes

#### Setup
1. Ensure the current user has NO assigned plans (not a lead on any active plans, not subscribed to any)
   - OR view as a user role with minimal plan access

#### Test Steps
1. Click on the "👤 My Plans" quick filter button (top left of the plans table)
2. The view should now filter to show only plans assigned to the current user
3. **Verify:** The table shows "No plans match filters" OR the new message
4. **Read the message carefully:**
   - **Expected text:** "No active plans assigned to you. You can request a new one or ask to be added as a lead or subscriber."
   - This message should be helpful and explain what the user can do
5. Switch away from "My Plans" filter
6. **Verify:** Other empty state messages still show generic "No plans match filters"
7. Switch back to "My Plans"
8. **Verify:** The context-aware message appears again (not the generic one)

#### Expected Results
- ✅ "My Plans" tab shows the NEW context-aware empty message (not "No plans match filters")
- ✅ Message explains the user has no active assigned plans
- ✅ Message provides helpful suggestions (request new plan, ask to be added)
- ✅ Other views still show generic "No plans match filters" message
- ✅ Message is readable and properly formatted

#### Message Validation
The message should contain:
- ✅ "No active plans assigned to you"
- ✅ Action items (request new one, ask to be added as lead/subscriber)
- ✅ Clear and user-friendly tone

#### Screenshots Required
- "My Plans" tab with empty state message clearly visible
- Comparison with generic empty state from other filters

---

## Pass/Fail Criteria

### PASS Criteria (All Must Be True)
- ✅ BUG-7: Plan Duration field has "(optional)" label AND help text in both modes
- ✅ BUG-9: "Submitted to DOT" appears only ONCE in Reports status breakdown
- ✅ BUG-11: Typing in search bar does NOT cause visible dashboard re-renders
- ✅ BUG-12: "My Plans" empty state shows context-aware message (not generic)

### FAIL Criteria (Any Failure = Test Fails)
- ❌ Plan Duration help text is missing
- ❌ "Submitted to DOT" appears multiple times in Reports
- ❌ Search bar causes dashboard to flash/re-render on each keystroke
- ❌ "My Plans" shows "No plans match filters" instead of new message
- ❌ Critical console errors preventing feature functionality
- ❌ Any previously working features are broken

---

## Test Execution Notes

### Tips for Testing
1. **Clear browser cache** if you see old UI (Ctrl+Shift+Del)
2. **Hard refresh** the page (Ctrl+Shift+R) to ensure latest code
3. **Open DevTools early** to catch any console errors
4. **Take screenshots** for documentation before reporting results
5. **Test with different screen sizes** if possible (responsive design)

### Known Limitations
- These tests assume the dev server is running and accessible
- Some features may require specific plan data (Plans in certain stages)
- If no test data exists, create a test plan first (via "+ New Request")

---

## Test Results Summary

| Bug ID | Test Case | Status | Notes |
|--------|-----------|--------|-------|
| BUG-7  | Plan Duration Clarity | [ ] PASS [ ] FAIL | |
| BUG-9  | Duplicate Stage | [ ] PASS [ ] FAIL | |
| BUG-11 | Search Performance | [ ] PASS [ ] FAIL | |
| BUG-12 | My Plans Messaging | [ ] PASS [ ] FAIL | |

**Overall Result:** [ ] ALL PASS [ ] SOME FAILURES [ ] CRITICAL FAILURES

---

## Additional Notes

- If any test fails, please provide:
  1. Screenshot of the failure
  2. Browser console output (if error-related)
  3. Steps to reproduce
  4. Expected vs. Actual behavior

- For performance testing (BUG-11), you may optionally use:
  - Chrome DevTools Performance tab
  - Chrome DevTools Rendering tab (show paint rectangles)
  - Check for excessive re-renders

---

**Test Plan Created:** 2026-05-09  
**For Use With:** Claude Chrome Extension or Manual Testing  
**Contact:** Development Team
