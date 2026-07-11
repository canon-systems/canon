import type {
  GranolaDetailDiagnostic,
  GranolaFetchDiagnostics,
  GranolaFolderDiagnostic,
  GranolaNoteDiagnostic,
  GranolaPageDiagnostic,
} from '@/lib/server/integrations/granola';

type GranolaDiagnosticsLogger = {
  info(event: string, metadata?: Record<string, unknown>): void;
  warn(event: string, metadata?: Record<string, unknown>): void;
};

function compactPairs(record: Record<string, string | number>, limit = 8) {
  return Object.entries(record)
    .slice(0, limit)
    .map(([key, value]) => `${key}:${value}`)
    .join(',');
}

function summarizeGranolaPage(page: GranolaPageDiagnostic) {
  return {
    page: page.page,
    responseType: page.responseType,
    responseKeys: page.responseKeys.join(',') || 'none',
    notesType: page.notesType,
    notesCount: page.notesCount,
    hasMore: page.hasMore,
    cursorReturned: page.cursorReturned,
    firstNoteKeys: page.firstNoteKeys.join(',') || 'none',
    firstNoteFieldTypes: compactPairs(page.firstNoteFieldTypes),
  };
}

function summarizeGranolaRejectedNote(note: GranolaNoteDiagnostic) {
  return {
    index: note.index,
    rawType: note.rawType,
    rawKeys: note.rawKeys.join(',') || 'none',
    idPresent: note.idPresent,
    titleLength: note.titleLength,
    collectedTextParts: note.collectedTextParts,
    bodyLength: note.bodyLength,
    contentLength: note.contentLength,
    textFieldLengths: compactPairs(note.textFieldLengths),
    reason: note.rejectionReason,
  };
}

function summarizeGranolaFailedDetail(detail: GranolaDetailDiagnostic) {
  return {
    index: detail.index,
    noteId: detail.noteId,
    responseKeys: detail.responseKeys.join(',') || 'none',
    error: detail.error,
  };
}

function summarizeGranolaFolder(folder: GranolaFolderDiagnostic) {
  return [
    folder.id,
    folder.name || 'unnamed',
    `notes:${folder.notesCount ?? 'unknown'}`,
    folder.error ? `error:${folder.error}` : '',
  ].filter(Boolean).join('|');
}

export function logGranolaDiagnostics(params: {
  log: GranolaDiagnosticsLogger;
  sourceId: string;
  sourceName: string;
  diagnostics: GranolaFetchDiagnostics;
}) {
  for (const page of params.diagnostics.pages) {
    params.log.info('granola_api_page', {
      sourceId: params.sourceId,
      source: params.sourceName,
      provider: 'granola',
      endpoint: params.diagnostics.endpoint,
      pageSize: params.diagnostics.pageSize,
      ...summarizeGranolaPage(page),
    });
  }

  const rawNotesSeen = params.diagnostics.pages.reduce((sum, page) => sum + page.notesCount, 0);
  const normalizedNotes = params.diagnostics.notes.filter((note) => note.normalized).length;
  const rejectedNotes = params.diagnostics.notes.filter((note) => !note.normalized);
  const detailsFetched = params.diagnostics.details.filter((detail) => detail.fetched).length;
  const detailFailures = params.diagnostics.details.filter((detail) => !detail.fetched);
  const transcriptItems = params.diagnostics.details.reduce((sum, detail) => sum + detail.transcriptItems, 0);
  const transcriptTextChars = params.diagnostics.details.reduce((sum, detail) => sum + detail.transcriptTextChars, 0);

  if (params.diagnostics.folders.length > 0) {
    params.log.info('granola_folder_summary', {
      sourceId: params.sourceId,
      source: params.sourceName,
      provider: 'granola',
      foldersVisible: params.diagnostics.folders.length,
      foldersWithNotes: params.diagnostics.folders.filter((folder) => (folder.notesCount ?? 0) > 0).length,
      folderNotesTotal: params.diagnostics.folders.reduce((sum, folder) => sum + (folder.notesCount ?? 0), 0),
      folders: params.diagnostics.folders.slice(0, 8).map(summarizeGranolaFolder).join(','),
    });
  }

  params.log.info('granola_normalization_summary', {
    sourceId: params.sourceId,
    source: params.sourceName,
    provider: 'granola',
    rawNotesSeen,
    normalizedNotes,
    rejectedNotes: rejectedNotes.length,
    rejectionReasons: compactPairs(
      rejectedNotes.reduce<Record<string, number>>((acc, note) => {
        const reason = note.rejectionReason || 'unknown';
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {})
    ) || 'none',
  });

  params.log.info('granola_transcript_summary', {
    sourceId: params.sourceId,
    source: params.sourceName,
    provider: 'granola',
    listedNotes: rawNotesSeen,
    detailRequests: params.diagnostics.details.length,
    detailsFetched,
    detailFailures: detailFailures.length,
    transcriptItems,
    transcriptTextChars,
    failureReasons: compactPairs(
      detailFailures.reduce<Record<string, number>>((acc, detail) => {
        const reason = detail.error || 'unknown';
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {})
    ) || 'none',
  });

  if (rawNotesSeen === 0) {
    params.log.warn('granola_empty_response', {
      sourceId: params.sourceId,
      source: params.sourceName,
      provider: 'granola',
      endpoint: params.diagnostics.endpoint,
      pages: params.diagnostics.pages.length,
      pageNotesCounts: params.diagnostics.pages.map((page) => `${page.page}:${page.notesCount}`).join(',') || 'none',
      likelyCause: 'Nango Granola API key can authenticate, but /v1/notes returned no notes for this workspace/key',
    });
  }

  for (const detail of detailFailures.slice(0, 5)) {
    params.log.warn('granola_transcript_fetch_failed', {
      sourceId: params.sourceId,
      source: params.sourceName,
      provider: 'granola',
      ...summarizeGranolaFailedDetail(detail),
    });
  }

  for (const note of rejectedNotes.slice(0, 5)) {
    params.log.warn('granola_note_rejected', {
      sourceId: params.sourceId,
      source: params.sourceName,
      provider: 'granola',
      ...summarizeGranolaRejectedNote(note),
    });
  }
}
