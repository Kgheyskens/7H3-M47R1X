const guildSelect = document.getElementById('guild');
const grid = document.getElementById('grid');
const template = document.getElementById('card');
const statusBox = document.getElementById('stat-status');
const visibleBox = document.getElementById('stat-visible');
const accuracyBox = document.getElementById('stat-accuracy');

let activeTab = 'pending';

async function api(path, options = {}) {
    const response = await fetch(path, {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });

    if (response.status === 401) {
        window.location.href = '/admin/login';
        throw new Error('Signed out.');
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
}

function setStatus(message) {
    statusBox.textContent = message;
}

function aiVerdict(submission) {
    if (submission.ai_status === 'verified') return { label: 'Win detected', className: 'win' };
    if (submission.ai_status === 'rejected') return { label: 'No win detected', className: 'nowin' };
    if (submission.ai_status === 'manual_review') return { label: 'Not conclusive', className: 'unsure' };
    if (submission.ai_status === 'unavailable') return { label: 'Verifier unavailable', className: 'unsure' };
    return { label: 'No screenshot', className: 'unsure' };
}

/** Floored, never rounded: 99.5% must not read as 100% next to the accuracy target. */
function percent(value) {
    return value === null || value === undefined ? 'n/a' : `${Math.floor(value * 1000) / 10}%`;
}

function renderCard(submission, guildId) {
    const node = template.content.firstElementChild.cloneNode(true);

    node.querySelector('.player').textContent = submission.player_name;
    node.querySelector('.meta').textContent = [
        `#${submission.id}`,
        submission.team_name,
        submission.region,
        new Date(submission.created_at).toLocaleString(),
    ]
        .filter(Boolean)
        .join(' · ');

    const badge = node.querySelector('.badge');
    badge.textContent = submission.status;
    badge.classList.add(submission.status);

    const shot = node.querySelector('.shot');
    const image = shot.querySelector('img');
    if (submission.has_screenshot) {
        image.src = `/admin/api/submissions/${submission.id}/screenshot?guildId=${encodeURIComponent(guildId)}`;
    } else {
        shot.classList.add('empty');
        image.remove();
        shot.textContent = 'No screenshot was uploaded';
    }

    const verdict = aiVerdict(submission);
    const aiBadge = node.querySelector('.ai-badge');
    aiBadge.textContent = verdict.label;
    aiBadge.classList.add(verdict.className);
    node.querySelector('.ai-confidence').textContent = `confidence ${percent(submission.ai_confidence)}`;
    node.querySelector('.ai-note').textContent = submission.ai_note || 'No note from the verifier.';

    const warnings = [];
    if (submission.ai_disagrees_with_player) {
        warnings.push('The AI and the player disagree about whether this was a win.');
    }
    if (submission.epic_name_mismatch) {
        warnings.push(`The screenshot reads "${submission.ai_predicted_epic_name}" but the player registered as "${submission.epic_name}".`);
    }
    if (submission.ai_corrected) {
        warnings.push('A human already corrected what the AI read on this submission.');
    }
    if (warnings.length) {
        const warningBox = node.querySelector('.warning');
        warningBox.textContent = warnings.join(' ');
        warningBox.hidden = false;
    }

    node.querySelector('.fact-kills').textContent = submission.submitted_kills;
    node.querySelector('.fact-win').textContent = submission.claimed_victory ? 'Yes' : 'No';
    node.querySelector('.fact-ai-kills').textContent =
        submission.ai_predicted_kills === null ? 'n/a' : submission.ai_predicted_kills;
    node.querySelector('.fact-epic').textContent = submission.epic_name || 'n/a';

    const form = node.querySelector('.decision');
    const killsInput = form.querySelector('.input-kills');
    const winInput = form.querySelector('.input-win');
    const noteInput = form.querySelector('.input-note');

    // Prefer what the AI read; fall back to what the player claimed.
    killsInput.value = submission.approved_kills ?? submission.ai_predicted_kills ?? submission.submitted_kills;
    winInput.checked =
        submission.status === 'approved'
            ? submission.victory_awarded
            : submission.ai_predicted_victory ?? submission.claimed_victory;
    noteInput.value = submission.review_note || '';

    async function decide(action) {
        const buttons = form.querySelectorAll('button');
        buttons.forEach((button) => { button.disabled = true; });

        try {
            await api(`/admin/api/submissions/${submission.id}/${action}`, {
                method: 'POST',
                body: JSON.stringify({
                    guildId,
                    userId: submission.user_id,
                    kills: Number(killsInput.value),
                    victory: winInput.checked,
                    note: noteInput.value || null,
                }),
            });
            setStatus(`Submission #${submission.id} ${action === 'approve' ? 'approved' : 'rejected'}.`);
            await load();
        } catch (error) {
            setStatus(error.message);
            buttons.forEach((button) => { button.disabled = false; });
        }
    }

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        decide('approve');
    });
    form.querySelector('.btn-reject').addEventListener('click', () => decide('reject'));

    return node;
}

async function load() {
    const guildId = guildSelect.value;
    if (!guildId) return;

    setStatus('Loading…');
    grid.replaceChildren();

    try {
        const { submissions, aiStats } = await api(
            `/admin/api/submissions?guildId=${encodeURIComponent(guildId)}&tab=${encodeURIComponent(activeTab)}`,
        );

        visibleBox.textContent = submissions.length;
        accuracyBox.textContent = aiStats?.accuracy === null || !aiStats
            ? 'n/a'
            : `${percent(aiStats.accuracy)} (${aiStats.sampleSize} reviewed)`;

        if (!submissions.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = 'Nothing to show in this tab.';
            grid.append(empty);
        } else {
            for (const submission of submissions) {
                grid.append(renderCard(submission, guildId));
            }
        }

        setStatus('Up to date.');
    } catch (error) {
        setStatus(error.message);
    }
}

document.getElementById('tabs').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-tab]');
    if (!button) return;

    activeTab = button.dataset.tab;
    document.querySelectorAll('#tabs button').forEach((tab) => tab.classList.toggle('active', tab === button));
    load();
});

guildSelect.addEventListener('change', load);
document.getElementById('refresh').addEventListener('click', load);

(async function start() {
    try {
        const { guilds } = await api('/admin/api/guilds');
        guildSelect.replaceChildren(
            ...guilds.map((guild) => {
                const option = document.createElement('option');
                option.value = guild.id;
                option.textContent = guild.name;
                return option;
            }),
        );
        await load();
    } catch (error) {
        setStatus(error.message);
    }
})();
