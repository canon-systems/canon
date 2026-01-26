import api, { route } from '@forge/api';

function escapeHtml(input) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  const output = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      output.push('</ul>');
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }

    if (line.startsWith('### ')) {
      closeList();
      output.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      closeList();
      output.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith('# ')) {
      closeList();
      output.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
      continue;
    }

    if (line.startsWith('- ')) {
      if (!inList) {
        output.push('<ul>');
        inList = true;
      }
      output.push(`<li>${escapeHtml(line.slice(2))}</li>`);
      continue;
    }

    closeList();
    output.push(`<p>${escapeHtml(line)}</p>`);
  }

  closeList();
  return output.join('');
}

export async function diffIngest(event) {
  try {
    const body = event?.body ? JSON.parse(event.body) : {};
    const pageId = body.pageId;
    const title = body.title || 'Daily Activity Diff';
    const markdown = body.markdown || '';

    if (!pageId) {
      return {
        outputKey: 'bad-request',
      };
    }

    const pageResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}`
    );

    if (!pageResponse.ok) {
      // Return not-found for 404, server-error for other fetch failures
      return {
        outputKey: pageResponse.status === 404 ? 'not-found' : 'server-error',
      };
    }

    const page = await pageResponse.json();
    const currentVersion = page?.version?.number ? Number(page.version.number) : null;
    if (!currentVersion) {
      return {
        outputKey: 'server-error',
      };
    }

    const storageValue = markdownToHtml(markdown);
    const updateResponse = await api.asApp().requestConfluence(
      route`/wiki/api/v2/pages/${pageId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: pageId,
          status: 'current',
          title,
          version: {
            number: currentVersion + 1,
          },
          body: {
            representation: 'storage',
            value: storageValue,
          },
        }),
      }
    );

    if (!updateResponse.ok) {
      // Return server-error for update failures
      return {
        outputKey: 'server-error',
      };
    }

    // Success - page was updated
    return {
      outputKey: 'success',
    };
  } catch (error) {
    // Return server-error for any unexpected errors
    return {
      outputKey: 'server-error',
    };
  }
}
