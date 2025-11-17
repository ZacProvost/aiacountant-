// Supabase Edge Function: ai-proxy
// Secure gateway between the client and AI providers (LM Studio or OpenRouter) ensuring sensitive data stays server-side.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1"
import { resolveAllowedOrigin } from "../_shared/cors.ts"
import { handleOptions, jsonResponse } from "../_shared/http.ts"
import { getEnvVar, getOptionalEnvVar } from "../_shared/env.ts"
import { createLogger } from "../_shared/logger.ts"
import { sanitizeActions } from "../_shared/actions.ts"
import { recordMetric } from "../_shared/metrics.ts"
import { HttpError, normaliseError } from "../_shared/errors.ts"
import { validateAIResponse, scoreAIResponse, sanitizeAIText, generateFallbackResponse, type AIResponseSchema } from "../_shared/validation.ts"
import { checkRateLimit, RATE_LIMITS } from "../_shared/rateLimit.ts"

type ChatRole = "system" | "user" | "assistant"

interface HistoryMessage {
  role: Exclude<ChatRole, "system">
  content: string
}

interface ReceiptData {
  vendor?: string
  date?: string
  total?: number
  subtotal?: number
  tax?: {
    gst?: number
    pst?: number
    qst?: number
    hst?: number
    total?: number
  }
  items?: Array<{
    name: string
    price: number
    quantity?: number
    unitPrice?: number
  }>
  currency?: string
  receiptPath?: string
}

interface ProxyRequest {
  prompt: string
  history?: HistoryMessage[]
  context?: {
    conversationId?: string
    conversationMemory?: string | null
    receipts?: ReceiptData[] // Structured receipt data from recent messages
  }
}

type SupportedAction =
  | "create_job"
  | "update_job"
  | "delete_job"
  | "update_job_status"
  | "create_expense"
  | "update_expense"
  | "delete_expense"
  | "attach_expense"
  | "detach_expense"
  | "create_category"
  | "rename_category"
  | "delete_category"
  | "create_notification"
  | "mark_notification_read"
  | "delete_notification"
  | "create_contract"
  | "query"

const SUPPORTED_ACTIONS: SupportedAction[] = [
  "create_job",
  "update_job",
  "delete_job",
  "update_job_status",
  "create_expense",
  "update_expense",
  "delete_expense",
  "attach_expense",
  "detach_expense",
  "create_category",
  "rename_category",
  "delete_category",
  "create_notification",
  "mark_notification_read",
  "delete_notification",
  "create_contract",
  "query",
]
const supportedActionSet = new Set<SupportedAction>(SUPPORTED_ACTIONS)

interface ProxyResponse {
  text: string
  actions?: Array<{
    action: SupportedAction
    data?: Record<string, unknown>
    confirmationMessage?: string
  }>
}

interface JobRecord {
  id: string
  user_id: string
  name: string | null
  status: string | null
  revenue: number | null
  expenses: number | null
  profit: number | null
  start_date: string | null
  end_date: string | null
}

interface ExpenseRecord {
  id: string
  user_id: string
  job_id: string | null
  name: string | null
  amount: number | null
  category: string | null
  date: string | null
  vendor: string | null
  notes: string | null
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const applyAliases = (text: string, aliases: AliasEntry[]) => {
  let output = text
  for (const { name, alias } of aliases) {
    if (!name) continue
    const regex = new RegExp(escapeRegExp(name), "gi")
    output = output.replace(regex, alias)
  }
  return output
}

const revertAliases = (text: string, aliases: AliasEntry[]) => {
  let output = text
  for (const { name, alias } of aliases) {
    if (!name) continue
    const regex = new RegExp(escapeRegExp(alias), "g")
    output = output.replace(regex, name)
  }
  return output
}

type AliasEntry = {
  id: string
  name: string
  alias: string
}

type ExpenseAliasEntry = AliasEntry & {
  jobAlias?: string
  amount: number
  category: string | null
  date: string | null
  vendor: string | null
  notes: string | null
}

const buildJobAliases = (jobs: JobRecord[]): AliasEntry[] =>
  jobs.map((job, index) => ({
    id: job.id,
    name: job.name ?? `Contrat ${index + 1}`,
    alias: `JOB_${String(index + 1).padStart(2, "0")}`,
  }))

const buildExpenseAliases = (
  expenses: ExpenseRecord[],
  jobAliasMap: Map<string, AliasEntry>,
): ExpenseAliasEntry[] =>
  expenses.map((expense, index) => {
    const jobAlias = expense.job_id ? jobAliasMap.get(expense.job_id)?.alias : undefined
    return {
      id: expense.id,
      name: expense.name ?? `Dépense ${index + 1}`,
      alias: `EXP_${String(index + 1).padStart(2, "0")}`,
      jobAlias,
      amount: coerceNumber(expense.amount),
      category: expense.category ?? null,
      date: expense.date ?? null,
      vendor: expense.vendor ?? null,
      notes: expense.notes ?? null,
    }
  })

const coerceNumber = (value: number | null | undefined) => Number(value ?? 0)

const toISODate = (date: Date) => date.toISOString().split("T")[0]

const computeTemporalContext = () => {
  const now = new Date()
  const currentDateISO = toISODate(now)

  const weekStart = new Date(now)
  const weekday = weekStart.getDay() || 7
  weekStart.setDate(weekStart.getDate() - (weekday - 1))

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  return {
    currentDateISO,
    weekStartISO: toISODate(weekStart),
    weekEndISO: toISODate(weekEnd),
    monthStartISO: toISODate(monthStart),
    monthEndISO: toISODate(monthEnd),
  }
}

const sanitiseActions = (raw: unknown): ProxyResponse["actions"] => {
  if (!Array.isArray(raw)) {
    return undefined
  }

  const cleaned: NonNullable<ProxyResponse["actions"]> = []

  raw.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return
    }
    const candidate = entry as Record<string, unknown>
    const actionValue = candidate.action
    if (typeof actionValue !== "string") {
      return
    }
    if (!supportedActionSet.has(actionValue as SupportedAction)) {
      return
    }

    const dataValue =
      candidate.data && typeof candidate.data === "object"
        ? (candidate.data as Record<string, unknown>)
        : undefined
    const confirmationMessageValue =
      typeof candidate.confirmationMessage === "string"
        ? candidate.confirmationMessage.trim()
        : undefined

    cleaned.push({
      action: actionValue as SupportedAction,
      data: dataValue,
      confirmationMessage: confirmationMessageValue && confirmationMessageValue.length > 0 ? confirmationMessageValue : undefined,
    })
  })

  return cleaned
}

const summariseJobs = (jobs: JobRecord[], aliases: AliasEntry[]) => {
  const byId = new Map(jobs.map((job) => [job.id, job]))
  const lines = aliases.map((entry) => {
    const job = byId.get(entry.id)
    if (!job) return ""
    return `- ${entry.alias} | nom=${entry.name ?? "Sans nom"} | revenu=${coerceNumber(job.revenue)} | dépenses=${coerceNumber(job.expenses)} | profit=${coerceNumber(job.profit)} | statut=${job.status ?? "En cours"} | période=${job.start_date ?? "n/a"} → ${job.end_date ?? "n/a"}`
  })
  const totals = jobs.reduce(
    (acc, job) => {
      acc.revenue += coerceNumber(job.revenue)
      acc.expenses += coerceNumber(job.expenses)
      acc.profit += coerceNumber(job.profit)
      return acc
    },
    { revenue: 0, expenses: 0, profit: 0 },
  )

  return {
    lines: lines.filter(Boolean),
    totals,
  }
}

/**
 * Extract state changes (deletions/creations) from conversation history
 * This helps the AI understand what was recently deleted vs what currently exists
 */
const extractStateChangesFromHistory = (
  history: Array<{ role: string; content: string }>,
  currentJobs: JobRecord[],
  currentExpenses: ExpenseRecord[]
): {
  recentDeletions: Array<{ type: 'job' | 'expense'; name: string; timestamp?: string }>;
  recentCreations: Array<{ type: 'job' | 'expense'; name: string; timestamp?: string }>;
} => {
  const recentDeletions: Array<{ type: 'job' | 'expense'; name: string; timestamp?: string }> = [];
  const recentCreations: Array<{ type: 'job' | 'expense'; name: string; timestamp?: string }> = [];
  
  // Look at last 20 messages for state changes
  const recentMessages = history.slice(-20);
  
  for (const message of recentMessages) {
    const content = message.content.toLowerCase();
    const originalContent = message.content; // Keep original for better matching
    
    // Detect deletions - multiple patterns to catch various phrasings
    const deletionPatterns = [
      /(?:contrat|job)\s+["']?([^"']+?)["']?\s+(?:a\s+été\s+)?(?:supprimé|supprimée|effacé|effacée|retiré|retirée)/i,
      /(?:dépense|expense)\s+["']?([^"']+?)["']?\s+(?:a\s+été\s+)?(?:supprimé|supprimée|effacé|effacée|retiré|retirée)/i,
      /(?:supprimé|supprimée|effacé|effacée|retiré|retirée)\s+(?:le|la|l'|un|une)\s+(?:contrat|job|dépense|expense)\s+["']?([^"']+?)["']?/i,
      /(?:supprimé|supprimée|effacé|effacée|retiré|retirée)[\s:]+["']?([^"']+?)["']?/i,
    ];
    
    for (const pattern of deletionPatterns) {
      const match = originalContent.match(pattern);
      if (match && match[1]) {
        const deletedName = match[1].trim();
        if (!deletedName || deletedName.length < 2) continue;
        
        // Determine type by checking context
        const isJob = /contrat|job/i.test(match[0]);
        const isExpense = /dépense|expense/i.test(match[0]);
        
        if (isJob || (!isExpense && deletedName.length > 0)) {
          // Check if this job still exists - if not, it was deleted
          const stillExists = currentJobs.some(j => j.name?.toLowerCase() === deletedName.toLowerCase());
          if (!stillExists && !recentDeletions.some(d => d.name.toLowerCase() === deletedName.toLowerCase() && d.type === 'job')) {
            recentDeletions.push({ type: 'job', name: deletedName });
          }
        }
        if (isExpense || (!isJob && deletedName.length > 0)) {
          // Check if this expense still exists - if not, it was deleted
          const stillExists = currentExpenses.some(e => e.name?.toLowerCase() === deletedName.toLowerCase());
          if (!stillExists && !recentDeletions.some(d => d.name.toLowerCase() === deletedName.toLowerCase() && d.type === 'expense')) {
            recentDeletions.push({ type: 'expense', name: deletedName });
          }
        }
      }
    }
    
    // Detect creations - multiple patterns
    const creationPatterns = [
      /(?:contrat|job)\s+["']?([^"']+?)["']?\s+(?:a\s+été\s+)?(?:créé|créée|ajouté|ajoutée)/i,
      /(?:dépense|expense)\s+["']?([^"']+?)["']?\s+(?:a\s+été\s+)?(?:créé|créée|ajouté|ajoutée)/i,
      /(?:créé|créée|ajouté|ajoutée)\s+(?:le|la|l'|un|une)\s+(?:contrat|job|dépense|expense)\s+["']?([^"']+?)["']?/i,
      /(?:créé|créée|ajouté|ajoutée|nouveau|nouvelle)[\s:]+["']?([^"']+?)["']?/i,
    ];
    
    for (const pattern of creationPatterns) {
      const match = originalContent.match(pattern);
      if (match && match[1]) {
        const createdName = match[1].trim();
        if (!createdName || createdName.length < 2) continue;
        
        // Determine type by checking context
        const isJob = /contrat|job/i.test(match[0]);
        const isExpense = /dépense|expense/i.test(match[0]);
        
        if (isJob || (!isExpense && createdName.length > 0)) {
          // Check if this job exists now - if yes, it was created
          const exists = currentJobs.some(j => j.name?.toLowerCase() === createdName.toLowerCase());
          if (exists && !recentCreations.some(c => c.name.toLowerCase() === createdName.toLowerCase() && c.type === 'job')) {
            recentCreations.push({ type: 'job', name: createdName });
          }
        }
        if (isExpense || (!isJob && createdName.length > 0)) {
          // Check if this expense exists now - if yes, it was created
          const exists = currentExpenses.some(e => e.name?.toLowerCase() === createdName.toLowerCase());
          if (exists && !recentCreations.some(c => c.name.toLowerCase() === createdName.toLowerCase() && c.type === 'expense')) {
            recentCreations.push({ type: 'expense', name: createdName });
          }
        }
      }
    }
  }
  
  return { recentDeletions, recentCreations };
};

const buildSystemPrompt = (
  jobSummary: ReturnType<typeof summariseJobs>,
  expenseAliases: ExpenseAliasEntry[],
  categories: string[],
  conversationMemory?: string | null,
  profile?: { name?: string | null; email?: string | null; company_name?: string | null; tax_rate?: number | null },
  stateChanges?: { recentDeletions: Array<{ type: 'job' | 'expense'; name: string }>; recentCreations: Array<{ type: 'job' | 'expense'; name: string }> },
  receipts?: ReceiptData[]
) => {
  const temporal = computeTemporalContext()
  const { totals, lines } = jobSummary
  const jobSection = lines.length
    ? `\nCONTRATS (alias JOB_XX):\n${lines.join("\n")}`
    : "\nAucun contrat actif."
  const expenseSection = expenseAliases.length
    ? `\nDÉPENSES (alias EXP_XX):\n${expenseAliases
        .map((expense) => {
          const parts = [
            `${expense.alias}`,
            `contrat=${expense.jobAlias ?? "SANS_CONTRAT"}`,
            `montant=${expense.amount}`,
            `categorie=${expense.category ?? "Non spécifiée"}`,
            `date=${expense.date ?? "Inconnue"}`,
            `libelle=${expense.name}`,
            expense.vendor ? `fournisseur=${expense.vendor}` : null,
            expense.notes ? `notes=${expense.notes}` : null,
          ]
          return `- ${parts.filter(Boolean).join(" | ")}`
        })
        .join("\n")}`
    : "\nAucune dépense enregistrée."

  const userName = profile?.name ?? "l'utilisateur"
  const userFirstName = profile?.name ? profile.name.split(' ')[0] : null  // Extract first name only
  const timeOfDay = new Date().getHours()
  const greeting = timeOfDay < 12 ? "Bonjour" : timeOfDay < 18 ? "Bon après-midi" : "Bonsoir"
  const dayOfWeek = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"][new Date().getDay()]

  // ENHANCED: Strong identity section - use first name only for more natural conversation
  const identitySection = `TU ES FISCALIA - Adjointe Financière Intelligente

TON IDENTITÉ:
• Nom: Fiscalia
• Rôle: Adjointe financière personnelle et dévouée${userFirstName ? ` de ${userFirstName}` : ''}
• Expertise: Gestion financière pour travailleurs autonomes québécois
• Personnalité: Professionnelle, chaleureuse, proactive, précise
• Langue: Français québécois EXCLUSIVEMENT

TON COMPORTEMENT:
• Tu te souviens de TOUTES les conversations et du contexte récent
• Tu es TOUJOURS précise dans tes calculs et confirmations
• Tu utilises le prénom (${userFirstName || 'l\'utilisateur'}) de façon NATURELLE et OCCASIONNELLE (pas à chaque phrase!)
• Tu poses des questions claires si une information manque
• Tu confirmes EXPLICITEMENT chaque action avec les détails précis
• Tu maintiens le CONTEXTE: si on mentionne "ce contrat" ou "cette dépense", tu sais de quoi on parle grâce à la conversation récente

RÈGLE ABSOLUE: Tu réponds TOUJOURS en français québécois, même si on te parle en anglais.`

  // ENHANCED: User profile section with clear instructions
  const profileSection = profile
    ? `

═══════════════════════════════════════════
📊 PROFIL UTILISATEUR
═══════════════════════════════════════════

• Nom: ${profile.name || 'Non renseigné'}
${profile.email ? `• Courriel: ${profile.email}` : ''}
${profile.company_name ? `• Entreprise: ${profile.company_name}` : ''}
${typeof profile.tax_rate === 'number' ? `• Taux de taxe: ${profile.tax_rate}%` : ''}

RÈGLE: Utilise ces infos quand c'est pertinent. Sois personnelle mais pas forcée.`
    : ""

  // ENHANCED: Memory section with explicit usage instructions
  const memorySection = conversationMemory 
    ? `

═══════════════════════════════════════════
🧠 MÉMOIRE DES CONVERSATIONS PASSÉES
═══════════════════════════════════════════

${conversationMemory}

INSTRUCTIONS MÉMOIRE:
• Utilise ce contexte quand l'utilisateur mentionne "comme avant", "la dernière fois", ou fait référence à des discussions passées
• Maintiens la continuité des façons de faire établies ensemble
• Si le contexte passé est pertinent, mentionne-le brièvement
• Exemple: "Comme la dernière fois, je vais..."
`
    : ""

  // ENHANCED: Receipt data section (structured data for better understanding)
  const receiptSection = receipts && receipts.length > 0
    ? `

═══════════════════════════════════════════
🧾 REÇUS RÉCENTS (DONNÉES STRUCTURÉES)
═══════════════════════════════════════════

${receipts.map((receipt, idx) => {
      const parts: string[] = []
      if (receipt.vendor) parts.push(`Fournisseur: ${receipt.vendor}`)
      if (receipt.date) parts.push(`Date: ${receipt.date}`)
      if (receipt.subtotal) parts.push(`Sous-total: ${receipt.subtotal.toFixed(2)}$`)
      if (receipt.tax) {
        const taxParts: string[] = []
        if (receipt.tax.gst) taxParts.push(`TPS: ${receipt.tax.gst.toFixed(2)}$`)
        if (receipt.tax.pst) taxParts.push(`TVP: ${receipt.tax.pst.toFixed(2)}$`)
        if (receipt.tax.qst) taxParts.push(`TVQ: ${receipt.tax.qst.toFixed(2)}$`)
        if (receipt.tax.hst) taxParts.push(`TVH: ${receipt.tax.hst.toFixed(2)}$`)
        if (receipt.tax.total) taxParts.push(`Taxe totale: ${receipt.tax.total.toFixed(2)}$`)
        if (taxParts.length > 0) parts.push(`Taxes: ${taxParts.join(', ')}`)
      }
      if (receipt.total) parts.push(`TOTAL: ${receipt.total.toFixed(2)}$`)
      if (receipt.items && receipt.items.length > 0) {
        // Show all items - no limit (structured data has all items)
        const itemsList = receipt.items.map(item => 
          `${item.name}: ${item.price.toFixed(2)}$${item.quantity ? ` (x${item.quantity})` : ''}`
        ).join('; ')
        parts.push(`Articles (${receipt.items.length}): [${itemsList}]`)
      }
      return `Reçu ${idx + 1}:\n  ${parts.join('\n  ')}`
    }).join('\n\n')}

INSTRUCTIONS POUR LES REÇUS:
• Ces données sont EXACTES et COMPLÈTES (extraction OCR améliorée)
• Utilise-les pour répondre aux questions précises sur les reçus
• Exemples: "Quelle est la TPS sur le reçu de [fournisseur]?", "Quels articles sont sur ce reçu?", "Combien coûte [article]?"
• Tu as accès à TOUS les articles et TOUS les détails fiscaux
• Réponds avec les valeurs EXACTES des reçus
`
    : ""

  // ENHANCED: Quebec French language rules
  const languageRules = `

═══════════════════════════════════════════
🇨🇦 FRANÇAIS QUÉBÉCOIS - RÈGLES STRICTES
═══════════════════════════════════════════

TERMINOLOGIE OBLIGATOIRE:
✓ "courriel" (JAMAIS "email")
✓ "dépense" (pas "frais")
✓ "contrat" (pas "job" en français)
✓ "revenu" (pas "revenue")

TON ET STYLE:
• Tutoiement naturel et chaleureux
• 2-3 phrases maximum par réponse (sauf si calculs complexes nécessaires)
• Confirmations explicites avec noms ET montants exacts
• Expressions québécoises: "Parfait!", "Aucun problème", "C'est fait!", "Super!", "D'accord!"
• N'utilise le prénom qu'occasionnellement (début de conversation, moments importants)

EXEMPLES DE BONNES RÉPONSES:
"Parfait! J'ai créé le contrat Plomberie Laval avec un revenu de 5000$. C'est maintenant dans ta liste."
"C'est fait! La dépense Essence de 75$ est maintenant supprimée."
"Super! Le montant du contrat Rénovation passe à 8500$."

EXEMPLES DE MAUVAISES RÉPONSES:
"Bonjour Marie! J'ai effectué l'action pour toi Marie!"  ← TOO MUCH NAME USAGE
"J'ai fait ça."  ← PAS ASSEZ PRÉCIS
"Action completed successfully."  ← ANGLAIS INTERDIT
`

  return `${identitySection}
${profileSection}
${memorySection}
${receiptSection}
${languageRules}


CONTEXTE ACTUEL (${greeting}, ${dayOfWeek} ${temporal.currentDateISO}):

📊 RÉSUMÉ FINANCIER:
- Contrats actifs: ${lines.length} | Revenu total: ${totals.revenue}$ | Dépenses: ${totals.expenses}$ | Profit: ${totals.profit}$
- Catégories: ${categories.join(", ") || "Aucune"}
- Cette semaine: ${temporal.weekStartISO} au ${temporal.weekEndISO}
- Ce mois: ${temporal.monthStartISO} au ${temporal.monthEndISO}

DONNÉES FINANCIÈRES (alias internes pour actions seulement):
${jobSection}
${expenseSection}
${stateChanges && (stateChanges.recentDeletions.length > 0 || stateChanges.recentCreations.length > 0)
    ? `\n\n⚠️ CHANGEMENTS RÉCENTS D'ÉTAT (CRITIQUE - NE PAS CONFONDRE):\n${
        stateChanges.recentDeletions.length > 0
          ? `\nSUPPRIMÉS RÉCEMMENT (n'existent PLUS dans la base de données):\n${stateChanges.recentDeletions
              .map((d) => `  - ${d.type === 'job' ? 'Contrat' : 'Dépense'} "${d.name}" (supprimé, n'existe plus)`)
              .join('\n')}`
          : ''
      }${
        stateChanges.recentCreations.length > 0
          ? `\n\nCRÉÉS RÉCEMMENT (existent MAINTENANT dans la base de données):\n${stateChanges.recentCreations
              .map((c) => `  - ${c.type === 'job' ? 'Contrat' : 'Dépense'} "${c.name}" (créé récemment, existe maintenant)`)
              .join('\n')}`
          : ''
      }\n\nRÈGLE ABSOLUE: Si un élément a été supprimé puis recréé avec le même nom, ce sont DEUX éléments DIFFÉRENTS. Utilise TOUJOURS les IDs actuels de la base de données, JAMAIS des références à des éléments supprimés.`
    : ''}

═══════════════════════════════════════════
⚡ RÈGLES DE COMPORTEMENT (CRITIQUES)
═══════════════════════════════════════════

1. MÉMOIRE CONTEXTUELLE ET GESTION DES SUPPRESSIONS (CRITIQUE):
   ⚠️ La conversation COMPLÈTE est dans l'historique des messages ci-dessous
   ⚠️ Quand l'utilisateur dit "ce contrat", "cette dépense", "celui-là", "le dernier", etc.:
      → REGARDE les derniers messages de la conversation
      → IDENTIFIE de quel contrat/dépense il parle
      → VÉRIFIE que cet élément EXISTE ENCORE dans la base de données (regarde la section DONNÉES FINANCIÈRES)
      → Si l'élément a été supprimé, dis clairement "Cet élément a été supprimé" et demande confirmation
      → Si l'élément existe, UTILISE le bon ID ou nom pour l'action
   ⚠️ Si vraiment ambigu, demande "Tu parles du contrat [Nom]?" plutôt que de dire "Je ne trouve pas"
   
   ⚠️⚠️ RÈGLE ABSOLUE SUR LES SUPPRESSIONS ET RECRÉATIONS:
   - Si un élément a été supprimé (voir section CHANGEMENTS RÉCENTS), il N'EXISTE PLUS
   - Si un élément avec le même nom existe maintenant, c'est un NOUVEL élément (ID différent)
   - JAMAIS confondre un élément supprimé avec un élément recréé
   - TOUJOURS utiliser les IDs de la base de données ACTUELLE, pas des IDs d'éléments supprimés
   - Si l'utilisateur mentionne un nom qui existe dans les suppressions récentes ET dans les créations récentes, 
     utilise TOUJOURS celui qui existe maintenant (création récente)
   
   EXEMPLES DE RÉSOLUTION CONTEXTUELLE:
   User: "Crée un contrat Plomberie Laval 5000$"
   AI: "Parfait! Contrat créé." [se souvient: dernier contrat = Plomberie Laval]
   User: "Supprime ce contrat"
   AI: [REGARDE historique → dernier contrat mentionné = Plomberie Laval] → [VÉRIFIE qu'il existe] → utilise son ID pour delete_job
   
   EXEMPLE DE GESTION DES SUPPRESSIONS:
   User: "Supprime le contrat Plomberie Laval"
   AI: [Supprime] → "Contrat supprimé."
   User: "Crée un contrat Plomberie Laval 5000$"
   AI: [CRÉE UN NOUVEAU contrat - c'est différent de celui supprimé] → "Parfait! Nouveau contrat Plomberie Laval créé."
   User: "Supprime ce contrat"
   AI: [REGARDE historique → dernier contrat mentionné = Plomberie Laval] → [VÉRIFIE qu'il existe dans DONNÉES FINANCIÈRES] → [Utilise l'ID du NOUVEAU contrat, pas l'ancien supprimé]

2. PRÉCISION ABSOLUE:
   • Calculs toujours exacts
   • Montants ET noms explicites dans TOUTES les confirmations
   • Si doute: pose UNE question précise (pas "je ne trouve pas")

3. PERSONNALISATION NATURELLE:
   • Utilise le prénom (${userFirstName || 'l\'utilisateur'}) OCCASIONNELLEMENT (1-2 fois par conversation max, pas à chaque message!)
   • Réfère-toi aux conversations passées si pertinent
   • Maintiens le CONTEXTE de la conversation EN COURS

4. FORMAT JSON STRICT:
• JSON valide obligatoire, sans markdown ni texte avant/après:
{
  "text": "Réponse en français québécois naturel (2-3 phrases max)",
  "actions": [{"action": "nom_action", "data": {...}}]
}

• Le champ "text" = français conversationnel avec montants exacts et détails précis
• Les alias (JOB_XX, EXP_XX) sont UNIQUEMENT pour les actions, JAMAIS dans "text"
• Ton professionnel, chaleureux et naturel (prénom occasionnel seulement)

ACTIONS DISPONIBLES:
• create_job: {name, revenue, status?, clientName?, address?, description?, startDate?, endDate?}
• update_job: {jobId?, jobName?, updates:{name?, clientName?, address?, description?, status?, startDate?, endDate?, revenue?, expenses?, profit?}}
  → TU PEUX MODIFIER revenue, expenses ET profit
  → Mets SEULEMENT les champs modifiés dans "updates"
  → Ne mets JAMAIS null, undefined, ou "" dans "updates"
  → Si l'utilisateur dit "ce contrat" ou "celui-là", REGARDE l'historique pour identifier lequel
• update_job_status: {jobId?, jobName?, status} (raccourci pour changer statut uniquement)
• delete_job: {jobId?, jobName?}
  → Si l'utilisateur dit "supprime ce contrat", REGARDE l'historique pour identifier lequel
• create_expense: {name, amount, category, date?, jobId?, jobName?, vendor?, notes?, receiptImage?}
  ⚠️⚠️ RÈGLE ABSOLUE POUR LES REÇUS:
  Quand un reçu est attaché, tu verras dans le message utilisateur un bloc du type:
     [reçu: chemin_reçu=USERID/UUID.jpg ; fournisseur=NOM ; sous_total=100.00 ; TPS=5.00 ; TVQ=9.98 ; total=123.45 ; date=AAAA-MM-JJ ; articles=[Article1:10.00; Article2:15.00]]
  
  ⚠️⚠️ TU DOIS OBLIGATOIREMENT:
     1. COPIER la valeur après "chemin_reçu=" dans data.receiptImage (path exact du fichier)
     2. UTILISER AUTOMATIQUEMENT les données du reçu SANS DEMANDER:
        - data.amount = la valeur après "total=" (si présent)
        - data.date = la valeur après "date=" (convertir en format AAAA-MM-JJ si nécessaire, ou utiliser date du jour si format invalide)
        - data.vendor = la valeur après "fournisseur=" (si présent)
        - data.name = peut être dérivé du fournisseur ou du contexte si l'utilisateur ne précise pas
     3. NE JAMAIS demander le montant, la date ou le fournisseur si ces informations sont dans le bloc [reçu: ...]
     4. Si la date du reçu est en format texte (ex: "15 novembre 2025"), convertis-la en AAAA-MM-JJ (ex: "2025-11-15")
     5. Si la date n'est pas lisible ou absente, utilise la date du jour (${temporal.currentDateISO})
  
  EXEMPLE:
  User: "Crée la dépense" avec [reçu: chemin_reçu=abc/123.jpg ; fournisseur=DOLLARAMA ; total=2.75 ; date=2025-11-15]
  AI: {"text":"Parfait! Dépense créée pour DOLLARAMA de 2.75$ le 15 novembre 2025.","actions":[{"action":"create_expense","data":{"name":"DOLLARAMA","amount":2.75,"category":"Autre","date":"2025-11-15","vendor":"DOLLARAMA","receiptImage":"abc/123.jpg"}}]}
  
  ⚠️ Si plusieurs reçus sont mentionnés, utilise le DERNIER reçu attaché dans la conversation.

  ⚠️⚠️ RÉPONDRE AUX QUESTIONS SUR LES REÇUS:
  Quand l'utilisateur pose une question sur un reçu (ex: "Quelle est la TPS?", "Quels articles sont sur ce reçu?", "Combien coûte [article]?"):
     1. REGARDE le bloc [reçu: ...] dans le message utilisateur ACTUEL ou dans l'HISTORIQUE de la conversation (messages précédents)
     2. Si un reçu a été attaché dans un message précédent, son contexte [reçu: ...] sera inclus dans l'historique
     3. UTILISE les données extraites pour répondre:
        - "sous_total=" = montant avant taxes
        - "TPS=" = Taxe sur les produits et services (GST)
        - "TVP=" = Taxe de vente provinciale (PST)
        - "TVQ=" = Taxe de vente du Québec (QST)
        - "TVH=" = Taxe de vente harmonisée (HST)
        - "taxe_totale=" = total des taxes (si pas de détail)
        - "articles=[...]" = liste des articles avec prix (format: Nom:Montant; Nom:Montant)
        - "total=" = montant total final
        - "fournisseur=" = nom du magasin/fournisseur
        - "date=" = date du reçu
     3. RÉPONDS de façon NATURELLE et PRÉCISE avec les valeurs exactes
     4. Si une information n'est pas dans le bloc [reçu: ...], dis que tu ne l'as pas
  
  EXEMPLES DE RÉPONSES AUX QUESTIONS:
  User: "Quelle est la TPS sur ce reçu?" avec [reçu: ... ; TPS=5.00 ; ...]
  AI: {"text":"La TPS sur ce reçu est de 5.00$.","actions":[]}
  
  User: "Quels articles sont sur ce reçu?" avec [reçu: ... ; articles=[Pain:5.00; Lait:10.00; Oeufs:15.00]]
  AI: {"text":"Sur ce reçu, il y a: Pain à 5.00$, Lait à 10.00$, et Oeufs à 15.00$.","actions":[]}
  
  User: "Combien coûte le Pain?" avec [reçu: ... ; articles=[Pain:5.00; ...]]
  AI: {"text":"Le Pain coûte 5.00$ sur ce reçu.","actions":[]}
  
  User: "Quel est le sous-total avant taxes?" avec [reçu: ... ; sous_total=30.00 ; ...]
  AI: {"text":"Le sous-total avant taxes est de 30.00$.","actions":[]}
• update_expense: {expenseId?, expenseName?, updates:{name?, amount?, category?, date?, jobId?, vendor?, notes?, receiptImage?}}
  → Mets SEULEMENT les champs modifiés dans "updates"
  → Ne mets JAMAIS null, undefined, ou "" dans "updates"
  → Si tu dois lier une dépense EXISTANTE à un reçu attaché récemment, mets updates:{receiptImage:"CHEMIN_REÇU"} avec le même path que ci‑dessus
  → Si l'utilisateur dit "cette dépense" ou "celle-là", REGARDE l'historique pour identifier laquelle
• delete_expense: {expenseId?, expenseName?}
  → Si l'utilisateur dit "supprime cette dépense", REGARDE l'historique pour identifier laquelle
• attach_expense: {expenseId?, expenseName?, jobId?, jobName?}
• detach_expense: {expenseId?, expenseName?}
• create_category: {name}
• rename_category: {categoryName, nextName}
• delete_category: {categoryName}
• query: {} (pour questions analytiques sans modification)

EXEMPLES CORRECTS (note l'usage naturel du prénom - pas à chaque réponse!):
{"text":"Parfait! J'ai créé le contrat Plomberie Laval avec un revenu de 5000$ et ajouté la dépense Matériel de 1200$.","actions":[{"action":"create_job","data":{"name":"Plomberie Laval","revenue":5000}},{"action":"create_expense","data":{"name":"Matériel","amount":1200,"category":"Matériel","date":"${temporal.currentDateISO}","jobName":"Plomberie Laval"}}]}

{"text":"C'est fait! La dépense Essence est maintenant supprimée.","actions":[{"action":"delete_expense","data":{"expenseId":"EXP_02"}}]}

{"text":"Super! J'ai changé le montant de la dépense Outils à 75$.","actions":[{"action":"update_expense","data":{"expenseId":"EXP_05","updates":{"amount":75}}}]}

{"text":"D'accord! Ce mois-ci tu as ${totals.revenue}$ de revenus et ${totals.expenses}$ de dépenses. Ton profit est de ${totals.profit}$.","actions":[]}

EXEMPLE DE RÉSOLUTION CONTEXTUELLE:
Conversation:
User: "Crée un contrat Électricité Montréal 3000$"
AI: {"text":"Parfait! Le contrat Électricité Montréal avec un revenu de 3000$ est créé.","actions":[{"action":"create_job","data":{"name":"Électricité Montréal","revenue":3000}}]}
User: "Supprime ce contrat"
AI: [ANALYSE historique → dernier contrat créé = Électricité Montréal] → {"text":"D'accord! Le contrat Électricité Montréal est supprimé.","actions":[{"action":"delete_job","data":{"jobName":"Électricité Montréal"}}]}

CONSIGNES CRITIQUES:
- MÉMOIRE: Avant chaque action, REGARDE l'historique des messages pour identifier les entités mentionnées récemment
- Si info manque ET historique n'aide pas: pose UNE question précise, actions:[]
- Dates: format AAAA-MM-JJ (utilise date du jour si non spécifié)
- Confirmations: TOUJOURS explicites avec nom exact et montant pour suppressions/modifications
- Calculs: explique clairement dans "text"
- Montants: toujours >0 (sauf profit peut être négatif)
- Utilise jobName/expenseName (avec nom exact de la conversation) au lieu d'alias si contexte clair
- Pour modifier: SEULEMENT les champs changés dans "updates"
- Actions multiples: OK si logiques (ex: créer contrat puis dépense associée)
- TU PEUX TOUJOURS modifier les montants (revenue, expenses, profit, amount) - c'est permis!
- Quand l'utilisateur dit "change le revenu à X$" ou "modifie le profit", utilise update_job
- Quand l'utilisateur dit "change le montant de la dépense", utilise update_expense
- Les analytics/statistiques se mettront à jour automatiquement après chaque modification
- PRÉNOM: Utilise-le occasionnellement (1-2 fois par conversation), pas à chaque message!
`
}

const parseAIResponse = (responseText: string, logger: ReturnType<typeof createLogger>): ProxyResponse => {
  const rawResponse = responseText.trim()
  
  // CRITICAL: Validate that response is not empty
  if (!rawResponse) {
    logger.error("Empty AI response received")
    return { text: generateFallbackResponse('general'), actions: undefined }
  }
  
  try {
    // Step 1: Extract JSON from markdown code blocks (```json ... ```)
    let jsonStr: string | null = null
    const markdownMatch = rawResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
    if (markdownMatch) {
      jsonStr = markdownMatch[1]
    }
    
    // Step 2: If no markdown, extract raw JSON object
    if (!jsonStr) {
      // Find the first { and match closing }
      const firstBrace = rawResponse.indexOf('{')
      if (firstBrace !== -1) {
        let braceCount = 0
        let endPos = firstBrace
        
        for (let i = firstBrace; i < rawResponse.length; i++) {
          if (rawResponse[i] === '{') braceCount++
          else if (rawResponse[i] === '}') braceCount--
          
          if (braceCount === 0) {
            endPos = i + 1
            break
          }
        }
        
        if (braceCount === 0) {
          jsonStr = rawResponse.substring(firstBrace, endPos)
        }
      }
    }
    
    // Step 3: Parse the JSON
    if (!jsonStr) {
      logger.error("No JSON found in AI response", { rawResponsePreview: rawResponse.slice(0, 200) })
      return { text: generateFallbackResponse('general'), actions: undefined }
    }
    
    const parsed = JSON.parse(jsonStr)
    
    // Step 4: Extract and validate text field
    let text = typeof parsed.text === "string" ? parsed.text.trim() : ""
    
    // Step 5: Parse and sanitize actions
    const actions = sanitiseActions(parsed.actions)
    
    // Step 6: Validate response quality using new validation system
    const responseToValidate: AIResponseSchema = { text, actions }
    const validation = validateAIResponse(responseToValidate, {
      minScore: 70, // ENHANCED: Increased from 50 for better quality responses
      maxTextLength: 1000,
      requireFrench: true
    })
    
    // Log quality score for monitoring
    logger.info("AI response quality", {
      score: validation.score,
      valid: validation.valid,
      hasActions: actions && actions.length > 0
    })
    
    // If validation fails but we have actions, try to generate better text
    if (!validation.valid && actions && actions.length > 0) {
      logger.warn("AI response validation failed, generating fallback text", {
        errors: validation.errors,
        originalText: text.slice(0, 100)
      })
      
      // Generate natural French response from actions
      const actionTexts: string[] = []
      
      actions.forEach((action) => {
        if (action.confirmationMessage) {
          actionTexts.push(action.confirmationMessage)
        } else {
          // Generate default confirmation based on action type
          switch (action.action) {
            case "create_job":
            case "create_contract":
              actionTexts.push("Contrat créé avec succès!")
              break
            case "update_job":
              actionTexts.push("Contrat mis à jour.")
              break
            case "delete_job":
              actionTexts.push("Contrat supprimé.")
              break
            case "create_expense":
              actionTexts.push("Dépense ajoutée.")
              break
            case "update_expense":
              actionTexts.push("Dépense mise à jour.")
              break
            case "delete_expense":
              actionTexts.push("Dépense supprimée.")
              break
            case "create_category":
              actionTexts.push("Catégorie créée.")
              break
            case "query":
              // For queries, try to use original text if somewhat valid
              if (text && text.length > 10) {
                text = sanitizeAIText(text)
              }
              break
            default:
              actionTexts.push("Action effectuée.")
          }
        }
      })
      
      if (actionTexts.length > 0) {
        text = actionTexts.join(" ")
      }
    }
    
    // Step 7: Final text cleanup and validation
    if (!text || text.length < 3) {
      if (actions && actions.length > 0) {
        text = "Compris, c'est fait!"
      } else {
        text = "Je suis là pour vous aider. Que puis-je faire pour vous?"
      }
    }
    
    // Clean up text one final time
    text = sanitizeAIText(text)
    
    // Final quality check - if still poor quality, throw to trigger retry
    const finalScore = scoreAIResponse({ text, actions })
    if (finalScore < 40) {
      logger.error("AI response quality too low after cleanup", { finalScore, text: text.slice(0, 100) })
      throw new Error(`Response quality too low: ${finalScore}`)
    }
    
    return { text, actions }
    
  } catch (error) {
    logger.error("Failed to parse AI response", {
      error: error instanceof Error ? error.message : String(error),
      responsePreview: rawResponse.slice(0, 300)
    })
    
    // Last resort: Try to salvage something useful from the response
    // Check if it's just plain text (no JSON)
    if (!rawResponse.includes('{') && !rawResponse.includes('[')) {
      const sanitized = sanitizeAIText(rawResponse.slice(0, 500))
      if (sanitized && sanitized.length > 10) {
        return { text: sanitized, actions: undefined }
      }
    }
    
    return { 
      text: generateFallbackResponse('general'),
      actions: undefined 
    }
  }
}

const restoreAliasesInActions = (
  actions: ProxyResponse["actions"],
  jobAliases: AliasEntry[],
  expenseAliases: ExpenseAliasEntry[],
) => {
  if (!actions?.length) return actions
  const jobAliasMap = new Map(jobAliases.map((alias) => [alias.alias, alias]))
  const jobNameMap = new Map(jobAliases.map((alias) => [alias.name.toLowerCase(), alias]))
  const expenseAliasMap = new Map(expenseAliases.map((alias) => [alias.alias, alias]))
  const expenseNameMap = new Map(expenseAliases.map((alias) => [alias.name.toLowerCase(), alias]))

  const normaliseValue = (entry: AliasEntry, key?: string) => {
    if (!key) return entry.id
    const lower = key.toLowerCase()
    if (lower.includes("name") || lower.includes("title") || lower.includes("label")) {
      return entry.name
    }
    if (lower.includes("alias")) {
      return entry.alias
    }
    return entry.id
  }

  const replaceValue = (value: unknown, key?: string): unknown => {
    if (typeof value === "string") {
      const lowered = value.toLowerCase()
      const jobEntry = jobAliasMap.get(value) ?? jobNameMap.get(lowered)
      if (jobEntry) {
        return normaliseValue(jobEntry, key)
      }
      const expenseEntry = expenseAliasMap.get(value) ?? expenseNameMap.get(lowered)
      if (expenseEntry) {
        return normaliseValue(expenseEntry, key)
      }
      return value
    }
    if (Array.isArray(value)) {
      return value.map((entry) => replaceValue(entry, key))
    }
    if (value && typeof value === "object") {
      const next: Record<string, unknown> = {}
      for (const [innerKey, innerValue] of Object.entries(value)) {
        next[innerKey] = replaceValue(innerValue, innerKey)
      }
      return next
    }
    return value
  }

  return actions.map((action) => replaceValue(action) as typeof actions[number])
}

serve(async (req) => {
  // Resolve CORS origin FIRST - before anything else
  // This ensures we always have CORS headers, even if the function crashes
  let originHeader: string | null = null
  let origin: string | null = null
  let responseOrigin: string | null = null
  
  try {
    originHeader = req.headers.get("origin")
    origin = resolveAllowedOrigin(originHeader)
    
    // For CORS to work properly:
    // - If origin is in allowed list, echo it back
    // - If no origin header (same-origin or server-to-server), use null (no CORS needed)
    // - If origin not allowed, we'll reject with 403
    responseOrigin = origin ?? null
    
    // Log for debugging
    if (originHeader && !origin) {
      console.log(`[CORS] Origin not allowed: ${originHeader}`)
    }
    
    if (req.method === "OPTIONS") {
      // For OPTIONS preflight, return the origin if it's allowed
      return handleOptions(origin)
    }
    if (!origin && originHeader) {
      // Origin header was sent but not allowed - return 403 with CORS headers
      return jsonResponse({ error: "Origin not allowed" }, { status: 403, origin: "null" })
    }
  } catch (corsError) {
    // If CORS resolution fails, still return a response with CORS headers
    console.error("[ai-proxy] CORS resolution error:", corsError)
    const fallbackOrigin = originHeader || "*"
    return jsonResponse(
      { error: "Internal server error", detail: "CORS configuration error", correlationId: crypto.randomUUID() },
      { origin: fallbackOrigin, status: 500 }
    )
  }

  const correlationId = req.headers.get("x-correlation-id") ?? crypto.randomUUID()
  let logger
  try {
    logger = createLogger({ correlationId, function: "ai-proxy" })
  } catch (loggerError) {
    // If logger creation fails, still return a proper error response with CORS
    console.error("Failed to create logger:", loggerError)
    return jsonResponse(
      { error: "Internal server error", detail: "Logger initialization failed", correlationId },
      { origin: responseOrigin, status: 500 }
    )
  }
  const startedAt = performance.now()
  let userId: string | undefined

  try {
    if (req.method !== "POST") {
      throw new HttpError("Méthode non autorisée.", 405)
    }

    // Get environment variables with better error messages
    let supabaseUrl: string
    let serviceKey: string
    let openRouterKey: string | null = null
    
    try {
      supabaseUrl = getEnvVar("SUPABASE_URL")
    } catch (error) {
      logger.error("Missing SUPABASE_URL environment variable")
      throw new HttpError("Configuration error: SUPABASE_URL is missing", 500, {
        detail: "The Edge Function is missing required configuration. Please set SUPABASE_URL in your Supabase project settings.",
      })
    }
    
    try {
      serviceKey = getEnvVar("SUPABASE_SERVICE_ROLE_KEY")
    } catch (error) {
      logger.error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable")
      throw new HttpError("Configuration error: SUPABASE_SERVICE_ROLE_KEY is missing", 500, {
        detail: "The Edge Function is missing required configuration. Please set SUPABASE_SERVICE_ROLE_KEY in your Supabase project settings.",
      })
    }
    
    // OPENROUTER_API_KEY is now optional (only needed for fallback)
    openRouterKey = getOptionalEnvVar("OPENROUTER_API_KEY")

    let payload: ProxyRequest
    try {
      payload = await req.json()
    } catch {
      throw new HttpError("Corps JSON invalide.", 400)
    }

    if (!payload.prompt || typeof payload.prompt !== "string") {
      throw new HttpError("Prompt is required", 400)
    }

    const authorization = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? ""
    const supabase = createClient(supabaseUrl, serviceKey, {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    })

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) {
      throw new HttpError("Unauthorized", 401, { detail: userError?.message })
    }

    userId = userData.user.id

    // Check rate limit
    checkRateLimit(userId, 'ai-proxy', RATE_LIMITS.AI_PROXY)

    const [jobsRes, expensesRes, categoriesRes, profileRes] = await Promise.all([
      supabase.from("jobs").select("id, name, status, revenue, expenses, profit, start_date, end_date").eq("user_id", userId),
      supabase
        .from("expenses")
        .select("id, job_id, name, amount, category, date, vendor, notes")
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .limit(100),
      supabase.from("categories").select("name").eq("user_id", userId),
      supabase.from("profiles").select("name, email, company_name, tax_rate").eq("id", userId).maybeSingle(),
    ])

    if (jobsRes.error || expensesRes.error || categoriesRes.error) {
      logger.error("Failed to load user context", {
        jobsError: jobsRes.error?.message,
        expensesError: expensesRes.error?.message,
        categoriesError: categoriesRes.error?.message,
      })
      throw new HttpError("Failed to load context", 500)
    }

    const jobs = (jobsRes.data ?? []) as JobRecord[]
    const expenses = (expensesRes.data ?? []) as ExpenseRecord[]
    const categories = (categoriesRes.data ?? []).map((record) => record.name).filter((name): name is string => Boolean(name))
    const profile = profileRes.error ? null : profileRes.data ?? null

    if (profileRes.error) {
      logger.warn("Failed to load user profile", { error: profileRes.error.message })
    }

    const conversationId = payload.context?.conversationId
    let conversationMemory: string | null = null

    if (conversationId) {
      const { data: conversationRecord, error: conversationError } = await supabase
        .from("conversations")
        .select("memory_summary")
        .eq("user_id", userId)
        .eq("id", conversationId)
        .maybeSingle()

      if (conversationError) {
        logger.warn("Failed to load conversation memory", { error: conversationError.message })
      } else if (conversationRecord?.memory_summary) {
        conversationMemory = conversationRecord.memory_summary
      }
    }

    if (!conversationMemory && typeof payload.context?.conversationMemory === "string") {
      conversationMemory = payload.context.conversationMemory
    }

    const jobAliases = buildJobAliases(jobs)
    const jobAliasMap = new Map(jobAliases.map((alias) => [alias.id, alias]))
    const expenseAliases = buildExpenseAliases(expenses, jobAliasMap)
    const sanitizedPrompt = applyAliases(applyAliases(payload.prompt, expenseAliases), jobAliases)
    // ENHANCED: Keep 60 recent messages for excellent short-term memory
    // This ensures the AI can track recent entities and references like "that contract"
    // The memory summary provides additional long-term context
    const sanitizedHistory = (payload.history ?? []).slice(-60).map((message) => ({
      role: message.role,
      content: applyAliases(applyAliases(message.content, expenseAliases), jobAliases),
    }))
    
    // CRITICAL: Extract recent state changes from conversation history
    // This helps the AI understand what was deleted and what was created
    const recentStateChanges = extractStateChangesFromHistory(sanitizedHistory, jobs, expenses)

    const jobSummary = summariseJobs(jobs, jobAliases)
    const receipts = payload.context?.receipts || []
    const systemPrompt = buildSystemPrompt(jobSummary, expenseAliases, categories, conversationMemory, profile, recentStateChanges, receipts)

    // Determine which AI provider to use (need this early to format messages correctly)
    const useLmStudio = Deno.env.get("USE_LM_STUDIO") === "true"
    const useGroq = Deno.env.get("GROQ_API_KEY") && !useLmStudio
    const lmStudioUrl = Deno.env.get("LM_STUDIO_URL") ?? "http://192.168.0.103:1234"
    const model = Deno.env.get("AI_PROXY_MODEL") ?? (useLmStudio ? "google/gemma-3-12b" : "nvidia/nemotron-nano-9b-v2:free")
    
    // Build messages for AI model
    let messages: Array<{ role: ChatRole; content: string }>
    
    // LM Studio requires embedding system prompt in user message
    // Groq and OpenRouter support proper system messages
    if (useLmStudio) {
      // LM Studio: Simpler approach - embed system prompt in first user message only
      // Strict alternation: user → assistant → user → assistant
      messages = []
      
      // Add system context to the very first message
      let systemAdded = false
      
      // Process history with strict alternation
      for (const histMsg of sanitizedHistory) {
        if (messages.length === 0) {
          // First message must be user
          if (histMsg.role === "user") {
            messages.push({
              role: "user",
              content: `${systemPrompt}\n\n${histMsg.content}`,
            })
            systemAdded = true
          } else {
            // If first message is assistant, prepend a system user message
            messages.push({
              role: "user",
              content: systemPrompt,
            })
            messages.push({
              role: "assistant",
              content: histMsg.content,
            })
            systemAdded = true
          }
        } else {
          const lastRole = messages[messages.length - 1].role
          
          // Ensure alternation
          if (lastRole !== histMsg.role) {
            messages.push(histMsg)
          } else if (histMsg.role === "user") {
            // Two consecutive user messages - merge them
            messages[messages.length - 1].content += `\n\n${histMsg.content}`
          }
          // Skip consecutive assistant messages
        }
      }
      
      // Add current prompt
      if (messages.length === 0) {
        // No history - just system + prompt
        messages.push({
          role: "user",
          content: `${systemPrompt}\n\n${sanitizedPrompt}`,
        })
      } else {
        const lastRole = messages[messages.length - 1].role
        if (lastRole === "assistant") {
          // Perfect - can add user message
          messages.push({
            role: "user",
            content: systemAdded ? sanitizedPrompt : `${systemPrompt}\n\n${sanitizedPrompt}`,
          })
        } else {
          // Last was user - merge
          messages[messages.length - 1].content += `\n\n${sanitizedPrompt}`
        }
      }
      
    } else {
      // OpenRouter: Standard format with system message
      messages = [
        { role: "system" as ChatRole, content: systemPrompt },
        ...sanitizedHistory.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        { role: "user" as ChatRole, content: sanitizedPrompt },
      ]
    }

    try {
      
      // Select API endpoint
      const apiUrl = useLmStudio 
        ? `${lmStudioUrl}/v1/chat/completions`
        : useGroq
          ? "https://api.groq.com/openai/v1/chat/completions"
          : "https://openrouter.ai/api/v1/chat/completions"
      
      // Build headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      }
      
      if (useGroq) {
        const groqKey = Deno.env.get("GROQ_API_KEY")
        if (groqKey) {
          headers.Authorization = `Bearer ${groqKey}`
        }
      } else if (!useLmStudio && openRouterKey) {
        headers.Authorization = `Bearer ${openRouterKey}`
        headers["HTTP-Referer"] = Deno.env.get("AI_PROXY_REFERER") ?? "https://supabase.functions"
        headers["X-Title"] = "Fiscalia Secure Proxy"
      }
      
      const providerName = useLmStudio ? "LM Studio" : useGroq ? "Groq" : "OpenRouter"
      // Log message structure for debugging (especially for LM Studio)
      if (useLmStudio) {
        const messageRoles = messages.map(m => m.role).join(" -> ")
        logger.info(`Calling ${providerName}`, { 
          model, 
          apiUrl, 
          messageCount: messages.length,
          messageRoles,
          firstMessagePreview: messages[0]?.content?.slice(0, 100),
        })
      } else {
        logger.info(`Calling ${providerName}`, { model, apiUrl, messageCount: messages.length })
      }
      
      // Create AbortController for timeout
      const timeoutMs = useLmStudio ? 120000 : useGroq ? 30000 : 60000 // 120s for LM Studio, 30s for Groq (fast), 60s for OpenRouter
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      
      let response: Response
      try {
        response = await fetch(apiUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.7,
            max_tokens: 1200,
          }),
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
      } catch (fetchError) {
        clearTimeout(timeoutId)
        
        // Handle network errors (especially for local LM Studio)
        if (fetchError instanceof Error) {
          if (fetchError.name === "AbortError") {
            throw new HttpError("Timeout: Le modèle IA a pris trop de temps à répondre.", 504, {
              detail: `Le modèle ${model} n'a pas répondu dans les ${timeoutMs / 1000} secondes allouées.`,
            })
          }
          if (fetchError.message.includes("Failed to fetch") || fetchError.message.includes("network") || fetchError.message.includes("ECONNREFUSED")) {
            const errorMsg = useLmStudio
              ? "Impossible de se connecter à LM Studio. Vérifiez que le serveur est en cours d'exécution et accessible."
              : "Impossible de se connecter au fournisseur IA."
            throw new HttpError(errorMsg, 502, {
              detail: `Erreur réseau: ${fetchError.message}. ${useLmStudio ? `URL: ${apiUrl}` : ""}`,
            })
          }
        }
        throw fetchError
      }

      if (!response.ok) {
        const errorBody = await response.text()
        logger.error("AI provider error", { status: response.status, body: errorBody, provider: providerName })
        
        // Parse error to provide better messages
        let errorMessage = "Erreur du fournisseur IA."
        let errorDetail = errorBody
        
        // Handle specific error cases
        if (useLmStudio) {
          // LM Studio specific error handling
          if (response.status === 404) {
            errorMessage = "Modèle non trouvé dans LM Studio."
            errorDetail = `Le modèle "${model}" n'est pas disponible dans LM Studio. Vérifiez que le modèle est chargé.`
          } else if (response.status === 503 || response.status === 502) {
            errorMessage = "LM Studio n'est pas disponible."
            errorDetail = "Le serveur LM Studio ne répond pas. Vérifiez qu'il est en cours d'exécution et accessible."
          }
        } else {
          // OpenRouter specific error handling
          try {
            const errorJson = JSON.parse(errorBody)
            if (errorJson.error?.message) {
              const message = errorJson.error.message
              // Check for rate limit errors
              if (message.includes("Rate limit exceeded") || message.includes("rate limit") || message.includes("quota")) {
                errorMessage = "Limite d'utilisation quotidienne atteinte pour le modèle gratuit."
                errorDetail = "Le modèle IA gratuit a atteint sa limite quotidienne. Veuillez réessayer demain ou configurer un modèle payant dans les paramètres."
              } else if (message.includes("insufficient credits") || message.includes("credits")) {
                errorMessage = "Crédits insuffisants pour le modèle IA."
                errorDetail = "Votre compte n'a plus de crédits disponibles. Veuillez recharger votre compte ou configurer un autre modèle."
              } else {
                errorMessage = message
              }
            }
          } catch {
            // If error body is not JSON, check for rate limit in plain text
            if (errorBody.includes("Rate limit") || errorBody.includes("rate limit") || errorBody.includes("quota")) {
              errorMessage = "Limite d'utilisation quotidienne atteinte pour le modèle gratuit."
              errorDetail = "Le modèle IA gratuit a atteint sa limite quotidienne. Veuillez réessayer demain ou configurer un modèle payant dans les paramètres."
            }
          }
        }
        
        throw new HttpError(errorMessage, 502, { detail: errorDetail })
      }

      const data = await response.json()
      
      // Log the full response for debugging (remove sensitive data in production)
      logger.info(`${providerName} response`, {
        hasData: !!data,
        hasChoices: !!data?.choices,
        choicesLength: data?.choices?.length ?? 0,
        firstChoiceContent: data?.choices?.[0]?.message?.content?.slice(0, 100) ?? "no content",
        model: data?.model,
        usage: data?.usage,
      })
      
      // Check for various response structures
      const aiText: string = data?.choices?.[0]?.message?.content ?? 
                             data?.choices?.[0]?.delta?.content ?? 
                             data?.message?.content ?? 
                             ""
      
      if (!aiText.trim()) {
        // Log the full response structure to help debug
        logger.error("Empty AI response", {
          responseStructure: JSON.stringify(data).slice(0, 500),
          hasChoices: !!data?.choices,
          choicesCount: data?.choices?.length ?? 0,
          error: data?.error,
        })
        throw new HttpError("Empty AI response from model", 502, {
          detail: `Model returned empty content. Response structure: ${JSON.stringify(data).slice(0, 200)}`,
        })
      }

      const parsed = parseAIResponse(aiText, logger)
      const restoredText = revertAliases(parsed.text, [...jobAliases, ...expenseAliases])
      const restoredActionsRaw = parsed.actions
        ? restoreAliasesInActions(parsed.actions, jobAliases, expenseAliases)
        : undefined

      let safeActions = restoredActionsRaw
      if (restoredActionsRaw) {
        try {
          safeActions = sanitizeActions(restoredActionsRaw)
        } catch (validationError) {
          const normalisedValidation = normaliseError(validationError)
          logger.warn("Discarding invalid AI actions", {
            error: normalisedValidation.message,
            detail: normalisedValidation.detail,
            actions: restoredActionsRaw,
          })
          safeActions = undefined
        }
      }

      logger.info("ai-proxy response", {
        textPreview: restoredText.slice(0, 120),
        hasActions: Boolean(safeActions?.length),
        actionCount: safeActions?.length ?? 0,
      })

      const durationMs = performance.now() - startedAt
      recordMetric({
        correlationId,
        functionName: "ai-proxy",
        durationMs,
        success: true,
        userId,
        actionCount: safeActions?.length ?? 0,
      }).catch(() => {})

      return jsonResponse(
        {
          text: restoredText,
          actions: safeActions,
          correlationId,
        },
        { origin: responseOrigin },
      )
    } catch (error) {
      throw error
    }
  } catch (error) {
    const normalised = normaliseError(error)
    const durationMs = performance.now() - startedAt
    
    // Safely record metrics and log errors
    try {
      recordMetric({
        correlationId,
        functionName: "ai-proxy",
        durationMs,
        success: false,
        userId: userId ?? undefined,
        actionCount: 0,
        errorCode: normalised.code ?? undefined,
        errorMessage: normalised.message,
      }).catch(() => {})
      
      if (logger) {
        logger.error("ai-proxy failure", {
          error: normalised.message,
          status: normalised.status,
          detail: normalised.detail,
        })
      } else {
        console.error("[ai-proxy] Error:", normalised.message, normalised.detail)
      }
    } catch (loggingError) {
      console.error("[ai-proxy] Failed to log error:", loggingError)
    }
    
    // Always return a response with CORS headers, even on error
    // Use responseOrigin if available (it will be the allowed origin or null)
    // If we have an originHeader but it wasn't allowed, we should have returned 403 earlier
    // So here, responseOrigin should be set if origin was allowed, or null if no origin header
    const corsOrigin = responseOrigin ?? (originHeader || null)
    return jsonResponse(
      { error: normalised.message, detail: normalised.detail, correlationId },
      { origin: corsOrigin, status: normalised.status ?? 500 },
    )
  }
})


