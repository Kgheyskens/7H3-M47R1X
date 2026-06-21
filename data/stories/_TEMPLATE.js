// ================================================================
// 📖 STORY TEMPLATE  —  copy this file to make a new story!
// ================================================================
//
// HOW TO ADD YOUR OWN STORY (3 steps):
//
//   1. Copy this file. Name it after your story, e.g.
//        data/stories/sunken-city.js
//      (The leading "_" in "_TEMPLATE" is what makes the bot IGNORE
//       this file. Your real story file must NOT start with "_".)
//
//   2. Fill in the fields below. Keep the structure exactly the same.
//
//   3. Redeploy / restart the bot, then run /setup in Discord.
//      The bot auto-creates every role and channel for your new story.
//      Nothing else to wire up.
//
// RULES OF THUMB:
//   - "id" must be unique, lowercase, no spaces (used in role names).
//   - Levels are played in order, top to bottom. "id" must be 1,2,3,...
//   - "answers" is a list — add every spelling you'll accept. Matching
//     is case-insensitive and trims spaces, so "Ear" == "ear ".
//   - You can have as many levels as you like (2, 5, 10, 20...).
//   - Each level can have as many "channels" as you like (story flavour).
//   - "hints" are revealed one at a time; players get them in order.
// ================================================================

module.exports = {
  // ── Identity ───────────────────────────────────────────────
  id: 'CHANGE-ME',                 // unique, lowercase, no spaces (e.g. 'sunken-city')
  name: 'My New Story',            // shown to players everywhere
  description: 'One or two sentences that set the scene and hook the player.',
  emoji: '🧩',                     // shown next to the story name
  color: '#9b59b6',                // 6-digit hex (ALWAYS 6 digits, e.g. #5865f2)

  // ── Levels ─────────────────────────────────────────────────
  levels: [
    {
      id: 1,                       // first level is 1, then 2, 3, ...
      name: 'The Opening Puzzle',
      difficulty: 1,               // 1-5, only changes the role colour

      // Each channel is a Discord text channel full of story/clues.
      // The bot creates them automatically during /setup.
      channels: [
        {
          name: 'clue-room',                  // becomes the channel name (lowercase, dashes)
          description: '🔎 Short channel topic.',
          content: `**A HEADING**

Write your story text here. This whole block is posted as a message
when the channel is first created.

You can use Discord markdown: **bold**, *italics*, \`inline code\`,
and code blocks:

\`\`\`
puzzle art or ciphers go here
\`\`\``,
        },
        {
          name: 'second-clue',
          description: '📋 Another room with more hints.',
          content: `Add as many channels as you want — or just one. Split clues
across rooms to make players explore.`,
        },
      ],

      // Every accepted answer. Case-insensitive, spaces trimmed.
      answers: ['solution', 'the solution'],

      // Revealed one at a time via /hint. Order them easy → explicit.
      hints: [
        '💡 A gentle nudge.',
        '💡 A stronger hint.',
        '💡 Basically the answer for anyone really stuck.',
      ],

      // Shown when the player answers correctly and advances.
      successMessage: `🔓 **Correct!**

Write the reward / next story beat here. Tease what comes next.`,
    },

    // ── Add more levels by copying the block above ─────────────
    {
      id: 2,
      name: 'The Final Puzzle',
      difficulty: 2,
      channels: [
        {
          name: 'final-room',
          description: '🏁 The last room.',
          content: `The bot automatically treats the LAST level in this list as the
finale. Finishing it grants the winner role and posts to the
Hall of Fame — you don't need to configure anything extra.`,
        },
      ],
      answers: ['end', 'the end'],
      hints: [
        '💡 Hint one.',
        '💡 Hint two.',
      ],
      successMessage: `🔓 **You did it!**

Final victory text goes here.`,
    },
  ],
};
