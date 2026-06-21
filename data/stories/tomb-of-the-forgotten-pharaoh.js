// ================================================================
// 📖 STORY 3 — THE TOMB OF THE FORGOTTEN PHARAOH
// Through-line: an archaeologist is sealed inside a newly opened
// tomb when the entrance collapses. The only way out is to satisfy
// the tomb's guardian by proving you are worthy.
// Meta-finale: the four WORD answers (Amulet, Nile, King, Horus)
// give first letters A-N-K-H → the ankh, key of eternal life.
// ================================================================

module.exports = {
  id: 'tomb',
  name: 'Tomb of the Forgotten Pharaoh',
  description: 'Egypt, 1923. You are archaeologist Dr. Nora Halford. The moment your torch lit the burial chamber, the entrance collapsed behind you. The air is thin and the walls are covered in puzzles left by priests who did not want to be disturbed. Solve them, or join the pharaoh forever.',
  emoji: '🏺',
  color: '#c8a951',

  levels: [
    {
      id: 1,
      name: 'The Hieroglyph Key',
      difficulty: 2,
      channels: [
        {
          name: 'antechamber-wall',
          description: '𓂀 The first wall, carved with rows of symbols.',
          content: `**ANTECHAMBER — THE FIRST WALL**

A line of glyphs glows faintly where your torch passes:

\`\`\`
𓀀 𓁹 𓅓 𓄿 𓆑 𓏏
\`\`\`

Beneath, the priests left a translation key for the worthy. Read the glyphs in order — they name the object you must find to proceed.`,
        },
        {
          name: 'rosetta-key',
          description: '📜 A scribe\'s decoding key on papyrus.',
          content: `**SCRIBE'S KEY — GLYPH TO LETTER**

\`\`\`
𓀀 = A    𓁹 = M    𓅓 = U
𓄿 = L    𓆑 = E    𓏏 = T
𓊽 = D    𓂀 = R    𓃭 = N
\`\`\`

Translate the six glyphs on the wall, in order, into letters. They spell one word — the thing you must name.`,
        },
      ],
      answers: ['amulet', 'the amulet', 'an amulet'],
      hints: [
        '💡 Match each glyph to its letter using the scribe\'s key.',
        '💡 𓀀=A, 𓁹=M, 𓅓=U, 𓄿=L, 𓆑=E, 𓏏=T.',
        '💡 The glyphs spell AMULET.',
      ],
      successMessage: `🔓 **AMULET. A stone slab grinds aside.**

In a niche sits a golden amulet shaped like a beetle. As you lift it, torchlight floods the next passage.

*The tomb is testing you. Keep going.*`,
    },

    {
      id: 2,
      name: 'The River Riddle',
      difficulty: 3,
      channels: [
        {
          name: 'water-clock-room',
          description: '⏳ A chamber with a dry stone channel running through it.',
          content: `**THE CHANNEL ROOM**

A dry channel cuts across the floor toward a sealed door. Above the door, a riddle is carved in three languages; the worthy need only one:

*"I have no legs but I always run,
I have a mouth but never eat,
I have a bed but never sleep,
I gave this whole black land its life.
Speak my name and cross my bed."*

The answer is a single word — the great river of this land.`,
        },
        {
          name: 'priest-margin',
          description: '🪶 A priest\'s note chipped into the corner.',
          content: `**PRIEST'S NOTE**

*"A river runs without legs. Its mouth meets the sea. Its bed is the ground beneath the water.*

*Without it there is no Egypt. The Greeks called it one thing; we called it another, but you know the name the world remembers.*

*One word. Four letters."*`,
        },
      ],
      answers: ['nile', 'the nile', 'river nile'],
      hints: [
        '💡 It "runs" (flows), has a "mouth" (delta) and a "bed" (riverbed) but is not alive.',
        '💡 It is the great river of Egypt — four letters.',
        '💡 The answer is the NILE.',
      ],
      successMessage: `🔓 **NILE. Sand pours from a hidden slot and the door rolls back.**

Cool air rushes in. Painted on the new wall: a procession of kings.

*Two trials passed. The guardian is watching.*`,
    },

    {
      id: 3,
      name: 'The Numbered Cartouche',
      difficulty: 3,
      channels: [
        {
          name: 'hall-of-kings',
          description: '👑 A long hall lined with royal cartouches.',
          content: `**HALL OF KINGS — THE SEALED CARTOUCHE**

One cartouche is sealed with a numbered lock. Instead of glyphs, it shows a row of numbers:

\`\`\`
11 - 9 - 14 - 7
\`\`\`

A plaque reads: *"The old scribes hid words as numbers. The first letter of the alphabet is one. Count to find each letter. The word is the title of the one who lies here."*`,
        },
        {
          name: 'number-key',
          description: '🔢 An A1Z26 conversion table carved in stone.',
          content: `**NUMBER CIPHER — A1Z26**

\`\`\`
1=A   2=B   3=C   4=D   5=E   6=F   7=G
8=H   9=I  10=J  11=K  12=L  13=M  14=N
15=O  16=P  17=Q  18=R  19=S  20=T  21=U
22=V  23=W  24=X  25=Y  26=Z
\`\`\`

Convert 11-9-14-7 into four letters. They spell a royal title.`,
        },
      ],
      answers: ['king', 'the king'],
      hints: [
        '💡 Convert each number to its letter: 11=K, 9=I...',
        '💡 11-9-14-7 → K-I-N-G.',
        '💡 The title is KING.',
      ],
      successMessage: `🔓 **KING. The cartouche splits open.**

Behind it, a narrow stair spirals down to the burial chamber itself. The pharaoh's sarcophagus waits in the dark.

*One trial remains before the guardian.*`,
    },

    {
      id: 4,
      name: 'The Scattered God',
      difficulty: 4,
      channels: [
        {
          name: 'burial-chamber',
          description: '⚰️ The burial chamber. Four canopic jars stand in a row.',
          content: `**BURIAL CHAMBER — THE FALCON GOD**

Above the sarcophagus, a name has been deliberately scrambled by the priests so no thief could speak it and steal its power:

\`\`\`
S U R O H
\`\`\`

A carving warns: *"Unscramble the falcon-headed god, protector of kings, whose eye is painted on every wall. Speak his true name to face the guardian."*`,
        },
        {
          name: 'wall-painting',
          description: '🦅 A vivid wall painting of a falcon-headed deity.',
          content: `**WALL PAINTING — THE FALCON**

A god with the head of a falcon, the sun-disc above him, the wedjat **Eye** painted again and again across the chamber.

*"Five letters: S, U, R, O, H. Rearrange them. He is the sky-god, son of Osiris and Isis, the falcon whose right eye is the sun."*`,
        },
      ],
      answers: ['horus', 'the horus', 'god horus'],
      hints: [
        '💡 The letters S, U, R, O, H spell a famous Egyptian god — the falcon, the Eye.',
        '💡 Start with H... the son of Osiris and Isis.',
        '💡 Unscrambled: HORUS.',
      ],
      successMessage: `🔓 **HORUS. The painted Eye blazes with light.**

The sarcophagus lid slides aside on its own. No mummy — only a stone pedestal and the voice of the guardian, filling the chamber.

*"You have proven knowledge. Now prove understanding."*`,
    },

    {
      id: 5,
      name: 'The Key of Life',
      difficulty: 5,
      channels: [
        {
          name: 'the-guardian',
          description: '𓋹 The guardian\'s voice surrounds you. One way out.',
          content: `**THE GUARDIAN — FINAL TRIAL**

The voice speaks from everywhere at once:

*"Four words you spoke to reach me, in the order you found them. Take the FIRST LETTER of each and join them. You will hold the symbol the gods carry by its loop — the key of eternal life. Name it, and the tomb will open. Fail, and you stay with the king forever."*

On the pedestal, four worn dials wait for four letters.

Assemble the first letters of your four previous WORD answers, in order, and submit the word with \`/answer\`. Forgotten one? Use \`/hint\`.`,
        },
      ],
      answers: ['ankh', 'the ankh'],
      hints: [
        '💡 Only the four WORD answers count, in order: Level 1, 2, 3, 4.',
        '💡 Those words were: AMULET, NILE, KING, HORUS.',
        '💡 First letters A, N, K, H → ANKH, the Egyptian key of life.',
      ],
      successMessage: `🔓 **ANKH.**

The four dials lock into place. Carved across the far wall, an ankh splits down the middle and the whole slab swings outward — daylight, real daylight, and the smell of desert wind.

The guardian's voice fades, almost gentle:

*"You understood. The key of life was never gold or stone. Go, and remember us."*

You step out of the Tomb of the Forgotten Pharaoh into the rising sun.

━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 **TOMB OF THE FORGOTTEN PHARAOH — COMPLETED**
━━━━━━━━━━━━━━━━━━━━━━━━━`,
    },
  ],
};
