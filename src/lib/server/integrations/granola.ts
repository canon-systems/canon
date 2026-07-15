import { nangoProxyGet } from '@/lib/server/integrations/nango';
import { SOURCE_SYNC_LOOKBACK_DAYS, SOURCE_SYNC_TRANSCRIPT_ITEM_LIMIT } from '@/lib/knowledge/source-sync-policy';

type GranolaNotesResponse = {
  notes?: unknown[];
  hasMore?: boolean;
  cursor?: string | null;
};

type GranolaFoldersResponse = {
  folders?: unknown[];
  hasMore?: boolean;
  cursor?: string | null;
};

export type GranolaFolderDiagnostic = {
  id: string;
  name: string | null;
  parentFolderId: string | null;
  notesCount: number | null;
  fetched: boolean;
  error: string | null;
};

export type GranolaDetailDiagnostic = {
  index: number;
  noteId: string | null;
  fetched: boolean;
  responseKeys: string[];
  transcriptType: string;
  transcriptItems: number;
  transcriptTextChars: number;
  error: string | null;
};

export type GranolaPageDiagnostic = {
  page: number;
  responseType: string;
  responseKeys: string[];
  notesType: string;
  notesCount: number;
  hasMore: boolean | null;
  cursorReturned: boolean;
  firstNoteKeys: string[];
  firstNoteFieldTypes: Record<string, string>;
};

export type GranolaNoteDiagnostic = {
  index: number;
  rawType: string;
  rawKeys: string[];
  idPresent: boolean;
  titleLength: number;
  collectedTextParts: number;
  bodyLength: number;
  contentLength: number;
  textFieldLengths: Record<string, number>;
  normalized: boolean;
  rejectionReason: string | null;
};

export type GranolaFetchDiagnostics = {
  endpoint: string;
  pageSize: number;
  maxNotes: number;
  pages: GranolaPageDiagnostic[];
  folders: GranolaFolderDiagnostic[];
  details: GranolaDetailDiagnostic[];
  notes: GranolaNoteDiagnostic[];
};

export type NormalizedGranolaNote = {
  id: string;
  title: string;
  content: string;
  meetingDate: string | null;
  url: string | null;
  metadata: Record<string, unknown>;
};

export type GranolaNotesFetchResult = {
  notes: NormalizedGranolaNote[];
  rawCount: number;
  pagesFetched: number;
  detailsFetched: number;
  transcriptItems: number;
  transcriptTextChars: number;
  diagnostics: GranolaFetchDiagnostics;
};

const MAX_NOTES = SOURCE_SYNC_TRANSCRIPT_ITEM_LIMIT;
const PAGE_SIZE = 30;
const TEXT_FIELD_NAMES = new Set([
  'title',
  'name',
  'summary',
  'summary_text',
  'summaryText',
  'summary_markdown',
  'summaryMarkdown',
  'notes',
  'note',
  'content',
  'markdown',
  'text',
  'transcript',
  'description',
  'action_items',
  'actionItems',
  'takeaways',
  'topics',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function valueType(value: unknown) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function limitedKeys(record: Record<string, unknown>, limit = 30) {
  return Object.keys(record).slice(0, limit);
}

function fieldTypes(record: Record<string, unknown>, limit = 30) {
  return Object.fromEntries(
    Object.entries(record)
      .slice(0, limit)
      .map(([key, value]) => [key, valueType(value)])
  );
}

function stringField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

function noteIdFromRaw(raw: unknown) {
  if (!isRecord(raw)) return null;
  const id = stringField(raw, ['id', 'note_id', 'noteId']);
  return id?.startsWith('not_') ? id : null;
}

function folderFromRaw(raw: unknown): GranolaFolderDiagnostic | null {
  if (!isRecord(raw)) return null;
  const id = stringField(raw, ['id']);
  if (!id?.startsWith('fol_')) return null;
  return {
    id,
    name: stringField(raw, ['name']),
    parentFolderId: stringField(raw, ['parent_folder_id', 'parentFolderId']),
    notesCount: null,
    fetched: false,
    error: null,
  };
}

function arrayStringField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    const strings = value
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        if (isRecord(entry)) return stringField(entry, ['name', 'email', 'title', 'text']);
        return null;
      })
      .filter((entry): entry is string => Boolean(entry));
    if (strings.length > 0) return strings;
  }
  return [];
}

function textLength(value: unknown, depth = 0): number {
  if (depth > 3 || value === null || value === undefined) return 0;
  if (typeof value === 'string') return value.trim().length;
  if (Array.isArray(value)) return value.reduce<number>((sum, entry) => sum + textLength(entry, depth + 1), 0);
  if (!isRecord(value)) return 0;
  return Object.values(value).reduce<number>((sum, entry) => sum + textLength(entry, depth + 1), 0);
}

function collectTextFieldLengths(
  value: unknown,
  keyPath = '',
  depth = 0,
  entries: Array<[string, number]> = []
) {
  if (entries.length >= 30 || depth > 4 || value === null || value === undefined) return entries;

  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 20)) {
      collectTextFieldLengths(entry, keyPath, depth + 1, entries);
      if (entries.length >= 30) break;
    }
    return entries;
  }

  if (!isRecord(value)) return entries;

  for (const [key, entry] of Object.entries(value)) {
    const path = keyPath ? `${keyPath}.${key}` : key;
    if (TEXT_FIELD_NAMES.has(key)) {
      const length = textLength(entry);
      if (length > 0) entries.push([path, length]);
    }

    if (isRecord(entry) || Array.isArray(entry)) {
      collectTextFieldLengths(entry, path, depth + 1, entries);
      if (entries.length >= 30) break;
    }
  }

  return entries;
}

function transcriptStats(raw: unknown) {
  if (!isRecord(raw)) {
    return { transcriptType: valueType(undefined), transcriptItems: 0, transcriptTextChars: 0 };
  }

  const transcript = raw.transcript;
  if (!Array.isArray(transcript)) {
    return { transcriptType: valueType(transcript), transcriptItems: 0, transcriptTextChars: 0 };
  }

  return {
    transcriptType: 'array',
    transcriptItems: transcript.length,
    transcriptTextChars: transcript.reduce<number>((sum, entry) => {
      if (!isRecord(entry)) return sum;
      const text = typeof entry.text === 'string' ? entry.text.trim() : '';
      return sum + text.length;
    }, 0),
  };
}

function transcriptTextParts(raw: Record<string, unknown>) {
  const transcript = raw.transcript;
  if (!Array.isArray(transcript)) return [];

  return transcript.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const text = typeof entry.text === 'string' ? entry.text.replace(/\s+/g, ' ').trim() : '';
    if (text.length < 2) return [];
    const speaker = stringField(entry, ['speaker', 'speaker_name', 'speakerName', 'name']);
    return speaker ? [`${speaker}: ${text}`] : [text];
  });
}

function compactJoin(parts: string[]) {
  const seen = new Set<string>();
  return parts
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => {
      if (!part || seen.has(part)) return false;
      seen.add(part);
      return true;
    })
    .join('\n\n');
}

function isWithinWindow(isoDate: string | null, windowDays: number) {
  if (!isoDate) return true;
  const timestamp = new Date(isoDate).getTime();
  if (!Number.isFinite(timestamp)) return true;
  return timestamp >= Date.now() - windowDays * 24 * 60 * 60 * 1000;
}

function normalizeGranolaNoteWithDiagnostics(
  raw: unknown,
  index: number
): { note: NormalizedGranolaNote | null; diagnostic: GranolaNoteDiagnostic } {
  if (!isRecord(raw)) {
    return {
      note: null,
      diagnostic: {
        index,
        rawType: valueType(raw),
        rawKeys: [],
        idPresent: false,
        titleLength: 0,
        collectedTextParts: 0,
        bodyLength: 0,
        contentLength: 0,
        textFieldLengths: {},
        normalized: false,
        rejectionReason: 'raw_note_not_object',
      } satisfies GranolaNoteDiagnostic,
    };
  }

  const id = stringField(raw, ['id', 'uuid', 'note_id', 'noteId']) ?? `granola-note-${index}`;
  const title = stringField(raw, ['title', 'name', 'subject']) ?? `Granola meeting note ${index + 1}`;
  const meetingDate = stringField(raw, [
    'meeting_date',
    'meetingDate',
    'start_time',
    'startTime',
    'created_at',
    'createdAt',
    'updated_at',
    'updatedAt',
  ]);
  const url = stringField(raw, ['url', 'web_url', 'webUrl', 'share_url', 'shareUrl', 'app_url', 'appUrl']);
  const participants = arrayStringField(raw, ['participants', 'attendees', 'people']);
  const textParts = transcriptTextParts(raw);
  const body = compactJoin(textParts);

  const sections = [
    `Granola transcript: ${title}`,
    meetingDate ? `Meeting date: ${meetingDate}` : '',
    participants.length > 0 ? `Participants: ${participants.join(', ')}` : '',
    body,
  ].filter(Boolean);

  const content = sections.join('\n\n').trim();
  const diagnosticBase = {
    index,
    rawType: valueType(raw),
    rawKeys: limitedKeys(raw),
    idPresent: Boolean(stringField(raw, ['id', 'uuid', 'note_id', 'noteId'])),
    titleLength: title.length,
    collectedTextParts: textParts.length,
    bodyLength: body.length,
    contentLength: content.length,
    textFieldLengths: Object.fromEntries(collectTextFieldLengths(raw)),
  };

  if (content.length < 40) {
    return {
      note: null,
      diagnostic: {
        ...diagnosticBase,
        normalized: false,
        rejectionReason: `content_too_short:${content.length}`,
      } satisfies GranolaNoteDiagnostic,
    };
  }

  const note: NormalizedGranolaNote = {
    id,
    title,
    content,
    meetingDate,
    url,
    metadata: {
      provider: 'granola',
      source_type: 'transcript',
      source_name: title,
      source_url: url,
      note_id: id,
      title,
      meeting_date: meetingDate,
      url,
      participants,
    },
  };

  return {
    note,
    diagnostic: {
      ...diagnosticBase,
      normalized: true,
      rejectionReason: null,
    } satisfies GranolaNoteDiagnostic,
  };
}

async function fetchGranolaFolders(connectionId: string) {
  const folders: GranolaFolderDiagnostic[] = [];
  let cursor: string | null | undefined;

  do {
    const data = await nangoProxyGet({
      provider: 'granola',
      connectionId,
      endpoint: '/v1/folders',
      query: { page_size: PAGE_SIZE, cursor },
    }) as GranolaFoldersResponse;

    if (Array.isArray(data.folders)) {
      folders.push(...data.folders.flatMap((folder) => {
        const diagnostic = folderFromRaw(folder);
        return diagnostic ? [diagnostic] : [];
      }));
    }

    cursor = typeof data.cursor === 'string' && data.cursor.trim().length > 0 ? data.cursor : null;
    if (!data.hasMore) break;
  } while (cursor && folders.length < MAX_NOTES);

  return folders.slice(0, MAX_NOTES);
}

async function fetchGranolaNotesPage(params: {
  connectionId: string;
  cursor?: string | null;
  folderId?: string;
}) {
  return await nangoProxyGet({
    provider: 'granola',
    connectionId: params.connectionId,
    endpoint: '/v1/notes',
    query: { page_size: PAGE_SIZE, cursor: params.cursor, folder_id: params.folderId },
  }) as GranolaNotesResponse;
}

async function fetchGranolaFolderNotes(params: {
  connectionId: string;
  folders: GranolaFolderDiagnostic[];
}) {
  const notes: unknown[] = [];

  for (const folder of params.folders) {
    try {
      const data = await fetchGranolaNotesPage({
        connectionId: params.connectionId,
        folderId: folder.id,
      });
      const folderNotes = Array.isArray(data.notes) ? data.notes : [];
      folder.notesCount = folderNotes.length;
      folder.fetched = true;
      notes.push(...folderNotes);
    } catch (error) {
      folder.notesCount = null;
      folder.fetched = false;
      folder.error = error instanceof Error ? error.message : String(error);
    }
  }

  return notes;
}

async function fetchGranolaNoteDetailsWithTranscripts(params: {
  connectionId: string;
  rawNotes: unknown[];
  diagnostics: GranolaFetchDiagnostics;
}) {
  const enrichedNotes: unknown[] = [];

  for (const [index, rawNote] of params.rawNotes.entries()) {
    const noteId = noteIdFromRaw(rawNote);
    if (!noteId) {
      params.diagnostics.details.push({
        index,
        noteId: null,
        fetched: false,
        responseKeys: isRecord(rawNote) ? limitedKeys(rawNote) : [],
        transcriptType: valueType(undefined),
        transcriptItems: 0,
        transcriptTextChars: 0,
        error: 'missing_not_id',
      });
      enrichedNotes.push(rawNote);
      continue;
    }

    try {
      const detail = await nangoProxyGet({
        provider: 'granola',
        connectionId: params.connectionId,
        endpoint: `/v1/notes/${encodeURIComponent(noteId)}`,
        query: { include: 'transcript' },
      });
      const stats = transcriptStats(detail);
      params.diagnostics.details.push({
        index,
        noteId,
        fetched: true,
        responseKeys: isRecord(detail) ? limitedKeys(detail) : [],
        ...stats,
        error: null,
      });
      enrichedNotes.push(detail);
    } catch (error) {
      params.diagnostics.details.push({
        index,
        noteId,
        fetched: false,
        responseKeys: isRecord(rawNote) ? limitedKeys(rawNote) : [],
        transcriptType: valueType(undefined),
        transcriptItems: 0,
        transcriptTextChars: 0,
        error: error instanceof Error ? error.message : String(error),
      });
      enrichedNotes.push(rawNote);
    }
  }

  return enrichedNotes;
}

export async function fetchGranolaNotes(
  connectionId: string,
  options?: { windowDays?: number; maxNotes?: number }
): Promise<GranolaNotesFetchResult> {
  const notes: unknown[] = [];
  let cursor: string | null | undefined;
  let pagesFetched = 0;
  const maxNotes = Math.max(1, Math.min(5000, Math.round(options?.maxNotes ?? MAX_NOTES)));
  const windowDays = Math.max(1, Math.min(365, Math.round(options?.windowDays ?? SOURCE_SYNC_LOOKBACK_DAYS)));
  const diagnostics: GranolaFetchDiagnostics = {
    endpoint: '/v1/notes',
    pageSize: PAGE_SIZE,
    maxNotes,
    pages: [],
    folders: [],
    details: [],
    notes: [],
  };

  do {
    const data = await fetchGranolaNotesPage({ connectionId, cursor });

    pagesFetched++;
    const firstNote = Array.isArray(data.notes) ? data.notes.find(isRecord) : null;
    diagnostics.pages.push({
      page: pagesFetched,
      responseType: valueType(data),
      responseKeys: isRecord(data) ? limitedKeys(data) : [],
      notesType: valueType(data.notes),
      notesCount: Array.isArray(data.notes) ? data.notes.length : 0,
      hasMore: typeof data.hasMore === 'boolean' ? data.hasMore : null,
      cursorReturned: typeof data.cursor === 'string' && data.cursor.trim().length > 0,
      firstNoteKeys: firstNote ? limitedKeys(firstNote) : [],
      firstNoteFieldTypes: firstNote ? fieldTypes(firstNote) : {},
    });

    if (Array.isArray(data.notes)) {
      notes.push(...data.notes);
    }

    cursor = typeof data.cursor === 'string' && data.cursor.trim().length > 0 ? data.cursor : null;
    if (!data.hasMore) break;
  } while (cursor && notes.length < maxNotes);

  if (notes.length === 0) {
    diagnostics.folders = await fetchGranolaFolders(connectionId);
    const folderNotes = await fetchGranolaFolderNotes({
      connectionId,
      folders: diagnostics.folders,
    });
    notes.push(...folderNotes);
  }

  const limitedNotes = notes.slice(0, maxNotes);
  const enrichedNotes = await fetchGranolaNoteDetailsWithTranscripts({
    connectionId,
    rawNotes: limitedNotes,
    diagnostics,
  });

  const normalized = enrichedNotes
    .map((note, index) => normalizeGranolaNoteWithDiagnostics(note, index));
  diagnostics.notes = normalized.map((entry) => entry.diagnostic);
  const normalizedNotes = normalized
    .map((entry) => entry.note)
    .filter((note): note is NormalizedGranolaNote => note !== null)
    .filter((note) => isWithinWindow(note.meetingDate, windowDays))
    .slice(0, maxNotes);

  return {
    notes: normalizedNotes,
    rawCount: notes.length,
    pagesFetched,
    detailsFetched: diagnostics.details.filter((detail) => detail.fetched).length,
    transcriptItems: diagnostics.details.reduce((sum, detail) => sum + detail.transcriptItems, 0),
    transcriptTextChars: diagnostics.details.reduce((sum, detail) => sum + detail.transcriptTextChars, 0),
    diagnostics,
  };
}
