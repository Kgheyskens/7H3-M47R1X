// ================================================================
// 📚 STORY INDEX — automatically loads every story in ./stories
//
//   Add a new story  = add a new .js file in data/stories/
//   Files starting with "_" (e.g. _TEMPLATE.js) are IGNORED,
//   so you can keep templates/drafts in the folder safely.
// ================================================================

const fs   = require('fs');
const path = require('path');

const stories = new Map();

const dir = path.join(__dirname, 'stories');
const files = fs
  .readdirSync(dir)
  .filter(f => f.endsWith('.js') && !f.startsWith('_'));

for (const file of files) {
  try {
    const story = require(path.join(dir, file));
    if (!story || !story.id) {
      console.warn(`⚠️  Skipped ${file} — no "id" exported.`);
      continue;
    }
    if (stories.has(story.id)) {
      console.warn(`⚠️  Duplicate story id "${story.id}" in ${file} — skipped.`);
      continue;
    }
    stories.set(story.id, story);
    console.log(`📖 Story loaded: "${story.name}" (${story.levels.length} levels)`);
  } catch (e) {
    console.error(`❌ Failed to load story ${file}:`, e.message);
  }
}

/** All stories as an array. */
function allStories() {
  return Array.from(stories.values());
}

/** One story by id (or null). */
function getStory(id) {
  return stories.get(id) ?? null;
}

/**
 * Figure out which level a player is on in each story, from their roles.
 * Role names look like "frequency-L2" (storyId-L{levelId}).
 * Returns an array of { story, level, roleName } — one entry per active story.
 */
function getUserProgress(member) {
  const results = [];

  for (const story of stories.values()) {
    // Walk from the highest level down so we find the current one.
    for (let i = story.levels.length - 1; i >= 0; i--) {
      const level = story.levels[i];
      const roleName = makeRoleName(story.id, level.id);
      const role = member.guild.roles.cache.find(r => r.name === roleName);
      if (role && member.roles.cache.has(role.id)) {
        results.push({ story, level, roleName });
        break;
      }
    }
  }

  return results;
}

/** Consistent per-level role name, e.g. "frequency-L3". */
function makeRoleName(storyId, levelId) {
  return `${storyId}-L${levelId}`;
}

/** Winner role name for a finished story, e.g. "frequency-completed". */
function makeWinnerRoleName(storyId) {
  return `${storyId}-completed`;
}

module.exports = {
  allStories,
  getStory,
  getUserProgress,
  makeRoleName,
  makeWinnerRoleName,
};
