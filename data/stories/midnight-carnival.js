// ================================================================
// 📖 STORY 5 — THE MIDNIGHT CARNIVAL  (★ MEDIUM ★)
// Through-line: a carnival appears out of the fog at midnight. Each
// attraction is run by a masked character who blocks your way with a
// riddle, a piece of wordplay, or a lateral brain-teaser. No codes,
// no ciphers — only thinking.
// Meta-finale: the five WORD answers spell the truth of the place.
//   L1 Darkness · L2 River · L3 Echo · L4 Apple · L5 Moon → D-R-E-A-M
// You name it to wake up.
// ================================================================

module.exports = {
  id: 'carnival',
  name: 'The Midnight Carnival',
  description: 'You took a shortcut home through the fog and walked straight into a carnival that was not there yesterday. The gate is open. The music is warm. But every masked attendant wants the same toll before they let you pass: not a coin, but an answer. Solve your way to the centre — and to the truth of where you really are.',
  emoji: '🎪',
  color: '#9b59b6',
  difficultyLabel: 'Medium',

  levels: [
    // ── L1 ─────────────────────────────────────────────────────
    {
      id: 1,
      name: 'The Ticket Booth',
      difficulty: 2,
      channels: [
        {
          name: 'the-ticket-booth',
          description: '🎟️ A lantern-lit booth at the carnival gate.',
          content: `**THE MIDNIGHT CARNIVAL — GATE**

A seller in a grinning porcelain mask leans out of the booth. No money changes hands here.

*"First toll is free, friend — just a riddle. Name the thing that fills this whole carnival and yet you cannot hold it, cannot light it without chasing it away. It grows when the lanterns die. The more of it there is, the less you see. What am I asking you to name?"*

Answer with \`/answer\`. Stuck? Try \`/hint\`.`,
        },
      ],
      answers: ['darkness', 'the dark', 'dark', 'the darkness', 'night'],
      hints: [
        '💡 It is not a thing you can carry. It is what the lanterns are fighting against.',
        '💡 "The more of it there is, the less you see." Think about what shining a light *removes*.',
        '💡 It is the opposite of light. One word, begins with D.',
      ],
      successMessage: `🔓 **DARKNESS. The seller tips his mask and waves you through.**

*"One for one. Keep that word — you'll want it later."*

Past the gate, a row of attractions glows in the mist. The first is a fortune-teller's tent beside a slow black stream.`,
    },

    // ── L2 ─────────────────────────────────────────────────────
    {
      id: 2,
      name: 'The Fortune-Teller',
      difficulty: 2,
      channels: [
        {
          name: 'fortune-tent',
          description: '🔮 A velvet tent. A masked woman shuffles a deck that never runs out.',
          content: `**THE FORTUNE-TELLER**

She does not read your palm. She slides a card across the table, blank except for a question.

*"You crossed me to get here — you'll cross me again to leave. I have a mouth but I never eat, a bed but I never sleep, a head and I run for miles but I have no legs at all. The carnival sits on my bank. What am I?"*

Name it with \`/answer\`.`,
        },
        {
          name: 'her-whisper',
          description: '🃏 She leans in and whispers one extra line.',
          content: `**THE FORTUNE-TELLER — A WHISPER**

*"Every word in my riddle is a part of a body — mouth, bed, head — but I am no body at all. I am water that always knows which way is down. Follow me far enough and you reach the sea."*`,
        },
      ],
      answers: ['river', 'a river', 'the river', 'stream', 'the stream'],
      hints: [
        '💡 Mouth, bed, head — these are all real terms for the parts of one flowing thing.',
        '💡 It "runs" but has no legs; it has a "mouth" where it meets the sea.',
        '💡 The black water the carnival sits beside. One word, begins with R.',
      ],
      successMessage: `🔓 **RIVER. The card turns to water and soaks into the table.**

*"Two for two. The hall of mirrors is next — mind you don't lose your voice in there."*

Two words in your pocket now. You step toward a tunnel of glass.`,
    },

    // ── L3 ─────────────────────────────────────────────────────
    {
      id: 3,
      name: 'The Hall of Mirrors',
      difficulty: 3,
      channels: [
        {
          name: 'hall-of-mirrors',
          description: '🪞 A hall of glass. Something repeats everything you say.',
          content: `**THE HALL OF MIRRORS**

There is no attendant here. A voice comes from everywhere and nowhere, and it always answers a half-second after you speak — in your own words.

Scratched into the first mirror:

*"I have no throat, yet I will answer you. I have no body, yet I live in caves and empty halls and tunnels just like this one. Shout and I shout back, but always last, never first. Call me by my name and I'll let you pass."*

\`/answer\` with what you've worked out.`,
        },
      ],
      answers: ['echo', 'an echo', 'the echo'],
      hints: [
        '💡 The clue is in how the hall behaves: it repeats your words back, a moment later.',
        '💡 You hear it in canyons and empty rooms. It cannot speak first — only repeat.',
        '💡 Four letters, begins with E. A Greek nymph was named for it.',
      ],
      successMessage: `🔓 **ECHO. The voice repeats the word once, softly, and the glass clears.**

*...echo... echo... echo...*

The mirrors swing open like doors. Beyond them, a single tree grows indoors, heavy with fruit, beside a shooting gallery.

Three words now. Halfway to the centre.`,
    },

    // ── L4 ─────────────────────────────────────────────────────
    {
      id: 4,
      name: 'The Orchard Game',
      difficulty: 3,
      channels: [
        {
          name: 'the-lonely-tree',
          description: '🍎 An impossible tree indoors, one ripe fruit on the lowest branch.',
          content: `**THE ORCHARD GAME**

A juggler in a harlequin mask sits under the tree, tossing a single piece of fruit and catching it without looking.

*"Here's a quick one — wordplay, not riddle. I'm thinking of something on this tree:*

*It has a skin but wears no clothes.*
*It has a core but holds no army.*
*It has a heart that never beats, and seeds that never speak.*
*Teachers love to be given one, and it once fell on a very clever man's head.*

*What's the fruit?"*

Name it with \`/answer\`.`,
        },
      ],
      answers: ['apple', 'an apple', 'the apple', 'apples'],
      hints: [
        '💡 "Core", "skin", "seeds" — and a teacher\'s favourite gift.',
        '💡 "Fell on a clever man\'s head" — the story they tell about gravity and Newton.',
        '💡 Five letters, begins with A. Keeps the doctor away.',
      ],
      successMessage: `🔓 **APPLE. The juggler tosses it to you. It's warm, like it's been in the sun.**

*"Four down. One more before the middle. Look up — you've been able to see the last answer this whole time."*

Four words. You follow his pointing finger toward a tall striped tent with its roof open to the sky.`,
    },

    // ── L5 ─────────────────────────────────────────────────────
    {
      id: 5,
      name: 'The Open Roof',
      difficulty: 3,
      channels: [
        {
          name: 'under-the-open-sky',
          description: '🌙 A tent with no roof. The night sky pours in.',
          content: `**THE OPEN ROOF**

An old man in a silver mask lies in a deckchair, staring straight up. He doesn't look at you.

*"Last riddle before the heart of the carnival. I've been hanging over you since you arrived, but you only just looked up.*

*I have phases but no temper. I pull the whole sea back and forth, yet I never get wet. I borrow all my light and own none of it. I have a face, and seas with no water, and a dark side you'll never see.*

*Name me."*

\`/answer\` when you have it.`,
        },
        {
          name: 'his-last-words',
          description: '✨ He finally turns his head toward you.',
          content: `**THE OLD MAN — ONE MORE LINE**

*"When you have all five words — the dark one, the river, the voice in the glass, the fruit, and me — line them up in the order you met us. Read only the first letter of each.*

*That spells what this place really is. That's the word that wakes you."*`,
        },
      ],
      answers: ['moon', 'the moon', 'a moon'],
      hints: [
        '💡 "Phases", "pulls the sea", "borrows its light" — look up at night.',
        '💡 It has "seas" (the dark patches) but no water, and a far side we never see from Earth.',
        '💡 Four letters, begins with M.',
      ],
      successMessage: `🔓 **MOON. The old man smiles and closes his eyes.**

*"Five for five. Now you have everything you need. Go to the centre and say the true name of this place."*

Five words gathered: **Darkness, River, Echo, Apple, Moon.**

The path opens to a carousel at the very heart of the carnival, turning with no one on it.`,
    },

    // ── L6 — FINALE ────────────────────────────────────────────
    {
      id: 6,
      name: 'The Carousel',
      difficulty: 4,
      channels: [
        {
          name: 'the-carousel',
          description: '🎠 An empty carousel turning slowly at the centre of everything.',
          content: `**THE CAROUSEL — THE HEART OF THE CARNIVAL**

The grinning seller, the fortune-teller, the juggler and the old man are all here now, masks gone — and every face beneath is *your* face.

They speak together:

*"You were never walking home. The fog, the music, the masks — none of it was real, and somewhere a part of you has known that since the gate.*

*Take the five words you collected, in the order you found them. Read only the FIRST LETTER of each, top to bottom. That single word is the truth of this whole place.*

*Say it, and you wake up."*

\`\`\`
Darkness
River
Echo
Apple
Moon
\`\`\`

Submit the word with \`/answer\`.`,
        },
      ],
      answers: ['dream', 'a dream', 'this is a dream', 'dreaming', 'im dreaming', "i'm dreaming"],
      hints: [
        '💡 Ignore the riddles now. Look only at the five WORD answers you already gave.',
        '💡 First letter of each, in order: Darkness, River, Echo, Apple, Moon.',
        '💡 D-R-E-A-M. Five letters. It is where you have been all night.',
      ],
      successMessage: `🔓 **DREAM.**

The carousel stops. The masks, the tents, the fog — all of it folds inward like a closing hand, quietly and without fear.

You open your eyes. You're on the last bus home, forehead against the cold window, the streetlights sliding by. The driver calls your stop.

Just a dream. But you can still feel the warmth of an apple in your hand.

━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 **THE MIDNIGHT CARNIVAL — COMPLETED**
━━━━━━━━━━━━━━━━━━━━━━━━━`,
    },
  ],
};
