# Testing the Outdated Files Detection & Regeneration Workflow

## Prerequisites

1. **A GitHub repo submission** with:
   - `code_snapshot` populated (commit SHA + file SHAs)
   - `submission_files` table populated (use the debug endpoint if needed)

2. **Access to the GitHub repo** so you can modify files

## Step-by-Step Testing Guide

### Step 1: Create or Prepare a Submission

1. Go to `/submit` page
2. Select a GitHub repo (e.g., `github_repo_directory`)
3. Enter:
   - Repo URL: `https://github.com/your-org/your-repo`
   - Branch: `main` (or your branch)
   - Subdir: `frontend` (optional)
4. Click "Load files" and select some files
5. Click "Analyze & Save"
6. Wait for completion

### Step 2: Ensure submission_files is Populated

If your submission doesn't have `submission_files` rows yet, use the debug endpoint:

```bash
# Get your submission ID from the database or URL
# Then call:
GET /api/debug/track-files?submissionId=YOUR_SUBMISSION_ID
```

Or use Postman/curl:
```bash
curl "http://localhost:5173/api/debug/track-files?submissionId=YOUR_SUBMISSION_ID"
```

This will populate the `submission_files` table with file hashes.

### Step 3: Verify Initial State

1. Navigate to `/edit/YOUR_SUBMISSION_ID`
2. **Expected behavior:**
   - Page loads normally
   - You should see "Checking for updates..." briefly
   - Then the page should show normally (no outdated banner)
   - This means files are up-to-date

### Step 4: Modify Files in GitHub

To test the outdated detection, you need to change files in the GitHub repo:

1. Go to your GitHub repo
2. Edit one or more files that were included in the submission
3. Make a commit (add a comment, change code, etc.)
4. Push to the same branch you used in the submission

**Example changes:**
- Add a comment to a file
- Modify a function
- Add a new line
- Any change that modifies the file content

### Step 5: Test Outdated Detection

1. **Refresh the edit page** (`/edit/YOUR_SUBMISSION_ID`)
2. **Expected behavior:**
   - You should see "Checking for updates..." briefly
   - Then an **orange banner** should appear with:
     - Alert icon
     - "Source files have changed" message
     - List of changed files (file paths)
     - "Regenerate Documentation" button

### Step 6: Test Regeneration

1. Click the **"Regenerate Documentation"** button
2. **Expected behavior:**
   - Button shows "Regenerating..." with spinner
   - After a few seconds, you should see:
     - "Documentation regenerated successfully! Refreshing..."
     - Page automatically refreshes
   - After refresh, the outdated banner should be gone
   - Documentation content should reflect the latest code

### Step 7: Verify Regeneration Worked

1. Check the updated documentation content
2. Verify it includes changes from your GitHub edits
3. Check that `code_snapshot` was updated in the database:
   ```sql
   SELECT code_snapshot FROM submissions WHERE id = 'YOUR_SUBMISSION_ID';
   ```
   - Should have new `commitSha` and `fileShas`
   - Should have `updatedAt` timestamp (if using update endpoint)

## Testing with Browser DevTools

### Check Console Logs

Open browser DevTools (F12) and check the Console tab:

1. **On page load:**
   - Should see network request to `/api/docs/check-updates`
   - Check response in Network tab

2. **If outdated:**
   - Should see the outdated files in the response
   - Check the banner appears correctly

3. **During regeneration:**
   - Should see network request to `/api/docs/update`
   - Monitor for any errors

### Check Network Requests

1. Open DevTools → Network tab
2. Filter by "check-updates" or "update"
3. Check:
   - Request payload (should include `submissionId`)
   - Response status (should be 200)
   - Response body (should show `outdated: true/false` and `changedFiles`)

## Manual API Testing (Postman/curl)

### Test check-updates endpoint:

```bash
# Get your Supabase JWT token first (from browser DevTools → Application → Cookies)
# Or use: supabase.auth.getSession() in browser console

curl -X POST http://localhost:5173/api/docs/check-updates \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPABASE_JWT_TOKEN" \
  -d '{
    "submissionId": "YOUR_SUBMISSION_ID"
  }'
```

**Expected response:**
```json
{
  "outdated": true,
  "changedFiles": [
    {
      "file_path": "frontend/src/routes/submit/+page.svelte",
      "old_hash": "a2a4e7b6ff8e2479cfc1c29e24fd252e80a317f8",
      "new_hash": "new_sha_here"
    }
  ]
}
```

### Test update endpoint:

```bash
curl -X POST http://localhost:5173/api/docs/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SUPABASE_JWT_TOKEN" \
  -d '{
    "submissionId": "YOUR_SUBMISSION_ID"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "submissionId": "YOUR_SUBMISSION_ID",
  "message": "Documentation updated successfully"
}
```

## Troubleshooting

### Issue: Banner doesn't appear even after changing files

**Check:**
1. Is `submission_files` table populated? Use debug endpoint
2. Is `code_snapshot` populated in the submission?
3. Are you modifying files in the same branch used in submission?
4. Check browser console for errors
5. Check server logs for API errors

### Issue: "No tracked files for this submission"

**Solution:**
- Call `/api/debug/track-files?submissionId=YOUR_ID` to populate `submission_files`

### Issue: Regeneration fails

**Check:**
1. Is `GITHUB_TOKEN` set in environment?
2. Check server logs for detailed error messages
3. Verify the submission has valid `source_meta` with `repoUrl` and `branch`
4. Check that files still exist in the repo

### Issue: Files show as outdated but shouldn't be

**Possible causes:**
1. File paths might be wrong (check if subdir is handled correctly)
2. Branch might be different
3. Check the actual file hashes in `submission_files` table

## Quick Test Checklist

- [ ] Submission created with GitHub repo
- [ ] `code_snapshot` is populated
- [ ] `submission_files` table has rows (use debug endpoint if needed)
- [ ] Edit page loads without errors
- [ ] "Checking for updates..." appears briefly
- [ ] No outdated banner when files are up-to-date
- [ ] Modified files in GitHub repo
- [ ] Outdated banner appears after refresh
- [ ] Changed files are listed correctly
- [ ] Regenerate button works
- [ ] Documentation updates after regeneration
- [ ] Outdated banner disappears after regeneration

## Database Verification

Check the database to verify everything is working:

```sql
-- Check submission has code_snapshot
SELECT id, input_type, code_snapshot 
FROM submissions 
WHERE id = 'YOUR_SUBMISSION_ID';

-- Check submission_files are populated
SELECT * 
FROM submission_files 
WHERE submission_id = 'YOUR_SUBMISSION_ID';

-- Compare file hashes
SELECT 
  sf.file_path,
  sf.file_hash as stored_hash,
  cs.fileShas->>sf.file_path as snapshot_hash
FROM submission_files sf
JOIN submissions s ON s.id = sf.submission_id
CROSS JOIN LATERAL jsonb_extract_path(s.code_snapshot, 'fileShas') cs
WHERE sf.submission_id = 'YOUR_SUBMISSION_ID';
```

