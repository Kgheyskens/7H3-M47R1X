// ================================================================
// 📖 STORY 2 — THE HOLLOW LIGHTHOUSE
// Through-line: a lighthouse keeper vanished decades ago. You spend
// one night in the tower and the dead light starts sending messages.
// Meta-finale: the four WORD answers (Reef, Escape, Shore, Tower)
// give first letters R-E-S-T → "let me REST".
// ================================================================

module.exports = {
  id: 'lighthouse',
  name: 'The Hollow Lighthouse',
  description: 'Black Reef lighthouse has stood empty for forty years, ever since keeper Alma Brandt walked up the stairs one storm and never came down. You volunteered to spend one night logging the structure. Tonight, the dead light flickers on by itself.',
  emoji: '🗼',
  color: '#1abc9c',
  difficultyLabel: 'Easy',

  levels: [
    {
      id: 1,
      name: 'The Logbook',
      difficulty: 2,
      channels: [
        {
          name: 'keepers-desk',
          description: '🕯️ A desk at the base of the tower, thick with dust.',
          content: `**BLACK REEF LIGHTHOUSE — KEEPER'S LOG**

The last entry is dated 3 November 1984, in a shaking hand:

*"The light won't obey me anymore. It blinks at me in code. I copied the pattern before I lost my nerve. If anyone reads this — that's not a malfunction. That's a word. Decode it the way the navy taught us."*

Pinned beside the log, the flash pattern she copied:

\`\`\`
.-.  .  .  ..-.
\`\`\``,
        },
        {
          name: 'morse-card',
          description: '📇 A laminated morse card pinned above the desk.',
          content: `**INTERNATIONAL MORSE — REFERENCE**

\`\`\`
A .-    B -...  C -.-.  D -..   E .
F ..-.  G --.   H ....  I ..    J .---
K -.-   L .-..  M --    N -.    O ---
P .--.  Q --.-  R .-.   S ...   T -
U ..-   V ...-  W .--   X -..-  Y -.--
Z --..
\`\`\`

Each group separated by spaces is one letter. Decode the four letters from the log.`,
        },
      ],
      answers: ['reef', 'the reef', 'black reef'],
      hints: [
        '💡 The flash pattern is in the keeper\'s log; the morse card tells you how to read it. Take one group at a time.',
        '💡 Four groups, four letters. The shortest groups are the most common letters in English.',
        '💡 Once you have the four letters, say them aloud — it\'s the very danger this tower exists to warn ships about.',
      ],
      successMessage: `🔓 **REEF. The lamp above you flares once.**

A drawer you hadn't noticed clicks open at the side of the desk. Inside: a brass key and a torn page of verse.

*Someone — or something — wants you to climb.*`,
    },

    {
      id: 2,
      name: 'The Torn Poem',
      difficulty: 3,
      channels: [
        {
          name: 'the-poem',
          description: '📜 A torn page of verse, water-stained but readable.',
          content: `**FOUND IN THE DRAWER — A POEM**

The stair-gate has a 6-letter word lock. The verse hides the word — read it the old way keepers passed secrets:

\`\`\`
Empty the tower and empty the shore,
Salt in the lantern and dark at the door,
Cold come the breakers, the drowned ones once more,
All of them calling from under the floor,
Pray for the keeper who walks here no more,
Echoes and silence, then nothing at all.
\`\`\`

*"The first of each line will set you free."*`,
        },
        {
          name: 'margin-hint',
          description: '✍️ A note scrawled in the margin.',
          content: `**MARGIN NOTE — A.B.**

*"An acrostic. Take the very FIRST letter of every line, top to bottom, and read straight down.*

*Six lines. Six letters. One word. That word opens the gate."*`,
        },
      ],
      answers: ['escape', 'to escape'],
      hints: [
        '💡 The margin note tells you exactly how to read it. The poem itself doesn\'t matter — only its edges.',
        '💡 First letter of each line, top to bottom. Six lines, six letters.',
        '💡 It\'s a single six-letter word — what Alma never managed to do from this tower.',
      ],
      successMessage: `🔓 **ESCAPE. The gate swings inward.**

The spiral staircase rises into the dark. Salt wind moans down the shaft.

Halfway up, a framed photograph hangs crooked on the wall. You'll want to look at it.`,
    },

    {
      id: 3,
      name: 'The Mirror Letters',
      difficulty: 3,
      channels: [
        {
          name: 'the-photograph',
          description: '🖼️ A faded photo of the lighthouse staff, glass cracked.',
          content: `**PHOTOGRAPH — "STAFF, SUMMER 1984"**

Five keepers on the rocks. Scratched into the frame, a single word of nonsense:

\`\`\`
HSLIV
\`\`\`

Below it: *"She wrote everything in mirror-script so the others couldn't read it. A is Z, B is Y. Turn it around. It names the place she kept looking toward."*`,
        },
        {
          name: 'mirror-key',
          description: '🪞 An Atbash key etched into the cracked glass.',
          content: `**ATBASH (MIRROR) CIPHER — KEY**

Each letter swaps with its mirror across the alphabet:

\`\`\`
A B C D E F G H I J K L M
Z Y X W V U T S R Q P O N
\`\`\`

The first letter swaps with the last, the second with the second-to-last, and so on.

Mirror every letter of \`HSLIV\` to read the word.`,
        },
      ],
      answers: ['shore', 'the shore'],
      hints: [
        '💡 It\'s a mirror cipher — the key on the glass shows how each letter flips to its opposite end of the alphabet.',
        '💡 Work letter by letter through `HSLIV` using the key. The result is five letters.',
        '💡 It names the place Alma kept staring toward — where the land meets the water.',
      ],
      successMessage: `🔓 **SHORE.**

The photograph swings aside on a hidden hinge. Behind it: a brass dial and a map of the lamp-room floor.

*Keep climbing. The lamp room is next.*`,
    },

    {
      id: 4,
      name: 'The Lamp-Room Floor',
      difficulty: 4,
      channels: [
        {
          name: 'floor-grid',
          description: '🔲 The lamp-room floor is a 5×5 grid of brass tiles.',
          content: `**LAMP-ROOM FLOOR — TILE GRID**

Each tile holds a letter. You start on the tile marked ★ (top-left, row 1 column 1). A brass dial gives you a path. Follow it tile by tile and read the letters you LAND on (plus the start).

\`\`\`
      C1  C2  C3  C4  C5
 R1 [★T]  O   W   K   X
 R2   Z   Q   E   B   L
 R3   M   Y   R   U   D
 R4   I   A   S   N   H
 R5   G   P   V   F   C
\`\`\`

Start letter: **T** (★). Then apply the moves (R=right, D=down, L=left, U=up):
\`\`\`
R, R, D, D
\`\`\`
Read the start letter plus each landed letter — five letters total.`,
        },
        {
          name: 'dial-instructions',
          description: '🧭 Engraved instructions beside the brass dial.',
          content: `**BRASS DIAL — HOW TO READ**

Start on ★ (R1C1 = T). Apply each move to step one tile.
- **R** = column + 1
- **D** = row + 1

Worked start: T (R1C1) → **R** → R1C2 (O) → **R** → R1C3 (W) → ...

Continue the last two moves (D, D) and read all five letters in order. That word is the answer.`,
        },
      ],
      answers: ['tower', 'the tower'],
      hints: [
        '💡 Start on the ★ tile and apply the moves one at a time, writing down each letter you land on.',
        '💡 Right means column +1, Down means row +1. Don\'t skip the starting letter — five letters total.',
        '💡 Fittingly, the five letters spell the very thing you\'ve been climbing all night.',
      ],
      successMessage: `🔓 **TOWER.**

The tiles sink flush with the floor. The great lens stops turning. In the sudden stillness you hear it — a voice, faint, coming up through the stone beneath your boots.

You came all this way up. Now you must go down.`,
    },

    {
      id: 5,
      name: 'What the Light Was Saying',
      difficulty: 5,
      channels: [
        {
          name: 'the-sealed-door',
          description: '🚪 At the foot of the stairs: a stone door, no handle.',
          content: `**THE STONE DOOR — ALMA'S LAST MESSAGE**

A wax cylinder beside the door crackles to life in a woman's voice:

*"If you climbed all this way, you're braver than I was. The light was never broken. It was me, signalling, the only way I could from down here.*

*I sealed four doors on your way up, each with a single WORD. Four words, in the order you found them. Take the FIRST LETTER of each one and put them together — that is what I have been begging for, all these years.*

*Set it on the wheels below and let me have it at last."*

Carved above five worn letter-wheels:

*"Four words. Four first letters, in order. The thing the dead are owed."*

Assemble the first letters of your four previous WORD answers, in order, and submit the word with \`/answer\`. Stuck? Use \`/hint\`.`,
        },
      ],
      answers: ['rest', 'to rest', 'let me rest'],
      hints: [
        '💡 Look back at the four WORD answers you gave — not the numbers. The order you found them matters.',
        '💡 Take the first letter of each of those four words, in order.',
        '💡 Four letters — it\'s what the dead are owed, and what Alma has been begging for all these years.',
      ],
      successMessage: `🔓 **REST.**

The wheels click home. Far below, stone grinds against stone. A sealed door, shut for forty years, drifts open on the tide.

The light in the lamp room steadies — no more flashing, no more code. Just a calm, even beam sweeping the water, the way a lighthouse is meant to shine.

Somewhere beneath your feet, Alma Brandt finally stops calling for help.

━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 **THE HOLLOW LIGHTHOUSE — COMPLETED**
━━━━━━━━━━━━━━━━━━━━━━━━━`,
    },
  ],
};
