// ================================================================
// 📖 STORY 2 — THE HOLLOW LIGHTHOUSE
// Through-line: a lighthouse keeper vanished decades ago. You spend
// one night in the tower and the light starts sending messages.
// ================================================================

module.exports = {
  id: 'lighthouse',
  name: 'The Hollow Lighthouse',
  description: 'Black Reef lighthouse has stood empty for forty years, ever since keeper Alma Brandt walked up the stairs one storm and never came down. You volunteered to spend one night logging the structure. Tonight, the dead light flickers on by itself.',
  emoji: '🗼',
  color: '#1abc9c',

  levels: [
    {
      id: 1,
      name: 'The Logbook',
      difficulty: 1,
      channels: [
        {
          name: 'keepers-desk',
          description: '🕯️ A desk at the base of the tower, thick with dust.',
          content: `**BLACK REEF LIGHTHOUSE — KEEPER'S LOG**

The last entry is dated 3 November 1984, in a shaking hand:

*"The light won't obey me anymore. It blinks when I sleep. Three short, three long, three short. Over and over. If anyone reads this — that's not a malfunction. That's a cry. Answer it the way sailors do."*

The rest of the page is torn out.`,
        },
        {
          name: 'signal-card',
          description: '📇 A laminated reference card pinned above the desk.',
          content: `**MARITIME DISTRESS — REFERENCE**

Every sailor knows one signal above all others. Three short flashes, three long flashes, three short flashes. It is the universal call for help.

In letters, the three-three-three pattern spells the most famous distress call in the world.

*(Hint: it is also said to stand for "Save Our Souls.")*`,
        },
      ],
      answers: ['sos', 's.o.s', 's o s', 's-o-s'],
      hints: [
        '💡 Three short, three long, three short. What maritime signal is that?',
        '💡 The reference card spells it out — the most famous distress call.',
        '💡 Three letters. "Save Our Souls." The answer is SOS.',
      ],
      successMessage: `🔓 **SOS. The lamp above you flares once.**

A drawer you hadn't noticed clicks open at the side of the desk. Inside: a brass key and a tide chart.

*Someone — or something — wants you to climb.*`,
    },

    {
      id: 2,
      name: 'The Tide Chart',
      difficulty: 2,
      channels: [
        {
          name: 'tide-chart',
          description: '🌊 A water-stained chart of the local tides.',
          content: `**TIDE CHART — BLACK REEF — NOVEMBER**

The locked stair-gate uses a 3-digit code. The brass plate beside it reads:

*"The tower remembers the night she left. Enter the hour of the highest tide on the night of 3 November 1984 — written as it appears on this chart."*

\`\`\`
2 NOV   High tide: 21:00   Height: 4.1 m
3 NOV   High tide: 23:00   Height: 5.8 m   ← highest of the month
4 NOV   High tide: 22:00   Height: 4.4 m
\`\`\`

The code is the high-tide time on 3 November, digits only.`,
        },
        {
          name: 'brass-plate',
          description: '🔱 A small brass plate screwed beside the gate.',
          content: `**STAIR-GATE — INSTRUCTIONS**

The time is shown in 24-hour format on the chart. Strip the colon.

For example, a high tide listed as 09:00 would be entered as **900**.

Enter only the digits of the 3 November high-tide time.`,
        },
      ],
      answers: ['2300', '23:00', '23 00'],
      hints: [
        '💡 Find the highest tide of the month on the chart — it is marked.',
        '💡 The 3 November high tide is at 23:00.',
        '💡 Strip the colon: 23:00 becomes 2300.',
      ],
      successMessage: `🔓 **2300. The gate swings inward.**

The spiral staircase rises into the dark. Salt wind moans down the shaft.

Halfway up, a framed photograph hangs crooked on the wall. You'll want to look at it.`,
    },

    {
      id: 3,
      name: 'The Crooked Photograph',
      difficulty: 2,
      channels: [
        {
          name: 'the-photograph',
          description: '🖼️ A faded photo of the lighthouse staff.',
          content: `**PHOTOGRAPH — "STAFF, SUMMER 1984"**

Five people stand on the rocks. On the back, written in pencil:

*"Left to right: Tomas, Alma, Greta, Ravi, Nils."*

*"The one who stayed is the one in the middle. She is the key. Count her letters."*

The glass over Alma's face is cracked.`,
        },
        {
          name: 'wall-scratch',
          description: '🪨 Words scratched into the plaster beside the frame.',
          content: `**SCRATCHED INTO THE WALL**

*"Not the name. The NUMBER of letters in the name of the one who stayed."*

*"She stood in the middle of five. She never left this tower."*

Count carefully. The answer is a single number.`,
        },
      ],
      answers: ['4', 'four'],
      hints: [
        '💡 Who "stayed"? The keeper who vanished — the one in the middle of the five.',
        '💡 Left to right: Tomas, Alma, Greta, Ravi, Nils. The middle person is Alma.',
        '💡 Count the letters in ALMA: A-L-M-A = 4.',
      ],
      successMessage: `🔓 **4. The photograph swings aside on a hidden hinge.**

Behind it: a small alcove holding a wax cylinder recording and a note that simply says *"Play me at the top."*

You keep climbing.`,
    },

    {
      id: 4,
      name: 'The Lamp Room Cipher',
      difficulty: 3,
      channels: [
        {
          name: 'lamp-room',
          description: '💡 The top of the tower. The great lens turns slowly on its own.',
          content: `**LAMP ROOM — ROTATING LENS**

The lens flashes a sequence at you, deliberate and slow. Beside the mechanism, a card reads:

*"I speak in numbers. Each number is a letter. A=1, B=2, and so on to Z=26. Read me and you'll know where she is."*

The flashes, counted carefully:

\`\`\`
2 - 5 - 12 - 15 - 23
\`\`\``,
        },
        {
          name: 'cipher-key',
          description: '🔑 An engraved plate explaining the number code.',
          content: `**A1Z26 CIPHER — KEY**

Convert each number to its letter:

\`\`\`
1=A   2=B   3=C   4=D   5=E   6=F   7=G
8=H   9=I  10=J  11=K  12=L  13=M  14=N
15=O  16=P  17=Q  18=R  19=S  20=T  21=U
22=V  23=W  24=X  25=Y  26=Z
\`\`\`

Decode the five numbers into a five-letter word. It tells you where to look next.`,
        },
      ],
      answers: ['below', 'down', 'beneath'],
      hints: [
        '💡 Convert each number to a letter: 2=B, 5=E, 12=L...',
        '💡 2-5-12-15-23 → B-E-L-O-W.',
        '💡 The word is BELOW. Whatever you seek is beneath you, not above.',
      ],
      successMessage: `🔓 **BELOW.**

The word lands like a stone in your chest. You came all the way up — and the answer points *down*. Beneath the lighthouse. Beneath the rock.

The wax cylinder begins to play by itself.`,
    },

    {
      id: 5,
      name: 'What the Light Was Saying',
      difficulty: 4,
      channels: [
        {
          name: 'the-recording',
          description: '📼 The wax cylinder crackles to life in Alma\'s voice.',
          content: `**WAX CYLINDER — ALMA BRANDT**

*"If you climbed all this way, you're braver than I was. The light was never broken. It was me, signalling, the only way I could from down here.*

*The storm took the cliff path. I went below to save the spare oil and the sea sealed the door behind me. Forty years I've flashed the same word up the shaft, hoping someone would read it and dig.*

*Three short, three long, three short. Then a single word, over and over. The same word you'd shout into a cave to see if anyone shouts back. The same word that comes back to you off these cliffs every single night.*

*Say it, and let me rest."*`,
        },
        {
          name: 'final-clue',
          description: '🪨 Words chalked on the floor of the lamp room.',
          content: `**CHALKED ON THE FLOOR**

*"A sound that returns to the one who made it.*
*The cliffs give it back across the water every night.*
*Shout into the dark and the dark answers with your own voice.*

*Name it, and the door below opens."*`,
        },
      ],
      answers: ['echo', 'an echo', 'the echo'],
      hints: [
        '💡 A sound that bounces off the cliffs and returns to you — what is it called?',
        '💡 You shout into a cave and your own voice comes back. That returning sound...',
        '💡 The word is ECHO.',
      ],
      successMessage: `🔓 **ECHO.**

Far below, stone grinds against stone. A sealed door, shut for forty years, drifts open on the tide.

The light in the lamp room steadies — no more flashing, no more SOS. Just a calm, even beam sweeping the water, the way a lighthouse is meant to shine.

Somewhere beneath your feet, Alma Brandt finally stops calling for help.

━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 **THE HOLLOW LIGHTHOUSE — COMPLETED**
━━━━━━━━━━━━━━━━━━━━━━━━━`,
    },
  ],
};
