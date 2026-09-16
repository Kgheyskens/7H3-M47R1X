function boundedJoin(labels, limit = 1000) {
    let result = '';
    let shown = 0;

    for (const label of labels) {
        const next = result ? `${result}, ${label}` : label;
        if (next.length > limit) break;
        result = next;
        shown += 1;
    }

    const remaining = labels.length - shown;
    return remaining > 0 ? `${result}, …and ${remaining} more` : result;
}

/** Splits text into chunks no longer than `size`, breaking on a line boundary where possible. */
function chunkText(text, size) {
    if (text.length <= size) return [text];

    const chunks = [];
    let rest = text;

    while (rest.length > size) {
        let cut = rest.lastIndexOf('\n', size);
        if (cut < size * 0.5) cut = size;
        chunks.push(rest.slice(0, cut));
        rest = rest.slice(cut).replace(/^\n/, '');
    }
    if (rest) chunks.push(rest);

    return chunks;
}

function truncate(text, limit) {
    return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

module.exports = { boundedJoin, chunkText, truncate };
