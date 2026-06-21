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
> *"The signal does not end at the device — it ends at the ear."*

In Latin he called the ear: **auris**. In plain English: **ear**.`,
        },
      ],
      answers: ['ear', 'the ear', 'auris'],
      hints: [
        '💡 Read the diary. Where does a radio signal normally end?',
        '💡 Check the technical notes — what did the mentor write?',
        '💡 The answer is one word. Think of the body part you listen with.',
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
        '💡 Each group separated by a space is one letter. The first is C.',
        '💡 The morse spells a 4-letter word: C-O-D-E.',
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
        '💡 It is the Fibonacci sequence. Each number = the sum of the two before it.',
        '💡 The table stops at position 11 (value 89). What is 89 + 55?',
        '💡 The 12th Fibonacci number is 144.',
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

You already found that number earlier.`,
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

Example: W shifted back 3 = T. H-3 = E. O-3 = L. Z-3 = W.`,
        },
      ],
      answers: ['hush', 'be hush'],
      hints: [
        '💡 The shift = the number of people who vanished = 3. Shift every letter back 3.',
        '💡 W→T, H→E, O→L, O→L … the first word is TELL.',
        '💡 The full line is "TELL THEM TO HUSH". The answer is the last word.',
      ],
      successMessage: `🔓 **HUSH.**

You look up from the screen — your reflection moves a fraction too late.

*"They are trapped between frequencies. You are the bridge."*`,
    },

    {
      id: 6,
      name: 'The Facility',
      difficulty: 4,
      channels: [
        {
          name: 'floor-plan',
          description: '🗺️ A floor plan of the facility.',
          content: `**FLOOR PLAN — STATION RED-7**

\`\`\`
      NORTH (storage)
           |
WEST --- CORE --- EAST (bedroom)
           |
      SOUTH (corridor)
\`\`\`

The access code for the CORE is the sum of:
- Active refrigerators in NORTH
- Intact vials in WEST
- The number written on the mattress in EAST`,
        },
        {
          name: 'storage-north',
          description: '❄️ The storage room. It smells of cold air.',
          content: `**STORAGE ROOM NORTH**

There are 5 refrigerators. Refrigerators 3 and 5 are decommissioned — their plugs have been pulled out.

Refrigerators 1, 2 and 4 are active. On refrigerator 4 there is a sticker: *"Do not touch — specimen 7B"*

Decommissioned refrigerators do **not** count.`,
        },
        {
          name: 'bedroom-east',
          description: '🛏️ The bedroom. It smells of dust.',
          content: `**BEDROOM EAST**

Three bunk beds. Five mattresses are blank. On the sixth mattress — the top bunk of the middle bed — written in marker:

**47**

Below it: *"If you see this: the number is correct. — P.C."*

P.C. — Peter Callens.

*In the laboratory (WEST) there are 5 vials. 2 are broken.*`,
        },
      ],
      answers: ['53', 'fifty three', 'fifty-three'],
      hints: [
        '💡 Count the active refrigerators in NORTH (not the decommissioned ones).',
        '💡 In WEST there are 5 vials, 2 broken. How many intact? And the mattress number is in EAST.',
        '💡 Active refrigerators (3) + intact vials (3) + mattress number (47) = the code.',
      ],
      successMessage: `🔓 **53. The CORE opens.**

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

Three technicians report hearing a voice in the bedroom at night. The voice always said the same thing:

*"Seven. Six. Eight. Nine. Stop. Stop. Stop."*

Technician Callens wrote the numbers down as a mathematical row. He claims the row is never random.

*"The sum of the numbers she names is the name of who holds her captive."*

But it is not a sum. It is a **product**.`,
        },
        {
          name: 'callens-proof',
          description: "📐 Peter Callens' mathematical notes.",
          content: `**NOTES — PETER CALLENS**

The voice says: 7, 6, 8, 9

I tried every operation. Multiplying gives the keeper's number.

7 × 6 × 8 × 9 = ?

That number — that is his name. The frequency he broadcasts on.
*"If you know his name, you can jam him."*`,
        },
      ],
      answers: ['3024', 'three thousand twenty four', 'three thousand and twenty four'],
      hints: [
        '💡 The voice names four numbers: 7, 6, 8, 9. Multiply them all together.',
        '💡 7 × 6 = 42. 42 × 8 = 336. 336 × 9 = ?',
        '💡 7 × 6 × 8 × 9 = 3024.',
      ],
      successMessage: `🔓 **3024. The machine trembles.**

The woman opens her eyes. *"You're almost there. But there are more of them. They're getting impatient."*

She hands you a map covered in symbols.`,
    },

    {
      id: 8,
      name: 'The Book of Symbols',
      difficulty: 4,
      channels: [
        {
          name: 'the-map',
          description: '🗺️ The map covered in strange symbols.',
          content: `**THE MAP**

A 3×3 grid of symbols:

\`\`\`
  △  |  ○  |  □
-----|-----|-----
  △  |  □  |  △
-----|-----|-----
  ○  |  △  |  ○
\`\`\`

Values:
- △ (triangle) = 3
- ○ (circle) = 1
- □ (square) = 0

Add up all 9 symbols. That sum activates the bridge.`,
        },
        {
          name: 'legend',
          description: '📜 A faded legend on the back.',
          content: `**LEGEND — BACK OF THE MAP**

*"The symbols are older than the facility. Older than the radio.*

*Add everything up. The number that remains is the key to the bridge.*

*The bridge stands between here and there. Between memory and forgetting."*`,
        },
      ],
      answers: ['15', 'fifteen'],
      hints: [
        '💡 Triangle=3, circle=1, square=0. Add all 9 symbols.',
        '💡 Row 1: 3+1+0=4. Row 2: 3+0+3=6. Row 3: ?',
        '💡 Row 3: 1+3+1=5. Total: 4+6+5=15.',
      ],
      successMessage: `🔓 **15. The bridge activates.**

The symbols glow. The woman smiles for the first time.

*"The bridge is open. But you must choose who you pull through."*`,
    },

    {
      id: 9,
      name: 'The Final Letter',
      difficulty: 5,
      channels: [
        {
          name: 'the-portal',
          description: '🌀 The portal is open. But it is unstable.',
          content: `**THE PORTAL — OBSERVATIONS**

The signal is collapsing into a single letter. To stabilize the portal you must name that letter.

On the panel:
*"The first letter of the Greek alphabet is Alpha — the beginning. Name the LAST letter of the Greek alphabet — the end."*

The machine hums. It wants the name of the ending.`,
        },
        {
          name: 'greek-chart',
          description: '🔤 A chart of the Greek alphabet on the wall.',
          content: `**GREEK ALPHABET — FIRST AND LAST**

\`\`\`
Alpha  (Α α)  ← the first, the beginning
Beta   (Β β)
Gamma  (Γ γ)
...
Psi    (Ψ ψ)
Omega  (Ω ω)  ← the last, the end
\`\`\`

*"Alpha and Omega. The beginning and the end. Name the end and the bridge holds."*`,
        },
      ],
      answers: ['omega', 'the omega', 'ω'],
      hints: [
        '💡 The puzzle wants the LAST letter of the Greek alphabet.',
        '💡 Alpha is the first. What is traditionally paired with it as the last?',
        '💡 "Alpha and Omega." The answer is Omega.',
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

In the centre: the central transmitter. On the panel:

*"Enter the master code to shut the system down."*

The master code is a word. Take the first letter of every WORD answer you found along the way — skip the number answers.`,
        },
        {
          name: 'master-code-clue',
          description: '📟 A clue printed on thermal paper.',
          content: `**MASTER CODE — CLUE**

Take the first letter of every WORD answer:

- Level 1: **E**ar → E
- Level 2: **C**ode → C
- Level 3: 3149 → *(number, skip)*
- Level 4: 144 → *(number, skip)*
- Level 5: **H**ush → H
- Level 6: 53 → *(number, skip)*
- Level 7: 3024 → *(number, skip)*
- Level 8: 15 → *(number, skip)*
- Level 9: **O**mega → O

Letters in order: **E — C — H — O**`,
        },
        {
          name: 'ernest-last-message',
          description: '📻 Ernest stands at the radio. He wants to say something.',
          content: `**ERNEST VERMEER — LAST MESSAGE**

*"The word... I've known it all along.*

*The letters are E, C, H, O. Put them in order.*

*It's what a signal becomes when it has nowhere left to go. It bounces back. It repeats. It refuses to die.*

*An..."*

Ernest looks you straight in the eye.

*"**ECHO.**"*`,
        },
      ],
      answers: ['echo', 'an echo', 'the echo'],
      hints: [
        '💡 Take the first letter of every WORD answer: E (ear), C (code), H (hush), O (omega).',
        '💡 Put the letters E, C, H, O in order.',
        '💡 E + C + H + O = ECHO.',
      ],
      successMessage: `🔓 **ECHO.**

One by one the lights go out. The antenna stops humming. The radio falls silent.

For the first time in 37 years: absolute silence in Station Red-7.

Marta cries. Peter laughs. Ernest takes off his headphones.

**You brought them home.**

━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 **THE FORGOTTEN FREQUENCY — COMPLETED**
━━━━━━━━━━━━━━━━━━━━━━━━━`,
    },
  ],
};
