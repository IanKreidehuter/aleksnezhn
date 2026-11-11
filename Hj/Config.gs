/** Config.gs: constants, emotion taxonomy, Script Properties access. */

const SHEET_DEFS = {
  JOURNAL: { name: 'Journal', headers: ['entryId', 'entryDate', 'entryTime', 'createdAt', 'updatedAt', 'event', 'thoughts', 'emotionsJson', 'behaviourResponse', 'physicalResponse', 'additionalNotes', 'location', 'attachmentCount', 'status'] },
  MEDIA: { name: 'Media', headers: ['mediaId', 'entryId', 'fileName', 'mimeType', 'fileId', 'fileUrl', 'mediaType', 'createdAt'] },
  MOOD: { name: 'MoodChecker', headers: ['moodId', 'entryId', 'event', 'thoughts', 'emotion', 'behaviourResponse', 'physicalResponse', 'createdAt'] },
  CONFIG: { name: 'Configuration', headers: ['key', 'value', 'description'] }
};

const DEFAULT_SETTINGS = [
  ['MAX_IMAGE_MB', '20', 'Maximum size of one image (MB)'],
  ['MAX_VIDEO_MB', '100', 'Maximum size of one video (MB)'],
  ['MAX_ATTACHMENTS', '10', 'Maximum attachments per entry'],
  ['PAGE_SIZE', '10', 'Entries loaded per page on the timeline']
];

const LIMITS = { SHORT: 200, LONG: 10000, MAX_MOOD_ROWS: 20 };
const CHUNK_BYTES = 2 * 1024 * 1024; // must be a multiple of 256 KB (Drive resumable upload rule)

/** Emotion taxonomy from the feelings wheel (inner and outer rings), plus every term from the brief. */
const EMOTIONS = {
  Happy: ['Playful', 'Aroused', 'Cheeky', 'Content', 'Free', 'Joyful', 'Interested', 'Curious', 'Inquisitive', 'Proud', 'Successful', 'Confident', 'Accepted', 'Respected', 'Valued', 'Powerful', 'Courageous', 'Creative', 'Peaceful', 'Loving', 'Thankful', 'Trusting', 'Sensitive', 'Intimate', 'Optimistic', 'Hopeful', 'Inspired'],
  Sad: ['Lonely', 'Isolated', 'Abandoned', 'Vulnerable', 'Victimised', 'Fragile', 'Despair', 'Grief', 'Powerless', 'Guilty', 'Ashamed', 'Remorseful', 'Depressed', 'Empty', 'Inferior', 'Hurt', 'Disappointed', 'Embarrassed'],
  Angry: ['Let down', 'Betrayed', 'Resentful', 'Humiliated', 'Disrespected', 'Ridiculed', 'Bitter', 'Indignant', 'Violated', 'Mad', 'Furious', 'Jealous', 'Aggressive', 'Provoked', 'Hostile', 'Frustrated', 'Infuriated', 'Annoyed', 'Distant', 'Withdrawn', 'Numb', 'Critical', 'Sceptical', 'Dismissive', 'Disapproving', 'Judgmental', 'Embarrassed', 'Appalled', 'Revolted'],
  Fearful: ['Scared', 'Helpless', 'Frightened', 'Anxious', 'Overwhelmed', 'Worried', 'Insecure', 'Inadequate', 'Inferior', 'Weak', 'Worthless', 'Insignificant', 'Rejected', 'Excluded', 'Persecuted', 'Threatened', 'Nervous', 'Exposed', 'Betrayed'],
  Disgusted: ['Disapproving', 'Judgmental', 'Embarrassed', 'Disappointed', 'Appalled', 'Revolted', 'Awful', 'Nauseated', 'Detestable', 'Repelled', 'Horrified', 'Hesitant'],
  Surprised: ['Startled', 'Shocked', 'Dismayed', 'Confused', 'Disillusioned', 'Perplexed', 'Amazed', 'Astonished', 'Awe', 'Excited', 'Eager', 'Energetic', 'Tired', 'Stressed', 'Busy', 'Bored'],
  Bad: ['Bored', 'Indifferent', 'Apathetic', 'Busy', 'Pressured', 'Rushed', 'Stressed', 'Overwhelmed', 'Out of control', 'Tired', 'Sleepy', 'Unfocused']
};

function getProp(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

/** Settings = defaults overridden by the Configuration sheet (known keys only). */
function getSettings() {
  const out = {};
  DEFAULT_SETTINGS.forEach(r => { out[r[0]] = r[1]; });
  try {
    readAll(SHEET_DEFS.CONFIG).forEach(r => {
      if (r.key && Object.prototype.hasOwnProperty.call(out, r.key) && r.value !== '') out[r.key] = r.value;
    });
  } catch (e) { /* fall back to defaults */ }
  return out;
}
