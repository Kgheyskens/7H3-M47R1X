// ================================================================
// 📖 STORY 4 — THE PHANTOM VAULT  (★ HARD ★)
// Through-line: you are a safecracker hired to empty the legendary
// vault of a vanished master thief known only as "the Phantom".
// Every lock is a STACK of ciphers — 4 to 5 layers each. Almost no
// hand-holding. /hint only nudges, never solves.
//
// Word answers (first letters spell the finale GHOST):
//   L1 GOLD · L3 HEIST · L5 OPEN · L7 SAFE · L9 TIME  → G-H-O-S-T
// Number answers are vault dials combined from two encoded readouts:
//   L2 4096 · L4 1024 · L6 2048 · L8 512
// All cipher chains are machine-verified (see project _heist_gen.js).
// ================================================================

module.exports = {
  id: 'heist',
  name: 'The Phantom Vault',
  description: 'You are the best safecracker alive, hired for one last job: empty the vault of the Phantom, a master thief who vanished without spending a cent. He trusted no one, so he locked everything behind stacked ciphers — layer upon layer. No one has cracked a single door. The clock is running. Prove you are better than a ghost.',
  emoji: '💰',
  color: '#e67e22',
  difficultyLabel: 'Hard',

  levels: [
    // ── L1 ─────────────────────────────────────────────────────
    {
      id: 1,
      name: 'The Outer Door',
      difficulty: 5,
      channels: [
        {
          name: 'the-terminal',
          description: '💻 A cracked terminal bolted to the vault\'s outer door.',
          content: `**PHANTOM VAULT — OUTER DOOR**

The screen wakes when you touch it. One line of light:

\`\`\`
00000111 00011001 00000010 00001010
\`\`\`

A brass plate underneath, hand-engraved:

*"Four skins on this onion. Peel them in the right order or the door stays shut. The prize is what every thief is here for."*

The terminal accepts only the final word. Nothing else.`,
        },
        {
          name: 'phantoms-scrap',
          description: '🗒️ A scrap of paper wedged in the door frame.',
          content: `**SCRAP — PHANTOM'S HAND**

*"Ones and zeroes are just numbers wearing a costume.
Numbers are just letters that learned to count.
And letters lie — half of mine walk backwards, the rest walk thirteen paces.

Undo it all and you'll be holding what you came for."*`,
        },
      ],
      answers: ['gold', 'the gold'],
      hints: [
        '💡 Four layers sit between you and the word. Two of them turn symbols into numbers, two of them shuffle letters. Strip them in the only order that makes sense.',
        '💡 "Thirteen paces" and "walk backwards" are two different, very famous letter tricks. Each is its own inverse — applying it twice gives you nothing back.',
        '💡 Once you reach plain letters, you still have to undo the two letter-tricks. The result is the one thing a vault is built to hold.',
      ],
      successMessage: `🔓 **GOLD. The outer door sighs open.**

A cold breath of air rolls out of the dark. Beyond it: a corridor of smaller safes, each one humming with its own lock.

*One down. The Phantom is just getting started with you.*`,
    },

    // ── L2 ─────────────────────────────────────────────────────
    {
      id: 2,
      name: 'The Twin Dials',
      difficulty: 5,
      channels: [
        {
          name: 'twin-safes',
          description: '🔢 Two small safes wired to one four-digit dial.',
          content: `**TWIN SAFES — COMBINED DIAL**

Two readouts feed a single 4-digit dial. Read each value, then **combine** them.

**SAFE A** — the readout is text, but scrambled into the alphabet-of-six-bits:
\`\`\`
RkMw
\`\`\`
*(decode that back to plain characters first — then read those characters as a number written the way engineers count past nine)*

**SAFE B** — the readout is raw on/off:
\`\`\`
1000000
\`\`\`

Engraved between them: *"A and B were never meant to stand alone. Bring them together. The dial wants the total."*`,
        },
        {
          name: 'fence-note',
          description: '🪙 A note from the Phantom\'s fence.',
          content: `**FENCE'S NOTE**

*"He always hid the big number where you'd never read it straight. Safe A's value is dressed twice — once in that base-sixty-four costume couriers use, and underneath, in the base that runs 0-9 then A-F.

Safe B is just plain binary. Small.

Add. Don't overthink which way — two safes, one sum."*`,
        },
      ],
      answers: ['4096', '4 0 9 6'],
      hints: [
        '💡 Safe A is wrapped twice: first that "base-64 courier costume", and what falls out is a number written in the base that counts 0-9 then A-F (base-16).',
        '💡 Safe B is a simple binary string. It represents \(2^{6}\)',
        '💡 The dial wants the two values brought together as a single total. There are only two ways to combine two numbers — pick the one that grows.',
      ],
      successMessage: `🔓 **4096. The twin safes unlock as one.**

Inside: not money — a single key card, and a photograph of a man whose face has been burned away.

*"You're quick,"* says a voice from a hidden speaker. *"Quick isn't the same as clever."*`,
    },

    // ── L3 ─────────────────────────────────────────────────────
    {
      id: 3,
      name: 'The Phantom\'s Word',
      difficulty: 5,
      channels: [
        {
          name: 'keyed-lock',
          description: '🔐 A lock that demands a keyword before it gives anything up.',
          content: `**KEYED LOCK — LAYERED**

The readout, in pairs of base-16:

\`\`\`
18 16 18 17 0E
\`\`\`

A label: *"This one is keyed. Without the keyword, the rest is noise. The keyword is the five-letter thing you are standing inside trying to rob."*

Peel the layers and the lock gives you a five-letter word for what you're pulling off tonight.`,
        },
        {
          name: 'cracksmans-margin',
          description: '✍️ Margin notes from a previous, failed cracksman.',
          content: `**MARGIN — (the last crew who tried)**

*"Order we think it goes, from the screen inward:
  — read the hex as numbers,
  — numbers back to letters by position in the alphabet,
  — then a mirror,
  — then the keyed shift on top of everything.

We never found the keyword in time. You're standing in the answer. Five letters. Good luck — we're not coming back."*`,
        },
      ],
      answers: ['heist', 'the heist'],
      hints: [
        '💡 The readout shows base-16 numbers, this can be converted to decimal numbers from 1-26',
        '💡 The decimal numbrs can be letters from the alphabet, now mirror it.',
        '💡 The "keyed shift" is vault (you are inside it). Do a Vigenère-shift on your mirrored letters and the answer will be yours.',
      ],
      successMessage: `🔓 **HEIST. The keyed lock falls open.**

A drawer slides out. Inside, engraved on a steel slug:

*"Every door from here remembers the last. Forget nothing you've opened."*

*He's telling you something. You should believe him.*`,
    },

    // ── L4 ─────────────────────────────────────────────────────
    {
      id: 4,
      name: 'The Roman Tumbler',
      difficulty: 5,
      channels: [
        {
          name: 'tumbler-dials',
          description: '🔢 A four-digit tumbler fed by two odd readouts.',
          content: `**TUMBLER — TWO READOUTS**

**READOUT A** — base-8:
\`\`\`
1750
\`\`\`

**READOUT B** — old empire numerals:
\`\`\`
XXIV
\`\`\`

Scratched beside the tumbler: *"The big one is written in octal. The small one is written the way Caesar would. Put them together — the tumbler wants the four-digit total."*`,
        },
        {
          name: 'antiquarian-card',
          description: '🏛️ A collector\'s card on Roman numerals.',
          content: `**ROMAN NUMERALS — QUICK CARD**

\`\`\`
I = 1    V = 5    X = 10
L = 50   C = 100  D = 500  M = 1000
\`\`\`
A smaller numeral before a larger one subtracts (IX = 9, XL = 40).

*Decode B, decode the octal A, then combine for the dial.*`,
        },
      ],
      answers: ['1024', '1 0 2 4'],
      hints: [
        '💡 Readout A is octal — base 8, digits 0–7 only. Convert it to ordinary decimal. It lands near a thousand.',
        '💡 Readout B is a small Roman numeral. Two tens, then "one before five".',
        '💡 Two values, one tumbler. Combine them the way that makes the number bigger.',
      ],
      successMessage: `🔓 **1024. The tumbler spins free.**

A panel drops, revealing a narrow shaft going down. Cold air. Far below, something metal ticks like a clock.

*Halfway there. The Phantom's voice has gone quiet. That's worse, somehow.*`,
    },

    // ── L5 ─────────────────────────────────────────────────────
    {
      id: 5,
      name: 'The Fence Rail',
      difficulty: 5,
      channels: [
        {
          name: 'rail-lock',
          description: '🚪 A lock with a zig-zag mechanism behind the faceplate.',
          content: `**RAIL LOCK**

One blob, in that base-64 courier costume again:

\`\`\`
TFVXVg==
\`\`\`

Etched on the faceplate:
*"Strip the costume. Then un-flip it. Then un-zig-zag it across three rails. Then walk the letters back up the alphabet by the count of a perfect week. Four letters and the door does what its name says."*`,
        },
        {
          name: 'phantoms-doodle',
          description: '✏️ A doodle of a fence with three rails.',
          content: `**DOODLE**

A little sketch of a zig-zag fence, **3 rails** tall, letters bouncing down and up across it.

*"Reverse everything I did, in the opposite order I did it. I always sign off the same way: base-sixty-four on the outside. A rail fence is read row by row — rebuild the zig-zag to undo it."*

The shift "count of a perfect week" — how many days is that?`,
        },
      ],
      answers: ['open', 'the open'],
      hints: [
        '💡 Outermost layer is the base-64 courier wrapping — undo that first. What\'s left is short.',
        '💡 Then reverse the string, then undo a 3-rail zig-zag (rail-fence) transposition. You\'re left with four scrambled-looking letters, place them in order 1-2-3-4.',
        '💡 Last step is a simple letter shift — "a perfect week" is seven. Walk each letter back seven and the lock tells you exactly what to do.',
      ],
      successMessage: `🔓 **OPEN. The rail lock snaps wide.**

You're in the heart of the vault now. The walls are lined with safety-deposit doors, and every one of them is watching you.

*"Three letters of a word left,"* the speaker murmurs. *"Do you even know what you're spelling yet?"*`,
    },

    // ── L6 ─────────────────────────────────────────────────────
    {
      id: 6,
      name: 'The Courier\'s Sum',
      difficulty: 5,
      channels: [
        {
          name: 'courier-safes',
          description: '🔢 Two safes a courier could read at a glance — if trained.',
          content: `**COURIER SAFES — COMBINED DIAL**

**SAFE A** — wrapped in the base-sixty-four costume; inside is **binary**:
\`\`\`
MTExMTEwMTAwMDA=
\`\`\`
*(decode the costume, read the binary it hides as a number)*

**SAFE B** — base-16:
\`\`\`
30
\`\`\`

Plate: *"A is big, hidden two layers deep. B is small, dressed in hex. The dial wants their total — four digits."*`,
        },
        {
          name: 'runners-creed',
          description: '🏃 A courier\'s creed pinned to the wall.',
          content: `**RUNNER'S CREED**

*"Outside, always base-sixty-four. Underneath, whatever I please.
Safe A hides plain binary under the costume — strip it, read the ones and zeroes as one number.
Safe B is just hex. Two characters.
Add them. The vault never subtracts twice in a row."*`,
        },
      ],
      answers: ['2048', '2 0 4 8'],
      hints: [
        '💡 Safe A: peel the base-64 wrapper, and what\'s inside is a long binary number. Convert it to decimal',
        '💡 Safe B is hex, just two characters. Small.',
        '💡 Bring the two values together as one total. The creed tells you the vault doesn\'t subtract here.',
      ],
      successMessage: `🔓 **2048. The courier safes release together.**

Behind them, a steel door with a single painted handprint. Still tacky. Fresh.

*Someone was here. Recently. The Phantom isn't as gone as everyone thinks.*`,
    },

    // ── L7 ─────────────────────────────────────────────────────
    {
      id: 7,
      name: 'The Grid Beneath',
      difficulty: 5,
      channels: [
        {
          name: 'grid-lock',
          description: '🔳 A lock whose readout is pairs of small numbers.',
          content: `**GRID LOCK**

Wrapped, as ever, in the base-sixty-four costume:

\`\`\`
MjMgNTUgNDUgNTE=
\`\`\`

Strip the costume and you'll find **pairs of digits** — row,column into a 5×5 letter square. But the Phantom mirrored the letters first, so even the square lies to you.

Four letters. It's the word for the box you're trying to crack.`,
        },
        {
          name: 'square-key',
          description: '🔠 A 5×5 cipher square scratched into the steel.',
          content: `**5×5 SQUARE (no J — it shares with I)**

\`\`\`
    1  2  3  4  5
 1  A  B  C  D  E
 2  F  G  H  I  K
 3  L  M  N  O  P
 4  Q  R  S  T  U
 5  V  W  X  Y  Z
\`\`\`

Each pair is **row then column**. Read the letters out... then remember he mirrors everything across the alphabet before he's done. Undo that mirror last.`,
        },
      ],
      answers: ['safe', 'the safe'],
      hints: [
        '💡 Peel the base-64 wrapper. You\'re left with four pairs of digits — each pair is a row,column coordinate in the 5×5 square.',
        '💡 Read the four letters off the grid. They won\'t look like a word yet.',
        '💡 The grid letters are mirrored across the alphabet (first ↔ last). Undo that mirror and you get the four-letter word for the box itself.',
      ],
      successMessage: `🔓 **SAFE. The grid lock opens.**

Inside the safe: nothing but a wristwatch, still ticking, set to a time that hasn't happened yet.

*"Tick, Tock"* says the speaker. *"You're slower than you think."*`,
    },

    // ── L8 ─────────────────────────────────────────────────────
    {
      id: 8,
      name: 'The Subtracted Lock',
      difficulty: 5,
      channels: [
        {
          name: 'minus-safes',
          description: '🔢 Two readouts and, for once, a minus sign.',
          content: `**TWO READOUTS — ONE DIFFERENCE**

**READOUT A** — base-16:
\`\`\`
210
\`\`\`

**READOUT B** — base-8 (octal):
\`\`\`
20
\`\`\`

Carved deep, and underlined twice: *"This one is cruel. A is hex, B is octal. The dial does NOT want the sum. It wants what's left."*`,
        },
        {
          name: 'phantoms-warning',
          description: '⚠️ A warning gouged into the metal.',
          content: `**WARNING — PHANTOM**

*"Everyone adds. Adders die here. Convert both to honest decimal, then provide what's left... Three digits. Get greedy and add, and you'll never see daylight ever again."*`,
        },
      ],
      answers: ['512', '5 1 2'],
      hints: [
        '💡 Readout A is hex; readout B is octal. Convert each to ordinary decimal first.',
        '💡 A is a few hundred; B is small.',
        '💡 This lock subtracts — take the small value away from the big one. The result is three digits.',
      ],
      successMessage: `🔓 **512. The subtracted lock gives way.**

One door left between you and the inner vault. Through the gap you can see it: a single pedestal, and on it, a clock with no hands.

*Almost. Almost. Don't get greedy now.*`,
    },

    // ── L9 ─────────────────────────────────────────────────────
    {
      id: 9,
      name: 'The Phantom\'s Clock',
      difficulty: 5,
      channels: [
        {
          name: 'final-lock',
          description: '⏰ The last lock. Five layers deep, and keyed.',
          content: `**FINAL LOCK — FIVE SKINS, KEYED**

The deepest readout yet!:

\`\`\`
00000101 00011000 00000001 00010110
\`\`\`

A plaque, the Phantom's last words on it:
*"Five skins. The keyword is the name they whisper when they talk about me — seven letters, the thing I became. Strip it all and you'll hold the only thing I ever truly stole: not gold. Four letters."*`,
        },
        {
          name: 'last-confession',
          description: '🕯️ The Phantom\'s confession, taped beneath the pedestal.',
          content: `**CONFESSION**

*"Order, outermost first:
  — read the binary as numbers,
  — numbers to letters by alphabet position,
  — thirteen paces,
  — a mirror,
  — and beneath everything, the keyed square-table shift.

The keyword is what I am now: a seven-letter word for a thing that haunts a place it can't leave. I have all the gold in the world and I cannot spend a second of what I really wanted. Time is the real enemy here. Tick Tock Tick Tock...."*`,
        },
      ],
      answers: ['time', 'the time'],
      hints: [
        '💡 The keyword is the seven-letter word for what the Phantom became — what haunts a place and can\'t leave. You\'ve seen it hinted all night.',
        '💡 Strip from the screen inward: binary → numbers → letters by position → undo "thirteen paces" → undo a mirror → undo the keyed square-table shift with that seven-letter key.',
        '💡 Both letter-tricks ("thirteen paces" and "the mirror") are their own inverse. The four-letter answer is the one thing money could never buy back and what we wish we\'d have more.',
      ],
      successMessage: `🔓 **TIME. The final lock opens.**

There is no gold. There never was. Just the Phantom himself, sitting in the dark, rich beyond counting and out of the only thing that mattered.

*"You beat my locks,"* he says quietly. *"Now beat the last one. Take the first letter of every WORD you forced open tonight, in order. Say what I am."*`,
    },

    // ── L10 — META FINALE ──────────────────────────────────────
    {
      id: 10,
      name: 'What He Became',
      difficulty: 5,
      channels: [
        {
          name: 'the-confession-dial',
          description: '👻 One dial. Five letters. The Phantom is waiting.',
          content: `**THE LAST WORD**

The Phantom turns to face you for the first time. Where his face should be, there's almost nothing left.

*"Five doors had WORDS, not numbers. You spoke them all to get here. Take the FIRST LETTER of each — in the order you opened them — and put them together.*

*It spells what I am now. What a thief becomes when he steals everything except the time to enjoy it.*

*Say it, and you can walk out of here with everything. Say it, and let me finally be done."*

Five worn dials wait. Assemble the first letters of your five WORD answers, in order, and submit with \`/answer\`. Lost one? \`/hint\`.`,
        },
      ],
      answers: ['ghost', 'the ghost', 'a ghost'],
      hints: [
        '💡 Only the five WORD answers count — the numbers were just dials. In order: the outer door, the keyed word, the rail lock, the grid lock, the final clock.',
        '💡 Take the first letter of each of those five words, in the order you solved them.',
        '💡 Five first letters spell the thing the Phantom became — what haunts a vault it can never leave.',
      ],
      successMessage: `🔓 **GHOST.**

The word lands like a key in a lock that's been waiting 40 years.

The Phantom smiles — you feel it more than see it — and the whole vault exhales. Every door you opened swings wide at once. Gold, art, bearer bonds, everything, suddenly yours and meaningless beside the look of relief on a face that isn't there.

*"Thank you,"* he says. And then the chair is empty, the clocks all stop, and the lights come up clean and white.

You walk out of the Phantom Vault at dawn, pockets full, having stolen the one thing he couldn't keep — and given him back the only thing he wanted.

━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 **THE PHANTOM VAULT — COMPLETED**
━━━━━━━━━━━━━━━━━━━━━━━━━`,
    },
  ],
};
