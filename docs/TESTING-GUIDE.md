# Comprehensive Testing Guide - AI Functionality

This guide walks you through testing all the improvements made to the AI system and delete operations.

## Prerequisites

Before testing, ensure you have:
1. ✅ Llama 3.2 3B Instruct loaded in LM Studio
2. ✅ LM Studio server running (default port 1234)
3. ✅ ngrok tunnel active: `ngrok http 1234`
4. ✅ Supabase environment variables set
5. ✅ Functions deployed: `supabase functions deploy ai-proxy ai-actions`

## Test Suite 1: AI Response Quality

### Test 1.1: Natural French Responses
**Objective:** Verify AI responds in natural Québécois French without JSON or code

**Steps:**
1. Open the app and go to Assistant
2. Type: "Bonjour, comment ça va?"
3. Verify response is in natural French (e.g., "Bonjour! Je vais bien, merci. Comment puis-je vous aider aujourd'hui?")
4. Check that NO JSON, code blocks, or technical structures are visible

**Expected Result:** ✅ Natural French greeting, no code visible

**Pass/Fail:** ⬜

---

### Test 1.2: Context Awareness
**Objective:** Verify AI is aware of time, user, and data

**Steps:**
1. Send message: "Dis-moi mes statistiques"
2. Verify response mentions:
   - Correct time-based greeting (Bonjour/Bon après-midi/Bonsoir based on time)
   - Your actual data (revenue, expenses, profit)
   - Current date/week/month context

**Expected Result:** ✅ Contextual response with accurate data

**Pass/Fail:** ⬜

---

### Test 1.3: Concise Responses
**Objective:** Verify responses are short and clear (2-3 sentences)

**Steps:**
1. Ask: "Quel est mon profit ce mois-ci?"
2. Count sentences in response

**Expected Result:** ✅ 1-3 sentences, clear and direct

**Pass/Fail:** ⬜

---

## Test Suite 2: CRUD Operations via AI

### Test 2.1: Create Job
**Objective:** AI can create a contract

**Steps:**
1. Say: "Crée un contrat Plomberie Laval de 5000$"
2. Wait for confirmation
3. Check Jobs screen - verify contract appears immediately
4. Verify data is correct (name, amount)

**Expected Result:** ✅ Contract created and visible instantly

**Pass/Fail:** ⬜

---

### Test 2.2: Create Expense
**Objective:** AI can create an expense

**Steps:**
1. Say: "Ajoute une dépense Matériel de 1500$ catégorie Matériel"
2. Wait for confirmation  
3. Check Expenses screen - verify expense appears
4. Verify data is correct

**Expected Result:** ✅ Expense created and visible instantly

**Pass/Fail:** ⬜

---

### Test 2.3: Update Expense
**Objective:** AI can modify an expense

**Steps:**
1. Create an expense first (or use existing one)
2. Say: "Change le montant de [expense name] à 2000$"
3. Verify AI updates the expense
4. Check that UI reflects new amount immediately

**Expected Result:** ✅ Expense updated, UI shows new value

**Pass/Fail:** ⬜

---

### Test 2.4: Add Note to Expense
**Objective:** AI can add notes without creating new expense

**Steps:**
1. Say: "Ajoute une note 'achetés chez Rona' à la dépense [expense name]"
2. Verify confirmation message
3. Open expense details - verify note is there

**Expected Result:** ✅ Note added to existing expense (not new expense created)

**Pass/Fail:** ⬜

---

### Test 2.5: Delete Expense via AI
**Objective:** AI can delete an expense

**Steps:**
1. Say: "Supprime la dépense [expense name]"
2. Verify confirmation message in French
3. Check Expenses screen - expense should be gone immediately
4. Refresh page - verify it's still gone (persisted)

**Expected Result:** ✅ Expense deleted, UI updated instantly

**Pass/Fail:** ⬜

---

### Test 2.6: Delete Job via AI
**Objective:** AI can delete a contract

**Steps:**
1. Say: "Supprime le contrat [job name]"
2. Verify confirmation
3. Check Jobs screen - contract and associated expenses gone
4. Refresh - verify persistence

**Expected Result:** ✅ Contract deleted with cascading expenses

**Pass/Fail:** ⬜

---

## Test Suite 3: Delete Operations via UI

### Test 3.1: Delete Expense via UI Button
**Objective:** UI delete buttons work with optimistic updates

**Steps:**
1. Go to Expenses screen
2. Click delete (trash icon) on an expense
3. Observe: expense disappears immediately (no waiting)
4. Verify success toast appears
5. Refresh page - verify it's still deleted

**Expected Result:** ✅ Instant removal, persisted

**Pass/Fail:** ⬜

---

### Test 3.2: Delete Contract via UI Button
**Objective:** Contract delete works with rollback on error

**Steps:**
1. Go to Jobs screen
2. Click delete on a contract
3. Observe: contract disappears immediately
4. Verify success toast
5. Refresh - verify deletion persisted
6. Check that associated expenses are also deleted

**Expected Result:** ✅ Contract and expenses deleted, cascaded properly

**Pass/Fail:** ⬜

---

### Test 3.3: Delete with Error (Simulated)
**Objective:** Rollback works if delete fails

**Note:** This is hard to test without simulating an error. If you encounter a delete error naturally, verify that:
- The item reappears in the list (rollback)
- Error message is shown in French
- Data reloads to ensure consistency

**Pass/Fail:** ⬜

---

## Test Suite 4: Memory & Context Persistence

### Test 4.1: Short-term Memory
**Objective:** AI remembers within same conversation

**Steps:**
1. Start new conversation
2. Say: "Je préfère toujours classer mes dépenses dans la catégorie Matériel"
3. Later in same conversation, say: "Ajoute une dépense de 500$"
4. Verify AI asks clarifying questions OR automatically uses Matériel category

**Expected Result:** ✅ AI uses preference from earlier in conversation

**Pass/Fail:** ⬜

---

### Test 4.2: Long-term Memory Persistence
**Objective:** Memory survives logout and page refresh

**Steps:**
1. Have a conversation with multiple exchanges
2. Include a preference like "J'aime avoir des rapports détaillés"
3. Close the app completely (or logout)
4. Reopen and go to same conversation
5. Say: "Donne-moi un rapport"
6. Check if AI remembers your preference for detailed reports

**Expected Result:** ✅ Preference remembered across sessions

**Pass/Fail:** ⬜

---

### Test 4.3: Conversation History Persists
**Objective:** Chat messages survive logout

**Steps:**
1. Send several messages in a conversation
2. Logout
3. Login again
4. Open same conversation
5. Verify all messages are still there

**Expected Result:** ✅ All messages present

**Pass/Fail:** ⬜

---

## Test Suite 5: Error Handling & Retry Logic

### Test 5.1: Network Error Recovery
**Objective:** System retries on network failures

**Steps:**
1. While testing, temporarily disconnect ngrok or pause LM Studio
2. Try sending a message to AI
3. Observe retry behavior (check browser console)
4. Reconnect ngrok/unpause LM Studio
5. See if message eventually succeeds

**Expected Result:** ✅ Automatic retries, eventually succeeds or shows clear error

**Pass/Fail:** ⬜

---

### Test 5.2: User-Friendly Error Messages
**Objective:** Error messages are in French and helpful

**Steps:**
1. Try various operations that might fail
2. Verify all error messages are:
   - In French
   - Clear about what went wrong
   - Actionable (suggest what to do)

**Expected Result:** ✅ French errors with helpful guidance

**Pass/Fail:** ⬜

---

## Test Suite 6: Analytics & Queries

### Test 6.1: Revenue Question
**Steps:**
1. Ask: "Quel est mon revenu total?"
2. Verify response has correct number
3. Check calculation is accurate

**Pass/Fail:** ⬜

---

### Test 6.2: Period-Specific Query
**Steps:**
1. Ask: "Combien j'ai dépensé cette semaine?"
2. Verify AI understands "this week"
3. Check calculation

**Pass/Fail:** ⬜

---

### Test 6.3: Profit Analysis
**Steps:**
1. Ask: "Montre-moi mon profit"
2. Verify response includes revenue - expenses = profit
3. Check explanation is clear

**Pass/Fail:** ⬜

---

## Test Suite 7: Edge Cases

### Test 7.1: Empty Data
**Objective:** AI handles empty state gracefully

**Steps:**
1. With a new account (no jobs/expenses)
2. Ask: "Quels sont mes contrats?"
3. Verify friendly response about no data

**Pass/Fail:** ⬜

---

### Test 7.2: Ambiguous Request
**Objective:** AI asks clarifying questions

**Steps:**
1. Say: "Ajoute une dépense"
2. Verify AI asks for missing info (amount, category, name)

**Pass/Fail:** ⬜

---

### Test 7.3: Multiple Actions in One Request
**Objective:** AI can handle compound requests

**Steps:**
1. Say: "Crée un contrat Rénovation de 10000$ et ajoute une dépense Outils de 500$"
2. Verify both actions execute
3. Check that expense is linked to the new contract

**Pass/Fail:** ⬜

---

## Summary Checklist

After completing all tests, verify:

- [ ] AI responds in natural Québécois French 100% of the time
- [ ] No JSON or code ever visible to user
- [ ] All CRUD operations work via AI
- [ ] All CRUD operations work via UI
- [ ] Delete operations work for jobs and expenses
- [ ] UI updates instantly (optimistic updates)
- [ ] Memory persists across logout/refresh
- [ ] Errors are caught and displayed in French
- [ ] Retry logic works for network issues
- [ ] Analytics/queries return accurate data
- [ ] AI is context-aware (time, user, data)

## Performance Notes

**Expected Response Times:**
- AI text response: 1-3 seconds
- Action execution: < 1 second
- Delete operation: Instant UI update, < 1 second backend

**Token Generation Speed (Llama 3.2 3B on RTX 3050):**
- Expected: 20-40 tokens/second
- If slower: Check LM Studio settings, GPU acceleration enabled

## Troubleshooting

### If AI returns JSON instead of French:
```bash
# Check model loaded
curl http://localhost:1234/v1/models

# Check ngrok is forwarding
curl https://YOUR-NGROK-URL/v1/models

# Redeploy function
supabase functions deploy ai-proxy
```

### If deletes fail:
```javascript
// Check browser console for detailed errors
// Look for messages like:
// "Failed to delete expense: [specific error]"
```

### If memory doesn't persist:
```sql
-- Check Supabase dashboard
SELECT id, title, memory_summary FROM conversations WHERE user_id = '[your-user-id]';
```

## Reporting Issues

If any test fails, note:
1. Test number
2. Exact steps taken
3. Expected vs actual result
4. Browser console errors (if any)
5. Supabase function logs

Check logs:
```bash
supabase functions logs ai-proxy --tail
supabase functions logs ai-actions --tail
```


