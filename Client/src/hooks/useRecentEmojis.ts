import { useState, useEffect, useCallback } from "react";

const RECENT_REACTIONS_KEY = "recent_reactions";
const DEFAULT_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

interface EmojiUsage {
  emoji: string;
  count: number;
  lastUsed: number;
}

export const useRecentEmojis = (limit: number = 6) => {
  const [recentEmojis, setRecentEmojis] = useState<string[]>(DEFAULT_EMOJIS);

  useEffect(() => {
    loadRecents();
  }, []);

  const loadRecents = () => {
    try {
      const stored = localStorage.getItem(RECENT_REACTIONS_KEY);
      if (stored) {
        const usage: EmojiUsage[] = JSON.parse(stored);
        const sorted = usage.sort((a, b) => {
          if (a.count === b.count) return b.lastUsed - a.lastUsed;
          return b.count - a.count;
        });

        const topEmojis = sorted.map((u) => u.emoji).slice(0, limit);

        if (topEmojis.length < limit) {
          const availableDefaults = DEFAULT_EMOJIS.filter(
            (e) => !topEmojis.includes(e),
          );
          setRecentEmojis([...topEmojis, ...availableDefaults].slice(0, limit));
        } else {
          setRecentEmojis(topEmojis);
        }
      } else {
        setRecentEmojis(DEFAULT_EMOJIS);
      }
    } catch (e) {
      console.error("Failed to load recent emojis", e);
      setRecentEmojis(DEFAULT_EMOJIS);
    }
  };

  const trackEmoji = useCallback((emoji: string) => {
    try {
      const stored = localStorage.getItem(RECENT_REACTIONS_KEY);
      let usage: EmojiUsage[] = stored ? JSON.parse(stored) : [];

      const existingIndex = usage.findIndex((u) => u.emoji === emoji);
      if (existingIndex >= 0) {
        usage[existingIndex].count += 1;
        usage[existingIndex].lastUsed = Date.now();
      } else {
        usage.push({ emoji, count: 1, lastUsed: Date.now() });
      }

      localStorage.setItem(RECENT_REACTIONS_KEY, JSON.stringify(usage));
      loadRecents();
    } catch (e) {
      console.error("Failed to track emoji", e);
    }
  }, []);

  return { recentEmojis, trackEmoji };
};
