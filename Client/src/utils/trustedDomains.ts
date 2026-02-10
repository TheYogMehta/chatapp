export const DEFAULT_TRUSTED_DOMAINS = [
  "giphy.com",
  "media.giphy.com",
  "googleusercontent.com",
  "fbcdn.net",
  "cdn.discordapp.com",
  "imgur.com",
  "i.imgur.com",
  "reddit.com",
  "i.redd.it",
  "youtube.com",
  "youtu.be",
  "twimg.com",
  "pbs.twimg.com",
  "tenor.com",
  "media.tenor.com",
];

const STORAGE_KEY = "trusted_domains";

export const getTrustedDomains = (): string[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const userDomains = stored ? JSON.parse(stored) : [];
    return Array.from(new Set([...DEFAULT_TRUSTED_DOMAINS, ...userDomains]));
  } catch (e) {
    return DEFAULT_TRUSTED_DOMAINS;
  }
};

export const addTrustedDomain = (domain: string) => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const userDomains = stored ? JSON.parse(stored) : [];
    if (!userDomains.includes(domain)) {
      userDomains.push(domain);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userDomains));
    }
  } catch (e) {
    console.error("Failed to save trusted domain", e);
  }
};

export const isTrustedUrl = (url: string): boolean => {
  try {
    const hostname = new URL(url).hostname;
    const allTrusted = getTrustedDomains();
    return allTrusted.some((domain) => hostname.endsWith(domain));
  } catch (e) {
    return false;
  }
};
