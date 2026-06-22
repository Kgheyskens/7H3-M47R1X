// ================================================================
// 📖 STORY 1 — THE FORGOTTEN FREQUENCY
// Through-line: a radio technician in 1987 picks up a mysterious
// signal from people trapped between frequencies.
// ================================================================

module.exports = {
  id: 'frequency',
  name: 'The Forgotten Frequency',
  description: 'The year is 1987. You are radio technician Ernest Vermeer. One night you pick up a signal from people who vanished — not dead, but wedged between frequencies. You are their only hope.',
  emoji: '📻',
  color: '#5865f2',
  difficultyLabel: 'Medium',

  levels: [
    {
      id: 1,
      name: 'The First Broadcast',
      difficulty: 1,
      channels: [
        {
          name: 'radio-room',
          description: '📻 A dusty room full of equipment.',
          content: `**— DIARY OF ERNEST VERMEER, 14 OCTOBER 1987 —**

It started tonight at 3:17. I was alone in the radio room, the scanner running its usual sweeps. And then — between 87.6 and 87.9 MHz — I heard it. Not static. Not interference. A voice.

*"If you can hear this, you are the first in a long time. Listen closely. The word you seek is where the signal ends."*

The broadcast lasted exactly 11 seconds. Then: silence. I noted the frequency: **87.7 MHz**.

But what ended there? Where does a radio signal end?`,
        },
        {
          name: 'technical-notes',
          description: '📋 Loose sheets of paper with notes.',
          content: `**TECHNICAL NOTES — FREQUENCY RESEARCH**

Radio signals end at a receiver. But people say a signal really ends at the *antenna*.

My mentor always wrote:
> *"The signal does not end at the device — it ends at the auris."*

But what doe the auris mean?`,
        },
      ],
      answers: ['ear', 'the ear'],
      hints: [
        '💡 Read the diary. Where does a radio signal normally end?',
        '💡 Check the technical notes what did the mentor write?',
        '💡 Auris... mhhh it sounds like something Latin..',
      ],
      successMessage: `🔓 **Correct. The signal ends at the ear.**

The radio crackles. Then, very clearly:
*"Good. You're listening. Keep going. They're waiting for you."*

A new frequency appears on the screen: **91.3 MHz**.`,
    },

    {
      id: 2,
      name: 'Morse in the Static',
      difficulty: 2,
      channels: [
        {
          name: 'signal-log',
          description: '📡 Automated logs of the signal on 91.3 MHz.',
          content: `**SIGNAL LOG — 91.3 MHz — 14/10/1987 03:31**

The signal repeats every 47 seconds. I converted it to morse:

\`\`\`
-.-. --- -.. .
\`\`\`

It repeats three times, then silence, then again. My morse table is in the archive.`,
        },
        {
          name: 'archive-morse-table',
          description: '📁 A yellowed sheet of paper with a morse table.',
          content: `**INTERNATIONAL MORSE TABLE**

\`\`\`
A .-    B -...  C -.-.  D -..   E .
F ..-.  G --.   H ....  I ..    J .---
K -.-   L .-..  M --    N -.    O ---
P .--.  Q --.-  R .-.   S ...   T -
U ..-   V ...-  W .--   X -..-  Y -.--
Z --..
\`\`\`

Space between letters = one space. Space between words = /`,
        },
      ],
      answers: ['code', 'the code'],
      hints: [
        '💡 Use the morse table to decode the signal.',
        '💡 Each group separated by a space is one letter.',
        '💡 The morse spells a 4-letter word',
      ],
      successMessage: `🔓 **CODE. Correct.**

The morse stops. A click — as if a lock somewhere disengages.

*"You found the code. But there are more. Look in the archive."*`,
    },

    {
      id: 3,
      name: 'The Missing File',
      difficulty: 2,
      channels: [
        {
          name: 'personnel-files',
          description: '🗂️ Cabinets full of files. Most are empty.',
          content: `**PERSONNEL FILES — STATION RED-7**

**FILE A — MARTA LENS**
Birth year: 1952 | Role: Head Archivist
Last seen: 09/09/1987
Note: *"Requested access to vault B."*

**FILE B — PETER CALLENS**
Birth year: 1948 | Role: Radio Technician
Last seen: 11/09/1987
Note: *"Confirmed Marta's request. Both vanished afterward."*

**FILE C — UNKNOWN**
Birth year: ???? | Last seen: 12/09/1987
Note: *"Was the last one present. Name wiped from the system."*`,
        },
        {
          name: 'vault-room',
          description: '🔒 A small room with one metal vault. 4-digit code.',
          content: `**VAULT B — INSTRUCTION SHEET**

The code is 4 digits:

1. The first digit is the **number of people who vanished**.
2. The second digit is the **first digit of the day** the last person vanished.
3. The third digit is the **difference in birth years** between the oldest and youngest known person.
4. The fourth digit is the **month** of the disappearances.

*"The answer is hidden in what you already know."*`,
        },
      ],
      answers: ['3149', '3-1-4-9'],
      hints: [
        '💡 Count the people who vanished in the files. That is your first digit.',
        '💡 The last person vanished on the 12th. Take only the FIRST digit of that date: 1.',
        '💡 Birth years: 1952 and 1948. Difference = 4. Month of disappearance = September = 9. Code: 3-1-4-9.',
      ],
      successMessage: `🔓 **3149 — The vault springs open.**

Inside: a cassette tape and a note.

*"If you find this: listen to the tape. Trust the signal. Do not trust yourself."*
— M.L.`,
    },

    {
      id: 4,
      name: "Marta's Sequence",
      difficulty: 3,
      channels: [
        {
          name: 'cassette-transcript',
          description: '📼 Written transcript of the cassette tape.',
          content: `**TRANSCRIPT — CASSETTE TAPE, VAULT B**

*[Static. Then a woman's voice — Marta.]*

"If you hear this, it's too late for me. But not for the others.

The facility runs on a frequency system I designed myself. Every access level has a number. Those numbers form a sequence. I hid the sequence in my research notes, on page 7.

The pattern always starts with 1, 1, 2, 3, 5...

The number you need is the **12th number** in that sequence."`,
        },
        {
          name: 'research-notes-p7',
          description: "📓 Page 7 of Marta's research notes.",
          content: `**MARTA LENS — RESEARCH NOTES — PAGE 7**

The sequence is based on the work of Leonardo Fibonacci. Each number is the sum of the two before it:

\`\`\`
Position:  1   2   3   4   5   6   7   8   9  10  11  12
Value:     1   1   2   3   5   8  13  21  34  55  89  ???
\`\`\`

The 12th number unlocks the next layer.

*Margin note: "Peter knew it too. He memorized it. That was his mistake."*`,
        },
      ],
      answers: ['144', 'one hundred forty four', 'one hundred and forty four'],
      hints: [
        '💡 It is the Fibonacci sequence.',
        '💡 Position has nothing to do with the Value you need to get',
        '💡 The first numbber you can find by 1... 2nd is 1 + nothing, 3rd is 1+1 (2), 4th is 1+2 (3), 5th is 2+3 (5) etc etc.',
      ],
      successMessage: `🔓 **144. The frequency jumps.**

On the screen: *"Access granted — Layer 5 — CIPHER CORE"*

The temperature in the room drops noticeably.`,
    },

    {
      id: 5,
      name: 'The Cipher Core',
      difficulty: 3,
      channels: [
        {
          name: 'encrypted-message',
          description: '🔐 An encrypted message on the screen.',
          content: `**ENCRYPTED MESSAGE — LAYER 5**

\`\`\`
WHOO WKHP WR KXVK
\`\`\`

Below it: *"Shift = the number of people who vanished in September 1987."*

You already found that number earlier.

⚠️ *The console is small. It accepts only the **last word** of the decoded message — nothing else.*`,
        },
        {
          name: 'caesar-explained',
          description: '📖 A technical manual about Caesar ciphers.',
          content: `**CAESAR CIPHER — QUICK GUIDE**

In a Caesar cipher you shift every letter by a fixed number of positions in the alphabet.

To **decrypt**: shift every letter back.
If the shift is 3, you go 3 positions back.

\`\`\`
Alphabet: A B C D E F G H I J K L M N O P Q R S T U V W X Y Z
\`\`\`

Example: W shifted back 4 = S. H = D. O = K. Z = V, etc.`,
        },
      ],
      answers: ['hush', 'HUSH'],
      hints: [
        '💡 The shift = the number of people who vanished = 3.',
        '💡 Shift every letter back 3 places. ',
        '💡 The full line is "TELL THEM TO HUSH".',
      ],
      successMessage: `🔓 **HUSH.**

You look up from the screen — your reflection moves a fraction too late.

*"They are trapped between frequencies. You are the bridge."*`,
    },

    {
      id: 6,
      name: 'The Locked Wing',
      difficulty: 4,
      channels: [
        {
          name: 'floor-plan',
          description: '🗺️ A floor plan of the facility — five sealed rooms.',
          content: `**FLOOR PLAN — STATION RED-7, LOWER WING**

Five rooms run in a straight line, numbered **1 to 5** left to right:

\`\`\`
[ 1 ] — [ 2 ] — [ 3 ] — [ 4 ] — [ 5 ]
\`\`\`

A captive is held behind exactly **one** locked door. The CORE will open the right room — but only if you tell it the room **number**.

The clues are scrawled across the other notes in this wing. Cross them off until one room is left.`,
        },
        {
          name: 'guards-notes',
          description: "🩸 A guard's torn rounds-sheet.",
          content: `**ROUNDS — STATION RED-7 — DEDUCTION**

What the night guard scribbled, in order:

1. *"The cell is **not** at either end of the row."*
2. *"It is **not** directly next to the boiler in room 2."*
3. *"Her number is **even**."*
4. *"I always reach it **before** room 5 on my round, and **after** room 2."*`,
        },
        {
          name: 'marta-margin-note',
          description: "📓 A note in Marta's hand, taped under the desk.",
          content: `**MARGIN NOTE — M.L.**

*"They moved me three times. The guards talk too much.*

*Eliminate, don't guess. When four facts point at one door, that door is the truth.*

*Tell the CORE the room number. Nothing else."*`,
        },
      ],
      answers: ['4', 'four', 'room 4'],
      hints: [
        '💡 Write out rooms 1-5 and cross off as each clue forbids one.',
        '💡 Every clue eliminates a possible door.',
        '💡 Read the words carefully, try to assign each line to a door te eliminate possible doors.',
      ],
      successMessage: `🔓 **Room 4. The lock releases.**

Inside: a massive machine. In the centre: a chair. Strapped to the chair — a person.

She is still breathing.`,
    },

    {
      id: 7,
      name: 'The Bedroom Voice',
      difficulty: 4,
      channels: [
        {
          name: 'incident-report',
          description: '🩸 A crumpled report with bloodstains on the corners.',
          content: `**INCIDENT REPORT — STATION RED-7 — 12/09/1987**

The captive whispers a sequence, over and over. Each night she adds one more number to it:

\`\`\`
1
11
21
1211
111221
?
\`\`\`

*"The next number unlocks the machine,"* she says. *"It is not maths. It is not addition. You must say what you see."*

Technician Callens wrote underneath: *"It's not arithmetic at all. Read each line out loud and describe it."*`,
        },
        {
          name: 'callens-proof',
          description: "📐 Peter Callens' decoding notes.",
          content: `**NOTES — PETER CALLENS**

I cracked it. You **describe the line above**, digit-group by digit-group:

- \`1\` is read as "one 1" → write **11**
- \`11\` is "two 1s" → write **21**
- \`21\` is "one 2, one 1" → write **1211**
- \`1211\` is "one 1, one 2, two 1s" → write **111221**

So the 6th line describes \`111221\`. Read it aloud: "three 1s, two 2s, one 1."

Write what you said as digits. That string of digits is the answer.`,
        },
      ],
      answers: ['312211'],
      hints: [
        '💡 This is the "look and say" sequence. You read the previous line aloud and write down what you hear.',
        '💡 You have to describe 111221',
        '💡 three 1s, then two 2s, then one 1.....',
      ],
      successMessage: `🔓 **312211. The machine trembles.**

The woman opens her eyes. *"You're almost there. But there are more of them. They're getting impatient."*

She hands you a map covered in symbols.`,
    },

    {
      id: 8,
      name: 'The Punch-Tape',
      difficulty: 4,
      channels: [
        {
          name: 'the-tape',
          description: '🎞️ A roll of punch-tape spilling out of the machine.',
          content: `**PUNCH-TAPE — BRIDGE ACTIVATION**

The machine spat out a strip of tape. A hole = **1**, no hole = **0**. Read across, eight positions, one byte:

\`\`\`
● ○ ● ● ○ ● ● ●
1 0 1 1 0 1 1 1
\`\`\`

A label on the reel reads: *"One byte. Convert it to a normal number and feed it back to the bridge."*

The bridge accepts only the **decimal** value.`,
        },
        {
          name: 'conversion-card',
          description: '📜 A binary conversion card taped to the reel.',
          content: `**BINARY → DECIMAL — CONVERSION CARD**

Each position is worth a power of two. Add the values where there is a **1**:

\`\`\`
byte values:  128  64  32  16   8   4   2   1
\`\`\`

Add up only the columns that show a 1. That total is the answer.`,
        },
      ],
      answers: ['183', 'one hundred eighty three', 'one hundred and eighty three'],
      hints: [
        '💡 Binary 10110111. Add the place-values where the bit is 1',
        '💡 You need 128, 32, 16, 4, 2 and 1.',
        '💡 simply add the numbers together, the combined total is the answer.',
      ],
      successMessage: `🔓 **183. The bridge activates.**

The tape goes slack. The woman smiles for the first time.

*"The bridge is open. But you must choose who you pull through."*`,
    },

    {
      id: 9,
      name: 'The Mirror Alphabet',
      difficulty: 5,
      channels: [
        {
          name: 'the-portal',
          description: '🌀 The portal is open. But it is unstable.',
          content: `**THE PORTAL — OBSERVATIONS**

The signal collapses into a single scorched word burned onto the panel:

\`\`\`
LNVTZ
\`\`\`

Beneath it: *"The captives spoke backwards through the glass. A is Z, B is Y. Mirror every letter to read the name that stabilizes the bridge."*

Remember Level 5 — your reflection moved a fraction too late. The whole facility runs on mirrors.`,
        },
        {
          name: 'mirror-key',
          description: '🪞 An Atbash mirror-cipher key etched into the glass.',
          content: `**ATBASH (MIRROR) CIPHER — KEY**

Each letter swaps with its mirror across the alphabet — first ↔ last:

\`\`\`
A B C D E F G H I J K L M
Z Y X W V U T S R Q P O N
\`\`\`

So A↔Z, E↔V, L↔O, G↔T, V↔E, J↔Q, I↔R.

Mirror each letter of \`LNVTZ\` to read the word.`,
        },
      ],
      answers: ['omega', 'the omega', 'ω', 'OMEGA'],
      hints: [
        '💡 Atbash mirrors the alphabet: A↔Z, B↔Y, and so on. Use the key.',
        '💡 It is the last letter of the Greek alphabet — the end of all things.',
        '💡 L→O, N→M, V→E, T→G, Z→A.',
      ],
      successMessage: `🔓 **OMEGA. The portal stabilizes.**

Marta. Then Peter. Then Ernest. They stand beside you. All at once. In your time.

Marta: *"There is one more layer. The very last."*`,
    },

    {
      id: 10,
      name: 'The Forgotten Frequency',
      difficulty: 5,
      channels: [
        {
          name: 'final-room',
          description: '🔴 The final room. The system is still running.',
          content: `**THE FINAL ROOM**

In the centre: the central transmitter. Ernest stands beside it, headphones in hand. On the panel, one last prompt:

*"Enter the MASTER CODE to shut the system down."*

Ernest turns to you:

*"Four of the doors you opened were sealed with a **word**, not a number. Four words. Take the **first letter of each one**, in the order you found them, and you'll have the master code.*

*The numbers along the way were just locks. The words were the message all along... I hope you still remembered..*

*Assemble the four letters. It spells what a signal becomes when it has nowhere left to go — it bounces back, it repeats, it refuses to die.*

*Submit it with \`/answer\` in your answer channel. Stuck on which words? Use \`/hint\`."*`,
        },
      ],
      answers: ['echo', 'an echo', 'the echo'],
      hints: [
        '💡 Only four levels had WORD answers (not numbers).',
        '💡 The word-answers were: Level 1 (a body part), Level 2 (a 4-letter morse word), Level 5 (decoded Caesar), Level 9 (decoded Atbash).',
        '💡 The words were Ear, Code, Hush and Omega.',
      ],
      successMessage: `🔓 **ECHO.**

One by one the lights go out. The antenna stops humming. The radio falls silent.

For the first time in 37 years: absolute silence in Station Red-7.

Marta cries. Peter laughs. Ernest takes off his headphones.

**You brought them home... Finally they can rest.**

━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 **THE FORGOTTEN FREQUENCY — COMPLETED**
━━━━━━━━━━━━━━━━━━━━━━━━━`,
    },
  ],
};
