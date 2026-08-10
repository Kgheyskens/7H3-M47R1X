const { EmbedBuilder } = require('discord.js');
const { query } = require('./db');
const { getPlayerStandings, getTeamStandings } = require('./scoreStore');
const { getActiveTournament, getTournament } = require('./tournamentStore');

const MEDALS = ['🥇', '🥈', '🥉'];

function rankGlyph(index) {
    return MEDALS[index] || `**${index + 1}.**`;
}

function plural(count, singular, pluralForm = `${singular}s`) {
    return count === 1 ? singular : pluralForm;
}

async function buildTeamEmbed(guild, tournamentId = null) {
    const rows = await getTeamStandings(guild.id, tournamentId);
    const tournament = tournamentId ? await getTournament(guild.id, tournamentId) : null;

    const description = rows.length
        ? rows
              .map((row, index) => {
                  const label = guild.roles.cache.get(row.role_id) ? `<@&${row.role_id}>` : row.name;
                  return [
                      `${rankGlyph(index)}  ${label}`,
                      `**${row.points} ${plural(row.points, 'point')}**  ·  ${row.kills} ${plural(row.kills, 'kill')}  ·  ${row.wins} ${plural(row.wins, 'win')}`,
                  ].join('\n');
              })
              .join('\n\n')
        : 'No teams have scored yet.';

    return new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('🏆 Team Leaderboard')
        .setDescription(tournament ? `**${tournament.name}**\n\n${description}` : description)
        .setFooter({ text: 'Only approved submissions count · Updates automatically' })
        .setTimestamp();
}

async function buildPlayerEmbed(guild, tournamentId = null, limit = 15) {
    const rows = await getPlayerStandings(guild.id, tournamentId, limit);
    const tournament = tournamentId ? await getTournament(guild.id, tournamentId) : null;

    const description = rows.length
        ? rows
              .map((row, index) => {
                  const team = row.team_name ? ` · ${row.team_name}` : '';
                  return `${rankGlyph(index)} <@${row.user_id}> — **${row.points} ${plural(row.points, 'point')}** · ${row.wins} ${plural(row.wins, 'win')} · ${row.kills} ${plural(row.kills, 'kill')}${team}`;
              })
              .join('\n')
        : 'No approved scores yet.';

    return new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('🎯 Player Leaderboard')
        .setDescription(tournament ? `**${tournament.name}**\n\n${description}` : description)
        .setFooter({ text: 'Only approved submissions count · Updates automatically' })
        .setTimestamp();
}

async function buildTournamentEmbed(guild) {
    const tournament = await getActiveTournament(guild.id);
    if (!tournament) {
        return new EmbedBuilder()
            .setColor(0x99aab5)
            .setTitle('🎮 Tournament Standings')
            .setDescription('No tournament is currently running.')
            .setTimestamp();
    }

    return buildPlayerEmbed(guild, tournament.id, 15);
}

const BUILDERS = {
    team: (guild, tournamentId) => buildTeamEmbed(guild, tournamentId),
    player: (guild, tournamentId) => buildPlayerEmbed(guild, tournamentId),
    tournament: (guild) => buildTournamentEmbed(guild),
};

async function setLiveBoard(guildId, boardType, channelId, messageId, tournamentId = null) {
    await query(
        `INSERT INTO live_boards (guild_id, board_type, channel_id, message_id, tournament_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (guild_id, board_type) DO UPDATE
         SET channel_id = EXCLUDED.channel_id,
             message_id = EXCLUDED.message_id,
             tournament_id = EXCLUDED.tournament_id,
             updated_at = NOW()`,
        [guildId, boardType, channelId, messageId, tournamentId],
    );
}

async function getLiveBoards(guildId) {
    const result = await query('SELECT * FROM live_boards WHERE guild_id = $1', [guildId]);
    return result.rows;
}

/** Returns false when the tracked message is gone, so a deleted board simply stops updating. */
async function refreshLiveBoard(guild, board) {
    const builder = BUILDERS[board.board_type];
    if (!builder) return false;

    const channel = await guild.channels.fetch(board.channel_id).catch(() => null);
    if (!channel || !channel.isTextBased()) return false;

    const message = await channel.messages.fetch(board.message_id).catch(() => null);
    if (!message) return false;

    const embed = await builder(guild, board.tournament_id);
    await message.edit({ embeds: [embed] });
    return true;
}

async function refreshGuildBoards(guild) {
    const boards = await getLiveBoards(guild.id);
    await Promise.all(
        boards.map((board) =>
            refreshLiveBoard(guild, board).catch((error) =>
                console.error(`Could not refresh the ${board.board_type} board for guild ${guild.id}:`, error.message),
            ),
        ),
    );
}

async function refreshAllBoards(client) {
    for (const guild of client.guilds.cache.values()) {
        await refreshGuildBoards(guild).catch((error) =>
            console.error(`Could not refresh boards for guild ${guild.id}:`, error.message),
        );
    }
}

module.exports = {
    buildPlayerEmbed,
    buildTeamEmbed,
    buildTournamentEmbed,
    getLiveBoards,
    rankGlyph,
    refreshAllBoards,
    refreshGuildBoards,
    refreshLiveBoard,
    setLiveBoard,
};
