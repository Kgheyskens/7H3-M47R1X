// ================================================================
// 📖 STORY 6 — THE LAST TRAIN TO NOWHERE  (★ HARD ★)
// Through-line: you're a detective trapped on a night train where a
// passenger has vanished mid-journey. Each carriage is a locked-room
// puzzle solved by lateral thinking, logic deduction, and hard
// wordplay — NO ciphers, no decoding. Real "doordenkers".
// Meta-finale: the six WORD answers, first letters, name the culprit.
//   L1 Silence · L2 Tunnel · L3 Empty · L4 Window · L5 Echo · L6 Nine
//   → S-T-E-W-E-N  →  "STEWEN" (the conductor's name).
// Every level demands a single, exact word; /hint nudges, never solves.
// ================================================================

module.exports = {
  id: 'lasttrain',
  name: 'The Last Train to Nowhere',
  description: 'You boarded the 23:48 sleeper as a passenger, not a detective. Three stations in, compartment 7 is found locked from the inside, the window sealed, and the man who booked it simply… gone. The train will not stop until dawn. Six carriages stand between you and the truth, and each one guards its secret with a puzzle. No codes here — only how well you think.',
  emoji: '🚂',
  color: '#34495e',
  difficultyLabel: 'Hard',

  levels: [
    // ── L1 ─────────────────────────────────────────────────────
    {
      id: 1,
      name: 'Compartment Seven',
      difficulty: 5,
      channels: [
        {
          name: 'the-locked-room',
          description: '🚪 The vanished passenger\'s compartment, locked from inside.',
          content: `**COMPARTMENT 7 — THE FIRST PUZZLE**

The door was bolted from the inside. The window won't open. The man is gone, but he left a note pinned to the pillow, in a careful hand:

*"Detective — if you're reading this, you already feel it. The thing that filled this room the instant I disappeared. It is the one witness to what happened, and it will tell you nothing, because telling is the one thing it cannot do.*

*It is broken by a single word and destroyed by a sound. It lives in libraries, in graves, and in the gap between two people who used to speak.*

*Name the witness. That is your way in."*

\`/answer\` with one word. Stuck? \`/hint\`.`,
        },
        {
          name: 'the-conductors-card',
          description: '🎫 A conductor\'s calling card on the floor, name worn away.',
          content: `**CONDUCTOR'S CARD — A LINE ON THE BACK**

*"Six doors. Six words. When you have all six, read down their first letters — they spell the name of the one who did this. I should know. Find me last."*

The conductor's own name has been deliberately scratched off the front of the card.`,
        },
      ],
      answers: ['silence', 'the silence'],
      hints: [
        '💡 It "filled the room", it cannot speak, and it is "broken" by a word or a sound — those are the classic clues for one thing.',
        '💡 You "break" it when you speak. A library is full of it.',
        '💡 Seven letters, begins with S. The absence of all sound.',
      ],
      successMessage: `🔓 **SILENCE. The bolt slides back on its own — or you only now notice it was never truly stuck.**

First letter banked: **S**.

The corridor stretches ahead, swaying. The lights flicker as the train plunges into something darker than night.`,
    },

    // ── L2 ─────────────────────────────────────────────────────
    {
      id: 2,
      name: 'Into the Dark',
      difficulty: 5,
      channels: [
        {
          name: 'the-sudden-dark',
          description: '🌑 Every window goes black at once. A riddle is scratched in the grime.',
          content: `**INTO THE DARK**

Without warning every window turns to pure black and your ears pop. A child's handwriting is fingered into the condensation of the glass:

*"We are in my belly now. I have no light of my own and I swallow the train whole, then give it back. Birds nest at my mouths but never in my middle. I am longest where the mountain is highest. Mapmakers draw me as a pair of dotted lips in the hillside.*

*Where are we right now?"*

One word, with \`/answer\`.`,
        },
        {
          name: 'the-draught',
          description: '💨 A cold draught carries a second hint down the carriage.',
          content: `**A VOICE ON THE DRAUGHT**

*"Think about why the windows went black and your ears popped at the very same instant. You did not stop. You went *through* something. It has two ends and no middle-light, and the longer I am, the longer you wait for the stars to come back."*`,
        },
      ],
      answers: ['tunnel', 'a tunnel', 'the tunnel'],
      hints: [
        '💡 Windows black, ears popping, no daylight — you have entered something the train passes through.',
        '💡 It "swallows the train and gives it back", it cuts through mountains, it has two mouths and a dark middle.',
        '💡 Six letters, begins with T.',
      ],
      successMessage: `🔓 **TUNNEL.**

First letters now: **S · T**.

Daylight — no, moonlight — slams back into the windows as you burst out the far end. In the sudden brightness you see the next carriage door standing wide open.`,
    },

    // ── L3 ─────────────────────────────────────────────────────
    {
      id: 3,
      name: 'The Dining Car',
      difficulty: 5,
      channels: [
        {
          name: 'the-dining-car',
          description: '🍽️ Tables set for a full service. Not one passenger in any seat.',
          content: `**THE DINING CAR — A LOGIC PROBLEM**

Every table is laid — steaming plates, poured wine — but there is not a single diner. A card stands on the maître d's lectern:

*"Four passengers should be sitting here: the Doctor, the Widow, the Soldier and the Priest. The waiter swears all four ordered, yet all four seats are bare. He tells you four things, and exactly ONE of them is a lie:*

*1. 'If the Doctor is gone, so is the Soldier.'*
*2. 'The Widow is still on the train.'*
*3. 'The Doctor is gone.'*
*4. 'If the Widow is still on the train, then the Soldier is gone too.'*

*The dining car is a single word that describes what every seat in it now is. Once you reason out who's missing, that word names the car's condition. What is it?"*

\`/answer\` with one word.`,
        },
        {
          name: 'waiters-apron',
          description: '🧾 A note tucked in the waiter\'s folded apron.',
          content: `**WAITER'S NOTE**

*"Don't overthink the names — they're a distraction. Work out from the four statements that everyone is in fact missing, and then just LOOK at the room. Plates served, wine poured, and every chair holding no one. What is the single word for a seat, a table, a whole car like that?"*`,
        },
      ],
      answers: ['empty', 'the empty', 'all empty'],
      hints: [
        '💡 Statements 2 and 4 together force the Soldier to be gone; statement 1 says nothing once you test it; statement 3 lines up — so reason out which single statement must be the lie, and you find everyone is missing.',
        '💡 The puzzle is a misdirection. The answer is simply the plain word for a room full of seats with nobody in them.',
        '💡 Five letters, begins with E. The opposite of full.',
      ],
      successMessage: `🔓 **EMPTY.**

First letters: **S · T · E**.

The wine glasses tremble with the rhythm of the rails. At the end of the dining car, a single window has been left open to the night — the only one on the whole train.`,
    },

    // ── L4 ─────────────────────────────────────────────────────
    {
      id: 4,
      name: 'The Open Window',
      difficulty: 5,
      channels: [
        {
          name: 'the-one-open-window',
          description: '🪟 The single open window on the train. Cold air howls through.',
          content: `**THE OPEN WINDOW — A WORDPLAY LOCK**

The frame is engraved with a verse. The catch won't release until you speak the word it's describing — and the word is hidden *inside* the verse itself.

*"I am a part of every wall that lets the morning through.*
*Break me into pieces and you'll find the WIND that rattles me,*
*and the LOW place a debtor sinks to when his luck runs through.*
*I watch, but I am not an eye. I am 'wind' and 'low' standing together.*
*Say my whole name."*

\`/answer\` with the single word.`,
        },
        {
          name: 'frost-on-the-glass',
          description: '❄️ Letters appear in the frost as you breathe on it.',
          content: `**FROST HINT**

*"This is not a riddle about meaning — it's a riddle about spelling. Take the word for moving air. Put after it the word for the opposite of high. Read the two as one word. That is the thing you are looking through right now."*`,
        },
      ],
      answers: ['window', 'a window', 'the window'],
      hints: [
        '💡 The answer literally contains two smaller words back to back: one means moving air, the other means not-high.',
        '💡 WIND + LOW, read as a single word. And it\'s the very thing the verse is engraved on.',
        '💡 Six letters, begins with W.',
      ],
      successMessage: `🔓 **WINDOW. The catch snaps shut and the howling stops.**

First letters: **S · T · E · W**.

In the new quiet you hear it — a voice, repeating the last thing you said, coming from the empty luggage car ahead.`,
    },

    // ── L5 ─────────────────────────────────────────────────────
    {
      id: 5,
      name: 'The Luggage Car',
      difficulty: 5,
      channels: [
        {
          name: 'the-luggage-car',
          description: '🧳 Stacks of trunks and cases. Your own voice comes back to you.',
          content: `**THE LUGGAGE CAR**

Trunks tower to the ceiling. When you speak, the word comes back a heartbeat later from somewhere in the stacks. A label tied to the largest trunk reads:

*"I am the only thing that has answered you honestly all night, and I have only ever said what you said first. I have no tongue. I am born the instant you speak and I die before you finish listening. Caves keep me. Mountains throw me back. The missing man's last word still lives in me, here, if you'll name what I am."*

One word, \`/answer\`.`,
        },
      ],
      answers: ['echo', 'an echo', 'the echo'],
      hints: [
        '💡 The car itself is doing it: repeating your words back a moment after you speak.',
        '💡 It only repeats, never originates; you meet it in caves and canyons.',
        '💡 Four letters, begins with E.',
      ],
      successMessage: `🔓 **ECHO. The repeating voice says the word back, then falls silent for good.**

First letters: **S · T · E · W · E**.

One trunk sits apart from the rest, a brass combination lock on its clasp, a single digit short of opening. The final carriage — the conductor's own — lies just beyond.`,
    },

    // ── L6 — FINALE ────────────────────────────────────────────
    {
      id: 6,
      name: 'The Conductor\'s Van',
      difficulty: 5,
      channels: [
        {
          name: 'the-conductors-van',
          description: '🔒 The last carriage. The conductor\'s logbook lies open on the desk.',
          content: `**THE CONDUCTOR'S VAN — THE LAST PUZZLE**

The final door. On the desk, the conductor's logbook is open to a half-finished page:

*"Detective. You're nearly there. One number stands between you and my name.*

*Count the carriages you have walked through tonight to reach me — the compartment, the tunnel stretch, the dining car, the window car, the luggage car, and this one. But the riddle wants more than a count.*

*Take that number of carriages. Now think of the number that, when you multiply it by itself, gives the number of carriages times itself, plus the dining car and the luggage car and the open window and the silence and the tunnel and this van again — no. Forget my arithmetic. I am stalling.*

*The truth is simpler and crueller: there were never six carriages. A train like this always runs with the same cursed number — three more than the six you counted. Say that number as a WORD."*

(Six carriages walked, plus three the riddle adds, names the final word.)

\`/answer\` with the number written as a word.`,
        },
        {
          name: 'the-scratched-card-again',
          description: '🎫 The conductor\'s card from the first carriage, held to the lamp.',
          content: `**THE CARD, UNDER THE LAMP**

Held to the light, the scratched-off name on the conductor's card shows its ghost:

*"Six words you have earned tonight. Read down their first letters — Silence, Tunnel, Empty, Window, Echo, and the word you are about to give me. That spells the name of the one who emptied compartment 7.*

*Six plus three. Write the number as a word, and you'll have the last letter you need."*`,
        },
      ],
      answers: ['nine', '9'],
      hints: [
        '💡 The maths is deliberate noise. The conductor tells you plainly: six carriages you counted, plus three more — that is the number he wants.',
        '💡 6 + 3. Write it as a word, not a digit (though both are accepted).',
        '💡 Four letters, begins with N. Its first letter is the one that completes the name.',
      ],
      successMessage: `🔓 **NINE.**

The six first letters fall into place:
**S · T · E · W · E · N — STEWEN.**

The name on the scratched card resolves at last: *Stewen*, the night conductor. The chair behind the desk turns slowly, and the man who was never missing — who walked compartment 7's passenger off at the tunnel and reported himself gone — looks up at you with a tired smile.

*"Took you six carriages, detective. Most people sleep right through to dawn and never notice a thing."*

Outside, the first grey light breaks over the rails. The train, for the first time all night, begins to slow.

━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 **THE LAST TRAIN TO NOWHERE — COMPLETED**
━━━━━━━━━━━━━━━━━━━━━━━━━`,
    },
  ],
};
